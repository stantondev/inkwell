defmodule Inkwell.FirstEntryNotices do
  @moduledoc """
  "Juan posted their first entry": an in-app (and push) notice for members who
  asked to hear about newcomers (Settings → Notifications, off by default:
  `settings["first_entry_notices"]`). For people who like welcoming new
  writers, like @stoicalgeezer, who until 2026-10-29 found them by searching
  Explore for "new" and so also found ad accounts.

  Sent 15 minutes after publishing, so the spam check that runs for new
  accounts has had its turn, and only if the entry still qualifies for the
  Feed's "New to Inkwell" (`Journals.newcomer_first_entry?/1`), so the same
  rule keeps ads out of both. Opt-in on purpose: nobody is asked to reply.
  """

  import Ecto.Query

  alias Inkwell.{Accounts, Journals, Repo}
  alias Inkwell.Accounts.{Notification, User}

  @delay_seconds 15 * 60

  def delay_seconds, do: @delay_seconds

  @doc "Queue the notices for `entry` if it's its writer's first entry."
  def queue(entry) do
    if entry.privacy == :public and Journals.first_entry?(entry) do
      %{entry_id: entry.id}
      |> Inkwell.Workers.FirstEntryNoticeWorker.new(schedule_in: @delay_seconds)
      |> Oban.insert()
    end

    :ok
  end

  @doc "Notify everyone who asked, if `entry_id` is still a new writer's first entry."
  def notify(entry_id) do
    with true <- Journals.newcomer_first_entry?(entry_id),
         %{} = entry <- Journals.get_entry(entry_id) |> Repo.preload(:user) do
      for reader <- recipients(entry.user_id), not already_told?(reader.id, entry.id) do
        Accounts.create_notification(%{
          type: :first_entry,
          user_id: reader.id,
          actor_id: entry.user_id,
          target_type: "entry",
          target_id: entry.id,
          data: %{
            "entry_title" => entry.title,
            "entry_path" => "/#{entry.user.username}/#{entry.slug}"
          }
        })
      end
    end

    :ok
  end

  defp recipients(writer_id) do
    from(u in User,
      where: u.id != ^writer_id and is_nil(u.blocked_at),
      where: is_nil(u.moderation_state) or u.moderation_state != "limited",
      where: fragment("coalesce((?->>'first_entry_notices')::boolean, false) = true", u.settings)
    )
    |> Repo.all()
  end

  defp already_told?(user_id, entry_id) do
    Repo.exists?(
      from(n in Notification,
        where: n.user_id == ^user_id and n.type == :first_entry and n.target_id == ^entry_id
      )
    )
  end
end
