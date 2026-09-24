defmodule Inkwell.FirstEntryNudge do
  @moduledoc """
  One friendly email, from Stanton, to people who signed up 3–10 days ago and
  haven't written anything yet. About half of real signups never publish.

  Sent at most once per account (`settings["first_entry_nudge_sent_at"]`), only
  to people who actually signed in (a signup form alone creates an account, and
  the address may not be theirs), never to accounts moderation has flagged, to
  fediverse placeholder addresses, or to anyone who turned email off.

  Off unless `config :inkwell, :first_entry_nudge_enabled, true`
  (`FIRST_ENTRY_NUDGE_ENABLED=true`).
  """

  import Ecto.Query

  alias Inkwell.Accounts.User
  alias Inkwell.Repo

  require Logger

  @min_age_days 3
  @max_age_days 10

  def enabled?, do: Application.get_env(:inkwell, :first_entry_nudge_enabled, false) in [true, "true"]

  @doc "Accounts due the email right now."
  def due(now \\ DateTime.utc_now()) do
    newest = DateTime.add(now, -@min_age_days, :day)
    oldest = DateTime.add(now, -@max_age_days, :day)

    from(u in User,
      where: u.inserted_at <= ^newest and u.inserted_at >= ^oldest,
      where: is_nil(u.blocked_at) and is_nil(u.moderation_state),
      where: not like(u.email, "%.fediverse.inkwell.social"),
      where: fragment("coalesce((?->>'email_notifications_disabled')::boolean, false) = false", u.settings),
      where: fragment("(?->>'first_entry_nudge_sent_at') IS NULL", u.settings),
      # Signed in at least once.
      where: fragment("EXISTS (SELECT 1 FROM auth_tokens t WHERE t.user_id = ? AND t.type = 'api_session')", u.id),
      # Nothing written yet, not even a sticky or a draft.
      where: fragment("NOT EXISTS (SELECT 1 FROM entries e WHERE e.user_id = ?)", u.id)
    )
    |> Repo.all()
  end

  @doc "Queue the email for everyone due. Returns how many were queued."
  def enqueue_due do
    if enabled?() do
      users = due()

      Enum.each(users, fn u ->
        %{"user_id" => u.id}
        |> Inkwell.Workers.FirstEntryNudgeWorker.new(unique: [period: 30 * 24 * 3600, keys: [:user_id], states: :all])
        |> Oban.insert()
      end)

      length(users)
    else
      0
    end
  end

  @doc "Send to one account if it still qualifies, and remember that we did."
  def deliver(%User{} = user) do
    if still_due?(user) do
      {subject, body} = content(user)

      case Inkwell.Email.send_announcement(user, subject, body, replyable: true) do
        {:ok, _} ->
          mark_sent(user)
          Logger.info("[FirstEntryNudge] Sent to @#{user.username}")
          :sent

        {:error, reason} ->
          {:error, reason}
      end
    else
      :skipped
    end
  end

  defp still_due?(user), do: Enum.any?(due(), &(&1.id == user.id))

  defp mark_sent(user) do
    settings = Map.put(user.settings || %{}, "first_entry_nudge_sent_at", DateTime.utc_now() |> DateTime.to_iso8601())
    user |> Ecto.Changeset.change(settings: settings) |> Repo.update()
  end

  @doc "Subject and plain-text body."
  def content(%User{} = user) do
    url = Application.get_env(:inkwell, :frontend_url, "https://inkwell.social")

    body = """
    Hey #{first_name(user)}!

    Thanks for signing up for Inkwell. I'm Stanton, I build it (mostly by myself), and I noticed you haven't written anything yet. Totally fine, the first entry is always the hardest one haha.

    It doesn't have to be much. A few lines about your day, a memory, something you've been reading. If a full entry feels like a lot, you can jot a sticky instead, which is just a short note with no title.

    #{url}/editor

    You can keep anything private while you get comfortable, and nobody else sees it until you choose to share it.

    If something got in the way, or Inkwell wasn't what you expected, just reply and tell me. I read every one.
    """

    {"Your first page on Inkwell", body}
  end

  defp first_name(%User{display_name: name}) when is_binary(name) and name != "" do
    name |> String.split(~r/\s+/, trim: true) |> List.first()
  end

  defp first_name(%User{username: username}), do: username
end
