defmodule InkwellWeb.FediverseCountsTest do
  @moduledoc """
  What readers see on fediverse posts in Feed, on the post page and on the
  buttons. Before 2026-09-25: Feed always said you hadn't inked or reprinted a
  fediverse post, tapping Ink or Reprint replaced the count with Inkwell's
  alone (dropping the fediverse's favourites/boosts), Explore counted Inkwell
  reprints twice, and a reprint never reached the post's author.
  """
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  alias Inkwell.Federation.RemoteEntry
  alias Inkwell.Federation.Workers.{DeliverActivityWorker, FanOutWorker}
  alias Inkwell.Inks.Ink
  alias Inkwell.Journals.Comment
  alias Inkwell.Reprints.Reprint

  setup do
    user = create_user()
    actor = create_remote_actor(%{inbox: "https://author.example/users/a/inbox", shared_inbox: "https://author.example/inbox"})
    create_relationship(follower_id: user.id, remote_actor_id: actor.id, status: :accepted)

    post =
      Repo.insert!(%RemoteEntry{
        ap_id: "#{actor.ap_id}/statuses/#{System.unique_integer([:positive])}",
        body_html: "<p>a post from the fediverse</p>",
        remote_actor_id: actor.id,
        published_at: DateTime.utc_now(),
        reply_count: 2,
        likes_count: 10,
        boosts_count: 3
      })

    Repo.insert!(%Comment{
      remote_entry_id: post.id,
      body_html: "<p>a reply</p>",
      ap_id: "https://elsewhere.example/statuses/1",
      remote_author: %{"username" => "x", "domain" => "elsewhere.example"}
    })

    %{user: user, actor: actor, post: post}
  end

  defp feed_item(conn, post) do
    conn |> get("/api/feed") |> json_response(200) |> Map.fetch!("data") |> Enum.find(&(&1["id"] == post.id))
  end

  test "Feed shows the fediverse's counts and your own ink/reprint", %{conn: conn, user: user, post: post} do
    Repo.insert!(%Ink{user_id: user.id, remote_entry_id: post.id})
    conn = log_in_user(conn, user)

    item = feed_item(conn, post)
    assert item["comment_count"] == 2
    assert item["ink_count"] == 11
    assert item["reprint_count"] == 3
    assert item["my_ink"] == true
    assert item["my_reprint"] == false
  end

  test "the post page has the same counts", %{conn: conn, user: user, post: post} do
    data = conn |> log_in_user(user) |> get("/api/remote-entries/#{post.id}") |> json_response(200) |> Map.fetch!("data")
    assert %{"comment_count" => 2, "ink_count" => 10, "reprint_count" => 3} = data
  end

  test "the comments list says how many there are", %{conn: conn, user: user, post: post} do
    Repo.update_all(from(e in RemoteEntry, where: e.id == ^post.id), set: [replies_fetched_at: DateTime.utc_now()])
    body = conn |> log_in_user(user) |> get("/api/remote-entries/#{post.id}/comments") |> json_response(200)
    assert length(body["data"]) == 1
    assert body["comment_count"] == 2
  end

  test "tapping Ink keeps the fediverse's favourites in the count", %{conn: conn, user: user, post: post} do
    conn = log_in_user(conn, user)

    assert %{"inked" => true, "ink_count" => 11} =
             conn |> post("/api/remote-entries/#{post.id}/ink") |> json_response(200) |> Map.fetch!("data")

    assert %{"inked" => false, "ink_count" => 10} =
             conn |> post("/api/remote-entries/#{post.id}/ink") |> json_response(200) |> Map.fetch!("data")
  end

  test "a reprint keeps the boosts in the count and goes to the author's server", %{conn: conn, user: user, actor: actor, post: post} do
    Oban.Testing.with_testing_mode(:manual, fn ->
      data =
        conn
        |> log_in_user(user)
        |> post("/api/remote-entries/#{post.id}/reprint/toggle")
        |> json_response(200)
        |> Map.fetch!("data")

      assert %{"reprinted" => true, "reprint_count" => 4} = data

      reprint = Repo.get_by!(Reprint, user_id: user.id, remote_entry_id: post.id)
      assert reprint.ap_announce_id =~ "#announce-"

      [job] = all_enqueued(worker: FanOutWorker)
      :ok = perform_job(FanOutWorker, job.args)

      assert [%{"activity" => activity, "inbox_url" => "https://author.example/inbox"}] =
               all_enqueued(worker: DeliverActivityWorker) |> Enum.map(& &1.args)

      assert activity["type"] == "Announce"
      assert activity["object"] == post.ap_id
      assert actor.ap_id in activity["cc"]
    end)
  end
end
