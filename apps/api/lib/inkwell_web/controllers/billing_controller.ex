defmodule InkwellWeb.BillingController do
  use InkwellWeb, :controller

  alias Inkwell.Billing

  require Logger

  # How long after we successfully hand a user a checkout URL before we'll mint
  # another one. This exists only to stop a double-clicked button from creating
  # duplicate Payment Links — it is NOT a penalty box, so it is deliberately
  # short and is only ever recorded on SUCCESS (see record_billing_checkout/1).
  #
  # This used to be 900s (15 min) AND was recorded before the attempt ran, so a
  # single failed checkout locked the user out for a quarter of an hour behind
  # the message "You can only process one purchase at a time" — which reads like
  # a card decline. At least one prospective subscriber gave up because of it.
  @billing_checkout_throttle 60

  # POST /api/billing/checkout — create a checkout session (Square Payment Link)
  # Body: {"interval": "year"} for yearly Plus; anything else is monthly.
  def checkout(conn, params) do
    user = conn.assigns.current_user

    with :ok <- check_billing_rate(user),
         :ok <- check_no_active_plus(user) do
      result =
        if params["interval"] == "year",
          do: Billing.create_plus_annual_checkout_session(user, :billing),
          else: Billing.create_checkout_session(user)

      case result do
        {:ok, %{url: url}} ->
          record_billing_checkout(user)
          json(conn, %{url: url})

        {:error, :square_not_configured} ->
          conn
          |> put_status(:service_unavailable)
          |> json(%{error: "Billing is not yet configured. Coming soon!"})

        {:error, reason} ->
          Logger.error("Checkout session failed: #{inspect(reason)}")
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Unable to start checkout. Please try again."})
      end
    else
      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{error: "We just opened a checkout page for you. If it didn't appear, wait a few seconds and try again — nothing has been charged."})

      {:error, :already_subscribed} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "You already have an active Plus subscription."})
    end
  end

  # POST /api/billing/cancel — cancel Plus subscription (replaces Stripe portal)
  def cancel(conn, _params) do
    user = conn.assigns.current_user

    case Billing.cancel_subscription(user) do
      {:ok, _user} ->
        json(conn, %{ok: true})

      :ok ->
        json(conn, %{ok: true})

      {:error, :no_subscription} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "No active subscription found."})

      {:error, reason} ->
        Logger.error("Cancel subscription failed: #{inspect(reason)}")
        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "Unable to cancel subscription. Please try again."})
    end
  end

  # POST /api/billing/cancel-donor — cancel Ink Donor subscription
  def cancel_donor(conn, _params) do
    user = conn.assigns.current_user

    case Billing.cancel_donor_subscription(user) do
      {:ok, _user} ->
        json(conn, %{ok: true})

      :ok ->
        json(conn, %{ok: true})

      {:error, reason} ->
        Logger.error("Cancel donor subscription failed: #{inspect(reason)}")
        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "Unable to cancel donation. Please try again."})
    end
  end

  # POST /api/billing/portal — legacy endpoint, redirects to cancel
  # Square has no hosted portal — we use inline cancel UI instead
  def portal(conn, _params) do
    conn
    |> put_status(:gone)
    |> json(%{error: "The billing portal is no longer available. Use the cancel button in Settings instead."})
  end

  # POST /api/billing/donor-checkout — create a checkout for Ink Donor (recurring)
  def donor_checkout(conn, %{"amount_cents" => amount_cents}) when amount_cents in [100, 200, 300] do
    user = conn.assigns.current_user

    with :ok <- check_billing_rate(user),
         :ok <- check_no_active_donor(user) do
      case Billing.create_donor_checkout_session(user, amount_cents) do
        {:ok, %{url: url}} ->
          record_billing_checkout(user)
          json(conn, %{url: url})

        {:error, :square_not_configured} ->
          conn
          |> put_status(:service_unavailable)
          |> json(%{error: "Donations are not yet configured. Coming soon!"})

        {:error, reason} ->
          Logger.error("Donor checkout failed: #{inspect(reason)}")
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Unable to start checkout. Please try again."})
      end
    else
      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{error: "We just opened a checkout page for you. If it didn't appear, wait a few seconds and try again — nothing has been charged."})

      {:error, :already_subscribed} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "You already have an active Ink Donor subscription."})
    end
  end

  def donor_checkout(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "Invalid amount. Choose $1, $2, or $3."})
  end

  # POST /api/billing/donate — create a one-time donation checkout
  # Accepts any amount between $1 and $500 (100-50000 cents)
  def donate(conn, %{"amount_cents" => amount_cents})
      when is_integer(amount_cents) and amount_cents >= 100 and amount_cents <= 50000 do
    user = conn.assigns.current_user

    with :ok <- check_billing_rate(user) do
      case Billing.create_donation_checkout_session(user, amount_cents) do
        {:ok, %{url: url}} ->
          record_billing_checkout(user)
          json(conn, %{url: url})

        {:error, :square_not_configured} ->
          conn
          |> put_status(:service_unavailable)
          |> json(%{error: "Donations are not yet configured. Coming soon!"})

        {:error, reason} ->
          Logger.error("Donation checkout failed: #{inspect(reason)}")
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Unable to start checkout. Please try again."})
      end
    else
      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{error: "We just opened a checkout page for you. If it didn't appear, wait a few seconds and try again — nothing has been charged."})
    end
  end

  def donate(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "Invalid amount. Donations can be between $1 and $500."})
  end

  # POST /api/billing/onboarding-checkout — create checkout during onboarding
  def onboarding_checkout(conn, %{"type" => "plus"} = params) do
    user = conn.assigns.current_user

    with :ok <- check_billing_rate(user),
         :ok <- check_no_active_plus(user) do
      result =
        if params["interval"] == "year",
          do: Billing.create_plus_annual_checkout_session(user, :onboarding),
          else: Billing.create_onboarding_checkout_session(user, "plus")

      case result do
        {:ok, %{url: url}} ->
          record_billing_checkout(user)
          json(conn, %{url: url})

        {:error, :square_not_configured} ->
          conn
          |> put_status(:service_unavailable)
          |> json(%{error: "Billing is not yet configured. Coming soon!"})

        {:error, reason} ->
          Logger.error("Onboarding checkout (Plus) failed: #{inspect(reason)}")
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Unable to start checkout. Please try again."})
      end
    else
      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{error: "We just opened a checkout page for you. If it didn't appear, wait a few seconds and try again — nothing has been charged."})

      {:error, :already_subscribed} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "You already have an active Plus subscription."})
    end
  end

  def onboarding_checkout(conn, %{"type" => "donor", "amount_cents" => amount_cents})
      when amount_cents in [100, 200, 300] do
    user = conn.assigns.current_user

    with :ok <- check_billing_rate(user),
         :ok <- check_no_active_donor(user) do
      case Billing.create_onboarding_checkout_session(user, "donor", amount_cents) do
        {:ok, %{url: url}} ->
          record_billing_checkout(user)
          json(conn, %{url: url})

        {:error, :square_not_configured} ->
          conn
          |> put_status(:service_unavailable)
          |> json(%{error: "Donations are not yet configured. Coming soon!"})

        {:error, reason} ->
          Logger.error("Onboarding checkout (Donor) failed: #{inspect(reason)}")
          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Unable to start checkout. Please try again."})
      end
    else
      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{error: "We just opened a checkout page for you. If it didn't appear, wait a few seconds and try again — nothing has been charged."})

      {:error, :already_subscribed} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "You already have an active Ink Donor subscription."})
    end
  end

  def onboarding_checkout(conn, %{"type" => "founding"}) do
    founding_checkout_response(conn, :onboarding)
  end

  def onboarding_checkout(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "Invalid checkout parameters."})
  end

  # POST /api/billing/founding-checkout — one-time Founding Member purchase
  def founding_checkout(conn, _params), do: founding_checkout_response(conn, :billing)

  defp founding_checkout_response(conn, return_to) do
    user = conn.assigns.current_user

    with :ok <- check_billing_rate(user) do
      case Inkwell.Billing.Founding.create_checkout_session(user, return_to) do
        {:ok, %{url: url}} ->
          record_billing_checkout(user)
          json(conn, %{url: url})

        {:error, :already_founding_member} ->
          conn
          |> put_status(:conflict)
          |> json(%{error: "You're already a Founding Member — thank you!"})

        {:error, :founding_sold_out} ->
          conn
          |> put_status(:gone)
          |> json(%{error: "All Founding Memberships have been claimed. Plus is still available monthly or yearly."})

        {:error, :square_not_configured} ->
          conn
          |> put_status(:service_unavailable)
          |> json(%{error: "Billing is not yet configured. Coming soon!"})

        {:error, reason} ->
          Logger.error("Founding checkout failed: #{inspect(reason)}")

          conn
          |> put_status(:internal_server_error)
          |> json(%{error: "Unable to start checkout. Please try again."})
      end
    else
      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{error: "We just opened a checkout page for you. If it didn't appear, wait a few seconds and try again — nothing has been charged."})
    end
  end

  # POST /api/billing/start-trial — free 14-day Plus trial, no card
  def start_trial(conn, _params) do
    user = conn.assigns.current_user

    case Inkwell.Billing.Trials.start(user) do
      {:ok, updated} ->
        json(conn, %{
          ok: true,
          subscription_tier: updated.subscription_tier,
          subscription_status: updated.subscription_status,
          subscription_expires_at: updated.subscription_expires_at
        })

      {:error, :already_plus} ->
        conn |> put_status(:conflict) |> json(%{error: "You already have Plus."})

      {:error, :trial_already_used} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "You've already used your free trial."})

      {:error, reason} ->
        Logger.error("Start trial failed for #{user.id}: #{inspect(reason)}")

        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "Couldn't start your trial. Please try again."})
    end
  end

  # GET /api/billing/status — return current subscription status
  def status(conn, _params) do
    user = conn.assigns.current_user

    dismissed = get_in(user.settings || %{}, ["resubscribe_dismissed"]) == true

    needs_resubscribe =
      if dismissed do
        false
      else
        had_stripe =
          not is_nil(user.stripe_subscription_id) or
          not is_nil(user.ink_donor_stripe_subscription_id)

        has_square =
          not is_nil(user.square_subscription_id) or
          not is_nil(user.square_donor_subscription_id)

        had_stripe and not has_square
      end

    json(conn, %{
      data: %{
        subscription_tier: Inkwell.SelfHosted.effective_tier(user),
        subscription_status: user.subscription_status || "none",
        subscription_expires_at: user.subscription_expires_at,
        ink_donor_status: user.ink_donor_status,
        ink_donor_amount_cents: user.ink_donor_amount_cents,
        self_hosted: Inkwell.SelfHosted.enabled?(),
        processor: "square",
        needs_resubscribe: needs_resubscribe,
        founding_member_number: user.founding_member_number,
        founding_member_at: user.founding_member_at,
        founding: Inkwell.Billing.Founding.status(),
        trial_eligible: Inkwell.Billing.Trials.eligible?(user),
        trial_days: Inkwell.Billing.Trials.trial_days(),
        plus_annual_available: Inkwell.Square.plus_annual_configured?(),
        plus_annual_cents: Inkwell.Square.plus_annual_cents()
      }
    })
  end

  # POST /api/billing/sync — reconcile local state from Square
  # Fallback when Square webhooks fail to reach us. Safe to call repeatedly.
  def sync(conn, _params) do
    user = conn.assigns.current_user

    # Founding purchases are one-time payments, not subscriptions, so the
    # subscription sync below can't see them. Check them first; a failure
    # here must not block the subscription sync.
    {user, founding_changes} =
      case Inkwell.Billing.Founding.sync_from_square(user) do
        {:ok, u, changes} -> {u, changes}
        _ -> {user, []}
      end

    case Billing.sync_from_square(user) do
      {:ok, updated_user, changes} ->
        changes = founding_changes ++ changes

        json(conn, %{
          ok: true,
          changes: Enum.map(changes, &Atom.to_string/1),
          subscription_tier: updated_user.subscription_tier,
          subscription_status: updated_user.subscription_status,
          ink_donor_status: updated_user.ink_donor_status
        })

      {:error, reason} ->
        Logger.warning("Sync from Square failed for user #{user.id}: #{inspect(reason)}")
        conn
        |> put_status(:service_unavailable)
        |> json(%{error: "Unable to reach Square right now. Please try again in a moment."})
    end
  end

  # POST /api/billing/webhook — receive Square webhook events
  # Raw body is cached by endpoint plug before JSON parsing
  def webhook(conn, _params) do
    raw_body = conn.assigns[:raw_body] || conn.private[:raw_body]
    signature = Plug.Conn.get_req_header(conn, "x-square-hmacsha256-signature") |> List.first()
    remote_ip = remote_ip_string(conn)
    body_size = if is_binary(raw_body), do: byte_size(raw_body), else: 0

    base_log = %{
      source: "square",
      remote_ip: remote_ip,
      body_size: body_size
    }

    if is_nil(raw_body) do
      Billing.log_delivery(Map.merge(base_log, %{status: "missing_body", signature_valid: false, error: "no request body"}))
      Logger.warning("Square webhook received with no body from #{remote_ip}")
      conn |> put_status(:bad_request) |> json(%{error: "Missing request body"})
    else
      case Billing.verify_webhook_signature(raw_body, signature) do
        :ok ->
          case Jason.decode(raw_body) do
            {:ok, event} ->
              event_type = event["type"] || "unknown"

              Billing.log_delivery(
                Map.merge(base_log, %{
                  status: "received",
                  signature_valid: true,
                  event_type: event_type
                })
              )

              Logger.info("Square webhook received: type=#{event_type} from #{remote_ip}")

              # Process reliably via Oban worker (retries, persistence, dedup)
              Inkwell.Workers.WebhookProcessingWorker.new(%{"event" => event})
              |> Oban.insert()

              json(conn, %{received: true})

            {:error, reason} ->
              Billing.log_delivery(
                Map.merge(base_log, %{
                  status: "parse_failed",
                  signature_valid: true,
                  error: "Invalid JSON: #{inspect(reason)}"
                })
              )

              Logger.warning("Square webhook JSON parse failed from #{remote_ip}: #{inspect(reason)}")
              conn |> put_status(:bad_request) |> json(%{error: "Invalid JSON"})
          end

        {:error, reason} ->
          Billing.log_delivery(
            Map.merge(base_log, %{
              status: "signature_failed",
              signature_valid: false,
              error: "Signature verification failed: #{inspect(reason)}"
            })
          )

          Logger.warning("Square webhook signature verification failed from #{remote_ip}: #{inspect(reason)}")
          conn |> put_status(:bad_request) |> json(%{error: "Invalid signature"})
      end
    end
  end

  defp remote_ip_string(conn) do
    case Plug.Conn.get_req_header(conn, "x-forwarded-for") do
      [value | _] when is_binary(value) ->
        value |> String.split(",") |> List.first() |> String.trim()

      _ ->
        case conn.remote_ip do
          nil -> "unknown"
          ip -> :inet.ntoa(ip) |> to_string()
        end
    end
  end

  # ── Private: Rate Limiting & Duplicate Prevention ──────────────────────

  # Check only — never records. A user whose checkout fails must be able to
  # retry immediately, so the throttle is recorded exclusively on success by
  # record_billing_checkout/1 in each action's {:ok, %{url: url}} branch.
  defp check_billing_rate(user) do
    ensure_billing_rate_table()
    key = {:billing_checkout, user.id}
    now = System.system_time(:second)

    case :ets.lookup(:billing_rate_limit, key) do
      [{^key, last_time}] when now - last_time < @billing_checkout_throttle ->
        {:error, :rate_limited}

      _ ->
        :ok
    end
  end

  # Called only after we've successfully handed the user a checkout URL.
  defp record_billing_checkout(user) do
    ensure_billing_rate_table()
    :ets.insert(:billing_rate_limit, {{:billing_checkout, user.id}, System.system_time(:second)})
    :ok
  end

  defp check_no_active_plus(user) do
    if Inkwell.Accounts.User.founding_member?(user) or
         (user.square_subscription_id && user.subscription_status == "active") do
      {:error, :already_subscribed}
    else
      :ok
    end
  end

  defp check_no_active_donor(user) do
    if user.square_donor_subscription_id && user.ink_donor_status == "active" do
      {:error, :already_subscribed}
    else
      :ok
    end
  end

  defp ensure_billing_rate_table do
    if :ets.whereis(:billing_rate_limit) == :undefined do
      :ets.new(:billing_rate_limit, [:named_table, :public, :set])
    end
  rescue
    ArgumentError -> :ok
  end
end
