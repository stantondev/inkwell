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
    # Only a successful run counts. A failed attempt is recorded too, and
    # counting it made every Oban retry skip the event, so retries never ran.
    Repo.exists?(from(we in WebhookEvent, where: we.event_id == ^event_id and we.status == "processed"))
  end

  @doc "Record a processed webhook event for deduplication."
  def record_event(event_id, event_type, status \\ "processed") do
    %WebhookEvent{}
    |> WebhookEvent.changeset(%{event_id: event_id, event_type: event_type, status: status})
    |> Repo.insert(on_conflict: {:replace, [:status]}, conflict_target: :event_id)
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

  @doc """
  Called by the `EffectiveTier` plug on every signed-in request. An account
  whose Plus time has run out is handed back as free. When no Square
  subscription is on file (a manual grant) the row is updated too, so admin
  lists and background jobs agree; with one on file the row is left for
  Square's webhook to settle and only this request sees free.
  """
  def end_plus_if_time_ran_out(%User{} = user) do
    cond do
      not User.plus_time_ran_out?(user) ->
        user

      is_nil(user.square_subscription_id) ->
        case downgrade_expired_plus(user) do
          {:ok, updated} -> updated
          _ -> %{user | subscription_tier: "free"}
        end

      true ->
        %{user | subscription_tier: "free"}
    end
  end

  def end_plus_if_time_ran_out(user), do: user

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
  IDs. The admin can manually run grace expiration from the admin panel's
  advanced tools, or the user naturally sees the free tier when
  `subscription_expires_at` passes if they haven't re-subscribed.

  Returns `{:ok, user}` or an error.
  """
  def grant_plus_until(email, %DateTime{} = expires_at) when is_binary(email) do
    normalized = email |> String.trim() |> String.downcase()

    case Repo.get_by(User, email: normalized) do
      nil -> {:error, :user_not_found}
      %User{} = user -> apply_grant_plus(user, expires_at)
    end
  end

  def grant_plus_until(_, _), do: {:error, :invalid_params}

  @doc """
  Same as `grant_plus_until/2` but looks up the user by username instead of
  email. Useful for the admin UI when the admin doesn't know or doesn't want
  to look up the user's email (e.g., extending Plus for a known user by
  their handle). A leading `@` is stripped if present.
  """
  def grant_plus_to_username_until(username, %DateTime{} = expires_at) when is_binary(username) do
    normalized =
      username
      |> String.trim()
      |> String.trim_leading("@")
      |> String.downcase()

    case Repo.get_by(User, username: normalized) do
      nil -> {:error, :user_not_found}
      %User{} = user -> apply_grant_plus(user, expires_at)
    end
  end

  def grant_plus_to_username_until(_, _), do: {:error, :invalid_params}

  # Shared grant logic used by both email and username lookup paths.
  #
  # Also clears any stale legacy Stripe ID (Stripe is gone).
  #
  # Status is "canceled" (not "active"): the user isn't paying; they have
  # access until expires_at and are free from then on
  # (`User.plus_time_ran_out?/1`). Same shape as a cancel-at-period-end.
  defp apply_grant_plus(%User{} = user, %DateTime{} = expires_at) do
    attrs = %{
      subscription_tier: "plus",
      subscription_status: "canceled",
      subscription_expires_at: expires_at,
      stripe_subscription_id: nil
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

  @doc """
  Expire the grace period for Plus users whose subscription has been canceled
  (manually via grant_plus_until, via admin cancel, or via a user-initiated
  cancel-at-period-end flow) and whose `subscription_expires_at` has passed.

  Run from the admin panel (preview = dry_run: true, run = dry_run: false).
  There is deliberately no cron: an account whose time has run out is
  already treated as free everywhere (`User.plus_time_ran_out?/1`), and a
  manual grant's row is updated the next time its owner signs in
  (`end_plus_if_time_ran_out/1`). This just tidies rows early.
  The admin Billing page (`Billing.AdminOverview`) flags them.

  Supports a `:dry_run` option (default false). In dry run mode, returns the
  list of candidates without actually downgrading them — used by the preview
  endpoint so the admin can audit what the worker would do before the cron
  fires.

  The filter matches any user who is in "cancel-at-period-end" state:
  - `subscription_tier == "plus"` — only Plus users (donors are separate)
  - `subscription_status == "canceled"` — cancel flow has been triggered
    (either by grant_plus_until, admin cancel, or user cancel)
  - `subscription_expires_at < now()` — the paid/granted period has passed

  Donor status is intentionally not touched — donors are independent of Plus
  and expire via the admin panel's manual grace expiration tool.

  Returns a map:

      %{
        dry_run: boolean,
        checked_at: DateTime.t(),
        candidates: [user_summary, ...],
        downgraded: [user_summary, ...],  # empty if dry_run
        errors: [%{user_id, username, reason}, ...]
      }
  """
  def expire_grace_periods(opts \\ []) do
    dry_run = Keyword.get(opts, :dry_run, false)
    now = DateTime.utc_now()

    candidates =
      from(u in User,
        where: u.subscription_tier == "plus",
        where: u.subscription_status == "canceled",
        where: not is_nil(u.subscription_expires_at),
        where: u.subscription_expires_at < ^now,
        where: is_nil(u.founding_member_number),
        order_by: [asc: u.subscription_expires_at],
        select: u
      )
      |> Repo.all()
      # Never downgrade on a guess: someone who still has a Square
      # subscription on file only loses Plus once Square confirms it ended.
      |> Enum.filter(&still_unpaid?/1)

    candidate_summaries = Enum.map(candidates, &grace_user_summary/1)

    if dry_run do
      %{
        dry_run: true,
        checked_at: now,
        candidates: candidate_summaries,
        downgraded: [],
        errors: []
      }
    else
      {downgraded, errors} =
        Enum.reduce(candidates, {[], []}, fn user, {ok_acc, err_acc} ->
          case downgrade_expired_plus(user) do
            {:ok, updated} ->
              {[grace_user_summary(updated) | ok_acc], err_acc}

            {:error, changeset} ->
              error = %{
                user_id: user.id,
                username: user.username,
                reason: inspect(changeset.errors)
              }

              {ok_acc, [error | err_acc]}
          end
        end)

      %{
        dry_run: false,
        checked_at: now,
        candidates: candidate_summaries,
        downgraded: Enum.reverse(downgraded),
        errors: Enum.reverse(errors)
      }
    end
  end

  defp grace_user_summary(%User{} = u) do
    %{
      id: u.id,
      username: u.username,
      email: u.email,
      subscription_expires_at: u.subscription_expires_at
    }
  end

  # A canceled member with no Square subscription on file (a manual grant,
  # or a subscription whose id was already cleared) has nothing to check.
  # With one on file, Square must confirm it is no longer billing them;
  # any doubt — Square unreachable, still ACTIVE with no cancel date —
  # leaves them on Plus and they stay flagged on the admin page.
  defp still_unpaid?(%User{square_subscription_id: nil}), do: true

  defp still_unpaid?(%User{square_subscription_id: sub_id} = user) do
    case Square.get_subscription(sub_id) do
      {:ok, %{"status" => status}} when status in ["CANCELED", "DEACTIVATED"] ->
        true

      {:ok, %{"status" => "ACTIVE", "canceled_date" => date}} when is_binary(date) ->
        # Scheduled cancel. Our expiry has passed, so Square's should have too.
        case Date.from_iso8601(date) do
          {:ok, d} -> Date.compare(d, Date.utc_today()) != :gt
          _ -> false
        end

      {:ok, %{"status" => status}} ->
        Logger.warning(
          "[grace expiration] Kept Plus for @#{user.username}: canceled locally but Square subscription #{sub_id} is #{status}"
        )

        false

      {:error, reason} ->
        Logger.warning(
          "[grace expiration] Kept Plus for @#{user.username}: couldn't check Square (#{inspect(reason)})"
        )

        false
    end
  end

  defp downgrade_expired_plus(%User{} = user) do
    attrs = %{
      subscription_tier: "free",
      subscription_status: "canceled",
      subscription_expires_at: nil
    }

    case user |> User.subscription_changeset(attrs) |> Repo.update() do
      {:ok, updated} ->
        maybe_deactivate_custom_domain(updated.id)

        Logger.info(
          "[grace expiration] Downgraded @#{updated.username} (#{updated.id}) — grace expired at #{DateTime.to_iso8601(user.subscription_expires_at)}"
        )

        {:ok, updated}

      error ->
        Logger.error(
          "[grace expiration] Failed to downgrade @#{user.username} (#{user.id}): #{inspect(error)}"
        )

        error
    end
  end

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
                [
                  %{user_id: user.id, username: user.username, reason: inspect(reason)}
                  | acc.error_details
                ]
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

  @doc """
  Ensure the user has a Square customer record. Idempotent — returns existing
  `square_customer_id` if set, otherwise creates a new Square customer tagged
  with `reference_id = user.id` and persists the ID on the user.

  This is the Stripe-parity equivalent of pre-creating a Stripe customer
  before checkout: it gives us a stable Square-native identifier that binds
  subsequent subscription/payment webhooks back to the Inkwell user,
  regardless of what email the buyer types at Square checkout.

  Returns:
    * `{:ok, customer_id, user}` — success (user is updated if we just
      created the customer)
    * `{:error, :square_not_configured}` — Square credentials missing
    * `{:error, reason}` — Square API error
  """
  def ensure_square_customer(%User{square_customer_id: cid} = user)
      when is_binary(cid) and cid != "" do
    {:ok, cid, user}
  end

  def ensure_square_customer(%User{} = user) do
    attrs = build_square_customer_attrs(user)

    case Square.create_customer(attrs) do
      {:ok, %{"id" => customer_id}} ->
        case user
             |> User.subscription_changeset(%{square_customer_id: customer_id})
             |> Repo.update() do
          {:ok, updated} ->
            Logger.info(
              "[Billing] Pre-created Square customer #{customer_id} for @#{user.username} (user #{user.id})"
            )

            {:ok, customer_id, updated}

          {:error, changeset} ->
            Logger.error(
              "[Billing] Created Square customer #{customer_id} but failed to persist on user #{user.id}: #{inspect(changeset.errors)}"
            )

            {:error, :persist_failed}
        end

      {:error, reason} ->
        Logger.error(
          "[Billing] Failed to create Square customer for user #{user.id} (@#{user.username}): #{inspect(reason)}"
        )

        {:error, reason}
    end
  end

  # Build the Square CreateCustomer payload from an Inkwell user. Tags the
  # customer with `reference_id = user.id` so webhook handlers can resolve
  # the Inkwell user from any Square customer record we've created, even
  # when the email doesn't match.
  defp build_square_customer_attrs(%User{} = user) do
    base = %{
      "reference_id" => user.id,
      "note" => "Inkwell user @#{user.username}"
    }

    base =
      if fediverse_placeholder_email?(user.email) do
        base
      else
        Map.put(base, "email_address", user.email)
      end

    cond do
      is_binary(user.display_name) and user.display_name != "" ->
        case String.split(user.display_name, " ", parts: 2) do
          [given] ->
            Map.put(base, "given_name", given)

          [given, family] ->
            base
            |> Map.put("given_name", given)
            |> Map.put("family_name", family)
        end

      true ->
        Map.put(base, "given_name", user.username)
    end
  end

  defp fediverse_placeholder_email?(email) when is_binary(email) do
    String.ends_with?(email, ".fediverse.inkwell.social")
  end

  defp fediverse_placeholder_email?(_), do: false

  @doc "Create a checkout session for upgrading to Plus."
  def create_checkout_session(%User{} = user) do
    with_square_customer(user, fn customer_id, user ->
      Square.create_plus_payment_link(user, customer_id)
    end)
  end

  @doc "Create a checkout session for yearly Plus. `return_to` is :billing or :onboarding."
  def create_plus_annual_checkout_session(%User{} = user, return_to) do
    with_square_customer(user, fn customer_id, user ->
      Square.create_plus_annual_payment_link(user, customer_id, return_to)
    end)
  end

  @doc "Create a checkout session for an Ink Donor donation (recurring)."
  def create_donor_checkout_session(%User{} = user, amount_cents)
      when amount_cents in [100, 200, 300] do
    with_square_customer(user, fn customer_id, user ->
      Square.create_donor_payment_link(user, amount_cents, customer_id)
    end)
  end

  @doc "Create a checkout session for a one-time Ink Donor donation ($1-$500)."
  def create_donation_checkout_session(%User{} = user, amount_cents)
      when is_integer(amount_cents) and amount_cents >= 100 and amount_cents <= 50000 do
    with_square_customer(user, fn customer_id, user ->
      Square.create_donation_payment_link(user, amount_cents, customer_id)
    end)
  end

  @doc "Create a checkout session for Plus during onboarding."
  def create_onboarding_checkout_session(%User{} = user, "plus") do
    with_square_customer(user, fn customer_id, user ->
      Square.create_onboarding_payment_link(user, "plus", customer_id)
    end)
  end

  @doc "Create a checkout session for Ink Donor during onboarding."
  def create_onboarding_checkout_session(%User{} = user, "donor", amount_cents)
      when amount_cents in [100, 200, 300] do
    with_square_customer(user, fn customer_id, user ->
      Square.create_onboarding_payment_link(user, "donor", amount_cents, customer_id)
    end)
  end

  # Run `fun` with a guaranteed Square customer_id. Bubbles up errors from
  # ensure_square_customer/1 so callers don't have to handle them explicitly.
  defp with_square_customer(%User{} = user, fun) when is_function(fun, 2) do
    case ensure_square_customer(user) do
      {:ok, customer_id, user} -> fun.(customer_id, user)
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Cancel a Plus subscription. Square schedules the cancel for the end of the
  current billing period (`canceled_date`); we record that date as
  `subscription_expires_at` right away rather than waiting for the webhook, so
  plus_checkout_state/1 can see the paid period immediately.
  """
  def cancel_subscription(%User{} = user) do
    cond do
      user.square_subscription_id ->
        case Square.cancel_subscription_with_details(user.square_subscription_id) do
          {:ok, sub} -> mark_plus_canceled(user, sub)
          {:error, reason} -> {:error, reason}
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

  # ── Plus checkout guard ────────────────────────────────────────────────
  #
  # Square has no customer portal, so a member can't update the card on an
  # existing subscription. Starting a second checkout while the first
  # subscription is still live means Square bills both. Every Plus checkout
  # goes through plus_checkout_state/1:
  #
  #   * active                → already subscribed.
  #   * past_due (card failed) → refused. The billing page offers "Cancel and
  #     start over": it cancels the failing subscription, then opens checkout.
  #     The failed period was never paid, so the new subscription overlaps
  #     nothing.
  #   * canceled, paid period still running (a scheduled cancel) → refused.
  #     A new subscription would charge again for days already paid. The
  #     billing page offers "Keep my Plus" instead (resume_subscription/1),
  #     which undoes the scheduled cancel so the existing subscription simply
  #     renews on its usual date. Once the paid period is over, checkout opens.
  #   * canceled after a failed payment → allowed straight away (see
  #     @unpaid_cancel_key).

  # When a member cancels a past_due subscription we remember which one, in
  # settings. Square still reports it as a scheduled cancel with a future
  # canceled_date (the unpaid period), which would otherwise look exactly like
  # a paid-up member who canceled, and block the new checkout they need.
  @unpaid_cancel_key "plus_unpaid_canceled_subscription_id"

  @doc """
  Whether this user can start a new Plus checkout without being billed twice.
  Returns `:allowed`, `:already_subscribed`, `:payment_failed` or
  `:cancel_scheduled`.
  """
  def plus_checkout_state(%User{} = user, now \\ DateTime.utc_now()) do
    cond do
      User.founding_member?(user) -> :already_subscribed
      is_nil(user.square_subscription_id) -> :allowed
      user.subscription_status == "active" -> :already_subscribed
      user.subscription_status == "past_due" -> :payment_failed
      paid_period_running?(user, now) and not canceled_unpaid?(user) -> :cancel_scheduled
      true -> :allowed
    end
  end

  @doc "Whether the user's canceled Plus subscription can be resumed (the cancel undone)."
  def plus_resumable?(%User{} = user, now \\ DateTime.utc_now()) do
    plus_checkout_state(user, now) == :cancel_scheduled
  end

  defp paid_period_running?(%User{} = user, now) do
    user.subscription_status == "canceled" and
      match?(%DateTime{}, user.subscription_expires_at) and
      DateTime.compare(user.subscription_expires_at, now) == :gt
  end

  defp canceled_unpaid?(%User{} = user) do
    is_binary(user.square_subscription_id) and
      get_in(user.settings || %{}, [@unpaid_cancel_key]) == user.square_subscription_id
  end

  @doc false
  # Local bookkeeping after Square accepted a Plus cancel. `sub` is Square's
  # subscription from the cancel response (nil if it didn't include one).
  def mark_plus_canceled(%User{} = user, sub) do
    attrs =
      case square_period_end(sub) do
        %DateTime{} = ends -> %{subscription_status: "canceled", subscription_expires_at: ends}
        nil -> %{subscription_status: "canceled"}
      end

    changeset = User.subscription_changeset(user, attrs)

    changeset =
      if user.subscription_status == "past_due" do
        settings = Map.put(user.settings || %{}, @unpaid_cancel_key, user.square_subscription_id)
        Ecto.Changeset.put_change(changeset, :settings, settings)
      else
        changeset
      end

    Repo.update(changeset)
  end

  # The date a Square subscription is paid (or scheduled to end) through, as
  # the end of that day in UTC.
  defp square_period_end(%{} = sub) do
    case sub["canceled_date"] || sub["charged_through_date"] do
      date when is_binary(date) ->
        case Date.from_iso8601(date) do
          {:ok, d} -> DateTime.new!(d, ~T[23:59:59], "Etc/UTC")
          _ -> nil
        end

      _ ->
        nil
    end
  end

  defp square_period_end(_), do: nil

  @doc """
  Undo a scheduled Plus cancel: delete Square's pending CANCEL action so the
  existing subscription keeps renewing on its usual card and date. Nothing is
  charged now. Only for a paid-up member who canceled (plus_resumable?/1).
  """
  def resume_subscription(%User{} = user) do
    if plus_resumable?(user) do
      sub_id = user.square_subscription_id

      with {:ok, sub} <- Square.get_subscription_with_actions(sub_id),
           {:ok, resumed} <- undo_scheduled_cancel(sub_id, sub) do
        resumed = resumed || sub

        case effective_square_status(resumed) do
          "active" ->
            Logger.info("Plus cancel undone for #{user.username} (Square sub #{sub_id})")
            Inkwell.Slack.notify(":arrows_counterclockwise: *@#{user.username}* kept Plus (undid their cancellation)")

            user
            |> User.subscription_changeset(%{
              subscription_status: "active",
              subscription_tier: "plus",
              subscription_expires_at: square_period_end(Map.delete(resumed, "canceled_date"))
            })
            |> Repo.update()

          _ ->
            {:error, :not_resumable}
        end
      end
    else
      {:error, :not_resumable}
    end
  end

  defp undo_scheduled_cancel(sub_id, sub) do
    case resume_plan(sub) do
      {:delete_action, action_id} -> Square.delete_subscription_action(sub_id, action_id)
      :already_active -> {:ok, sub}
      :not_resumable -> {:error, :not_resumable}
    end
  end

  @doc false
  # What undoing a cancel takes, given a subscription fetched with its actions.
  def resume_plan(sub) do
    cancel_action =
      Enum.find(sub["actions"] || [], fn action -> action["type"] == "CANCEL" end)

    cond do
      sub["status"] != "ACTIVE" -> :not_resumable
      cancel_action -> {:delete_action, cancel_action["id"]}
      # Already undone (e.g. in the Square dashboard): just catch up locally.
      is_nil(sub["canceled_date"]) -> :already_active
      true -> :not_resumable
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

  @doc """
  Cancel every subscription attached to a user — Square Plus, Square Ink Donor,
  and both legacy Stripe subscriptions. Used during account deletion and when a
  dispute is filed.

  Best-effort by design: a billing failure must never block a user from deleting
  their account, so this always returns `:ok` and never raises. But it no longer
  fails *silently* — a Square cancel that doesn't take means the card keeps being
  charged after the account is gone, so those failures are logged loudly and sent
  to Slack for manual cleanup in the Square dashboard.

  Legacy Stripe failures are expected (the Stripe account is closed) and are
  logged at info level without alerting.
  """
  def cancel_all_subscriptions(%User{} = user) do
    cancel_square_subscription(user, user.square_subscription_id, "Plus")
    cancel_square_subscription(user, user.square_donor_subscription_id, "Ink Donor")

    cancel_legacy_stripe(user.stripe_subscription_id)
    cancel_legacy_stripe(user.ink_donor_stripe_subscription_id)

    :ok
  end

  defp cancel_square_subscription(_user, nil, _label), do: :ok

  defp cancel_square_subscription(%User{} = user, subscription_id, label) do
    case Square.cancel_subscription(subscription_id) do
      :ok ->
        Logger.info(
          "[Billing] Canceled Square #{label} subscription #{subscription_id} for @#{user.username}"
        )

        :ok

      {:error, reason} ->
        Logger.error(
          "[Billing] FAILED to cancel Square #{label} subscription #{subscription_id} for " <>
            "@#{user.username} (user #{user.id}): #{inspect(reason)} — this subscription is " <>
            "still LIVE and will keep billing. Cancel it manually in the Square dashboard."
        )

        Inkwell.Slack.notify_cancel_failed(user.username, label, subscription_id)
        :ok
    end
  rescue
    e ->
      Logger.error(
        "[Billing] Exception canceling Square #{label} subscription #{subscription_id}: " <>
          Exception.message(e)
      )

      :ok
  end

  defp cancel_legacy_stripe(nil), do: :ok

  defp cancel_legacy_stripe(subscription_id) do
    case cancel_stripe_subscription(subscription_id) do
      :ok ->
        :ok

      other ->
        Logger.info(
          "[Billing] Legacy Stripe cancel skipped for #{subscription_id} " <>
            "(Stripe account is closed): #{inspect(other)}"
        )

        :ok
    end
  rescue
    e ->
      Logger.info(
        "[Billing] Legacy Stripe cancel raised for #{subscription_id}: " <> Exception.message(e)
      )

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
          |> reconcile_plus(plus_sub, customer_id, subscriptions)
          |> reconcile_donor(donor_sub, customer_id, config, subscriptions)

        {:ok, updated_user, changes}

      {:ok, :not_found} ->
        # No customer record in Square for this email — nothing to reconcile
        {:ok, user, []}

      {:error, reason} ->
        Logger.warning("sync_from_square failed for user #{user.id}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # Find Square subscriptions for a user.
  #
  # Square's email search is fuzzy (it tokenizes the address, so
  # john@gmail.com also matches john.doe@gmail.com). This used to take the
  # first returned customer with any subscription, which could attach someone
  # else's subscription to this account, or pick an old duplicate customer
  # whose only subscription was canceled and downgrade a paying member. Now
  # only customers that really belong to this account count: the one stored
  # on the user, and search results whose email matches exactly or whose
  # reference_id is this user's id. Subscriptions from all of them are
  # considered together.
  #
  # Returns {:ok, customer_id, [subs]}, {:ok, :not_found} or {:error, reason}.
  defp find_user_subscriptions(user, normalized_email) do
    with {:ok, customers} <- Square.search_customers_by_email(user.email) do
      candidate_ids =
        [user.square_customer_id | owned_customer_ids(customers, user, normalized_email)]
        |> Enum.reject(&is_nil/1)
        |> Enum.uniq()

      case collect_subscriptions(candidate_ids) do
        {:ok, []} -> full_scan_for_user(normalized_email)
        {:ok, subs} -> {:ok, primary_customer_id(subs, user), subs}
        {:error, reason} -> {:error, reason}
      end
    end
  end

  @doc false
  # Customers from a (fuzzy) email search that genuinely belong to this user.
  def owned_customer_ids(customers, user, normalized_email) do
    customers
    |> Enum.filter(fn c ->
      (is_binary(normalized_email) and normalized_email != "" and
         normalize_email(c["email_address"]) == normalized_email) or
        (not is_nil(c["reference_id"]) and c["reference_id"] == user.id)
    end)
    |> Enum.map(& &1["id"])
  end

  defp collect_subscriptions(customer_ids) do
    Enum.reduce_while(customer_ids, {:ok, []}, fn customer_id, {:ok, acc} ->
      case Square.search_subscriptions_by_customer(customer_id) do
        {:ok, subs} when is_list(subs) -> {:cont, {:ok, acc ++ subs}}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end

  defp primary_customer_id(subs, user) do
    case pick_newest_active(subs) do
      %{"customer_id" => id} when is_binary(id) ->
        id

      _ ->
        user.square_customer_id ||
          case subs do
            [%{"customer_id" => id} | _] -> id
            _ -> nil
          end
    end
  end

  @doc false
  # Only treat a subscription as over when Square positively shows it ended.
  # Not finding it (a different customer record, an API hiccup) is not proof.
  def subscription_confirmed_ended?(nil, _seen), do: false

  def subscription_confirmed_ended?(sub_id, seen) do
    case Enum.find(seen, &(&1["id"] == sub_id)) do
      %{"status" => status} ->
        status not in ["ACTIVE", "PENDING"]

      nil ->
        case Square.get_subscription(sub_id) do
          {:ok, %{"status" => status}} -> status not in ["ACTIVE", "PENDING"]
          _ -> false
        end
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
  defp full_scan_for_user(normalized_email)
       when is_binary(normalized_email) and normalized_email != "" do
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

  defp normalize_email(email) when is_binary(email),
    do: email |> String.trim() |> String.downcase()

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
          # Clear subscription_expires_at to wipe any stale grace-period
          # grant — user is now properly on Square so the grant is superseded.
          {:ok, updated} =
            user
            |> User.subscription_changeset(%{
              square_customer_id: customer_id,
              square_subscription_id: sub_id,
              subscription_tier: "plus",
              subscription_status: "active",
              subscription_expires_at: nil,
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
  defp reconcile_plus(user, nil, _customer_id, seen) do
    # No active Plus subscription in Square. Clear local Plus only when this
    # user's own subscription is confirmed ended; otherwise leave it alone.
    if user.square_subscription_id && user.subscription_status == "active" &&
         subscription_confirmed_ended?(user.square_subscription_id, seen) do
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
      if user.square_subscription_id && user.subscription_status == "active" do
        Logger.warning(
          "sync_from_square: no active Plus found for user #{user.id} but their subscription " <>
            "#{user.square_subscription_id} isn't confirmed ended; leaving Plus in place"
        )
      end

      {user, []}
    end
  end

  defp reconcile_plus(user, plus_sub, customer_id, _seen) do
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
      # Also clear legacy Stripe state if present — they're now on Square.
      # Also clear subscription_expires_at to wipe any stale manual grant
      # date from a previous recovery flow, so the user no longer shows
      # an "expires on X" chip after they've properly re-subscribed.
      attrs = %{
        stripe_subscription_id: nil,
        square_customer_id: customer_id,
        square_subscription_id: sub_id,
        subscription_tier: "plus",
        subscription_status: inkwell_status,
        subscription_expires_at: nil
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
  defp reconcile_donor(user_tuple, nil, _customer_id, _config, seen) do
    {user, changes} = user_tuple

    if user.square_donor_subscription_id && user.ink_donor_status == "active" &&
         subscription_confirmed_ended?(user.square_donor_subscription_id, seen) do
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

  defp reconcile_donor(user_tuple, donor_sub, _customer_id, config, _seen) do
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

      Logger.info(
        "sync_from_square: activated Donor for user #{user.id} (sub #{sub_id}, $#{(amount_cents || 0) / 100}/mo)"
      )

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

    # Four-layer resolution chain, in order of reliability + speed:
    #
    #   1. `square_customer_id` on the user (pre-created by
    #      Billing.ensure_square_customer/1 before checkout)
    #   2. Square Customer.reference_id (set when we pre-created the customer —
    #      this catches the case where our local DB write didn't land yet but
    #      Square has the customer with our user.id on it)
    #   3. Subscription → Invoice → Order.reference_id (belt-and-suspenders for
    #      when Square ignores order.customer_id and creates a fresh customer)
    #   4. Legacy email match (last resort, retained so existing pre-customer-
    #      pre-creation subscriptions still resolve)
    user =
      find_user_by_square_customer(customer_id) ||
        find_user_by_customer_reference_id(customer_id) ||
        find_user_by_subscription_reference_id(sub) ||
        find_user_by_email_from_square(customer_id)

    case user do
      nil ->
        Logger.error(
          "subscription.created — no user found for sub #{sub_id} / customer #{customer_id} " <>
            "(tried square_customer_id, customer.reference_id, invoice→order.reference_id, email)"
        )

        Inkwell.Slack.notify_unmatched_subscription(sub_id, customer_id)
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

          # Also store customer ID if not set (covers the reference_id-based
          # fallback paths where local square_customer_id wasn't pre-set)
          maybe_set_square_customer(user, customer_id)

          Logger.info(
            "User #{user.username} became an Ink Donor ($#{(amount_cents || 0) / 100}/mo via Square)"
          )

          Inkwell.Slack.notify_ink_donor(user.username, amount_cents)
        else
          user
          |> User.subscription_changeset(%{
            square_customer_id: customer_id,
            square_subscription_id: sub_id,
            subscription_tier: "plus",
            subscription_status: "active",
            # Clears a free-trial end date (or stale grant) — the paid
            # subscription replaces it. subscription.updated sets the real
            # charged-through date later.
            subscription_expires_at: nil
          })
          |> Repo.update()

          Logger.info("User #{user.username} upgraded to Plus via Square (sub: #{sub_id})")
          Inkwell.Slack.notify_plus_subscription(user.username)
        end

        :ok
    end
  end

  defp handle_subscription_created(_), do: :ok

  # Fallback 2: look up user by the reference_id we stamped on the Square
  # customer at pre-creation time. This closes a race where our local
  # square_customer_id write didn't commit (or didn't propagate fast enough)
  # but Square has already fired subscription.created.
  defp find_user_by_customer_reference_id(nil), do: nil

  defp find_user_by_customer_reference_id(customer_id) do
    case Square.get_customer(customer_id) do
      {:ok, %{"reference_id" => ref_id}} when is_binary(ref_id) and ref_id != "" ->
        # reference_id is the raw user UUID (see build_square_customer_attrs/1)
        case Ecto.UUID.cast(ref_id) do
          {:ok, user_id} -> Repo.get(User, user_id)
          :error -> nil
        end

      _ ->
        nil
    end
  end

  # Fallback 3: follow the subscription's first invoice to its order, and
  # read the order's reference_id (bare user UUID — Square's Order.reference_id
  # has a 40-char limit, so we can't prefix it). Works even if Square created
  # a fresh customer at checkout that has no reference_id of its own.
  defp find_user_by_subscription_reference_id(%{"invoice_ids" => [invoice_id | _]})
       when is_binary(invoice_id) do
    with {:ok, %{"order_id" => order_id}} <- Square.get_invoice(invoice_id),
         {:ok, %{"reference_id" => ref_id}} when is_binary(ref_id) <- Square.get_order(order_id),
         {:ok, uuid} <- Ecto.UUID.cast(ref_id) do
      Repo.get(User, uuid)
    else
      _ -> nil
    end
  end

  defp find_user_by_subscription_reference_id(_), do: nil

  defp handle_square_subscription_updated(%{"subscription" => sub}) do
    handle_square_subscription_updated(sub)
  end

  defp handle_square_subscription_updated(%{"id" => sub_id, "status" => _status} = sub) do
    customer_id = sub["customer_id"]
    plan_variation_id = sub["plan_variation_id"]
    config = Application.get_env(:inkwell, :square, [])
    inkwell_status = effective_square_status(sub)

    user = find_user_by_square_customer(customer_id) || find_user_by_square_subscription(sub_id)

    case user do
      nil ->
        Logger.warning("subscription.updated — no user for Square subscription #{sub_id}")
        :ok

      user ->
        donor? =
          is_donor_plan?(plan_variation_id, config) or sub_id == user.square_donor_subscription_id

        current_id =
          if donor?, do: user.square_donor_subscription_id, else: user.square_subscription_id

        cond do
          stale_subscription_event?(current_id, sub_id, inkwell_status) ->
            # Users are found by customer id, and customers are reused, so this
            # can be about an old subscription: e.g. someone canceled, then
            # re-subscribed, and the old one just reached its end date. It used
            # to overwrite the new, paid subscription with "canceled".
            Logger.info(
              "subscription.updated — ignoring #{inkwell_status} for old subscription #{sub_id} " <>
                "(user #{user.id} is on #{current_id})"
            )

          donor? ->
            apply_donor_update(user, sub_id, inkwell_status)

          true ->
            apply_plus_update(user, sub, sub_id, inkwell_status)
        end

        :ok
    end
  end

  defp handle_square_subscription_updated(_), do: :ok

  @doc false
  # An update for a subscription other than the user's current one may start
  # something (a new active subscription) but never cancel or pause it.
  def stale_subscription_event?(current_id, sub_id, inkwell_status) do
    is_binary(current_id) and current_id != sub_id and inkwell_status != "active"
  end

  @doc false
  # Square keeps a subscription ACTIVE until the end of the paid period after
  # a cancel is scheduled, with `canceled_date` set. Treat that as canceled
  # (access continues until the date) so a member's cancellation doesn't look
  # undone the next time Square sends an update.
  def effective_square_status(%{"status" => "ACTIVE", "canceled_date" => date})
      when is_binary(date),
      do: "canceled"

  def effective_square_status(%{"status" => status}), do: Square.map_subscription_status(status)

  defp apply_donor_update(user, sub_id, inkwell_status) do
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
  end

  defp apply_plus_update(user, sub, sub_id, inkwell_status) do
    expires_at = square_period_end(sub)

    tier =
      if inkwell_status in ["active"] or is_binary(sub["canceled_date"]),
        do: "plus",
        else: user.subscription_tier

    user
    |> User.subscription_changeset(%{
      square_subscription_id: sub_id,
      subscription_status: inkwell_status,
      subscription_tier: tier,
      subscription_expires_at: expires_at
    })
    |> Repo.update()

    if inkwell_status == "canceled" and user.subscription_status != "canceled" do
      Logger.info("Plus subscription canceled for #{user.username} (Square)")
      Inkwell.Slack.notify_plus_cancellation(user.username)
    end

    # A scheduled cancel is still ACTIVE (paid through the period); only drop
    # the custom domain once the subscription has actually ended.
    if inkwell_status == "canceled" and sub["status"] != "ACTIVE" do
      maybe_deactivate_custom_domain(user.id)
    end
  end

  defp handle_invoice_payment_made(%{"subscription_id" => sub_id}) when is_binary(sub_id) do
    user = find_user_by_square_subscription(sub_id)

    case user do
      nil ->
        :ok

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
      nil ->
        :ok

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

    Logger.error(
      "DISPUTE CREATED (Square): customer=#{customer_id}, amount=#{amount}, reason=#{reason}"
    )

    user = if customer_id, do: find_user_by_square_customer(customer_id), else: nil

    case user do
      nil ->
        Logger.error("Dispute — no user found for Square customer #{customer_id}")
        Inkwell.Slack.notify_dispute(nil, amount, reason)
        :ok

      user ->
        # Auto-block the user immediately
        with {:ok, blocked} <- Inkwell.Accounts.block_user(user) do
          Inkwell.Moderation.AutoModeration.after_manual_block(
            blocked,
            "blocked after a payment dispute"
          )
        end

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
  #
  # Square's `payment.updated` webhook fires on every status transition of a
  # Payment. We act only on status=COMPLETED, deduplicated by payment_id.
  #
  # Classifying donation vs. subscription is done via the parent Order's
  # first line_item name, NOT by checking whether the user has an active
  # subscription. Our donation Payment Links tag the line item
  # "Ink Donor — One-time"; subscription signup/renewal orders use
  # "Inkwell Plus" or "Ink Donor — $N/mo". This correctly fires for a Plus
  # subscriber making a separate one-time donation (which a naive
  # "user-has-sub" check would silently skip) and correctly suppresses
  # alerts on sub renewals.
  #
  # User resolution: Square's payment.updated fires multiple times per
  # payment as state transitions, and early firings can arrive before
  # customer_id is populated on the Payment object. The order_id is always
  # present from the first firing, so we fetch the order and use it both
  # for line-item classification AND as a reliable secondary lookup path
  # (order.reference_id = user.id on every Inkwell-initiated order).
  #
  # Prior bugs fixed here:
  #   * 2026-04-15: handler matched [COMPLETED, APPROVED] and fired Slack
  #     repeatedly per state transition. Now dedups by payment_id.
  #   * 2026-04-24 (Tim): classified as donation when webhook couldn't
  #     find the user. Fixed by expanding user-resolution fallback chain.
  #   * 2026-04-24 (stanton @unknown $1 donation): first payment.updated
  #     firing had no customer_id yet. Fixed by using order_id path.
  #   * 2026-04-24 (latent): subscription_renewal? skipped donation alerts
  #     for any Plus subscriber, silently losing legitimate donations.
  #     Fixed by classifying via order.line_items[0].name.

  defp handle_payment_completed(%{"payment" => payment}), do: handle_payment_completed(payment)

  defp handle_payment_completed(
         %{
           "id" => payment_id,
           "amount_money" => %{"amount" => amount_cents},
           "status" => "COMPLETED"
         } = payment
       ) do
    customer_id = payment["customer_id"]
    order_id = payment["order_id"]

    # Fetch the order once — we need it for both user resolution and for
    # classifying the payment as donation vs. subscription.
    order =
      case order_id do
        oid when is_binary(oid) ->
          case Square.get_order(oid) do
            {:ok, o} -> o
            _ -> :fetch_failed
          end

        _ ->
          nil
      end

    # Without the order we can't tell a $99 Founding purchase from anything
    # else. This used to carry on with a nil order, log it as "not a
    # donation" and mark the event processed, so a brief Square hiccup
    # silently dropped the purchase. Fail so the webhook job retries.
    if order == :fetch_failed do
      Logger.warning("Payment #{payment_id}: couldn't fetch order #{order_id}; will retry")
      :error
    else
      handle_completed_payment_with_order(payment_id, amount_cents, customer_id, order_id, order)
    end
  end

  defp handle_payment_completed(%{"status" => status}) do
    Logger.debug("Ignoring payment event with status #{status}")
    :ok
  end

  defp handle_payment_completed(_) do
    Logger.info("payment event — unrecognized structure, skipping")
    :ok
  end

  defp handle_completed_payment_with_order(payment_id, amount_cents, customer_id, order_id, order) do
    user =
      find_user_by_square_customer(customer_id) ||
        find_user_by_order(order) ||
        find_user_by_customer_reference_id(customer_id) ||
        find_user_by_email_from_square(customer_id)

    cond do
      Inkwell.Billing.Founding.founding_order?(order) ->
        Inkwell.Billing.Founding.handle_completed_payment(payment_id, user, customer_id)

      not donation_order?(order) ->
        # Subscription signup/renewal order OR order we can't classify —
        # don't fire donation alert either way. Subscription.created
        # handles subscription activation separately.
        Logger.info(
          "Payment #{payment_id} (#{amount_cents} cents) is not a donation order — skipping donation notification"
        )

        :ok

      is_nil(user) ->
        # Donation order but we couldn't resolve the user. This is rare
        # — all four fallbacks failed. Alert admin instead of attributing
        # the donation to "unknown".
        Logger.error(
          "Payment #{payment_id} (#{amount_cents} cents) is a donation order but no Inkwell user could be resolved " <>
            "(customer_id=#{inspect(customer_id)}, order_id=#{inspect(order_id)}) — alerting admin"
        )

        Inkwell.Slack.notify_unmatched_donation(payment_id, customer_id, amount_cents)
        :ok

      true ->
        notify_donation_once(payment_id, user, amount_cents)
    end
  end

  # Resolve an Inkwell user from an order's reference_id. Our Payment Links
  # stamp reference_id = user.id on every order (via build_order/1 in
  # Inkwell.Square); Square-generated subscription-renewal orders don't
  # have reference_id set.
  defp find_user_by_order(nil), do: nil

  defp find_user_by_order(order) do
    case order["reference_id"] do
      ref when is_binary(ref) and ref != "" ->
        case Ecto.UUID.cast(ref) do
          {:ok, uuid} -> Repo.get(User, uuid)
          :error -> nil
        end

      _ ->
        nil
    end
  end

  # True if the order looks like an Inkwell one-time donation. Our donation
  # Payment Link sets the line item name to "Ink Donor — One-time" (see
  # Inkwell.Square.create_donation_payment_link/3). Subscription orders use
  # "Inkwell Plus" or "Ink Donor — $N/mo" so they don't match.
  defp donation_order?(nil), do: false

  defp donation_order?(order) do
    case order["line_items"] do
      [%{"name" => name} | _] when is_binary(name) ->
        String.contains?(name, "One-time")

      _ ->
        false
    end
  end

  # Fire the donation Slack notification exactly once per payment_id. Uses
  # the existing webhook_events table (unique index on event_id) as a
  # dedup cache — the first insert succeeds and fires the notification,
  # subsequent inserts for the same payment_id silently no-op via
  # on_conflict: :nothing.
  defp notify_donation_once(payment_id, user, amount_cents) do
    dedup_key = "donation_notified:#{payment_id}"

    if already_processed?(dedup_key) do
      Logger.debug("Already notified for payment #{payment_id}, skipping duplicate")
      :ok
    else
      username = if user, do: user.username, else: "unknown"

      Logger.info(
        "One-time donation received: #{amount_cents} cents from #{username} (payment #{payment_id})"
      )

      Inkwell.Slack.notify_donation(username, amount_cents)
      record_event(dedup_key, "donation_notified", "processed")
      :ok
    end
  end

  # ── Private: Helpers ───────────────────────────────────────────────────

  defp find_user_by_square_customer(nil), do: nil

  defp find_user_by_square_customer(customer_id) do
    Repo.one(from(u in User, where: u.square_customer_id == ^customer_id))
  end

  defp find_user_by_square_subscription(nil), do: nil

  defp find_user_by_square_subscription(sub_id) do
    Repo.one(
      from(u in User,
        where: u.square_subscription_id == ^sub_id or u.square_donor_subscription_id == ^sub_id
      )
    )
  end

  # Fetch customer from Square API to get email, then look up user by email
  defp find_user_by_email_from_square(nil), do: nil

  defp find_user_by_email_from_square(customer_id) do
    case Square.get_customer(customer_id) do
      {:ok, %{"email_address" => email}} when is_binary(email) and email != "" ->
        Repo.one(from(u in User, where: u.email == ^email))

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
    donor_ids =
      [
        config[:donor_plan_variation_1],
        config[:donor_plan_variation_2],
        config[:donor_plan_variation_3]
      ]
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

  @doc false
  # Public so trial expiry can reuse it. Founding members keep Plus, so their
  # domain stays up even if some old subscription for them is canceled.
  def deactivate_custom_domain_unless_plus(user_id), do: maybe_deactivate_custom_domain(user_id)

  defp maybe_deactivate_custom_domain(user_id) do
    case Repo.get(User, user_id) do
      %User{} = u when u.founding_member_number != nil -> :ok
      _ -> do_deactivate_custom_domain(user_id)
    end
  end

  defp do_deactivate_custom_domain(user_id) do
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
      Logger.warning(
        "STRIPE_SECRET_KEY not set — cannot cancel Stripe subscription #{subscription_id}"
      )

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
