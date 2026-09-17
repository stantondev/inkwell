defmodule InkwellWeb.ModerationAdminController do
  @moduledoc "Admin: review and undo automated moderation."
  use InkwellWeb, :controller

  import Ecto.Query

  alias Inkwell.Accounts.User
  alias Inkwell.Moderation.{AutoModeration, ModerationAction}
  alias Inkwell.Repo

  # GET /api/admin/moderation?page=1&filter=active|all|notes
  def index(conn, params) do
    page = max(String.to_integer(params["page"] || "1"), 1)
    per_page = 50

    query =
      from(a in ModerationAction,
        join: u in User, on: u.id == a.user_id,
        order_by: [desc: a.inserted_at],
        select: {a, u}
      )

    query =
      case params["filter"] do
        "all" -> query
        # dry-run and "needs review" notes are stored already-reversed
        "notes" -> where(query, [a], not is_nil(a.reversed_at) and is_nil(a.reversed_by_id))
        _ -> where(query, [a], is_nil(a.reversed_at))
      end

    rows = query |> limit(^per_page) |> offset(^((page - 1) * per_page)) |> Repo.all()

    json(conn, %{
      mode: AutoModeration.mode(),
      thresholds: %{block: Inkwell.Moderation.SpamSignals.block_threshold(), limit: Inkwell.Moderation.SpamSignals.limit_threshold()},
      data:
        Enum.map(rows, fn {a, u} ->
          %{
            id: a.id,
            action: a.action,
            automated: a.automated,
            score: a.score,
            reasons: a.reasons,
            hidden_entry_count: length(a.hidden_entry_ids),
            inserted_at: a.inserted_at,
            reversed_at: a.reversed_at,
            note: not is_nil(a.reversed_at) and is_nil(a.reversed_by_id),
            user: %{
              id: u.id,
              username: u.username,
              display_name: u.display_name,
              email_domain: u.email && (u.email |> String.split("@") |> List.last()),
              joined: u.inserted_at,
              blocked: not is_nil(u.blocked_at),
              limited: u.moderation_state == "limited"
            }
          }
        end)
    })
  end

  # POST /api/admin/moderation/:id/undo
  def undo(conn, %{"id" => id}) do
    with %ModerationAction{} = action <- Repo.get(ModerationAction, id),
         {:ok, restored} <- AutoModeration.undo(action, conn.assigns.current_user) do
      json(conn, %{ok: true, restored_entries: restored})
    else
      nil -> conn |> put_status(:not_found) |> json(%{error: "Not found"})
      {:error, :already_reversed} -> conn |> put_status(:conflict) |> json(%{error: "Already undone"})
      {:error, reason} -> conn |> put_status(:unprocessable_entity) |> json(%{error: inspect(reason)})
    end
  end

  # GET /api/admin/moderation/check?username=foo — score one account, change nothing
  def check(conn, %{"username" => username}) do
    case Inkwell.Accounts.get_user_by_username(String.trim(username)) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      user ->
        {decision, result} = AutoModeration.evaluate(user)

        json(conn, %{
          username: user.username,
          decision: decision,
          score: result.score,
          reasons: result.reasons,
          blocked: not is_nil(user.blocked_at),
          limited: user.moderation_state == "limited"
        })
    end
  end

  # POST /api/admin/moderation/scan — run the hourly scan now
  def scan(conn, _params) do
    summary = AutoModeration.scan_recent()

    json(conn, %{
      mode: AutoModeration.mode(),
      scanned: summary.scanned,
      blocked: summary.blocked,
      limited: summary.limited,
      review: summary.review
    })
  end
end
