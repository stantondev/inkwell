defmodule InkwellWeb.PrivateFediverseReplyTest do
  @moduledoc """
  Two holes found in the Sept 2026 Letters audit.

  1. A Mastodon reply sent as a *private mention* (or followers-only) to an
     Inkwell entry became an ordinary comment anyone could read. The sender
     chose who could see it; it now reaches the people it mentions as a
     private notification instead, the way a Mastodon direct message already
     did.

  2. Blocking a fediverse account or domain in Settings → Blocked did nothing
     to what that account sent afterwards: `FediverseBlocks.should_reject_actor?/3`
     existed but nothing called it. Blocked accounts could still message you,
     comment on your entries, sign your guestbook and follow you.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Accounts.Notification
  alias Inkwell.Journals
  alias Inkwell.Journals.Comment
  alias Inkwell.Moderation.FediverseBlocks
  alias InkwellWeb.FederationController

  @public "https://www.w3.org/ns/activitystreams#Public"

  setup do
    author = create_user()
    actor = create_remote_actor()

    {:ok, entry} =
      Journals.create_entry(%{
        "user_id" => author.id,
        "title" => "A public entry",
        "body_html" => "<p>Something worth replying to.</p>",
        "privacy" => "public"
      })

    %{author: author, actor: actor, entry: entry}
  end

  defp actor_url(user), do: "#{InkwellWeb.Endpoint.url()}/users/#{user.username}"

  defp create(actor, object) do
    %{"type" => "Create", "actor" => actor.ap_id, "object" => object}
  end

  defp note(actor, attrs) do
    Map.merge(
      %{
        "type" => "Note",
        "id" => "#{actor.ap_id}/statuses/#{System.unique_integer([:positive])}",
        "content" => "<p>just between us</p>",
        "attributedTo" => actor.ap_id
      },
      attrs
    )
  end

  defp reply(actor, entry, author, to, cc) do
    note(actor, %{
      "inReplyTo" => entry.ap_id,
      "to" => to,
      "cc" => cc,
      "tag" => [%{"type" => "Mention", "href" => actor_url(author)}]
    })
  end

  defp comments_on(entry), do: Repo.all(from c in Comment, where: c.entry_id == ^entry.id)

  defp notifications_for(user, type),
    do: Repo.all(from n in Notification, where: n.user_id == ^user.id and n.type == ^type)

  test "publicly_addressed?/1" do
    assert FederationController.publicly_addressed?(%{"to" => [@public]})
    assert FederationController.publicly_addressed?(%{"cc" => ["as:Public"]})
    assert FederationController.publicly_addressed?(%{"to" => "Public"})
    refute FederationController.publicly_addressed?(%{"to" => ["https://x.example/users/a"]})
    refute FederationController.publicly_addressed?(%{"to" => ["https://x.example/users/a/followers"]})
    refute FederationController.publicly_addressed?(%{})
    refute FederationController.publicly_addressed?(nil)
  end

  describe "replies to an entry" do
    test "a private mention becomes a private notification, not a comment", %{author: author, actor: actor, entry: entry} do
      activity = create(actor, reply(actor, entry, author, [actor_url(author)], []))

      FederationController.process_activity_async(activity, author)

      assert comments_on(entry) == []
      assert [n] = notifications_for(author, :fediverse_mention)
      assert n.data["public"] == false
      assert n.data["content_preview"] =~ "just between us"
    end

    test "a followers-only reply isn't posted either", %{author: author, actor: actor, entry: entry} do
      activity = create(actor, reply(actor, entry, author, ["#{actor.ap_id}/followers"], [actor_url(author)]))

      FederationController.process_activity_async(activity, nil)

      assert comments_on(entry) == []
      assert [_] = notifications_for(author, :fediverse_mention)
    end

    test "public and unlisted replies are comments", %{author: author, actor: actor, entry: entry} do
      FederationController.process_activity_async(create(actor, reply(actor, entry, author, [@public], [])), author)
      FederationController.process_activity_async(create(actor, reply(actor, entry, author, [actor_url(author)], [@public])), author)

      assert length(comments_on(entry)) == 2
    end

    test "the backfill path skips private replies too", %{author: author, actor: actor, entry: entry} do
      FederationController.process_incoming_reply_for_backfill(reply(actor, entry, author, [actor_url(author)], []), actor.ap_id)
      assert comments_on(entry) == []
    end
  end

  describe "fediverse blocks" do
    test "a blocked account's replies don't become comments", %{author: author, actor: actor, entry: entry} do
      {:ok, _} = FediverseBlocks.block_remote_actor(author.id, actor.id)

      FederationController.process_activity_async(create(actor, reply(actor, entry, author, [@public], [])), author)

      assert comments_on(entry) == []
      assert notifications_for(author, :comment) == []
    end

    test "nor do replies from a blocked domain", %{author: author, actor: actor, entry: entry} do
      {:ok, _} = FediverseBlocks.block_domain(author.id, actor.domain)

      FederationController.process_activity_async(create(actor, reply(actor, entry, author, [@public], [])), nil)

      assert comments_on(entry) == []
    end

    test "a blocked account can't reach you with a private mention", %{author: author, actor: actor} do
      {:ok, _} = FediverseBlocks.block_remote_actor(author.id, actor.id)

      dm =
        note(actor, %{
          "to" => [actor_url(author)],
          "tag" => [%{"type" => "Mention", "href" => actor_url(author)}]
        })

      FederationController.process_activity_async(create(actor, dm), author)
      FederationController.process_activity_async(create(actor, dm), nil)

      assert notifications_for(author, :fediverse_mention) == []
    end

    test "an unblocked account still can", %{author: author, actor: actor} do
      dm =
        note(actor, %{
          "to" => [actor_url(author)],
          "tag" => [%{"type" => "Mention", "href" => actor_url(author)}]
        })

      FederationController.process_activity_async(create(actor, dm), author)

      assert [_] = notifications_for(author, :fediverse_mention)
    end

    test "a blocked account can't follow you", %{author: author, actor: actor} do
      {:ok, _} = FediverseBlocks.block_remote_actor(author.id, actor.id)

      follow = %{
        "type" => "Follow",
        "id" => "#{actor.ap_id}#follow-#{System.unique_integer([:positive])}",
        "actor" => actor.ap_id,
        "object" => actor_url(author)
      }

      FederationController.process_activity_async(follow, author)

      refute Repo.exists?(
               from r in Inkwell.Social.Relationship,
                 where: r.remote_actor_id == ^actor.id and r.following_id == ^author.id
             )
    end
  end
end
