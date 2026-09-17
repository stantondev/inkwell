defmodule Inkwell.MentionNotificationTest do
  @moduledoc """
  Mentioning someone in an entry must notify them once, not once per save.
  The editor autosaves, so the un-deduped version sent one notification and
  one email per save (35 of each for a single post in production).
  """
  use Inkwell.DataCase, async: false

  import Ecto.Query

  alias Inkwell.Accounts
  alias Inkwell.Accounts.Notification
  alias Inkwell.Repo

  defp mention_count(user), do: Repo.aggregate(from(n in Notification, where: n.user_id == ^user.id and n.type == :mention), :count, :id)

  test "already_notified_mention? is per person and per item" do
    mentioned = create_user()
    entry_id = Ecto.UUID.generate()

    refute Accounts.already_notified_mention?(mentioned.id, "entry", entry_id)

    {:ok, _} =
      Accounts.create_notification(%{
        type: :mention,
        user_id: mentioned.id,
        actor_id: create_user().id,
        target_type: "entry",
        target_id: entry_id
      })

    assert Accounts.already_notified_mention?(mentioned.id, "entry", entry_id)
    refute Accounts.already_notified_mention?(mentioned.id, "entry", Ecto.UUID.generate())
    refute Accounts.already_notified_mention?(create_user().id, "entry", entry_id)
    refute Accounts.already_notified_mention?(mentioned.id, "comment", entry_id)
    assert mention_count(mentioned) == 1
  end

  test "notification emails are capped per hour" do
    author = create_user()
    target = create_user()

    for _ <- 1..9 do
      Accounts.create_notification(%{
        type: :mention,
        user_id: target.id,
        actor_id: author.id,
        target_type: "entry",
        target_id: Ecto.UUID.generate()
      })
    end

    emails =
      Repo.aggregate(
        from(j in "oban_jobs", where: j.worker == "Inkwell.Workers.EmailNotificationWorker"),
        :count,
        :id
      )

    assert emails <= 7, "expected the hourly email cap to hold, got #{emails} email jobs"
    assert mention_count(target) == 9
  end
end
