defmodule InkwellWeb.AvatarLinksTest do
  @moduledoc """
  Members' avatars are stored as data URIs on the user row. Responses must
  point at `/api/avatars/:username` instead of carrying the image, or every
  page that mentions someone downloads their whole picture again, uncached.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Repo
  alias Inkwell.Journals.Entry
  alias Inkwell.Feedback.{FeedbackComment, FeedbackPost}
  alias Inkwell.Bookmarks.Bookmark
  alias Inkwell.Reprints.Reprint
  alias Inkwell.Social.Relationship

  # A real 1×1 PNG, so it passes any image check.
  @png "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

  defp member do
    create_user() |> Ecto.Changeset.change(avatar_url: @png) |> Repo.update!()
  end

  defp published(user) do
    Repo.insert!(%Entry{
      user_id: user.id,
      title: "Entry #{System.unique_integer([:positive])}",
      slug: "entry-#{System.unique_integer([:positive])}",
      body_html: "<p>Some words here.</p>",
      status: :published,
      privacy: :public,
      published_at: DateTime.utc_now()
    })
  end

  defp refute_inline_avatar(body, username) do
    refute body =~ "data:image", "response carried an avatar image instead of a link"
    assert body =~ "/api/avatars/#{username}"
  end

  test "roadmap posts and their comments" do
    author = member()
    commenter = member()

    post =
      Repo.insert!(%FeedbackPost{user_id: author.id, title: "An idea", body: "Please", category: :idea, status: :new})

    Repo.insert!(%FeedbackComment{user_id: commenter.id, feedback_post_id: post.id, body: "<p>Yes</p>"})

    list = build_conn() |> get("/api/feedback") |> response(200)
    refute_inline_avatar(list, author.username)

    show = build_conn() |> get("/api/feedback/#{post.id}") |> response(200)
    refute_inline_avatar(show, commenter.username)
  end

  test "bookmarks" do
    reader = member()
    writer = member()
    entry = published(writer)
    Repo.insert!(%Bookmark{user_id: reader.id, entry_id: entry.id})

    body = build_conn() |> log_in_user(reader) |> get("/api/bookmarks") |> response(200)
    refute_inline_avatar(body, writer.username)
  end

  test "notifications" do
    me = member()
    actor = member()
    {:ok, _} = Inkwell.Accounts.create_notification(%{type: :follow_accepted, user_id: me.id, actor_id: actor.id})

    body = build_conn() |> log_in_user(me) |> get("/api/notifications") |> response(200)
    refute_inline_avatar(body, actor.username)
  end

  test "reprints in the Feed" do
    reader = member()
    reprinter = member()
    writer = member()
    entry = published(writer)
    Repo.insert!(%Relationship{follower_id: reader.id, following_id: reprinter.id, status: :accepted})
    Repo.insert!(%Reprint{user_id: reprinter.id, entry_id: entry.id})

    body = build_conn() |> log_in_user(reader) |> get("/api/feed") |> response(200)
    assert body =~ ~s("reprinter")
    refute_inline_avatar(body, reprinter.username)
  end

  test "search documents carry the link" do
    user = member()
    doc = Inkwell.Search.build_user_document(user)
    assert doc.avatar_url =~ "/api/avatars/#{user.username}?v="
  end
end
