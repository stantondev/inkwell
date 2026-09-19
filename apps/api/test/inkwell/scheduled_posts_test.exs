defmodule Inkwell.ScheduledPostsTest do
  @moduledoc "Roadmap: Scheduled posts (suggested by @kltrtrgr)."
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  import Ecto.Query

  alias Inkwell.Accounts.Notification
  alias Inkwell.Federation.Workers.FanOutWorker
  alias Inkwell.Journals
  alias Inkwell.Journals.Entry
  alias Inkwell.Repo
  alias Inkwell.Workers.PublishScheduledEntriesWorker

  defp in_minutes(n), do: DateTime.add(DateTime.utc_now(), n * 60, :second)

  defp draft(user, attrs \\ %{}) do
    build_conn()
    |> log_in_user(user)
    |> post("/api/entries", Map.merge(%{title: "Later", body_html: "<p>Coming soon</p>", privacy: "public", status: "draft"}, attrs))
    |> json_response(201)
    |> get_in(["data", "id"])
  end

  defp patch_entry(user, id, attrs), do: build_conn() |> log_in_user(user) |> patch("/api/entries/#{id}", attrs)

  # Makes a scheduled draft due without waiting (the API refuses past times).
  defp make_due(id) do
    Repo.update_all(from(e in Entry, where: e.id == ^id), set: [scheduled_at: DateTime.add(DateTime.utc_now(), -30, :second)])
  end

  describe "scheduling a draft" do
    test "a future time and the writer's options are saved" do
      user = create_user()
      id = draft(user)
      at = in_minutes(90)

      body =
        patch_entry(user, id, %{
          scheduled_at: DateTime.to_iso8601(at),
          scheduled_options: %{send_newsletter: true, newsletter_subject: "Hi", crosspost_to: ["acct-1"], junk: "x"}
        })
        |> json_response(200)

      assert body["data"]["scheduled_at"]
      entry = Repo.get!(Entry, id)
      assert entry.status == :draft
      assert DateTime.diff(entry.scheduled_at, at) == 0
      assert entry.scheduled_options == %{"send_newsletter" => true, "newsletter_subject" => "Hi", "crosspost_to" => ["acct-1"]}
    end

    test "a time in the past is refused" do
      user = create_user()
      id = draft(user)

      body = patch_entry(user, id, %{scheduled_at: DateTime.to_iso8601(in_minutes(-5))}) |> json_response(422)
      assert body["errors"]["scheduled_at"] == ["must be in the future"]
    end

    test "an empty post can't be scheduled" do
      user = create_user()
      id = draft(user, %{body_html: "<p></p>"})

      patch_entry(user, id, %{scheduled_at: DateTime.to_iso8601(in_minutes(30))}) |> json_response(422)
      assert Repo.get!(Entry, id).scheduled_at == nil
    end

    test "unscheduling clears it" do
      user = create_user()
      id = draft(user, %{scheduled_at: DateTime.to_iso8601(in_minutes(30))})
      assert Repo.get!(Entry, id).scheduled_at

      patch_entry(user, id, %{scheduled_at: nil}) |> json_response(200)
      assert Repo.get!(Entry, id).scheduled_at == nil
    end
  end

  describe "PublishScheduledEntriesWorker" do
    test "publishes due posts like a manual publish, dated at their scheduled time" do
      user = create_user()
      friend = create_user()
      id = draft(user, %{body_html: "<p>Hello @#{friend.username}</p>", scheduled_at: DateTime.to_iso8601(in_minutes(30))})
      make_due(id)
      due_at = Repo.get!(Entry, id).scheduled_at

      Oban.Testing.with_testing_mode(:manual, fn ->
        assert :ok = perform_job(PublishScheduledEntriesWorker, %{})
        assert_enqueued(worker: FanOutWorker, args: %{entry_id: id, action: "create"})
      end)

      entry = Repo.get!(Entry, id)
      assert entry.status == :published
      assert entry.slug
      assert entry.published_at == due_at
      assert entry.scheduled_at == nil
      assert entry.scheduled_options == %{}
      assert Repo.exists?(from n in Notification, where: n.user_id == ^friend.id and n.type == :mention)
    end

    test "leaves posts that aren't due yet" do
      user = create_user()
      id = draft(user, %{scheduled_at: DateTime.to_iso8601(in_minutes(30))})

      perform_job(PublishScheduledEntriesWorker, %{})
      assert Repo.get!(Entry, id).status == :draft
    end

    test "a suspended author's post is unscheduled, not published" do
      user = create_user()
      id = draft(user, %{scheduled_at: DateTime.to_iso8601(in_minutes(30))})
      make_due(id)
      user |> Ecto.Changeset.change(blocked_at: DateTime.utc_now()) |> Repo.update!()

      perform_job(PublishScheduledEntriesWorker, %{})

      entry = Repo.get!(Entry, id)
      assert entry.status == :draft
      assert entry.scheduled_at == nil
    end
  end

  test "publishing a scheduled draft by hand clears the schedule" do
    user = create_user()
    id = draft(user, %{scheduled_at: DateTime.to_iso8601(in_minutes(30))})

    build_conn()
    |> log_in_user(user)
    |> post("/api/entries/#{id}/publish", %{title: "Later", body_html: "<p>Coming soon</p>", privacy: "public"})
    |> json_response(200)

    entry = Repo.get!(Entry, id)
    assert entry.status == :published
    assert entry.scheduled_at == nil
  end

  test "the abandoned-drafts cleanup never deletes a scheduled post" do
    user = create_user()
    scheduled = draft(user, %{scheduled_at: DateTime.to_iso8601(in_minutes(60 * 24 * 400))})
    plain = draft(user, %{title: "Forgotten", body_html: "<p>Never finished</p>"})
    old = DateTime.add(DateTime.utc_now(), -400, :day)
    Repo.update_all(from(e in Entry, where: e.id in ^[scheduled, plain]), set: [updated_at: old])

    Journals.cleanup_abandoned_drafts()

    assert Repo.get(Entry, scheduled)
    refute Repo.get(Entry, plain)
  end
end
