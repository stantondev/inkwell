defmodule InkwellWeb.EntryMentionTest do
  use InkwellWeb.ConnCase, async: false

  import Ecto.Query

  alias Inkwell.Accounts.Notification
  alias Inkwell.Repo

  defp mentions_for(user),
    do: Repo.aggregate(from(n in Notification, where: n.user_id == ^user.id and n.type == :mention), :count, :id)

  test "re-saving an entry notifies a mentioned person only once", %{conn: conn} do
    author = create_user()
    friend = create_user()
    body = ~s(<p>Thank you @#{friend.username} for everything.</p>)

    created =
      conn
      |> log_in_user(author)
      |> post("/api/entries", %{title: "Thanks", body_html: body, privacy: "public"})
      |> json_response(201)

    id = created["data"]["id"]
    assert mentions_for(friend) == 1

    # The editor autosaves: several updates in a row, same mention.
    for i <- 1..5 do
      build_conn()
      |> log_in_user(author)
      |> patch("/api/entries/#{id}", %{body_html: body <> "<p>edit #{i}</p>"})
      |> json_response(200)
    end

    assert mentions_for(friend) == 1
  end

  test "a draft doesn't notify anyone until it's published", %{conn: conn} do
    author = create_user()
    friend = create_user()
    body = ~s(<p>Hello @#{friend.username}</p>)

    draft =
      conn
      |> log_in_user(author)
      |> post("/api/entries", %{title: "Draft", body_html: body, privacy: "public", status: "draft"})
      |> json_response(201)

    assert mentions_for(friend) == 0

    build_conn()
    |> log_in_user(author)
    |> post("/api/entries/#{draft["data"]["id"]}/publish", %{})
    |> json_response(200)

    assert mentions_for(friend) == 1
  end
end
