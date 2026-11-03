defmodule InkwellWeb.FeedbackStatusNoticeTest do
  use InkwellWeb.ConnCase, async: false

  import Ecto.Query

  alias Inkwell.Accounts.Notification
  alias Inkwell.Feedback
  alias Inkwell.Repo

  defp admin, do: create_user() |> Ecto.Changeset.change(role: "admin") |> Repo.update!()

  defp roadmap_post(author) do
    {:ok, post} =
      Feedback.create_post(%{"title" => "Sharing to social media", "body" => "The share button disappeared today", "category" => "bug", "user_id" => author.id})

    post
  end

  defp notices(user, type),
    do: Repo.all(from(n in Notification, where: n.user_id == ^user.id and n.type == ^type))

  test "marking an item done tells the person who posted it" do
    author = create_user()
    post = roadmap_post(author)

    build_conn()
    |> log_in_user(admin())
    |> patch("/api/feedback/#{post.id}", %{
      status: "done",
      admin_response: nil,
      release_note: "Share is back in the row under each entry.",
      priority: nil,
      value_score: nil
    })
    |> json_response(200)

    Process.sleep(150)
    assert [n] = notices(author, :feedback_status_change)
    assert n.data["new_status"] == "done"
  end

  test "status changes and comments are sent as push notifications, linking to the post" do
    assert Inkwell.Push.pushable_type?(:feedback_status_change)
    assert Inkwell.Push.pushable_type?(:feedback_comment)

    done = %Notification{type: :feedback_status_change, target_id: "abc", data: %{"post_title" => "Sharing", "new_status" => "done"}}
    assert %{title: "Shipped", body: "stanton marked “Sharing” as done", data: %{url: "/roadmap/abc"}} =
             Inkwell.Push.build_payload(done, "stanton")

    planned = %{done | data: %{post_title: "Sharing", new_status: "in_progress"}}
    assert Inkwell.Push.build_payload(planned, "stanton").body == "stanton marked “Sharing” as in progress"

    comment = %Notification{type: :feedback_comment, target_id: "abc", data: %{"post_title" => "Sharing"}}
    assert %{body: "stanton commented on “Sharing”", data: %{url: "/roadmap/abc"}} =
             Inkwell.Push.build_payload(comment, "stanton")
  end
end
