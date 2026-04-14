defmodule Inkwell.Moderation do
  import Ecto.Query
  require Logger
  alias Ecto.Multi
  alias Inkwell.{Accounts, Repo}
  alias Inkwell.Accounts.User
  alias Inkwell.Moderation.{Report, UserWarning}

  # ── Policy knob ──────────────────────────────────────────────────────────
  # When a user accumulates this many strikes they are automatically blocked.
  # Can be overridden via application env for testing.
  @auto_block_threshold Application.compile_env(:inkwell, :warning_auto_block_threshold, 3)

  @doc "Current auto-block threshold (for display in admin UI and tests)."
  def auto_block_threshold, do: @auto_block_threshold

  # ── Reports ──────────────────────────────────────────────────────────────

  def create_report(attrs) do
    %Report{}
    |> Report.changeset(attrs)
    |> Repo.insert()
  end

  def list_reports(opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)
    status = Keyword.get(opts, :status)

    query =
      Report
      |> preload([:reporter, entry: :user])
      |> order_by(desc: :inserted_at)

    query = if status, do: where(query, status: ^status), else: query

    query
    |> limit(^per_page)
    |> offset(^((page - 1) * per_page))
    |> Repo.all()
  end

  def count_pending_reports do
    Report
    |> where(status: "pending")
    |> Repo.aggregate(:count)
  end

  def get_report!(id), do: Repo.get!(Report, id)

  def get_report(id), do: Repo.get(Report, id)

  def resolve_report(%Report{} = report, attrs) do
    report
    |> Report.resolve_changeset(Map.merge(attrs, %{resolved_at: DateTime.utc_now()}))
    |> Repo.update()
  end

  def has_reported?(user_id, entry_id) do
    Report
    |> where(reporter_id: ^user_id, entry_id: ^entry_id)
    |> Repo.exists?()
  end

  # ── Warnings & Strikes ───────────────────────────────────────────────────

  @doc """
  Issue a warning to a user. Atomically:
    1. Increments the user's strike_count
    2. Inserts a UserWarning record (with the new strike number)
    3. Creates a :warning notification so the user sees it in-app
    4. Sends a warning email (best-effort, non-blocking)
    5. Auto-blocks the user if strike_count reaches @auto_block_threshold

  ## Opts
    * `:details` — admin-written note (string, max 2000 chars)
    * `:report_id` — UUID of the triggering report (will also mark it actioned)
    * `:entry_id`  — UUID of the triggering entry

  Returns `{:ok, %{warning: warning, user: user, blocked: boolean}}` on success.
  """
  def warn_user(%User{} = target, %User{} = issuer, reason, opts \\ [])
      when is_binary(reason) do
    details = Keyword.get(opts, :details)
    report_id = Keyword.get(opts, :report_id)
    entry_id = Keyword.get(opts, :entry_id)

    Multi.new()
    |> Multi.run(:increment_strike, fn repo, _changes ->
      {1, [updated]} =
        from(u in User, where: u.id == ^target.id, select: u)
        |> repo.update_all(inc: [strike_count: 1])

      {:ok, updated}
    end)
    |> Multi.run(:insert_warning, fn repo, %{increment_strike: user} ->
      will_block = user.strike_count >= @auto_block_threshold

      %UserWarning{}
      |> UserWarning.changeset(%{
        user_id: target.id,
        issued_by_id: issuer.id,
        reason: reason,
        details: details,
        report_id: report_id,
        entry_id: entry_id,
        strike_number: user.strike_count,
        escalated_to_block: will_block
      })
      |> repo.insert()
    end)
    |> Multi.run(:maybe_block, fn _repo, %{increment_strike: user} ->
      if user.strike_count >= @auto_block_threshold do
        case Accounts.block_user(user) do
          {:ok, blocked} -> {:ok, blocked}
          other -> other
        end
      else
        {:ok, user}
      end
    end)
    |> Repo.transaction()
    |> case do
      {:ok, %{increment_strike: user, insert_warning: warning, maybe_block: final_user}} ->
        blocked? = user.strike_count >= @auto_block_threshold

        # Best-effort side effects — don't fail the transaction result
        deliver_warning_notification(warning, target, issuer)
        deliver_warning_email(warning, final_user, issuer)

        # If this was triggered by a report, mark it actioned
        if report_id do
          case get_report(report_id) do
            nil ->
              :ok

            report ->
              resolve_report(report, %{
                status: "actioned",
                resolved_by: issuer.id,
                admin_notes:
                  "Warning issued (strike #{user.strike_count})#{if blocked?, do: " — auto-blocked", else: ""}"
              })
          end
        end

        {:ok, %{warning: warning, user: final_user, blocked: blocked?}}

      {:error, step, reason, _changes} ->
        Logger.error("warn_user failed at #{step}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc "List warnings for a user, newest first."
  def list_warnings_for_user(user_id) do
    UserWarning
    |> where(user_id: ^user_id)
    |> order_by(desc: :inserted_at)
    |> preload(:issued_by)
    |> Repo.all()
  end

  @doc """
  List warnings across all users for the admin audit view.

  ## Opts
    * `:page` — 1-based page number (default 1)
    * `:per_page` — page size (default 50, max 200)

  Preloads both the recipient (:user) and the issuing admin (:issued_by) so
  the UI can render them without additional queries. Returns `{warnings, total}`.
  """
  def list_all_warnings(opts \\ []) do
    page = Keyword.get(opts, :page, 1) |> max(1)
    per_page = Keyword.get(opts, :per_page, 50) |> min(200) |> max(1)

    base = from(w in UserWarning)

    total = Repo.aggregate(base, :count)

    warnings =
      base
      |> order_by(desc: :inserted_at)
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> preload([:user, :issued_by])
      |> Repo.all()

    {warnings, total}
  end

  # ── Private helpers ──────────────────────────────────────────────────────

  defp deliver_warning_notification(warning, target, issuer) do
    Accounts.create_notification(%{
      user_id: target.id,
      actor_id: issuer.id,
      type: :warning,
      target_type: if(warning.entry_id, do: "entry", else: nil),
      target_id: warning.entry_id,
      data: %{
        reason: warning.reason,
        strike_number: warning.strike_number,
        details: warning.details,
        escalated_to_block: warning.escalated_to_block,
        warning_id: warning.id
      }
    })
  rescue
    e ->
      Logger.warning("[Moderation] failed to deliver warning notification: #{inspect(e)}")
      :ok
  end

  defp deliver_warning_email(warning, target, issuer) do
    if target.email && String.contains?(target.email, "@") do
      Task.start(fn ->
        try do
          Inkwell.Email.send_user_warning(target, issuer, warning)
        rescue
          e ->
            Logger.warning("[Moderation] failed to send warning email: #{inspect(e)}")
        end
      end)
    end

    :ok
  end
end
