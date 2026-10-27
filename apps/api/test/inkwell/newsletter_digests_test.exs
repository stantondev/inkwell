defmodule Inkwell.NewsletterDigestsTest do
  @moduledoc "Newsletter digests (asked for by @stoicalgeezer): weekly or every N posts."
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  import Ecto.Query

  alias Inkwell.{Accounts, Newsletter, Repo}
  alias Inkwell.Journals.Entry
  alias Inkwell.Newsletter.{Digests, Send}
  alias Inkwell.Workers.NewsletterDigestWorker

  defp writer(attrs \\ %{}) do
    user = create_user()

    {:ok, user} =
      Accounts.update_user_profile(user, Map.merge(%{"newsletter_enabled" => true}, attrs))

    user
  end

  defp subscribe!(user, email \\ "reader@example.com") do
    {:ok, sub} = Newsletter.subscribe(user.id, email)
    {:ok, _} = Newsletter.confirm_subscriber(sub.confirm_token)
  end

  defp publish(user, attrs \\ %{}) do
    build_conn()
    |> log_in_user(user)
    |> post(
      "/api/entries",
      Map.merge(
        %{title: "A post", body_html: "<p>Something worth reading, number #{System.unique_integer([:positive])}.</p>", privacy: "public", status: "published", send_newsletter: true},
        attrs
      )
    )
    |> json_response(201)
    |> get_in(["data", "id"])
  end

  defp queued_at!(id, at) do
    Repo.update_all(from(e in Entry, where: e.id == ^id), set: [newsletter_queued_at: at])
  end

  defp days_ago(n), do: DateTime.add(DateTime.utc_now(), -n * 86_400, :second)
  defp sends(user), do: Repo.all(from s in Send, where: s.writer_id == ^user.id)
  defp reload(user), do: Repo.get!(Accounts.User, user.id)

  describe "weekly digests" do
    test "a marked post waits instead of being emailed" do
      user = writer(%{"newsletter_mode" => "weekly"})
      subscribe!(user)
      id = publish(user)

      assert sends(user) == []
      entry = Repo.get!(Entry, id)
      assert entry.newsletter_queued_at
      assert is_nil(entry.newsletter_sent_at)
    end

    test "on the day, everything waiting goes out as one email that doesn't use up monthly sends" do
      user = writer(%{"newsletter_mode" => "weekly"})
      subscribe!(user)
      a = publish(user, %{title: "First"})
      b = publish(user, %{title: "Second"})
      queued_at!(a, days_ago(8))

      perform_job(NewsletterDigestWorker, %{})

      assert [send] = sends(user)
      assert send.kind == "digest"
      assert send.status == "sent"
      assert send.subject == "2 new entries from #{user.display_name || user.username}"
      for id <- [a, b], do: assert(Repo.get!(Entry, id).newsletter_sent_at)
      assert Newsletter.count_sends_this_month(user.id) == 0

      # Nothing left: the next run sends nothing.
      perform_job(NewsletterDigestWorker, %{})
      assert length(sends(user)) == 1
    end

    test "posts written since the last send time wait for the next one" do
      user = writer(%{"newsletter_mode" => "weekly"})
      subscribe!(user)
      publish(user)

      perform_job(NewsletterDigestWorker, %{})
      assert sends(user) == []
    end

    test "send times follow the writer's time zone across daylight saving" do
      user = %Accounts.User{
        newsletter_mode: "weekly",
        newsletter_digest_day: 7,
        newsletter_digest_hour: 9,
        newsletter_digest_timezone: "America/New_York"
      }

      # Wednesday 2026-10-28: last Sunday 9am EDT = 13:00 UTC
      assert Digests.last_weekly_due(user, ~U[2026-10-28 12:00:00Z]) == ~U[2026-10-25 13:00:00Z]
      # Clocks go back Nov 1: the next Sunday 9am EST = 14:00 UTC
      assert Digests.next_weekly_due(user, ~U[2026-10-28 12:00:00Z]) == ~U[2026-11-01 14:00:00Z]
      # Sunday itself, before and after the hour
      assert Digests.last_weekly_due(user, ~U[2026-11-01 13:59:00Z]) == ~U[2026-10-25 13:00:00Z]
      assert Digests.last_weekly_due(user, ~U[2026-11-01 14:00:00Z]) == ~U[2026-11-01 14:00:00Z]
    end
  end

  describe "digests every N posts" do
    test "the Nth post sends them all at once" do
      user = writer(%{"newsletter_mode" => "count", "newsletter_digest_count" => 3})
      subscribe!(user)
      publish(user)
      publish(user)
      assert sends(user) == []

      publish(user)
      assert [%{kind: "digest", status: "sent"}] = sends(user)
    end

    test "never more than one every three days" do
      user = writer(%{"newsletter_mode" => "count", "newsletter_digest_count" => 3})
      subscribe!(user)
      for _ <- 1..3, do: publish(user)
      assert length(sends(user)) == 1

      for _ <- 1..3, do: publish(user)
      assert length(sends(user)) == 1

      # The settings page says when the next one can go.
      [last] = sends(user)
      expected = DateTime.add(last.inserted_at, 3 * 86_400, :second)
      assert DateTime.diff(Digests.status(reload(user)).next_send_at, expected) |> abs() < 2

      Repo.update_all(from(s in Send, where: s.writer_id == ^user.id), set: [inserted_at: days_ago(4)])
      perform_job(NewsletterDigestWorker, %{})
      assert length(sends(user)) == 2
    end

    test "a post never waits more than 30 days" do
      user = writer(%{"newsletter_mode" => "count", "newsletter_digest_count" => 5})
      subscribe!(user)
      id = publish(user)

      perform_job(NewsletterDigestWorker, %{})
      assert sends(user) == []

      queued_at!(id, days_ago(31))
      perform_job(NewsletterDigestWorker, %{})
      assert [%{kind: "digest"}] = sends(user)
    end
  end

  describe "ticking the box on a post that's already published (@stoicalgeezer's test)" do
    defp save(user, id, attrs) do
      build_conn()
      |> log_in_user(user)
      |> patch("/api/entries/#{id}", Map.merge(%{title: "Edited"}, attrs))
      |> json_response(200)
    end

    test "saving queues it, and the third one sends the digest" do
      user = writer(%{"newsletter_mode" => "count", "newsletter_digest_count" => 3})
      subscribe!(user)
      ids = for _ <- 1..3, do: publish(user, %{send_newsletter: false})

      [a, b, c] = ids
      body = save(user, a, %{send_newsletter: true})
      assert body["newsletter"] == "queued"
      assert body["data"]["newsletter_queued_at"]

      assert save(user, b, %{send_newsletter: true})["newsletter"] == "queued"
      assert sends(user) == []

      save(user, c, %{send_newsletter: true})
      assert [send] = sends(user)
      assert send.kind == "digest" and send.status == "sent"
      assert Enum.sort(Enum.map(Digests.entries_for(send), & &1.id)) == Enum.sort(ids)
    end

    test "saving again doesn't queue it twice, and an unticked box does nothing" do
      user = writer(%{"newsletter_mode" => "weekly"})
      subscribe!(user)
      id = publish(user, %{send_newsletter: false})

      assert save(user, id, %{})["newsletter"] == nil
      assert is_nil(Repo.get!(Entry, id).newsletter_queued_at)

      assert save(user, id, %{send_newsletter: true})["newsletter"] == "queued"
      assert save(user, id, %{send_newsletter: true})["newsletter"] == "already"
      assert length(Digests.queued_entries(user.id)) == 1
    end

    test "one email per post: saving sends it, and says so when nobody's subscribed" do
      user = writer()
      subscribe!(user)
      id = publish(user, %{send_newsletter: false})
      assert save(user, id, %{send_newsletter: true})["newsletter"] == "sent"
      assert [%{kind: "entry", entry_id: ^id}] = sends(user)

      lonely = writer()
      id = publish(lonely, %{send_newsletter: false})
      assert save(lonely, id, %{send_newsletter: true})["newsletter"] == "no_subscribers"
    end
  end

  test "switching back to one email per post sends what was waiting" do
    user = writer(%{"newsletter_mode" => "weekly"})
    subscribe!(user)
    publish(user)
    {:ok, _} = Accounts.update_user_profile(reload(user), %{"newsletter_mode" => "each"})

    perform_job(NewsletterDigestWorker, %{})
    assert [%{kind: "digest"}] = sends(user)

    # From now on posts go out one at a time again.
    publish(reload(user))
    assert Enum.count(sends(user), &(&1.kind == "entry")) == 1
  end

  test "with no subscribers the waiting posts are let go" do
    user = writer(%{"newsletter_mode" => "weekly"})
    id = publish(user)
    queued_at!(id, days_ago(8))

    perform_job(NewsletterDigestWorker, %{})
    assert sends(user) == []
    assert is_nil(Repo.get!(Entry, id).newsletter_queued_at)
  end

  test "a post made private before the digest is left out" do
    user = writer(%{"newsletter_mode" => "weekly"})
    subscribe!(user)
    a = publish(user, %{title: "Stays"})
    b = publish(user, %{title: "Goes private"})
    queued_at!(a, days_ago(8))
    Repo.update_all(from(e in Entry, where: e.id == ^b), set: [privacy: :private])

    perform_job(NewsletterDigestWorker, %{})
    assert [send] = sends(user)
    assert Enum.map(Digests.entries_for(send), & &1.id) == [a]
  end

  describe "the settings API" do
    test "shows what's waiting, removes a post, and sends now (once a day)" do
      user = writer(%{"newsletter_mode" => "weekly", "newsletter_digest_timezone" => "Europe/London"})
      subscribe!(user)
      a = publish(user, %{title: "Keep"})
      b = publish(user, %{title: "Drop"})
      conn = build_conn() |> log_in_user(user)

      body = conn |> get("/api/newsletter/settings") |> json_response(200)
      assert body["data"]["newsletter_mode"] == "weekly"
      assert Enum.map(body["data"]["digest"]["queued"], & &1["title"]) == ["Keep", "Drop"]
      assert body["data"]["digest"]["can_send_now"]
      assert body["data"]["digest"]["next_send_at"]

      body = build_conn() |> log_in_user(user) |> delete("/api/newsletter/digest/entries/#{b}") |> json_response(200)
      assert Enum.map(body["data"]["queued"], & &1["id"]) == [a]

      body = build_conn() |> log_in_user(user) |> post("/api/newsletter/digest/send") |> json_response(200)
      assert body["data"]["kind"] == "digest"
      assert body["digest"]["queued"] == []

      publish(user)
      build_conn() |> log_in_user(user) |> post("/api/newsletter/digest/send") |> json_response(422)

      sends = build_conn() |> log_in_user(user) |> get("/api/newsletter/sends") |> json_response(200)
      assert [%{"kind" => "digest", "entries" => [%{"title" => "Keep"}]}] = sends["data"]
    end

    test "refuses unknown time zones and counts outside 3–10" do
      user = writer()
      conn = build_conn() |> log_in_user(user)

      body = conn |> patch("/api/newsletter/settings", %{newsletter_digest_timezone: "Mars/Olympus"}) |> json_response(422)
      assert body["errors"]["newsletter_digest_timezone"]

      body = build_conn() |> log_in_user(user) |> patch("/api/newsletter/settings", %{newsletter_digest_count: 2}) |> json_response(422)
      assert body["errors"]["newsletter_digest_count"]

      body = build_conn() |> log_in_user(user) |> patch("/api/newsletter/settings", %{newsletter_mode: "daily"}) |> json_response(422)
      assert body["errors"]["newsletter_mode"]
    end
  end

  test "cancelling a queued digest puts its posts back" do
    user = writer(%{"newsletter_mode" => "weekly"})
    subscribe!(user)
    id = publish(user)
    {:ok, send} = Repo.insert(%Send{writer_id: user.id, kind: "digest", status: "queued", recipient_count: 1})
    Repo.update_all(from(e in Entry, where: e.id == ^id), set: [newsletter_send_id: send.id])

    assert {:ok, _} = Newsletter.cancel_send(send.id, user.id)
    assert [%{id: ^id}] = Digests.queued_entries(user.id)
  end

  describe "the digest email" do
    test "shows each post's opening, and only the warning for a sensitive one" do
      user = writer()
      long = String.duplicate("word ", 200)

      entries = [
        %Entry{id: Ecto.UUID.generate(), slug: "open", title: "Open & honest", body_html: "<p>#{long}</p>", published_at: DateTime.utc_now(), word_count: 200},
        %Entry{id: Ecto.UUID.generate(), slug: "hard", title: "Hard", body_html: "<p>SECRET DETAILS</p>", sensitive: true, content_warning: "grief", published_at: DateTime.utc_now()}
      ]

      html = Inkwell.Email.build_digest_html(entries, user)
      assert html =~ "2 new entries from"
      assert html =~ "Open &amp; honest"
      assert html =~ "word…"
      refute html =~ String.trim(long)
      assert html =~ "Content warning: grief"
      refute html =~ "SECRET DETAILS"
      assert html =~ "{{UNSUBSCRIBE_URL}}"
    end
  end
end
