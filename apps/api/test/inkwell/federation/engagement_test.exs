defmodule Inkwell.Federation.EngagementTest do
  @moduledoc """
  Counts on fediverse posts: read from the home server, combined with what
  Inkwell members did, and never counting anything twice. Until 2026-09-25
  Mastodon posts showed 0 comments (Mastodon doesn't put a reply total in its
  ActivityPub object) and boosts/favourites only when a refresh happened to
  reach them.
  """
  use Inkwell.DataCase, async: false

  alias Inkwell.Federation.{Engagement, RemoteEntries, RemoteEntry}
  alias Inkwell.Inks.Ink
  alias Inkwell.Journals.Comment
  alias Inkwell.Reprints.Reprint
  alias Inkwell.Stamps.Stamp

  defp post(attrs \\ %{}) do
    actor = create_remote_actor()
    n = System.unique_integer([:positive])

    Repo.insert!(
      struct(
        RemoteEntry,
        Map.merge(
          %{
            ap_id: "https://mastodon.example/users/#{actor.username}/statuses/#{n}",
            url: "https://mastodon.example/@#{actor.username}/#{n}",
            body_html: "<p>a post</p>",
            remote_actor_id: actor.id,
            published_at: DateTime.utc_now()
          },
          attrs
        )
      )
    )
  end

  defp remote_comment(post, attrs \\ %{}) do
    Repo.insert!(
      struct(
        Comment,
        Map.merge(
          %{
            remote_entry_id: post.id,
            body_html: "<p>reply</p>",
            ap_id: "https://elsewhere.example/statuses/#{System.unique_integer([:positive])}",
            remote_author: %{"username" => "someone", "domain" => "elsewhere.example"}
          },
          attrs
        )
      )
    )
  end

  defp ago(seconds), do: DateTime.add(DateTime.utc_now(), -seconds, :second)

  describe "where counts come from" do
    test "Mastodon and Misskey post ids are recognised" do
      assert {:mastodon, "mastodon.social", "117327932994028225"} =
               Engagement.api_ref("https://mastodon.social/users/Gargron/statuses/117327932994028225")

      assert {:mastodon, "social.vivaldi.net", "117327957301665345"} =
               Engagement.api_ref("https://social.vivaldi.net/ap/users/115831478228446444/statuses/117327957301665345")

      assert {:misskey, "mitchelltribe.rodeo", "ard7mr7w48g3001x"} =
               Engagement.api_ref("https://mitchelltribe.rodeo/notes/ard7mr7w48g3001x")

      assert Engagement.api_ref("https://gts.example/users/a/statuses/01HXYZABC") == nil
      assert Engagement.api_ref("https://snac.example/erici/p/1790373552.326472") == nil
      assert Engagement.api_ref("http://mastodon.social/users/a/statuses/1") == nil
      assert Engagement.api_ref(nil) == nil
    end

    test "a Mastodon status gives all three counts" do
      assert %{replies: 10, boosts: 65, likes: 73} =
               Engagement.from_mastodon_status(%{"replies_count" => 10, "reblogs_count" => 65, "favourites_count" => 73})
    end

    test "a Misskey note: reactions are its favourites" do
      assert %{replies: 2, boosts: 3, likes: 7} =
               Engagement.from_misskey_note(%{"repliesCount" => 2, "renoteCount" => 3, "reactions" => %{"👍" => 4, ":heart:" => 3}})

      assert %{likes: 9} = Engagement.from_misskey_note(%{"reactionCount" => 9, "reactions" => %{"👍" => 1}})
    end

    test "an ActivityPub object: a missing total is unknown, not 0" do
      mastodon_note = %{
        "replies" => %{"type" => "Collection", "first" => %{"type" => "CollectionPage", "items" => []}},
        "likes" => %{"type" => "Collection", "totalItems" => 73},
        "shares" => %{"type" => "Collection", "totalItems" => 65}
      }

      assert %{replies: nil, boosts: 65, likes: 73} = Engagement.from_ap_object(mastodon_note)
      assert %{replies: nil, boosts: nil, likes: nil} = Engagement.from_ap_object(%{})

      assert Engagement.ingest_attrs(mastodon_note) == %{likes_count: 73, boosts_count: 65}
    end
  end

  describe "storing counts" do
    test "the home server's numbers are stored, and can go down; unknown ones are kept" do
      p = post(%{reply_count: 4, likes_count: 10, boosts_count: 3})

      Engagement.apply_counts(p, %{replies: nil, boosts: 2, likes: 9})

      assert %{reply_count: 4, boosts_count: 2, likes_count: 9} = Repo.get!(RemoteEntry, p.id)
    end

    test "a post seen again from another server never lowers its counts" do
      p = post(%{reply_count: 5, likes_count: 20, boosts_count: 8})

      {:ok, _} =
        RemoteEntries.upsert_remote_entry(%{
          ap_id: p.ap_id,
          body_html: "<p>edited</p>",
          remote_actor_id: p.remote_actor_id,
          reply_count: 0,
          likes_count: 25,
          boosts_count: 1
        })

      assert %{reply_count: 5, likes_count: 25, boosts_count: 8, body_html: "<p>edited</p>"} =
               Repo.get!(RemoteEntry, p.id)
    end
  end

  describe "freshness" do
    test "young posts are refreshed often, older ones less" do
      now = DateTime.utc_now()
      assert Engagement.ttl_seconds(ago(30 * 60), now) == 15 * 60
      assert Engagement.ttl_seconds(ago(6 * 3600), now) == 3600
      assert Engagement.ttl_seconds(ago(2 * 86_400), now) == 6 * 3600
      assert Engagement.ttl_seconds(ago(10 * 86_400), now) == 86_400
      assert Engagement.ttl_seconds(ago(60 * 86_400), now) == 7 * 86_400
    end

    test "stale?/1" do
      assert Engagement.stale?(post())
      refute Engagement.stale?(post(%{published_at: ago(3600), engagement_refreshed_at: ago(60)}))
      assert Engagement.stale?(post(%{published_at: ago(3600), engagement_refreshed_at: ago(20 * 60)}))
      refute Engagement.stale?(post(%{published_at: ago(5 * 86_400), engagement_refreshed_at: ago(3 * 3600)}))
    end
  end

  describe "summaries" do
    test "comments: everything stored here, plus direct replies not fetched yet" do
      p = post(%{reply_count: 3})
      direct = remote_comment(p)
      remote_comment(p, %{parent_comment_id: direct.id, depth: 1})

      # 2 stored (1 direct), home server says 3 direct → 2 not fetched yet
      assert Engagement.summary(p).comment_count == 4

      remote_comment(p)
      remote_comment(p)
      # all 3 direct replies fetched + 1 nested reply = what you see when you open them
      assert Engagement.summary(p).comment_count == 4
    end

    test "Mastodon post with replies but none fetched shows the home server's count" do
      assert Engagement.summary(post(%{reply_count: 7})).comment_count == 7
    end

    test "inks are Inkwell inks + fediverse favourites, reprints are Inkwell reprints + boosts" do
      p = post(%{likes_count: 10, boosts_count: 4, engagement_refreshed_at: ago(60)})
      alice = create_user()
      bob = create_user()

      Repo.insert!(%Ink{user_id: alice.id, remote_entry_id: p.id})

      counts = Engagement.summaries([p], alice.id)[p.id]
      assert counts.ink_count == 11
      assert counts.reprint_count == 4
      assert counts.my_ink
      refute counts.my_reprint
      refute Engagement.summaries([p], bob.id)[p.id].my_ink
    end

    test "a reprint or stamp the home server has already counted isn't counted twice" do
      p = post()
      alice = create_user()
      bob = create_user()

      # Before the refresh: announced reprint + stamp, not yet in the home server's numbers
      Repo.insert!(%Reprint{user_id: alice.id, remote_entry_id: p.id, ap_announce_id: "https://inkwell.test/users/a#announce-x"})
      Repo.insert!(%Stamp{user_id: bob.id, remote_entry_id: p.id, stamp_type: :felt})

      p = %{p | likes_count: 5, boosts_count: 2}
      counts = Engagement.summary(p)
      assert counts.reprint_count == 3
      assert counts.ink_count == 5

      # The refresh after them: the home server now includes both
      Repo.update_all(from(e in RemoteEntry, where: e.id == ^p.id),
        set: [engagement_refreshed_at: DateTime.utc_now(), likes_count: 6, boosts_count: 3]
      )

      counts = Engagement.summary(Repo.get!(RemoteEntry, p.id))
      assert counts.reprint_count == 3
      assert counts.boosts_count == 2
      assert counts.ink_count == 5
    end

    test "a quote reprint (no Announce sent) is never taken out of the boosts" do
      p = post(%{boosts_count: 2})
      alice = create_user()
      Repo.insert!(%Reprint{user_id: alice.id, remote_entry_id: p.id})

      Repo.update_all(from(e in RemoteEntry, where: e.id == ^p.id), set: [engagement_refreshed_at: DateTime.utc_now()])

      assert Engagement.summary(Repo.get!(RemoteEntry, p.id)).reprint_count == 3
    end

    test "no entries" do
      assert Engagement.summaries([], nil) == %{}
    end
  end

  describe "refresh/2" do
    test "claims the post, so a fresh post isn't fetched again" do
      p = post(%{published_at: ago(3600), engagement_refreshed_at: ago(60)})
      assert Engagement.refresh(p) == :skipped
    end
  end
end
