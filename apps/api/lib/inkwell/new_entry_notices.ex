defmodule Inkwell.NewEntryNotices do
  @moduledoc """
  "Marko published “On Becoming”": an in-app notice to the people who follow
  a writer when one of their entries goes live. Asked for by members
  (2026-09-27): readers couldn't tell when someone they follow had written
  something unless they happened to open the Feed.

  Kept quiet on purpose:

    * Entries only, not stickies or imported posts, and only entries dated
      in the last 7 days, so publishing old drafts or a backdated post
      doesn't announce itself.
    * Only followers (accepted) who can read the entry
      (`Journals.viewable_by?/2`), who aren't suspended and haven't turned
      notices off (`settings["new_entry_notices_disabled"]`). Blocks are
      skipped by `Accounts.create_notification/1`.
    * Welcomers (`settings["first_entry_notices"]`) who were told about a new
      writer's first entry in the last day hear about that writer's next
      entries the same day too: the first-entry notice is updated ("posted 3
      entries"), the way a follower's notice is. Asked for by @stoicalgeezer
      (2026-11-24), who saw @renacer's first post and missed the next two.
    * One notice per writer per reader per day: another entry the same day
      updates that notice (newest entry, count) and marks it unread again.
    * In-app only. `:new_entry` isn't a push or email type.
  """

  import Ecto.Query

  alias Inkwell.{Accounts, Journals, Repo}
  alias Inkwell.Accounts.{Notification, User}
  alias Inkwell.Journals.Entry
  alias Inkwell.Social.Relationship

  @recent_days 7

  @doc "Whether publishing `entry` should notify its writer's followers."
  def announce?(%Entry{kind: "entry", status: :published, imported_from: nil, privacy: privacy, published_at: %DateTime{} = at})
      when privacy != :private do
    DateTime.diff(DateTime.utc_now(), at, :day) < @recent_days
  end

  def announce?(_entry), do: false

  @doc "Notify everyone who follows `entry`'s writer and can read it."
  def notify_followers(%Entry{} = entry) do
    if announce?(entry) do
      told =
        entry.user_id
        |> followers()
        |> Enum.filter(&Journals.viewable_by?(entry, &1))
        |> Enum.map(fn reader ->
          notify(reader, entry)
          reader.id
        end)

      follow_up_welcomers(entry, MapSet.new(told))
    end

    :ok
  end

  defp followers(author_id) do
    from(u in User,
      join: r in Relationship,
      on: r.follower_id == u.id,
      where: r.following_id == ^author_id and r.status == :accepted and u.id != ^author_id,
      where: is_nil(u.blocked_at),
      where: fragment("coalesce((?->>'new_entry_notices_disabled')::boolean, false) = false", u.settings)
    )
    |> Repo.all()
  end

  # A new writer's next entries, for the welcomers who were just told about
  # their first one. Only public entries, only while the writer is in good
  # standing, and never for someone already notified above as a follower.
  defp follow_up_welcomers(%Entry{privacy: :public} = entry, already_told) do
    with %User{blocked_at: nil, moderation_state: state} = writer when state != "limited" <-
           Repo.get(User, entry.user_id) do
      path = "/#{writer.username}/#{entry.slug}"
      since = DateTime.add(DateTime.utc_now(), -1, :day)

      from(n in Notification,
        join: u in User,
        on: u.id == n.user_id,
        where: n.type == :first_entry and n.actor_id == ^entry.user_id and n.inserted_at >= ^since,
        where: is_nil(u.blocked_at),
        where: fragment("coalesce((?->>'first_entry_notices')::boolean, false) = true", u.settings)
      )
      |> Repo.all()
      |> Enum.reject(&(MapSet.member?(already_told, &1.user_id) or &1.target_id == entry.id))
      |> Enum.each(&add_to_first_entry_notice(&1, entry, path))
    end

    :ok
  end

  defp follow_up_welcomers(_entry, _already_told), do: :ok

  defp add_to_first_entry_notice(%Notification{} = n, entry, path) do
    data = n.data || %{}
    count = (data["count"] || 1) + 1

    n
    |> Ecto.Changeset.change(
      target_id: entry.id,
      read: false,
      data: Map.merge(data, %{"count" => count, "entry_title" => entry.title, "entry_path" => path}),
      inserted_at: DateTime.utc_now()
    )
    |> Repo.update()
  end

  defp notify(reader, entry) do
    since = DateTime.add(DateTime.utc_now(), -1, :day)

    existing =
      from(n in Notification,
        where:
          n.user_id == ^reader.id and n.type == :new_entry and n.actor_id == ^entry.user_id and
            n.inserted_at >= ^since,
        order_by: [desc: n.inserted_at],
        limit: 1
      )
      |> Repo.one()

    case existing do
      nil ->
        Accounts.create_notification(%{
          type: :new_entry,
          user_id: reader.id,
          actor_id: entry.user_id,
          target_type: "entry",
          target_id: entry.id,
          data: %{"count" => 1}
        })

      %Notification{target_id: same} when same == entry.id ->
        :ok

      %Notification{} = n ->
        count = (n.data["count"] || 1) + 1

        n
        |> Ecto.Changeset.change(
          target_id: entry.id,
          read: false,
          data: Map.put(n.data || %{}, "count", count),
          inserted_at: DateTime.utc_now()
        )
        |> Repo.update()
    end
  end
end
