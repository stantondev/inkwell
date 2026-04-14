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
