defmodule Inkwell.AnnouncementsTest do
  use Inkwell.DataCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  alias Inkwell.Accounts.User
  alias Inkwell.Announcements
  alias Inkwell.Repo

  test "recipients exclude blocked, fediverse placeholders and unsubscribed" do
    ok = create_user()

    create_user()
    |> Ecto.Changeset.change(blocked_at: DateTime.utc_now())
    |> Repo.update!()

    create_user(%{email: "someone@mastodon.social.fediverse.inkwell.social"})

    create_user()
    |> Ecto.Changeset.change(moderation_state: "limited")
    |> Repo.update!()

    create_user()
    |> Ecto.Changeset.change(settings: %{"email_notifications_disabled" => true})
    |> Repo.update!()

    ids = Announcements.recipients_query() |> Repo.all() |> Enum.map(& &1.id)
    assert ok.id in ids
    assert length(ids) == 1
    assert Announcements.recipient_count() == 1
  end

  test "enqueue_all queues one job per person and never twice" do
    create_user()
    create_user()

    Oban.Testing.with_testing_mode(:manual, fn ->
      assert {:ok, 2} = Announcements.enqueue_all("Hello", "Body")
      assert {:ok, 0} = Announcements.enqueue_all("Hello", "Body")
      assert length(all_enqueued(worker: Inkwell.Workers.AnnouncementWorker)) == 2
    end)
  end

  test "validation" do
    assert {:error, _} = Announcements.enqueue_all("", "body")
    assert {:error, _} = Announcements.enqueue_all("subject", "  ")
  end

  test "html escapes text, keeps paragraphs, links https urls" do
    html = Inkwell.Email.announcement_html("Hi <b>there</b>\n\nSee https://inkwell.social/transparency.", "https://x/unsub")
    assert html =~ "Hi &lt;b&gt;there&lt;/b&gt;"
    assert html =~ ~s(<a href="https://inkwell.social/transparency")
    refute html =~ ~s(transparency.")
    assert html =~ "https://x/unsub"
  end

  test "worker skips people who unsubscribed after queueing" do
    user =
      create_user()
      |> Ecto.Changeset.change(settings: %{"email_notifications_disabled" => true})
      |> Repo.update!()

    assert :ok = perform_job(Inkwell.Workers.AnnouncementWorker, %{"user_id" => user.id, "subject" => "s", "body" => "b"})
    assert %User{} = Repo.reload!(user)
  end

  test "exclude_paying leaves out Founding Members, paying Plus and Ink Donors" do
    free = create_user()

    create_user()
    |> Ecto.Changeset.change(founding_member_number: 1, founding_member_at: DateTime.utc_now())
    |> Repo.update!()

    create_user()
    |> Ecto.Changeset.change(subscription_tier: "plus", subscription_status: "active", square_subscription_id: "sq_1")
    |> Repo.update!()

    create_user()
    |> Ecto.Changeset.change(ink_donor_status: "active")
    |> Repo.update!()

    trialing =
      create_user()
      |> Ecto.Changeset.change(subscription_tier: "plus", subscription_status: "trialing")
      |> Repo.update!()

    assert Announcements.recipient_count() == 5
    ids = Announcements.recipients_query(exclude_paying: true) |> Repo.all() |> Enum.map(& &1.id)
    assert Enum.sort(ids) == Enum.sort([free.id, trialing.id])
  end
end
