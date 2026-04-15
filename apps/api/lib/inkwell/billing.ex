defmodule Inkwell.Billing do
  @moduledoc """
  Billing integration for Inkwell Plus subscriptions and Ink Donor donations.
  Currently uses Square as the payment processor (migrated from Stripe).
  Stripe code retained but inactive — will be re-enabled when LLC + new Stripe account is ready.
  """

  alias Inkwell.Accounts.User
  alias Inkwell.Billing.WebhookDelivery
  alias Inkwell.Billing.WebhookEvent
  alias Inkwell.Square
  alias Inkwell.Repo

  import Ecto.Query

  require Logger

  # ── Webhook Event Deduplication ─────────────────────────────────────────

  @doc "Check if a webhook event has already been processed."
  def already_processed?(nil), do: false
  def already_processed?(event_id) do
    Repo.exists?(from we in WebhookEvent, where: we.event_id == ^event_id)
  end

  @doc "Record a processed webhook event for deduplication."
  def record_event(event_id, event_type, status \\ "processed") do
    %WebhookEvent{}
    |> WebhookEvent.changeset(%{event_id: event_id, event_type: event_type, status: status})
    |> Repo.insert(on_conflict: :nothing)
  end

  @doc "Clean up webhook events older than 30 days."
  def cleanup_old_webhook_events do
    cutoff = DateTime.add(DateTime.utc_now(), -30, :day)

    {count, _} =
      from(we in WebhookEvent, where: we.inserted_at < ^cutoff)
      |> Repo.delete_all()

    {:ok, count}
  end

  # ── Webhook Delivery Logging (visibility / admin health widget) ─────────

  @doc """
  Log an inbound webhook delivery attempt. Always succeeds — failures to log
  are themselves logged but never raise, so logging can never break webhook
  processing.

  Call this for every hit to the webhook endpoint, regardless of outcome.
  """
  def log_delivery(attrs) do
    case %WebhookDelivery{}
         |> WebhookDelivery.changeset(attrs)
         |> Repo.insert() do
      {:ok, delivery} ->
        {:ok, delivery}

      {:error, changeset} ->
        Logger.error("Failed to log webhook delivery: #{inspect(changeset.errors)}")
        :error
    end
  rescue
    e ->
      Logger.error("Exception logging webhook delivery: #{inspect(e)}")
      :error
  end

  @doc "Return the most recent N webhook deliveries (newest first)."
  def recent_webhook_deliveries(limit \\ 20, source \\ "square") do
    from(d in WebhookDelivery,
      where: d.source == ^source,
      order_by: [desc: d.inserted_at],
      limit: ^limit
    )
    |> Repo.all()
  end

  @doc """
  Summary stats for the admin webhook health widget.

  Returns a map with:
    - last_delivery_at: timestamp of most recent delivery (nil if none)
    - total_24h: total deliveries in the last 24 hours
    - by_status_24h: map of status → count for last 24 hours
    - total_7d: total deliveries in the last 7 days
    - square_subscribers: count of users with an active Square subscription
    - square_donors: count of users with an active Square donor subscription
    - legacy_stripe_users: count of users still on a legacy Stripe subscription
  """
  def webhook_stats do
    cutoff_24h = DateTime.add(DateTime.utc_now(), -24, :hour)
    cutoff_7d = DateTime.add(DateTime.utc_now(), -7, :day)

    last_delivery_at =
      Repo.one(
        from d in WebhookDelivery,
          where: d.source == "square",
          order_by: [desc: d.inserted_at],
          limit: 1,
          select: d.inserted_at
      )

    total_24h =
      Repo.one(
        from d in WebhookDelivery,
          where: d.source == "square" and d.inserted_at > ^cutoff_24h,
          select: count(d.id)
      ) || 0

    total_7d =
      Repo.one(
        from d in WebhookDelivery,
          where: d.source == "square" and d.inserted_at > ^cutoff_7d,
          select: count(d.id)
      ) || 0

    by_status_24h =
      from(d in WebhookDelivery,
        where: d.source == "square" and d.inserted_at > ^cutoff_24h,
        group_by: d.status,
        select: {d.status, count(d.id)}
      )
      |> Repo.all()
      |> Map.new()

    square_subscribers =
      Repo.one(
        from u in User,
          where: not is_nil(u.square_subscription_id) and u.subscription_status == "active",
          select: count(u.id)
      ) || 0

    square_donors =
      Repo.one(
        from u in User,
          where: not is_nil(u.square_donor_subscription_id) and u.ink_donor_status == "active",
          select: count(u.id)
      ) || 0

    legacy_stripe_users =
      Repo.one(
        from u in User,
          where:
            not is_nil(u.stripe_subscription_id) or
              not is_nil(u.ink_donor_stripe_subscription_id),
          select: count(u.id)
      ) || 0

    # Ghost Plus detection: categorize all tier=plus users by payment source.
    # Pure DB read, no Square API calls.
    plus_buckets = plus_users_by_source()
    plus_square_active = length(Map.get(plus_buckets, :square_active, []))
    plus_legacy_stripe = length(Map.get(plus_buckets, :legacy_stripe, []))
    plus_orphaned = length(Map.get(plus_buckets, :orphaned, []))

    %{
      last_delivery_at: last_delivery_at,
      total_24h: total_24h,
      total_7d: total_7d,
      by_status_24h: by_status_24h,
      square_subscribers: square_subscribers,
      square_donors: square_donors,
      legacy_stripe_users: legacy_stripe_users,
      plus_square_active: plus_square_active,
      plus_legacy_stripe: plus_legacy_stripe,
      plus_orphaned: plus_orphaned
    }
  end

  @doc """
  Categorize every user with `subscription_tier = "plus"` by their payment
  source of record. Pure DB read, no Square API calls — runs in <100ms even
  on large user tables.

  Returns a map with three buckets (each a list of `%User{}` structs):

  - `:square_active` — `square_subscription_id` is set (paying via Square)
  - `:legacy_stripe` — no Square sub, but `stripe_subscription_id` is set
    (Stripe is dead, so they're effectively getting Plus for free)
  - `:orphaned` — no Square sub, no Stripe sub (marked Plus through some
    other path — these are the most concerning)

  All three buckets together = total Plus users.
  """
  def plus_users_by_source do
    users =
      from(u in User,
        where: u.subscription_tier == "plus",
        order_by: [desc: u.inserted_at]
      )
      |> Repo.all()

    Enum.group_by(users, fn u ->
      cond do
        not is_nil(u.square_subscription_id) -> :square_active
        not is_nil(u.stripe_subscription_id) -> :legacy_stripe
        true -> :orphaned
      end
    end)
  end

  @doc "Clean up webhook deliveries older than 30 days."
  def cleanup_old_webhook_deliveries do
    cutoff = DateTime.add(DateTime.utc_now(), -30, :day)

    {count, _} =
      from(d in WebhookDelivery, where: d.inserted_at < ^cutoff)
      |> Repo.delete_all()

    {:ok, count}
  end

  @doc """
  List every subscription in Square for the admin's raw view, enriched with:
  - The Square customer's email (fetched one-per-unique-customer)
  - The matched local Inkwell user (if any), looked up by normalized email
  - Plus/Donor classification based on plan_variation_id

  Returns a list of maps suitable for JSON encoding. If Square isn't configured
  (no access token / location ID), returns `{:error, :square_not_configured}`.

  Bounded by `Square.list_all_subscriptions/1` (max 500 subs, 5 pages) so this
  is safe to run on demand from the admin panel.
  """
  def list_square_subscriptions_raw do
    config = Application.get_env(:inkwell, :square, [])

    case Square.list_all_subscriptions() do
      {:ok, all_subs} ->
        # Fetch each unique customer once
        unique_customer_ids =
          all_subs
          |> Enum.map(& &1["customer_id"])
          |> Enum.reject(&is_nil/1)
          |> Enum.uniq()

        customer_map =
          Enum.into(unique_customer_ids, %{}, fn customer_id ->
            case Square.get_customer(customer_id) do
              {:ok, customer} -> {customer_id, customer}
              {:error, _} -> {customer_id, nil}
            end
          end)

        # Build one lowercase-email → user map in a single DB query
        normalized_emails =
          customer_map
          |> Map.values()
          |> Enum.reject(&is_nil/1)
          |> Enum.map(&Map.get(&1, "email_address"))
          |> Enum.reject(&is_nil/1)
          |> Enum.map(&normalize_email/1)
          |> Enum.reject(&(&1 == ""))
          |> Enum.uniq()

        user_map =
          case normalized_emails do
            [] ->
              %{}

            emails ->
              from(u in User, where: u.email in ^emails, select: u)
              |> Repo.all()
              |> Enum.into(%{}, fn u -> {normalize_email(u.email), u} end)
          end

        enriched =
          Enum.map(all_subs, fn sub ->
            customer = Map.get(customer_map, sub["customer_id"])
            customer_email = customer && Map.get(customer, "email_address")
            customer_name = customer && build_customer_name(customer)
            matched_user = customer_email && Map.get(user_map, normalize_email(customer_email))

            plan_variation_id = sub["plan_variation_id"]

            plan_type =
              cond do
                is_nil(plan_variation_id) -> "unknown"
                is_donor_plan?(plan_variation_id, config) -> "donor"
                true -> "plus"
              end

            %{
              subscription_id: sub["id"],
              status: sub["status"],
              plan_variation_id: plan_variation_id,
              plan_type: plan_type,
              customer_id: sub["customer_id"],
              customer_email: customer_email,
              customer_name: customer_name,
              created_at: sub["created_at"],
              start_date: sub["start_date"],
              canceled_date: sub["canceled_date"],
              matched_user:
                if matched_user do
                  %{
                    id: matched_user.id,
                    username: matched_user.username,
                    email: matched_user.email,
                    subscription_tier: matched_user.subscription_tier,
                    square_subscription_id: matched_user.square_subscription_id,
                    square_donor_subscription_id: matched_user.square_donor_subscription_id
                  }
                end
            }
          end)

        {:ok, enriched}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp build_customer_name(customer) when is_map(customer) do
    given = Map.get(customer, "given_name") || ""
    family = Map.get(customer, "family_name") || ""
    full = String.trim("#{given} #{family}")

    case full do
      "" -> nil
      name -> name
    end
  end

  defp build_customer_name(_), do: nil

  @doc """
  List recent Square payments (one-time charges, not subscriptions), enriched
  with matched local user. Used by the admin to find users who paid via the
  broken Payment Link flow but never got a recurring subscription created.

  Each entry includes: payment ID, amount, status, created_at, card brand/last4,
  buyer email/name (if Square captured them), and a guess at whether this looks
  like a Plus or Donor signup based on the amount.
  """
  def list_square_payments_raw(opts \\ []) do
    case Square.list_recent_payments(opts) do
      {:ok, payments} ->
        # Collect customer IDs to fetch in batch (deduplicated)
        unique_customer_ids =
          payments
          |> Enum.map(& &1["customer_id"])
          |> Enum.reject(&is_nil/1)
          |> Enum.uniq()

        customer_map =
          Enum.into(unique_customer_ids, %{}, fn customer_id ->
            case Square.get_customer(customer_id) do
              {:ok, customer} -> {customer_id, customer}
              {:error, _} -> {customer_id, nil}
            end
          end)

        # Build user lookup table from customer emails AND payment buyer_emails
        normalized_emails =
          payments
          |> Enum.flat_map(fn p ->
            customer = Map.get(customer_map, p["customer_id"])
            customer_email = customer && Map.get(customer, "email_address")
            [Map.get(p, "buyer_email_address"), customer_email]
          end)
          |> Enum.reject(&is_nil/1)
          |> Enum.map(&normalize_email/1)
          |> Enum.reject(&(&1 == ""))
          |> Enum.uniq()

        user_map =
          case normalized_emails do
            [] ->
              %{}

            emails ->
              from(u in User, where: u.email in ^emails, select: u)
              |> Repo.all()
              |> Enum.into(%{}, fn u -> {normalize_email(u.email), u} end)
          end

        enriched =
          Enum.map(payments, fn payment ->
            customer = Map.get(customer_map, payment["customer_id"])
            customer_email = customer && Map.get(customer, "email_address")
            customer_name = customer && build_customer_name(customer)
            buyer_email = Map.get(payment, "buyer_email_address")

            # Try buyer_email first, fall back to customer_email
            lookup_email = buyer_email || customer_email

            matched_user = lookup_email && Map.get(user_map, normalize_email(lookup_email))

            amount = get_in(payment, ["amount_money", "amount"]) || 0
            currency = get_in(payment, ["amount_money", "currency"]) || "USD"

            looks_like =
              cond do
                amount == 500 -> "plus"
                amount in [100, 200, 300] -> "donor"
                amount in [300, 500, 1000] -> "donation"
                true -> "unknown"
              end

            card_details = Map.get(payment, "card_details") || %{}
            card = Map.get(card_details, "card") || %{}

            %{
              payment_id: payment["id"],
              status: payment["status"],
              amount_cents: amount,
              currency: currency,
              created_at: payment["created_at"],
              note: payment["note"],
              looks_like: looks_like,
              card_brand: Map.get(card, "card_brand"),
              card_last4: Map.get(card, "last_4"),
              receipt_url: payment["receipt_url"],
              order_id: payment["order_id"],
              customer_id: payment["customer_id"],
              customer_email: customer_email,
              customer_name: customer_name,
              buyer_email: buyer_email,
              matched_user:
                if matched_user do
                  %{
                    id: matched_user.id,
                    username: matched_user.username,
                    email: matched_user.email,
                    subscription_tier: matched_user.subscription_tier,
                    square_subscription_id: matched_user.square_subscription_id,
                    square_donor_subscription_id: matched_user.square_donor_subscription_id
                  }
                end
            }
          end)

        {:ok, enriched}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Manually grant Plus tier to a user with an explicit expiration date.

  Used for recovery cases like the 2026-04-15 quick_pay bug where users paid
  via a broken Payment Link, got charged once, but never had a subscription
  created. We give them the time they paid for, then they re-subscribe via
  the corrected flow.

  Sets `subscription_tier="plus"`, `subscription_status="active"`,
  `subscription_expires_at=<expires_at>`. Does NOT touch any Square or Stripe
  IDs. Phase 2's grace-period worker will downgrade the user when
  `subscription_expires_at` passes if they haven't re-subscribed.

  Returns `{:ok, user}` or an error.
  """
  def grant_plus_until(email, %DateTime{} = expires_at) when is_binary(email) do
    normalized = email |> String.trim() |> String.downcase()

    case Repo.get_by(User, email: normalized) do
      nil ->
        {:error, :user_not_found}

      %User{} = user ->
        attrs = %{
          subscription_tier: "plus",
          subscription_status: "active",
          subscription_expires_at: expires_at
        }

        case user |> User.subscription_changeset(attrs) |> Repo.update() do
          {:ok, updated} ->
            Logger.info(
              "Manually granted Plus to user #{updated.id} (@#{updated.username}) until #{DateTime.to_iso8601(expires_at)}"
            )

            {:ok, updated}

          {:error, changeset} ->
            {:error, changeset}
        end
    end
  end

  def grant_plus_until(_, _), do: {:error, :invalid_params}

  @doc """
  Reconcile users with billing-relevant state against Square.

  Iterates users with an existing or historical billing relationship (Plus tier,
  Donor active, or any Stripe/Square subscription/customer ID), calls
  `sync_from_square/1` on each with a 300ms delay between calls (~6.67 QPS,
  comfortably under Square's 10 QPS limit), and collects categorized results.

  Skips free users with no billing history — they sync naturally on their
  next billing page visit, OR the admin uses `sync_user_by_email/1` for known
  new Square signups whose webhook didn't fire.

  Returns a summary map with categorized error counts so the admin sees
  "10 rate limited (retry), 65 not found (expected), 0 real errors" instead
  of a wall of raw 429 messages.

  Skips users with no email (extremely rare) and blocked users.
  """
  def reconcile_all_users(opts \\ []) do
    max_users = Keyword.get(opts, :max_users, 1000)

    users =
      from(u in User,
        where: not is_nil(u.email),
        where: is_nil(u.blocked_at),
        where:
          u.subscription_tier == "plus" or
            not is_nil(u.ink_donor_amount_cents) or
            not is_nil(u.square_customer_id) or
            not is_nil(u.square_subscription_id) or
            not is_nil(u.square_donor_subscription_id) or
            not is_nil(u.stripe_subscription_id) or
            not is_nil(u.ink_donor_stripe_subscription_id),
        order_by: [desc: u.inserted_at],
        limit: ^max_users,
        select: u
      )
      |> Repo.all()

    initial = %{
      total_checked: 0,
      plus_activated: 0,
      donor_activated: 0,
      plus_canceled: 0,
      donor_canceled: 0,
      not_found: 0,
      rate_limited: 0,
      errors: 0,
      error_details: []
    }

    users
    |> Enum.with_index()
    |> Enum.reduce(initial, fn {user, idx}, acc ->
      # Per-user 300ms delay to stay under Square's 10 QPS rate limit.
      # Skip the delay before the first user.
      if idx > 0, do: Process.sleep(300)

      case sync_from_square(user) do
        {:ok, _updated, []} ->
          # No changes made to this user. Two possible causes (both non-actionable):
          # 1) Customer not found in Square (legacy Stripe users, etc.)
          # 2) Local state already matches Square (already-synced users)
          # Either way the admin has nothing to do, so we lump them together
          # under :not_found for display purposes.
          acc
          |> Map.update!(:total_checked, &(&1 + 1))
          |> Map.update!(:not_found, &(&1 + 1))

        {:ok, _updated, changes} ->
          acc
          |> Map.update!(:total_checked, &(&1 + 1))
          |> update_change_counts(changes)

        {:error, {:square_error, 429, _body}} ->
          %{
            acc
            | total_checked: acc.total_checked + 1,
              rate_limited: acc.rate_limited + 1
          }

        {:error, reason} ->
          %{
            acc
            | total_checked: acc.total_checked + 1,
              errors: acc.errors + 1,
              error_details:
                [%{user_id: user.id, username: user.username, reason: inspect(reason)} | acc.error_details]
                |> Enum.take(20)
          }
      end
    end)
  end

  defp update_change_counts(acc, changes) do
    Enum.reduce(changes, acc, fn change, acc ->
      case change do
        :plus_activated -> Map.update!(acc, :plus_activated, &(&1 + 1))
        :donor_activated -> Map.update!(acc, :donor_activated, &(&1 + 1))
        :plus_canceled -> Map.update!(acc, :plus_canceled, &(&1 + 1))
        :donor_canceled -> Map.update!(acc, :donor_canceled, &(&1 + 1))
        _ -> acc
      end
    end)
  end

  # ── Public API ──────────────────────────────────────────────────────────

  @doc "Create a checkout session for upgrading to Plus."
  def create_checkout_session(%User{} = user) do
    Square.create_plus_payment_link(user)
  end

  @doc "Create a checkout session for an Ink Donor donation (recurring)."
  def create_donor_checkout_session(%User{} = user, amount_cents) when amount_cents in [100, 200, 300] do
    Square.create_donor_payment_link(user, amount_cents)
  end

  @doc "Create a checkout session for a one-time Ink Donor donation ($1-$500)."
  def create_donation_checkout_session(%User{} = user, amount_cents)
      when is_integer(amount_cents) and amount_cents >= 100 and amount_cents <= 50000 do
    Square.create_donation_payment_link(user, amount_cents)
  end

  @doc "Create a checkout session for Plus during onboarding."
  def create_onboarding_checkout_session(%User{} = user, "plus") do
    Square.create_onboarding_payment_link(user, "plus")
  end

  @doc "Create a checkout session for Ink Donor during onboarding."
  def create_onboarding_checkout_session(%User{} = user, "donor", amount_cents) when amount_cents in [100, 200, 300] do
    Square.create_onboarding_payment_link(user, "donor", amount_cents)
  end

  @doc "Cancel a Plus subscription."
  def cancel_subscription(%User{} = user) do
    cond do
      user.square_subscription_id ->
        case Square.cancel_subscription(user.square_subscription_id) do
          :ok ->
            user
            |> User.subscription_changeset(%{
              subscription_status: "canceled"
            })
            |> Repo.update()

          {:error, reason} ->
            {:error, reason}
        end

      user.stripe_subscription_id ->
        # Legacy Stripe subscription — Stripe account is closed, so these are
        # already defunct. Clear local state so the user can re-subscribe via Square.
        Logger.info("Cancelled legacy Stripe subscription locally for user #{user.id}")

        user
        |> User.subscription_changeset(%{
          stripe_subscription_id: nil,
          subscription_tier: "free",
          subscription_status: "canceled",
          subscription_expires_at: nil
        })
        |> Repo.update()

      true ->
        {:error, :no_subscription}
    end
  end

  @doc "Cancel an Ink Donor subscription."
  def cancel_donor_subscription(%User{} = user) do
    cond do
      user.square_donor_subscription_id ->
        case Square.cancel_subscription(user.square_donor_subscription_id) do
          :ok ->
            user
            |> User.ink_donor_changeset(%{ink_donor_status: "canceled"})
            |> Repo.update()

          {:error, reason} ->
            {:error, reason}
        end

      user.ink_donor_stripe_subscription_id ->
        # Legacy Stripe donor subscription — Stripe account is closed.
        # Clear local state so the user can re-donate via Square.
        Logger.info("Cancelled legacy Stripe donor subscription locally for user #{user.id}")

        user
        |> User.ink_donor_changeset(%{
          ink_donor_stripe_subscription_id: nil,
          ink_donor_status: "canceled",
          ink_donor_amount_cents: nil
        })
        |> Repo.update()

      true ->
        :ok
    end
  end

  @doc "Cancel all subscriptions for a user (used during account deletion)."
  def cancel_all_subscriptions(%User{} = user) do
    # Cancel Plus
    if user.square_subscription_id do
      Square.cancel_subscription(user.square_subscription_id)
    end

    if user.stripe_subscription_id do
      cancel_stripe_subscription(user.stripe_subscription_id)
    end

    # Cancel Donor
    if user.square_donor_subscription_id do
      Square.cancel_subscription(user.square_donor_subscription_id)
    end

    if user.ink_donor_stripe_subscription_id do
      cancel_stripe_subscription(user.ink_donor_stripe_subscription_id)
    end

    :ok
  end

  @doc """
  On-demand reconciliation from Square → local DB.

  Looks up the user's Square customer by email, finds any active Plus or Donor
  subscriptions, and updates the local user record to match. This is the fallback
  when Square webhooks don't reach us (either misconfigured in Square dashboard
  or lost in transit). Safe to call repeatedly — idempotent.

  Lookup strategy (tries each until a subscription is found):
  1. Fuzzy email search on Square customers, then check subscriptions for
     EACH matched customer (not just the first — Square creates duplicate
     customer records on retries).
  2. Full-scan fallback: list all subscriptions for our location, fetch the
     customer for each, match by normalized email. Runs only when step 1
     returns nothing, so per-user API cost is bounded in the normal case.

  Returns `{:ok, user, changes}` where `changes` is a list of atoms describing
  what was updated: `[:plus_activated, :donor_activated, :plus_canceled, :donor_canceled]`.
  Empty list means the local state already matched Square.
  """
  def sync_from_square(%User{} = user) do
    config = Application.get_env(:inkwell, :square, [])
    normalized_email = normalize_email(user.email)

    case find_user_subscriptions(user, normalized_email) do
      {:ok, customer_id, subscriptions} ->
        # Categorize subscriptions by plan variation
        {plus_subs, donor_subs} =
          Enum.split_with(subscriptions, fn sub ->
            not is_donor_plan?(sub["plan_variation_id"], config)
          end)

        # Pick the newest active (or pending) subscription of each type
        plus_sub = pick_newest_active(plus_subs)
        donor_sub = pick_newest_active(donor_subs)

        {updated_user, changes} =
          user
          |> reconcile_plus(plus_sub, customer_id)
          |> reconcile_donor(donor_sub, customer_id, config)

        {:ok, updated_user, changes}

      {:ok, :not_found} ->
        # No customer record in Square for this email — nothing to reconcile
        {:ok, user, []}

      {:error, reason} ->
        Logger.warning("sync_from_square failed for user #{user.id}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # Find Square subscriptions for a user. Tries email-based lookup first
  # (cheap), falls back to full subscription scan if email search misses.
  # Returns {:ok, customer_id, [subs]} on success, {:ok, :not_found} on miss,
  # or {:error, reason} on API failure.
  defp find_user_subscriptions(user, normalized_email) do
    with {:ok, customers} <- Square.search_customers_by_email(user.email),
         {:ok, customer_id, subs} <- check_matched_customers(customers) do
      {:ok, customer_id, subs}
    else
      {:ok, :no_match} ->
        # Email search returned customers but none had subscriptions, OR
        # email search returned nothing. Fall back to full scan.
        full_scan_for_user(normalized_email)

      {:error, reason} ->
        {:error, reason}
    end
  end

  # Check each returned customer for subscriptions. Returns the first customer
  # that has any subscriptions. If none of the matched customers have subs,
  # returns {:ok, :no_match} so the caller can fall back to full scan.
  defp check_matched_customers([]), do: {:ok, :no_match}

  defp check_matched_customers([customer | rest]) do
    customer_id = customer["id"]

    case Square.search_subscriptions_by_customer(customer_id) do
      {:ok, []} ->
        check_matched_customers(rest)

      {:ok, subs} when is_list(subs) ->
        {:ok, customer_id, subs}

      {:error, reason} ->
        {:error, reason}
    end
  end

  # Fallback: list all subscriptions for the location, fetch the customer for
  # each one, match by normalized email (case-insensitive, whitespace-trimmed).
  # Returns {:ok, customer_id, [subs]} if the normalized email matches any
  # subscription's customer, {:ok, :not_found} if nothing matches.
  #
  # Deduplicates customer IDs before fetching to bound API calls: a user with
  # both Plus and Donor has 2 subs sharing one customer, so we only fetch
  # each customer once.
  defp full_scan_for_user(normalized_email) when is_binary(normalized_email) and normalized_email != "" do
    case Square.list_all_subscriptions() do
      {:ok, all_subs} ->
        # Build customer_id → email map (one fetch per unique customer)
        customer_emails =
          all_subs
          |> Enum.map(& &1["customer_id"])
          |> Enum.reject(&is_nil/1)
          |> Enum.uniq()
          |> Enum.into(%{}, fn customer_id ->
            email =
              case fetch_customer_email(customer_id) do
                {:ok, email} -> email
                _ -> nil
              end

            {customer_id, email}
          end)

        # Find the customer_id whose email matches
        matching_customer_id =
          Enum.find_value(customer_emails, fn {customer_id, email} ->
            if normalize_email(email) == normalized_email, do: customer_id, else: nil
          end)

        case matching_customer_id do
          nil ->
            {:ok, :not_found}

          customer_id ->
            # Filter subs to just this customer's subs
            matching_subs = Enum.filter(all_subs, fn sub -> sub["customer_id"] == customer_id end)
            {:ok, customer_id, matching_subs}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp full_scan_for_user(_), do: {:ok, :not_found}

  defp fetch_customer_email(nil), do: {:ok, nil}

  defp fetch_customer_email(customer_id) do
    case Square.get_customer(customer_id) do
      {:ok, customer} -> {:ok, Map.get(customer, "email_address")}
      {:error, _} -> {:ok, nil}
    end
  end

  defp normalize_email(nil), do: ""
  defp normalize_email(email) when is_binary(email), do: email |> String.trim() |> String.downcase()
  defp normalize_email(_), do: ""

  @doc """
  Look up a user by email and sync their Square state.

  Single-purpose admin tool for users whose Square webhook didn't fire and
  who haven't returned to their billing page to trigger the auto-sync. Two
  Square API calls per invocation, no rate limit risk.

  Email matching is case-insensitive (downcased before lookup).

  Returns:
  - `{:ok, user, changes}` — same shape as `sync_from_square/1`
  - `{:error, :user_not_found}` — no user with that email
  - `{:error, reason}` — Square API or other error
  """
  def sync_user_by_email(email) when is_binary(email) do
    normalized = email |> String.trim() |> String.downcase()

    case Repo.get_by(User, email: normalized) do
      nil -> {:error, :user_not_found}
      %User{} = user -> sync_from_square(user)
    end
  end

  def sync_user_by_email(_), do: {:error, :invalid_email}

  @doc """
  Manually attach a Square subscription ID to a local user record — safety net
  for cases where the automatic sync can't find a user but the admin has
  verified the subscription exists in their Square dashboard.

  Looks up the user by email (case-insensitive), fetches the subscription from
  Square to confirm it exists and get its plan_variation_id, then sets the
  correct local field (square_subscription_id OR square_donor_subscription_id)
  based on whether the plan is Plus or Donor.

  Returns `{:ok, user, type}` where type is `:plus` or `:donor`, or an error.
  """
  def attach_square_subscription(email, subscription_id)
      when is_binary(email) and is_binary(subscription_id) do
    normalized = email |> String.trim() |> String.downcase()
    sub_id = String.trim(subscription_id)

    with {:user, %User{} = user} <- {:user, Repo.get_by(User, email: normalized)},
         {:sub, {:ok, sub}} <- {:sub, Square.get_subscription(sub_id)},
         {:active, true} <- {:active, sub["status"] in ["ACTIVE", "PENDING"]} do
      config = Application.get_env(:inkwell, :square, [])
      plan_variation_id = sub["plan_variation_id"]
      customer_id = sub["customer_id"]
      square_status = sub["status"]
      inkwell_status = Square.map_subscription_status(square_status)

      cond do
        is_donor_plan?(plan_variation_id, config) ->
          amount_cents = amount_from_donor_plan(plan_variation_id, config)

          {:ok, updated} =
            user
            |> User.ink_donor_changeset(%{
              square_customer_id: customer_id,
              square_donor_subscription_id: sub_id,
              ink_donor_status: inkwell_status,
              ink_donor_amount_cents: amount_cents
            })
            |> Repo.update()

          Logger.info("Manually attached Square Donor subscription #{sub_id} to user #{user.id}")
          {:ok, updated, :donor}

        true ->
          {:ok, updated} =
            user
            |> User.subscription_changeset(%{
              square_customer_id: customer_id,
              square_subscription_id: sub_id,
              subscription_tier: "plus",
              subscription_status: "active",
              stripe_subscription_id: nil
            })
            |> Repo.update()

          Logger.info("Manually attached Square Plus subscription #{sub_id} to user #{user.id}")
          {:ok, updated, :plus}
      end
    else
      {:user, nil} -> {:error, :user_not_found}
      {:sub, {:error, reason}} -> {:error, {:subscription_fetch_failed, reason}}
      {:active, false} -> {:error, :subscription_not_active}
      err -> {:error, err}
    end
  end

  def attach_square_subscription(_, _), do: {:error, :invalid_params}

  defp amount_from_donor_plan(plan_variation_id, config) do
    cond do
      plan_variation_id == config[:donor_plan_variation_1] -> 100
      plan_variation_id == config[:donor_plan_variation_2] -> 200
      plan_variation_id == config[:donor_plan_variation_3] -> 300
      true -> nil
    end
  end

  defp pick_newest_active([]), do: nil
  defp pick_newest_active(subs) do
    subs
    |> Enum.filter(fn sub -> sub["status"] in ["ACTIVE", "PENDING"] end)
    |> Enum.sort_by(fn sub -> sub["created_at"] || "" end, :desc)
    |> List.first()
  end

  # Reconcile Plus subscription state. Returns {updated_user, changes_list}.
  defp reconcile_plus(user, nil, _customer_id) do
    # No active Plus subscription in Square. If local state says we have one,
    # clear it. Otherwise leave alone.
    if user.square_subscription_id && user.subscription_status == "active" do
      {:ok, updated} =
        user
        |> User.subscription_changeset(%{
          square_subscription_id: nil,
          subscription_status: "canceled",
          subscription_tier: "free"
        })
        |> Repo.update()

      Logger.info("sync_from_square: cleared stale Plus state for user #{user.id}")
      {updated, [:plus_canceled]}
    else
      {user, []}
    end
  end

  defp reconcile_plus(user, plus_sub, customer_id) do
    sub_id = plus_sub["id"]
    square_status = plus_sub["status"]
    inkwell_status = Square.map_subscription_status(square_status)

    already_matches =
      user.square_subscription_id == sub_id and
        user.subscription_tier == "plus" and
        user.subscription_status == "active" and
        not is_nil(user.square_customer_id)

    if already_matches do
      {user, []}
    else
      # Also clear legacy Stripe state if present — they're now on Square
      attrs = %{
        stripe_subscription_id: nil,
        square_customer_id: customer_id,
        square_subscription_id: sub_id,
        subscription_tier: "plus",
        subscription_status: inkwell_status
      }

      {:ok, updated} =
        user
        |> User.subscription_changeset(attrs)
        |> Repo.update()

      Logger.info("sync_from_square: activated Plus for user #{user.id} (sub #{sub_id})")

      # Notify Slack (first-time activation only)
      if is_nil(user.square_subscription_id) do
        Inkwell.Slack.notify_plus_subscription(updated.username)
      end

      {updated, [:plus_activated]}
    end
  end

  # Reconcile Donor subscription state.
  defp reconcile_donor(user_tuple, nil, _customer_id, _config) do
    {user, changes} = user_tuple

    if user.square_donor_subscription_id && user.ink_donor_status == "active" do
      {:ok, updated} =
        user
        |> User.ink_donor_changeset(%{
          square_donor_subscription_id: nil,
          ink_donor_status: "canceled",
          ink_donor_amount_cents: nil
        })
        |> Repo.update()

      Logger.info("sync_from_square: cleared stale Donor state for user #{user.id}")
      {updated, changes ++ [:donor_canceled]}
    else
      {user, changes}
    end
  end

  defp reconcile_donor(user_tuple, donor_sub, _customer_id, config) do
    {user, changes} = user_tuple
    sub_id = donor_sub["id"]
    square_status = donor_sub["status"]
    inkwell_status = Square.map_subscription_status(square_status)
    plan_variation_id = donor_sub["plan_variation_id"]
    amount_cents = donor_amount_for_plan(plan_variation_id, config)

    already_matches =
      user.square_donor_subscription_id == sub_id and
        user.ink_donor_status == "active"

    if already_matches do
      {user, changes}
    else
      attrs = %{
        ink_donor_stripe_subscription_id: nil,
        square_donor_subscription_id: sub_id,
        ink_donor_status: inkwell_status,
        ink_donor_amount_cents: amount_cents
      }

      {:ok, updated} =
        user
        |> User.ink_donor_changeset(attrs)
        |> Repo.update()

      Logger.info("sync_from_square: activated Donor for user #{user.id} (sub #{sub_id}, $#{(amount_cents || 0) / 100}/mo)")

      if is_nil(user.square_donor_subscription_id) do
        Inkwell.Slack.notify_ink_donor(updated.username, amount_cents)
      end

      {updated, changes ++ [:donor_activated]}
    end
  end

  # ── Webhook Processing (Square) ─────────────────────────────────────────

  @doc "Verify a Square webhook signature."
  def verify_webhook_signature(raw_body, signature_header) do
    # Determine notification URL from config
    api_url = Application.get_env(:inkwell, :api_url, "https://api.inkwell.social")
    notification_url = "#{api_url}/api/billing/webhook"
    Square.verify_webhook_signature(raw_body, signature_header, notification_url)
  end

  @doc "Process a Square webhook event."
  def handle_webhook_event(%{"type" => type, "data" => %{"object" => object}}) do
    case type do
      "subscription.created" ->
        handle_subscription_created(object)

      "subscription.updated" ->
        handle_square_subscription_updated(object)

      "invoice.payment_made" ->
        handle_invoice_payment_made(object)

      # Square renamed this event — support both old and current names
      "invoice.payment_failed" ->
        handle_invoice_payment_failed(object)

      "invoice.scheduled_charge_failed" ->
        handle_invoice_payment_failed(object)

      "dispute.created" ->
        handle_dispute_created(object)

      "dispute.state.changed" ->
        handle_dispute_created(object)

      # payment.completed isn't a real Square event — payment.updated is emitted
      # when a payment reaches COMPLETED status. We filter by status inside the
      # handler so we only act on actually-completed payments.
      "payment.updated" ->
        handle_payment_completed(object)

      "payment.completed" ->
        handle_payment_completed(object)

      _ ->
        Logger.info("Ignoring Square event: #{type}")
        :ok
    end
  end

  def handle_webhook_event(%{"type" => type} = event) do
    # Some Square events have data at top level
    object = get_in(event, ["data", "object"]) || event["data"] || %{}
    handle_webhook_event(%{"type" => type, "data" => %{"object" => object}})
  end

  def handle_webhook_event(_), do: :ok

  # ── Private: Square Webhook Handlers ──────────────────────────────────

  defp handle_subscription_created(%{"subscription" => sub}) do
    handle_subscription_created(sub)
  end

  defp handle_subscription_created(%{"id" => sub_id, "customer_id" => customer_id} = sub) do
    plan_variation_id = get_in(sub, ["plan_variation_id"])
    config = Application.get_env(:inkwell, :square, [])

    # Try customer ID first, then fall back to email lookup via Square API
    user =
      find_user_by_square_customer(customer_id) ||
        find_user_by_email_from_square(customer_id)

    case user do
      nil ->
        Logger.error("subscription.created — no user found for Square customer #{customer_id}")
        :error

      user ->
        if is_donor_plan?(plan_variation_id, config) do
          amount_cents = donor_amount_for_plan(plan_variation_id, config)

          user
          |> User.ink_donor_changeset(%{
            square_donor_subscription_id: sub_id,
            ink_donor_status: "active",
            ink_donor_amount_cents: amount_cents
          })
          |> Repo.update()

          # Also store customer ID if not set
          maybe_set_square_customer(user, customer_id)

          Logger.info("User #{user.username} became an Ink Donor ($#{(amount_cents || 0) / 100}/mo via Square)")
          Inkwell.Slack.notify_ink_donor(user.username, amount_cents)
        else
          user
          |> User.subscription_changeset(%{
            square_customer_id: customer_id,
            square_subscription_id: sub_id,
            subscription_tier: "plus",
            subscription_status: "active"
          })
          |> Repo.update()

          Logger.info("User #{user.username} upgraded to Plus via Square (sub: #{sub_id})")
          Inkwell.Slack.notify_plus_subscription(user.username)
        end

        :ok
    end
  end

  defp handle_subscription_created(_), do: :ok

  defp handle_square_subscription_updated(%{"subscription" => sub}) do
    handle_square_subscription_updated(sub)
  end

  defp handle_square_subscription_updated(%{"id" => sub_id, "status" => status} = sub) do
    customer_id = sub["customer_id"]
    plan_variation_id = sub["plan_variation_id"]
    config = Application.get_env(:inkwell, :square, [])
    inkwell_status = Square.map_subscription_status(status)

    user = find_user_by_square_customer(customer_id) || find_user_by_square_subscription(sub_id)

    case user do
      nil ->
        Logger.warning("subscription.updated — no user for Square subscription #{sub_id}")
        :ok

      user ->
        if is_donor_plan?(plan_variation_id, config) or sub_id == user.square_donor_subscription_id do
          user
          |> User.ink_donor_changeset(%{
            square_donor_subscription_id: sub_id,
            ink_donor_status: inkwell_status
          })
          |> Repo.update()

          if inkwell_status == "canceled" do
            Logger.info("Ink Donor canceled for #{user.username} (Square)")
            Inkwell.Slack.notify_donor_cancellation(user.username)
          end
        else
          expires_at = case sub["charged_through_date"] do
            date when is_binary(date) ->
              case Date.from_iso8601(date) do
                {:ok, d} -> DateTime.new!(d, ~T[23:59:59], "Etc/UTC")
                _ -> nil
              end
            _ -> nil
          end

          tier = if inkwell_status in ["active"], do: "plus", else: user.subscription_tier

          user
          |> User.subscription_changeset(%{
            square_subscription_id: sub_id,
            subscription_status: inkwell_status,
            subscription_tier: tier,
            subscription_expires_at: expires_at
          })
          |> Repo.update()

          if inkwell_status == "canceled" do
            Logger.info("Plus subscription canceled for #{user.username} (Square)")
            Inkwell.Slack.notify_plus_cancellation(user.username)
            maybe_deactivate_custom_domain(user.id)
          end
        end

        :ok
    end
  end

  defp handle_square_subscription_updated(_), do: :ok

  defp handle_invoice_payment_made(%{"subscription_id" => sub_id}) when is_binary(sub_id) do
    user = find_user_by_square_subscription(sub_id)

    case user do
      nil -> :ok
      user ->
        # Confirm subscription is active
        if sub_id == user.square_donor_subscription_id do
          user |> User.ink_donor_changeset(%{ink_donor_status: "active"}) |> Repo.update()
        else
          user |> User.subscription_changeset(%{subscription_status: "active"}) |> Repo.update()
        end

        :ok
    end
  end

  defp handle_invoice_payment_made(_), do: :ok

  defp handle_invoice_payment_failed(%{"subscription_id" => sub_id}) when is_binary(sub_id) do
    user = find_user_by_square_subscription(sub_id)

    case user do
      nil -> :ok
      user ->
        if sub_id == user.square_donor_subscription_id do
          user |> User.ink_donor_changeset(%{ink_donor_status: "past_due"}) |> Repo.update()
          Logger.warning("Ink Donor payment failed for #{user.username} (Square)")
          Inkwell.Slack.notify_payment_failed(user.username, :donor)
        else
          user |> User.subscription_changeset(%{subscription_status: "past_due"}) |> Repo.update()
          Logger.warning("Payment failed for #{user.username} — marked past_due (Square)")
          Inkwell.Slack.notify_payment_failed(user.username, :plus)
        end

        :ok
    end
  end

  defp handle_invoice_payment_failed(_), do: :ok

  # ── Private: Dispute/Chargeback handler (same auto-block as Stripe) ────

  defp handle_dispute_created(%{"amount_money" => %{"amount" => amount}} = object) do
    customer_id = object["customer_id"]
    reason = object["reason"]

    Logger.error("DISPUTE CREATED (Square): customer=#{customer_id}, amount=#{amount}, reason=#{reason}")

    user = if customer_id, do: find_user_by_square_customer(customer_id), else: nil

    case user do
      nil ->
        Logger.error("Dispute — no user found for Square customer #{customer_id}")
        Inkwell.Slack.notify_dispute(nil, amount, reason)
        :ok

      user ->
        # Auto-block the user immediately
        Inkwell.Accounts.block_user(user)
        Logger.error("FRAUD: Auto-blocked user #{user.username} due to Square dispute")

        # Cancel all subscriptions
        cancel_all_subscriptions(user)

        Inkwell.Slack.notify_dispute(user.username, amount, reason)
        :ok
    end
  end

  defp handle_dispute_created(_) do
    Logger.warning("dispute.created — missing amount data")
    :ok
  end

  # ── Handle One-Time Donation Payments ──────────────────────────────────

  defp handle_payment_completed(%{"payment" => payment}), do: handle_payment_completed(payment)

  defp handle_payment_completed(%{"amount_money" => %{"amount" => amount_cents}, "status" => status} = payment)
       when status in ["COMPLETED", "APPROVED"] do
    # One-time donations have no subscription_id — subscription payments are handled
    # via invoice.payment_made, so we only notify here for non-subscription payments
    if is_nil(payment["subscription_id"]) do
      customer_id = payment["customer_id"]
      user = if customer_id, do: find_user_by_square_customer(customer_id) || find_user_by_email_from_square(customer_id)
      username = if user, do: user.username, else: "unknown"

      Logger.info("One-time donation received: #{amount_cents} cents from #{username}")
      Inkwell.Slack.notify_donation(username, amount_cents)
    end

    :ok
  end

  defp handle_payment_completed(%{"status" => status}) do
    # payment.updated fires on every status change; only act on completed payments
    Logger.debug("Ignoring payment.updated with status #{status}")
    :ok
  end

  defp handle_payment_completed(_) do
    Logger.info("payment.completed — no amount data, skipping")
    :ok
  end

  # ── Private: Helpers ───────────────────────────────────────────────────

  defp find_user_by_square_customer(nil), do: nil
  defp find_user_by_square_customer(customer_id) do
    Repo.one(from u in User, where: u.square_customer_id == ^customer_id)
  end

  defp find_user_by_square_subscription(nil), do: nil
  defp find_user_by_square_subscription(sub_id) do
    Repo.one(
      from u in User,
        where: u.square_subscription_id == ^sub_id or u.square_donor_subscription_id == ^sub_id
    )
  end

  # Fetch customer from Square API to get email, then look up user by email
  defp find_user_by_email_from_square(nil), do: nil
  defp find_user_by_email_from_square(customer_id) do
    case Square.get_customer(customer_id) do
      {:ok, %{"email_address" => email}} when is_binary(email) and email != "" ->
        Repo.one(from u in User, where: u.email == ^email)

      _ ->
        nil
    end
  end

  defp maybe_set_square_customer(user, customer_id) do
    if is_nil(user.square_customer_id) do
      user |> User.subscription_changeset(%{square_customer_id: customer_id}) |> Repo.update()
    end
  end

  defp is_donor_plan?(nil, _config), do: false
  defp is_donor_plan?(plan_variation_id, config) do
    donor_ids = [config[:donor_plan_variation_1], config[:donor_plan_variation_2], config[:donor_plan_variation_3]]
    |> Enum.reject(fn id -> is_nil(id) or id == "" end)

    plan_variation_id in donor_ids
  end

  defp donor_amount_for_plan(nil, _config), do: nil
  defp donor_amount_for_plan(plan_variation_id, config) do
    cond do
      plan_variation_id == config[:donor_plan_variation_1] -> 100
      plan_variation_id == config[:donor_plan_variation_2] -> 200
      plan_variation_id == config[:donor_plan_variation_3] -> 300
      true -> nil
    end
  end

  defp maybe_deactivate_custom_domain(user_id) do
    case Inkwell.CustomDomains.get_domain_by_user(user_id) do
      nil ->
        :ok

      domain when domain.status in ["active", "pending_cert", "pending_dns"] ->
        Inkwell.CustomDomains.update_status(domain, "removed")

        if domain.status in ["active", "pending_cert"] do
          Inkwell.Workers.CustomDomainCertWorker.new(%{
            "action" => "delete",
            "hostname" => domain.domain
          })
          |> Oban.insert()
        end

      _domain ->
        :ok
    end
  end

  # ── Legacy Stripe helpers (for canceling existing Stripe subscriptions) ──

  @stripe_api "https://api.stripe.com/v1"

  defp cancel_stripe_subscription(subscription_id) do
    secret_key = Application.get_env(:inkwell, :stripe, [])[:secret_key]

    if is_nil(secret_key) or secret_key == "" do
      Logger.warning("STRIPE_SECRET_KEY not set — cannot cancel Stripe subscription #{subscription_id}")
      {:error, :stripe_not_configured}
    else
      url = ~c"#{@stripe_api}/subscriptions/#{subscription_id}"

      headers = [
        {~c"authorization", ~c"Bearer #{secret_key}"}
      ]

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :delete,
             {url, headers},
             [ssl: Inkwell.SSL.httpc_opts()],
             []
           ) do
        {:ok, {{_, status, _}, _headers, _resp_body}} when status in 200..299 ->
          Logger.info("Canceled legacy Stripe subscription #{subscription_id}")
          :ok

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          Logger.error("Stripe cancel error #{status}: #{to_string(resp_body)}")
          {:error, {:stripe_error, status}}

        {:error, reason} ->
          Logger.error("Stripe HTTP error canceling #{subscription_id}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end
end
