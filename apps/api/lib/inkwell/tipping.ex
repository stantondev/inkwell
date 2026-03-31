defmodule Inkwell.Tipping do
  @moduledoc """
  Stripe Connect integration for writer tips.
  Uses Express accounts so Stripe handles KYC, tax forms, and payouts.
  Same raw :httpc pattern as Billing module.
  """

  alias Inkwell.Accounts.User
  alias Inkwell.Tipping.Tip
  alias Inkwell.Repo

  import Ecto.Query

  require Logger

  @commission_rate 0.08

  @stripe_api "https://api.stripe.com/v1"

  # ── Stripe Connect: Account Management ─────────────────────────────

  @doc "Create a Stripe Connect Express account for the writer."
  def create_connect_account(%User{} = user) do
    if user.stripe_connect_account_id do
      {:ok, user.stripe_connect_account_id}
    else
      params =
        URI.encode_query(%{
          "type" => "express",
          "email" => user.email,
          "metadata[user_id]" => user.id,
          "metadata[username]" => user.username,
          "capabilities[transfers][requested]" => "true",
          "capabilities[card_payments][requested]" => "true",
          "business_type" => "individual",
          "business_profile[url]" => "https://inkwell.social/#{user.username}",
          "business_profile[product_description]" => "Writer on Inkwell receiving reader tips"
        })

      case stripe_post("/accounts", params) do
        {:ok, %{"id" => account_id}} ->
          user
          |> User.stripe_connect_changeset(%{stripe_connect_account_id: account_id})
          |> Repo.update()

          {:ok, account_id}

        {:error, reason} ->
          Logger.error("Failed to create Connect account for #{user.username}: #{inspect(reason)}")
          {:error, reason}
      end
    end
  end

  @doc "Create an Account Link for Stripe Connect onboarding (redirects writer to Stripe)."
  def create_onboarding_link(%User{} = user) do
    case user.stripe_connect_account_id do
      nil ->
        {:error, :no_connect_account}

      account_id ->
        frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")

        params =
          URI.encode_query(%{
            "account" => account_id,
            "refresh_url" => "#{frontend_url}/settings/support?refresh=true",
            "return_url" => "#{frontend_url}/settings/support?onboarding=complete",
            "type" => "account_onboarding"
          })

        case stripe_post("/account_links", params) do
          {:ok, %{"url" => url}} ->
            {:ok, url}

          {:error, reason} ->
            Logger.error("Failed to create onboarding link for #{user.username}: #{inspect(reason)}")
            {:error, reason}
        end
    end
  end

  @doc "Create a Stripe Express Dashboard login link for the connected account."
  def create_login_link(%User{} = user) do
    case user.stripe_connect_account_id do
      nil ->
        {:error, :no_connect_account}

      account_id ->
        case stripe_post("/accounts/#{account_id}/login_links", "") do
          {:ok, %{"url" => url}} ->
            {:ok, url}

          {:error, reason} ->
            Logger.error("Failed to create login link for #{user.username}: #{inspect(reason)}")
            {:error, reason}
        end
    end
  end

  @doc "Check the status of a connected Stripe account."
  def check_account_status(%User{} = user) do
    case user.stripe_connect_account_id do
      nil ->
        {:ok, %{connected: false, charges_enabled: false, payouts_enabled: false, onboarded: false}}

      account_id ->
        case stripe_get("/accounts/#{account_id}") do
          {:ok, account} ->
            charges_enabled = account["charges_enabled"] == true
            payouts_enabled = account["payouts_enabled"] == true
            details_submitted = account["details_submitted"] == true

            {:ok, %{
              connected: true,
              charges_enabled: charges_enabled,
              payouts_enabled: payouts_enabled,
              onboarded: details_submitted,
              account_id: account_id
            }}

          {:error, reason} ->
            Logger.error("Failed to check account status for #{user.username}: #{inspect(reason)}")
            {:error, reason}
        end
    end
  end

  @doc "Refresh the stripe_connect_enabled and stripe_connect_onboarded fields from Stripe."
  def refresh_connect_status(%User{} = user) do
    case check_account_status(user) do
      {:ok, %{connected: true, charges_enabled: charges, onboarded: onboarded}} ->
        user
        |> User.stripe_connect_changeset(%{
          stripe_connect_enabled: charges,
          stripe_connect_onboarded: onboarded
        })
        |> Repo.update()

      {:ok, %{connected: false}} ->
        {:ok, user}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc "Disconnect a Stripe Connect account (deauthorize + clear DB fields)."
  def disconnect_account(%User{} = user) do
    case user.stripe_connect_account_id do
      nil ->
        {:ok, user}

      account_id ->
        # Deauthorize the account via Stripe OAuth
        secret_key = stripe_config()[:secret_key]

        if secret_key do
          params = URI.encode_query(%{
            "client_id" => stripe_config()[:connect_client_id] || "",
            "stripe_user_id" => account_id
          })

          # Best-effort deauthorization — don't fail if it errors
          case stripe_post("/oauth/deauthorize", params) do
            {:ok, _} ->
              Logger.info("Deauthorized Connect account #{account_id} for #{user.username}")

            {:error, reason} ->
              Logger.warning("Failed to deauthorize Connect account #{account_id}: #{inspect(reason)}")
          end
        end

        # Clear DB fields regardless
        user
        |> User.stripe_connect_changeset(%{
          stripe_connect_account_id: nil,
          stripe_connect_enabled: false,
          stripe_connect_onboarded: false
        })
        |> Repo.update()
    end
  end

  # ── Tips: Creation & Payment ──────────────────────────────────────────

  @doc """
  Create a tip PaymentIntent with destination charge to the writer's connected account.
  Returns {:ok, %{client_secret, tip_id}} for the frontend to confirm with Stripe Elements.

  Fee structure:
  - Reader pays: tip_amount + processing fee (2.9% + $0.30)
  - Writer receives: tip_amount - 8% commission
  - Inkwell receives: 8% commission
  - Stripe receives: processing fee (charged to reader)
  """
  def create_tip(%User{} = sender, %User{} = recipient, attrs) do
    amount_cents = attrs["amount_cents"] || attrs[:amount_cents]
    anonymous = attrs["anonymous"] || attrs[:anonymous] || false
    message = attrs["message"] || attrs[:message]
    entry_id = attrs["entry_id"] || attrs[:entry_id]

    cond do
      Inkwell.Social.is_blocked_between?(sender.id, recipient.id) ->
        {:error, :blocked}

      !recipient.stripe_connect_enabled ->
        {:error, :tips_not_enabled}

      !recipient.stripe_connect_account_id ->
        {:error, :no_connect_account}

      sender.id == recipient.id ->
        {:error, :cannot_tip_self}

      !is_integer(amount_cents) or amount_cents < 100 or amount_cents > 10_000 ->
        {:error, :invalid_amount}

      true ->
        # Calculate fees
        # Processing fee: ceil((tip + 30) / (1 - 0.029)) - tip
        total_cents = ceil((amount_cents + 30) / (1 - 0.029)) |> trunc()
        commission_cents = ceil(amount_cents * @commission_rate) |> trunc()

        # Ensure sender has a Stripe Customer (so charges aren't "Guest" in Dashboard)
        sender_customer_id = case Inkwell.Billing.ensure_customer(sender) do
          {:ok, cid} -> cid
          _ -> nil
        end

        # Create Stripe PaymentIntent with destination charge
        base_params = %{
          "amount" => total_cents,
          "currency" => "usd",
          "payment_method_types[]" => "card",
          "application_fee_amount" => commission_cents,
          "transfer_data[destination]" => recipient.stripe_connect_account_id,
          "metadata[sender_id]" => sender.id,
          "metadata[sender_username]" => sender.username,
          "metadata[recipient_id]" => recipient.id,
          "metadata[recipient_username]" => recipient.username,
          "metadata[tip_amount_cents]" => amount_cents,
          "metadata[anonymous]" => to_string(anonymous)
        }

        params =
          URI.encode_query(
            if sender_customer_id do
              Map.put(base_params, "customer", sender_customer_id)
            else
              base_params
            end
          )

        case stripe_post("/payment_intents", params) do
          {:ok, %{"id" => pi_id, "client_secret" => client_secret}} ->
            # Create tip record in DB
            tip_attrs = %{
              sender_id: sender.id,
              recipient_id: recipient.id,
              entry_id: entry_id,
              amount_cents: amount_cents,
              total_cents: total_cents,
              currency: "usd",
              stripe_payment_intent_id: pi_id,
              anonymous: anonymous,
              message: message,
              status: "pending"
            }

            case %Tip{} |> Tip.changeset(tip_attrs) |> Repo.insert() do
              {:ok, tip} ->
                {:ok, %{client_secret: client_secret, tip_id: tip.id, total_cents: total_cents}}

              {:error, changeset} ->
                Logger.error("Failed to save tip record: #{inspect(changeset.errors)}")
                {:error, :db_error}
            end

          {:error, reason} ->
            Logger.error("Failed to create PaymentIntent: #{inspect(reason)}")
            {:error, reason}
        end
    end
  end

  @doc "Mark a tip as succeeded after frontend confirms payment."
  def confirm_tip(tip_id) do
    case Repo.get(Tip, tip_id) do
      nil ->
        {:error, :not_found}

      %Tip{status: "pending"} = tip ->
        case tip |> Tip.changeset(%{status: "succeeded"}) |> Repo.update() do
          {:ok, updated_tip} ->
            create_tip_notification(updated_tip)
            {:ok, updated_tip}

          error ->
            error
        end

      %Tip{status: status} ->
        {:error, {:already_processed, status}}
    end
  end

  @doc "Handle payment_intent.succeeded webhook — mark tip as succeeded."
  def handle_payment_succeeded(%{"id" => pi_id}) do
    case Tip |> where([t], t.stripe_payment_intent_id == ^pi_id) |> Repo.one() do
      nil ->
        Logger.info("payment_intent.succeeded for unknown PI #{pi_id}")
        :ok

      %Tip{status: "pending"} = tip ->
        tip |> Tip.changeset(%{status: "succeeded"}) |> Repo.update()
        # Create notification for recipient
        create_tip_notification(tip)
        :ok

      %Tip{status: "succeeded"} ->
        # Frontend already confirmed — just ensure notification exists
        :ok

      _ ->
        :ok
    end
  end

  @doc "Handle payment_intent.payment_failed webhook — mark tip as failed."
  def handle_payment_failed(%{"id" => pi_id}) do
    case Tip |> where([t], t.stripe_payment_intent_id == ^pi_id) |> Repo.one() do
      nil -> :ok

      %Tip{status: "pending"} = tip ->
        tip |> Tip.changeset(%{status: "failed"}) |> Repo.update()
        :ok

      _ -> :ok
    end
  end

  defp create_tip_notification(%Tip{} = tip) do
    Inkwell.Accounts.create_notification(%{
      type: :tip,
      user_id: tip.recipient_id,
      actor_id: if(tip.anonymous, do: nil, else: tip.sender_id),
      target_id: tip.id,
      data: %{
        "amount_cents" => tip.amount_cents,
        "message" => tip.message
      }
    })
  end

  # ── Tips: Listing & Stats ────────────────────────────────────────────

  @doc "List tips received by a writer, paginated."
  def list_tips_received(user_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 20)
    offset = Keyword.get(opts, :offset, 0)

    Tip
    |> where([t], t.recipient_id == ^user_id and t.status == "succeeded")
    |> order_by([t], desc: t.inserted_at)
    |> limit(^limit)
    |> offset(^offset)
    |> preload(:sender)
    |> Repo.all()
  end

  @doc "List tips sent by a reader, paginated."
  def list_tips_sent(user_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 20)
    offset = Keyword.get(opts, :offset, 0)

    Tip
    |> where([t], t.sender_id == ^user_id and t.status == "succeeded")
    |> order_by([t], desc: t.inserted_at)
    |> limit(^limit)
    |> offset(^offset)
    |> preload(:recipient)
    |> Repo.all()
  end

  @doc "Get tip stats for a specific entry (total received, count). Only counts succeeded tips."
  def get_entry_tip_stats(entry_id) do
    Tip
    |> where([t], t.entry_id == ^entry_id and t.status == "succeeded")
    |> select([t], %{total_cents: coalesce(sum(t.amount_cents), 0), count: count(t.id)})
    |> Repo.one()
  end

  @doc "Get tip stats for a writer (total received, count, this month)."
  def get_tip_stats(user_id) do
    now = DateTime.utc_now()
    month_start = %{now | day: 1, hour: 0, minute: 0, second: 0, microsecond: {0, 0}}

    all_time =
      Tip
      |> where([t], t.recipient_id == ^user_id and t.status == "succeeded")
      |> select([t], %{total: coalesce(sum(t.amount_cents), 0), count: count(t.id)})
      |> Repo.one()

    this_month =
      Tip
      |> where([t], t.recipient_id == ^user_id and t.status == "succeeded" and t.inserted_at >= ^month_start)
      |> select([t], %{total: coalesce(sum(t.amount_cents), 0), count: count(t.id)})
      |> Repo.one()

    %{
      all_time_total_cents: all_time.total,
      all_time_count: all_time.count,
      month_total_cents: this_month.total,
      month_count: this_month.count
    }
  end

  # ── Webhook: account.updated ────────────────────────────────────────

  @doc "Handle account.updated webhook event from Stripe Connect."
  def handle_account_updated(%{"id" => account_id} = account) do
    import Ecto.Query

    case User |> where([u], u.stripe_connect_account_id == ^account_id) |> Repo.one() do
      nil ->
        Logger.info("account.updated for unknown Connect account #{account_id}")
        :ok

      user ->
        charges_enabled = account["charges_enabled"] == true
        details_submitted = account["details_submitted"] == true

        user
        |> User.stripe_connect_changeset(%{
          stripe_connect_enabled: charges_enabled,
          stripe_connect_onboarded: details_submitted
        })
        |> Repo.update()

        Logger.info("Updated Connect status for #{user.username}: charges=#{charges_enabled}, onboarded=#{details_submitted}")
        :ok
    end
  end

  def handle_account_updated(_), do: :ok

  # ── Private: Stripe API helpers ─────────────────────────────────────

  defp stripe_post(path, body) do
    secret_key = stripe_config()[:secret_key]

    if is_nil(secret_key) or secret_key == "" do
      Logger.warning("STRIPE_SECRET_KEY not set — cannot make Stripe API call to #{path}")
      {:error, :stripe_not_configured}
    else
      url = ~c"#{@stripe_api}#{path}"

      headers = [
        {~c"authorization", ~c"Bearer #{secret_key}"},
        {~c"content-type", ~c"application/x-www-form-urlencoded"}
      ]

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :post,
             {url, headers, ~c"application/x-www-form-urlencoded", body},
             [ssl: Inkwell.SSL.httpc_opts()],
             []
           ) do
        {:ok, {{_, status, _}, _headers, resp_body}} when status in 200..299 ->
          case Jason.decode(to_string(resp_body)) do
            {:ok, data} -> {:ok, data}
            error -> {:error, {:parse_error, error}}
          end

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          Logger.error("Stripe API error #{status} on #{path}: #{to_string(resp_body)}")
          {:error, {:stripe_error, status, to_string(resp_body)}}

        {:error, reason} ->
          Logger.error("Stripe HTTP error on #{path}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end

  defp stripe_get(path) do
    secret_key = stripe_config()[:secret_key]

    if is_nil(secret_key) or secret_key == "" do
      Logger.warning("STRIPE_SECRET_KEY not set — cannot make Stripe API call to #{path}")
      {:error, :stripe_not_configured}
    else
      url = ~c"#{@stripe_api}#{path}"

      headers = [
        {~c"authorization", ~c"Bearer #{secret_key}"}
      ]

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :get,
             {url, headers},
             [ssl: Inkwell.SSL.httpc_opts()],
             []
           ) do
        {:ok, {{_, status, _}, _headers, resp_body}} when status in 200..299 ->
          case Jason.decode(to_string(resp_body)) do
            {:ok, data} -> {:ok, data}
            error -> {:error, {:parse_error, error}}
          end

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          Logger.error("Stripe API error #{status} on GET #{path}: #{to_string(resp_body)}")
          {:error, {:stripe_error, status, to_string(resp_body)}}

        {:error, reason} ->
          Logger.error("Stripe HTTP error on GET #{path}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end

  defp stripe_config do
    Application.get_env(:inkwell, :stripe, [])
  end
end
