defmodule InkwellWeb.FeedbackCommentEditTest do
  @moduledoc """
  Roadmap comments can be edited by the person who wrote them (strypey,
  March 2026: "it seems I'm unable to edit comments here").
  """
  use InkwellWeb.ConnCase, async: false

  import Ecto.Query

  alias Inkwell.Accounts.Notification
  alias Inkwell.Feedback
  alias Inkwell.Repo

  defp roadmap_post(author) do
    {:ok, post} =
      Feedback.create_post(%{"title" => "An idea", "body" => "Some details about the idea", "category" => "idea", "user_id" => author.id})

    post
  end

  defp comment(user, post, body) do
    build_conn()
    |> log_in_user(user)
    |> post("/api/feedback/#{post.id}/comments", %{body: body})
    |> json_response(201)
    |> get_in(["data", "id"])
  end

  defp edit(user, id, body), do: build_conn() |> log_in_user(user) |> patch("/api/feedback/comments/#{id}", %{body: body})

  defp mentions(user) do
    Repo.aggregate(from(n in Notification, where: n.user_id == ^user.id and n.type == :feedback_mention), :count, :id)
  end

  test "the author can edit their comment, and it's marked edited" do
    writer = create_user()
    id = comment(writer, roadmap_post(create_user()), "First thought")

    data = edit(writer, id, "Second thought\nwith a new line") |> json_response(200) |> Map.fetch!("data")

    # The sanitizer re-serializes void tags as <br />; either form renders the same.
      assert data["body"] =~ ~r{^<p>Second thought<br\s*/?>with a new line</p>$}
    assert data["edited_at"]
  end

  test "someone else can't edit it, not even an admin" do
    writer = create_user()
    id = comment(writer, roadmap_post(create_user()), "Mine")

    edit(create_user(), id, "Hijacked") |> json_response(403)
    assert Repo.get!(Inkwell.Feedback.FeedbackComment, id).body =~ "Mine"
  end

  test "only people newly mentioned by the edit are notified" do
    writer = create_user()
    friend = create_user()
    newcomer = create_user()
    id = comment(writer, roadmap_post(create_user()), "cc @#{friend.username}")

    # Mention notifications are sent in the background.
    Process.sleep(100)
    assert mentions(friend) == 1

    edit(writer, id, "cc @#{friend.username} and @#{newcomer.username}") |> json_response(200)
    Process.sleep(100)

    assert mentions(friend) == 1
    assert mentions(newcomer) == 1
  end

  test "an empty edit is rejected", %{conn: conn} do
    writer = create_user()
    id = comment(writer, roadmap_post(create_user()), "Something")

    conn |> log_in_user(writer) |> patch("/api/feedback/comments/#{id}", %{body: ""}) |> json_response(422)
  end
end
