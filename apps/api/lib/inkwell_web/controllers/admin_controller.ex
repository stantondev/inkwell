defmodule InkwellWeb.AdminController do
  use InkwellWeb, :controller

  require Logger

  alias Inkwell.Accounts
  alias Inkwell.Billing
  alias Inkwell.Journals
  alias Inkwell.Moderation
  alias InkwellWeb.EntryController

  # GET /api/admin/billing-health — Square webhook health + subscription counts
  def billing_health(conn, _params) do
    stats = Billing.webhook_stats()
    recent = Billing.recent_webhook_deliveries(20, "square")

    json(conn, %{
      stats: stats,
      recent: Enum.map(recent, &render_webhook_delivery/1)
    })
  end

  # POST /api/admin/reconcile-subscriptions — reconcile all users against Square
  def reconcile_subscriptions(conn, _params) do
    Logger.info("Admin #{conn.assigns.current_user.username} triggered full subscription reconciliation")

    # Run inline — this is a bounded operation (max ~1000 users) and admins
    # expect immediate feedback. If it grows beyond that we'll move to Oban.
    result = Billing.reconcile_all_users(max_users: 1000)

    json(conn, %{ok: true, result: result})
  end

  # POST /api/admin/sync-user-by-email — sync a single user's Square state
  # Body: %{"email" => "user@example.com"}
  def sync_user_by_email(conn, %{"email" => email}) when is_binary(email) do
    Logger.info("Admin #{conn.assigns.current_user.username} syncing user by email: #{email}")

    case Billing.sync_user_by_email(email) do
      {:ok, user, changes} ->
        json(conn, %{
          ok: true,
          user: %{
            id: user.id,
            username: user.username,
            email: user.email,
            subscription_tier: user.subscription_tier,
            subscription_status: user.subscription_status,
            square_subscription_id: user.square_subscription_id,
            square_donor_subscription_id: user.square_donor_subscription_id,
            ink_donor_status: user.ink_donor_status,
            ink_donor_amount_cents: user.ink_donor_amount_cents
          },
          changes: Enum.map(changes, &Atom.to_string/1)
        })

      {:error, :user_not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "No user with that email"})

      {:error, :invalid_email} ->
        conn |> put_status(:bad_request) |> json(%{error: "Invalid email"})

      {:error, reason} ->
        conn
        |> put_status(:bad_gateway)
        |> json(%{error: "Square sync failed", detail: inspect(reason)})
    end
  end

  def sync_user_by_email(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "email is required"})
  end

  # GET /api/admin/plus-users — list all Plus users grouped by payment source
  def plus_users(conn, _params) do
    buckets = Billing.plus_users_by_source()

    json(conn, %{
      square_active: render_plus_users(Map.get(buckets, :square_active, [])),
      manually_granted: render_plus_users(Map.get(buckets, :manually_granted, [])),
      legacy_stripe: render_plus_users(Map.get(buckets, :legacy_stripe, [])),
      orphaned: render_plus_users(Map.get(buckets, :orphaned, []))
    })
  end

  # GET /api/admin/square-subscriptions — raw Square view (what's actually in
  # Square, not what's in our local DB). Use this to verify whether a payment
  # actually exists in Square when the local sync fails to find it.
  def square_subscriptions(conn, _params) do
    Logger.info("Admin #{conn.assigns.current_user.username} fetching raw Square subscriptions")

    case Billing.list_square_subscriptions_raw() do
      {:ok, subscriptions} ->
        json(conn, %{ok: true, subscriptions: subscriptions, total: length(subscriptions)})

      {:error, :square_not_configured} ->
        conn
        |> put_status(:service_unavailable)
        |> json(%{error: "Square is not configured (no access token or location ID)"})

      {:error, reason} ->
        conn
        |> put_status(:bad_gateway)
        |> json(%{error: "Failed to fetch Square subscriptions", detail: inspect(reason)})
    end
  end

  # POST /api/admin/attach-square-subscription — safety net for cases where
  # automatic sync fails to find a user's Square payment. Admin provides the
  # user's email + the subscription ID from the Square dashboard, we fetch the
  # sub from Square to verify it exists, then write it to the user record.
  # Body: %{"email" => "...", "subscription_id" => "sub_xxx"}
  def attach_square_subscription(conn, %{"email" => email, "subscription_id" => sub_id})
      when is_binary(email) and is_binary(sub_id) do
    Logger.info("Admin #{conn.assigns.current_user.username} manually attaching Square sub #{sub_id} to #{email}")

    case Billing.attach_square_subscription(email, sub_id) do
      {:ok, user, type} ->
        json(conn, %{
          ok: true,
          type: Atom.to_string(type),
          user: %{
            id: user.id,
            username: user.username,
            email: user.email,
            subscription_tier: user.subscription_tier,
            subscription_status: user.subscription_status,
            square_subscription_id: user.square_subscription_id,
            square_donor_subscription_id: user.square_donor_subscription_id,
            ink_donor_status: user.ink_donor_status,
            ink_donor_amount_cents: user.ink_donor_amount_cents
          }
        })

      {:error, :user_not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "No user with that email"})

      {:error, :subscription_not_active} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Square subscription is not active (canceled/deactivated)"})

      {:error, {:subscription_fetch_failed, reason}} ->
        conn
        |> put_status(:bad_gateway)
        |> json(%{error: "Couldn't find that subscription in Square", detail: inspect(reason)})

      {:error, reason} ->
        conn
        |> put_status(:bad_gateway)
        |> json(%{error: "Attach failed", detail: inspect(reason)})
    end
  end

  def attach_square_subscription(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "email and subscription_id are required"})
  end

  # GET /api/admin/square-payments — raw view of one-time payments in Square
  # (Receipts/Orders, NOT subscriptions). Use this to find users who paid via
  # the broken Payment Link flow and never had a subscription created.
  def square_payments(conn, _params) do
    Logger.info("Admin #{conn.assigns.current_user.username} fetching raw Square payments")

    case Billing.list_square_payments_raw() do
      {:ok, payments} ->
        json(conn, %{ok: true, payments: payments, total: length(payments)})

      {:error, :square_not_configured} ->
        conn
        |> put_status(:service_unavailable)
        |> json(%{error: "Square is not configured (no access token or location ID)"})

      {:error, reason} ->
        conn
        |> put_status(:bad_gateway)
        |> json(%{error: "Failed to fetch Square payments", detail: inspect(reason)})
    end
  end

  # POST /api/admin/grant-plus-until — manually grant a user Plus tier with
  # an explicit expiration date. Used for recovery cases (e.g., users who paid
  # via a broken Payment Link and got a one-time charge instead of a sub).
  # Body: %{"email" => "...", "expires_at" => "2026-05-08T00:00:00Z"}
  def grant_plus_until(conn, %{"email" => email, "expires_at" => expires_at_iso})
      when is_binary(email) and is_binary(expires_at_iso) do
    Logger.info(
      "Admin #{conn.assigns.current_user.username} granting Plus to #{email} until #{expires_at_iso}"
    )

    with {:ok, expires_at, _} <- DateTime.from_iso8601(expires_at_iso),
         :future <- check_future(expires_at),
         {:ok, user} <- Billing.grant_plus_until(email, expires_at) do
      json(conn, %{
        ok: true,
        user: %{
          id: user.id,
          username: user.username,
          email: user.email,
          subscription_tier: user.subscription_tier,
          subscription_status: user.subscription_status,
          subscription_expires_at: user.subscription_expires_at
        }
      })
    else
      {:error, :user_not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "No user with that email"})

      :past ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "expires_at must be in the future"})

      {:error, :invalid_format} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "expires_at must be ISO 8601 (e.g., 2026-05-08T00:00:00Z)"})

      {:error, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to grant Plus", detail: inspect(reason)})
    end
  end

  def grant_plus_until(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "email and expires_at are required"})
  end

  defp check_future(%DateTime{} = dt) do
    case DateTime.compare(dt, DateTime.utc_now()) do
      :gt -> :future
      _ -> :past
    end
  end

  defp render_plus_users(users) do
    Enum.map(users, fn u ->
      %{
        id: u.id,
        username: u.username,
        email: u.email,
        inserted_at: u.inserted_at,
        subscription_status: u.subscription_status,
        subscription_expires_at: u.subscription_expires_at,
        stripe_customer_id: u.stripe_customer_id,
        stripe_subscription_id: u.stripe_subscription_id,
        square_customer_id: u.square_customer_id,
        square_subscription_id: u.square_subscription_id,
        ink_donor_status: u.ink_donor_status,
        ink_donor_amount_cents: u.ink_donor_amount_cents
      }
    end)
  end

  defp render_webhook_delivery(delivery) do
    %{
      id: delivery.id,
      source: delivery.source,
      event_type: delivery.event_type,
      status: delivery.status,
      signature_valid: delivery.signature_valid,
      remote_ip: delivery.remote_ip,
      body_size: delivery.body_size,
      error: delivery.error,
      inserted_at: delivery.inserted_at
    }
  end

  # GET /api/admin/stats
  def stats(conn, _params) do
    stats = Accounts.platform_stats()
    recent_plus = Accounts.recent_plus_subscribers(10)
    recent_donors = Accounts.recent_ink_donors(10)
    recent_signups = Accounts.recent_signups(10)

    json(conn, %{
      stats: Map.put(stats, :pending_reports, Moderation.count_pending_reports()),
      recent_plus: Enum.map(recent_plus, &render_user_brief/1),
      recent_donors: Enum.map(recent_donors, &render_user_brief/1),
      recent_signups: Enum.map(recent_signups, &render_user_brief/1)
    })
  end

  # GET /api/admin/users
  def list_users(conn, params) do
    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 50)
    search = params["search"]
    filter = params["filter"]

    {users, total} = Accounts.list_users(
      page: page,
      per_page: per_page,
      search: search,
      filter: filter
    )

    json(conn, %{
      data: Enum.map(users, &render_user_admin/1),
      pagination: %{page: page, per_page: per_page, total: total}
    })
  end

  # GET /api/admin/users/:id
  def show_user(conn, %{"id" => id}) do
    case Accounts.get_user_admin(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      user ->
        json(conn, %{data: render_user_admin(user)})
    end
  end

  # PATCH /api/admin/users/:id/role
  def set_role(conn, %{"id" => id, "role" => role}) when role in ["admin", "user"] do
    current_user = conn.assigns.current_user

    case Accounts.get_user_admin(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      target ->
        cond do
          current_user.id == target.id ->
            conn |> put_status(:forbidden) |> json(%{error: "You cannot change your own role"})

          role == "user" && Accounts.is_env_admin?(target) ->
            conn |> put_status(:forbidden) |> json(%{error: "This user is a system admin and cannot be demoted"})

          true ->
            case Accounts.set_role(target, role) do
              {:ok, user} -> json(conn, %{data: render_user_admin(user)})
              {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to update role"})
            end
        end
    end
  end

  def set_role(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "Invalid role. Must be 'admin' or 'user'."})
  end

  # PATCH /api/admin/users/:id/rename
  def rename_user(conn, %{"id" => id, "username" => new_username}) do
    case Accounts.get_user_admin(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      target ->
        case Accounts.admin_rename_user(target, new_username) do
          {:ok, user} ->
            Logger.info("Admin #{conn.assigns.current_user.username} renamed user #{target.username} to #{user.username}")
            json(conn, %{data: render_user_admin(user)})

          {:error, changeset} ->
            errors = Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
              Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
                opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
              end)
            end)
            conn |> put_status(:unprocessable_entity) |> json(%{error: "Invalid username", details: errors})
        end
    end
  end

  def rename_user(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "Missing username parameter"})
  end

  # POST /api/admin/users/:id/block
  def block_user(conn, %{"id" => id}) do
    current_user = conn.assigns.current_user

    case Accounts.get_user_admin(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      target ->
        if current_user.id == target.id do
          conn |> put_status(:forbidden) |> json(%{error: "You cannot block yourself"})
        else
          case Accounts.block_user(target) do
            {:ok, user} -> json(conn, %{data: render_user_admin(user)})
            {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to block user"})
          end
        end
    end
  end

  # POST /api/admin/users/:id/unblock
  def unblock_user(conn, %{"id" => id}) do
    case Accounts.get_user_admin(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      user ->
        case Accounts.unblock_user(user) do
          {:ok, user} -> json(conn, %{data: render_user_admin(user)})
          {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to unblock user"})
        end
    end
  end

  # POST /api/admin/users/:id/warn
  # Body: { reason, details?, report_id?, entry_id? }
  def warn_user(conn, %{"id" => id} = params) do
    current_user = conn.assigns.current_user
    reason = params["reason"]

    cond do
      is_nil(reason) or reason == "" ->
        conn |> put_status(:bad_request) |> json(%{error: "Reason is required"})

      true ->
        case Accounts.get_user_admin(id) do
          nil ->
            conn |> put_status(:not_found) |> json(%{error: "User not found"})

          target ->
            cond do
              current_user.id == target.id ->
                conn |> put_status(:forbidden) |> json(%{error: "You cannot warn yourself"})

              Accounts.is_env_admin?(target) ->
                conn |> put_status(:forbidden) |> json(%{error: "You cannot warn a system admin"})

              true ->
                opts =
                  [
                    details: params["details"],
                    report_id: params["report_id"],
                    entry_id: params["entry_id"]
                  ]
                  |> Enum.reject(fn {_, v} -> is_nil(v) or v == "" end)

                case Moderation.warn_user(target, current_user, reason, opts) do
                  {:ok, %{warning: warning, user: user, blocked: blocked}} ->
                    Logger.info(
                      "Admin #{current_user.username} warned @#{target.username} (strike #{warning.strike_number}, reason: #{reason}, blocked: #{blocked})"
                    )

                    json(conn, %{
                      data: %{
                        user: render_user_admin(user),
                        warning: render_warning(warning),
                        blocked: blocked
                      }
                    })

                  {:error, reason} ->
                    conn
                    |> put_status(:unprocessable_entity)
                    |> json(%{error: "Failed to warn user", detail: inspect(reason)})
                end
            end
        end
    end
  end

  # GET /api/admin/users/:id/warnings
  def list_user_warnings(conn, %{"id" => id}) do
    case Accounts.get_user_admin(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      _user ->
        warnings = Moderation.list_warnings_for_user(id)
        json(conn, %{data: Enum.map(warnings, &render_warning/1)})
    end
  end

  # GET /api/admin/warnings — platform-wide audit log of every warning issued
  def list_warnings(conn, params) do
    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 50)

    {warnings, total} = Moderation.list_all_warnings(page: page, per_page: per_page)

    json(conn, %{
      data: Enum.map(warnings, &render_warning_with_user/1),
      pagination: %{page: page, per_page: per_page, total: total}
    })
  end

  defp render_warning_with_user(warning) do
    warning
    |> render_warning()
    |> Map.put(:user, render_warning_target(Map.get(warning, :user)))
  end

  defp render_warning_target(nil), do: nil

  defp render_warning_target(user) do
    %{
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      strike_count: Map.get(user, :strike_count, 0),
      blocked_at: Map.get(user, :blocked_at)
    }
  end

  defp render_warning(warning) do
    %{
      id: warning.id,
      reason: warning.reason,
      details: warning.details,
      strike_number: warning.strike_number,
      escalated_to_block: warning.escalated_to_block,
      report_id: warning.report_id,
      entry_id: warning.entry_id,
      issued_by:
        case Map.get(warning, :issued_by) do
          %{username: username, display_name: display_name} ->
            %{username: username, display_name: display_name}

          _ ->
            nil
        end,
      inserted_at: warning.inserted_at
    }
  end

  # DELETE /api/admin/users/:id
  def delete_user(conn, %{"id" => id}) do
    current_user = conn.assigns.current_user

    case Accounts.get_user_admin(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      target ->
        if current_user.id == target.id do
          conn |> put_status(:forbidden) |> json(%{error: "You cannot delete your own account from admin"})
        else
          case Accounts.delete_account(target) do
            {:ok, _} -> send_resp(conn, :no_content, "")
            {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to delete user"})
          end
        end
    end
  end

  # GET /api/admin/entries
  def list_entries(conn, params) do
    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 50)

    {entries, total} = Journals.list_all_entries(
      page: page,
      per_page: per_page,
      search: params["search"],
      filter: params["filter"]
    )

    json(conn, %{
      data: Enum.map(entries, fn entry ->
        EntryController.render_entry(entry)
        |> Map.put(:author, %{
          username: entry.user.username,
          display_name: entry.user.display_name,
          avatar_url: entry.user.avatar_url
        })
      end),
      pagination: %{page: page, per_page: per_page, total: total}
    })
  end

  # POST /api/admin/entries/:id/mark-sensitive
  def mark_sensitive(conn, %{"id" => id}) do
    case Journals.mark_entry_sensitive(id) do
      {:ok, entry} ->
        json(conn, %{data: EntryController.render_entry(entry)})

      {:error, _} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  rescue
    Ecto.NoResultsError ->
      conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
  end

  # POST /api/admin/entries/:id/unmark-sensitive
  def unmark_sensitive(conn, %{"id" => id}) do
    case Journals.unmark_entry_sensitive(id) do
      {:ok, entry} ->
        json(conn, %{data: EntryController.render_entry(entry)})

      {:error, _} ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  rescue
    Ecto.NoResultsError ->
      conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
  end

  # DELETE /api/admin/entries/:id
  def delete_entry(conn, %{"id" => id}) do
    try do
      entry = Journals.get_entry!(id)
      {:ok, _} = Journals.delete_entry(entry)
      send_resp(conn, :no_content, "")
    rescue
      Ecto.NoResultsError ->
        conn |> put_status(:not_found) |> json(%{error: "Entry not found"})
    end
  end

  # ── Helpers ──────────────────────────────────────────────────────────────

  defp render_user_brief(user) do
    %{
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      subscription_tier: user.subscription_tier || "free",
      subscription_status: user.subscription_status,
      subscription_expires_at: user.subscription_expires_at,
      ink_donor_status: user.ink_donor_status,
      ink_donor_amount_cents: user.ink_donor_amount_cents,
      created_at: user.inserted_at
    }
  end

  defp render_user_admin(user) do
    %{
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      pronouns: user.pronouns,
      role: user.role || "user",
      is_env_admin: Map.get(user, :is_env_admin, Accounts.is_env_admin?(user)),
      is_admin: Accounts.is_admin?(user),
      subscription_tier: user.subscription_tier || "free",
      subscription_status: user.subscription_status,
      subscription_expires_at: user.subscription_expires_at,
      square_subscription_id: user.square_subscription_id,
      square_donor_subscription_id: user.square_donor_subscription_id,
      stripe_customer_id: user.stripe_customer_id,
      ink_donor_status: user.ink_donor_status,
      ink_donor_amount_cents: user.ink_donor_amount_cents,
      blocked_at: user.blocked_at,
      strike_count: Map.get(user, :strike_count, 0),
      last_active_at: user.last_active_at,
      is_inactive: Accounts.user_inactive?(user),
      created_at: user.inserted_at,
      updated_at: user.updated_at
    }
  end

  # POST /api/admin/reindex-search — trigger full Meilisearch reindex
  def reindex_search(conn, _params) do
    %{}
    |> Inkwell.Workers.SearchReindexWorker.new()
    |> Oban.insert()

    json(conn, %{ok: true, message: "Full search reindex enqueued"})
  end

  # POST /api/admin/backfill-link-previews — enqueue link preview workers for existing entries
  def backfill_link_previews(conn, _params) do
    entry_ids = Inkwell.Federation.RemoteEntries.list_entries_needing_link_previews(500)

    Enum.each(entry_ids, fn id ->
      %{remote_entry_id: id}
      |> Inkwell.Workers.LinkPreviewWorker.new()
      |> Oban.insert()
    end)

    json(conn, %{ok: true, message: "Enqueued #{length(entry_ids)} link preview jobs"})
  end

  # ── Admin Domain Blocking (Defederation) ──────────────────────────────

  alias Inkwell.Moderation.FediverseBlocks

  # GET /api/admin/blocked-domains
  def list_blocked_domains(conn, _params) do
    domains = FediverseBlocks.list_admin_blocked_domains()

    json(conn, %{
      data: Enum.map(domains, fn d ->
        %{id: d.id, domain: d.domain, reason: d.reason, blocked_at: d.inserted_at}
      end)
    })
  end

  # POST /api/admin/blocked-domains
  def admin_block_domain(conn, %{"domain" => domain} = params) do
    reason = Map.get(params, "reason")

    case FediverseBlocks.admin_block_domain(domain, reason) do
      {:ok, _block} ->
        Logger.info("Admin #{conn.assigns.current_user.username} defederated domain #{domain}")
        json(conn, %{ok: true})

      {:error, _changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Could not block domain"})
    end
  end

  # DELETE /api/admin/blocked-domains/:domain
  def admin_unblock_domain(conn, %{"domain" => domain}) do
    FediverseBlocks.admin_unblock_domain(domain)
    Logger.info("Admin #{conn.assigns.current_user.username} un-defederated domain #{domain}")
    json(conn, %{ok: true})
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, _) when is_integer(val), do: val
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
end
