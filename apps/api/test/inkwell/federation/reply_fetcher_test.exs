defmodule Inkwell.Federation.ReplyFetcherTest do
  @moduledoc """
  Storing a thread from Mastodon's context API: the whole public thread,
  nested replies threaded, each reply at the time it was written; never
  private replies, our own comments or defederated servers; replies deleted
  on the home server removed only when the thread is known to be complete.
  """
  use Inkwell.DataCase, async: false

  alias Inkwell.Federation.{ReplyFetcher, RemoteEntry}
  alias Inkwell.Journals.Comment
  alias Inkwell.Moderation.FediverseBlocks

  @status_id "117327932994028225"

  defp post(attrs \\ %{}) do
    actor = create_remote_actor(%{ap_id: "https://mastodon.example/users/author_#{System.unique_integer([:positive])}"})

    Repo.insert!(
      struct(
        RemoteEntry,
        Map.merge(
          %{
            ap_id: "https://mastodon.example/users/author/statuses/#{@status_id}",
            body_html: "<p>a post</p>",
            remote_actor_id: actor.id,
            published_at: DateTime.utc_now()
          },
          attrs
        )
      )
    )
  end

  defp status(id, in_reply_to, attrs \\ %{}) do
    Map.merge(
      %{
        "id" => id,
        "uri" => "https://beige.example/users/bedast/statuses/#{id}",
        "url" => "https://beige.example/@bedast/#{id}",
        "in_reply_to_id" => in_reply_to,
        "visibility" => "public",
        "content" => "<p>reply #{id}</p>",
        "created_at" => "2026-09-24T20:47:01.000Z",
        "media_attachments" => [],
        "account" => %{
          "username" => "bedast",
          "acct" => "bedast@beige.example",
          "display_name" => "Bedast",
          "uri" => "https://beige.example/users/bedast",
          "url" => "https://beige.example/@bedast",
          "avatar_static" => "https://beige.example/avatar.png"
        }
      },
      attrs
    )
  end

  defp comments(post) do
    Repo.all(from(c in Comment, where: c.remote_entry_id == ^post.id, order_by: c.inserted_at))
  end

  test "stores the thread, nested replies under their parents, at the time they were written" do
    p = post()

    :ok =
      ReplyFetcher.store_mastodon_thread(p, @status_id, [
        status("1", @status_id),
        status("2", "1", %{"created_at" => "2026-09-24T21:54:34.803Z", "account" => %{"username" => "author", "acct" => "author", "display_name" => ""}}),
        status("3", @status_id, %{"visibility" => "unlisted", "created_at" => "2026-09-24T21:00:00.000Z"})
      ])

    [first, second, third] = comments(p)
    assert first.ap_id =~ "/statuses/1"
    assert first.parent_comment_id == nil
    assert first.inserted_at == ~U[2026-09-24 20:47:01.000000Z]
    assert first.remote_author["username"] == "bedast"
    assert first.remote_author["domain"] == "beige.example"
    assert first.remote_author["ap_id"] == "https://beige.example/users/bedast"

    assert second.ap_id =~ "/statuses/3"
    assert third.ap_id =~ "/statuses/2"
    assert third.parent_comment_id == first.id
    # A local account on the home server: its domain is the post's server
    assert third.remote_author["domain"] == "mastodon.example"
    assert third.remote_author["display_name"] == "author"
  end

  test "fetching again adds only what's new" do
    p = post()
    ReplyFetcher.store_mastodon_thread(p, @status_id, [status("1", @status_id)])
    ReplyFetcher.store_mastodon_thread(p, @status_id, [status("1", @status_id), status("2", @status_id)])

    assert length(comments(p)) == 2
  end

  test "skips private replies, our own comments and defederated servers" do
    p = post()
    FediverseBlocks.admin_block_domain("blocked.example")

    ReplyFetcher.store_mastodon_thread(p, @status_id, [
      status("1", @status_id, %{"visibility" => "private"}),
      status("2", @status_id, %{"visibility" => "direct"}),
      status("3", @status_id, %{"uri" => "https://inkwell.social/comments/#{Ecto.UUID.generate()}"}),
      status("4", @status_id, %{"uri" => "https://blocked.example/users/x/statuses/4"}),
      status("5", @status_id)
    ])

    assert [only] = comments(p)
    assert only.ap_id =~ "/statuses/5"
  end

  test "a reply to one of our comments is threaded under it" do
    p = post()
    member = create_user()
    ours = Repo.insert!(%Comment{remote_entry_id: p.id, user_id: member.id, body_html: "<p>mine</p>"})
    ours_uri = "https://inkwell.social/comments/#{ours.id}"

    ReplyFetcher.store_mastodon_thread(p, @status_id, [
      status("1", @status_id, %{"uri" => ours_uri}),
      status("2", "1")
    ])

    reply = Repo.one!(from(c in Comment, where: c.remote_entry_id == ^p.id and is_nil(c.user_id)))
    assert reply.parent_comment_id == ours.id
  end

  test "keeps pictures" do
    p = post()

    ReplyFetcher.store_mastodon_thread(p, @status_id, [
      status("1", @status_id, %{
        "media_attachments" => [%{"type" => "image", "url" => "https://beige.example/media/cat.png", "description" => "a cat"}]
      })
    ])

    [c] = comments(p)
    assert c.body_html =~ ~s(src="https://beige.example/media/cat.png")
  end

  describe "replies deleted on the home server" do
    setup do
      p = post(%{engagement_refreshed_at: DateTime.utc_now(), reply_count: 1})
      ReplyFetcher.store_mastodon_thread(p, @status_id, [status("1", @status_id), status("2", @status_id)])
      %{post: Repo.get!(RemoteEntry, p.id)}
    end

    test "are removed when the thread is complete", %{post: p} do
      ReplyFetcher.store_mastodon_thread(p, @status_id, [status("1", @status_id)])
      assert [c] = comments(p)
      assert c.ap_id =~ "/statuses/1"
    end

    test "stay when the home server counts more replies than it showed", %{post: p} do
      p = %{p | reply_count: 2}
      ReplyFetcher.store_mastodon_thread(p, @status_id, [status("1", @status_id)])
      assert length(comments(p)) == 2
    end

    test "stay when the count never came from the home server", %{post: p} do
      p = %{p | engagement_refreshed_at: nil}
      ReplyFetcher.store_mastodon_thread(p, @status_id, [status("1", @status_id)])
      assert length(comments(p)) == 2
    end

    test "stay when someone here answered them", %{post: p} do
      [_, gone] = comments(p)
      member = create_user()
      Repo.insert!(%Comment{remote_entry_id: p.id, user_id: member.id, body_html: "<p>answer</p>", parent_comment_id: gone.id})

      ReplyFetcher.store_mastodon_thread(p, @status_id, [status("1", @status_id)])
      assert Repo.get(Comment, gone.id)
    end
  end
end
