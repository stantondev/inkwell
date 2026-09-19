defmodule Inkwell.SocialPrivacyTest do
  @moduledoc """
  Privacy holes found in the 2026-09-19 audit:

  - accept_follow accepted any relationship row, including a block, so a
    blocked person could turn the block into a mutual pen-pal connection.
  - block/2 deleted the other person's existing block.
  - Bookmarks listed any bookmarked published entry with its full body,
    regardless of privacy or blocks.
  """
  use Inkwell.DataCase, async: false

  import Inkwell.Factory
  alias Inkwell.{Bookmarks, Journals, Social}

  defp publish(user, privacy, title \\ "An entry") do
    {:ok, d} =
      Journals.create_draft(%{
        "user_id" => user.id,
        "title" => "#{title} #{System.unique_integer([:positive])}",
        "body_html" => "<p>secret words</p>",
        "privacy" => privacy
      })

    {:ok, e} = Journals.publish_draft(d, %{"privacy" => privacy})
    e
  end

  defp saved_ids(user), do: Bookmarks.list_user_bookmarks(user.id) |> Enum.map(fn {e, _, _} -> e.id end)

  describe "accept_follow" do
    test "a blocked person can't accept their way past the block" do
      bob = create_user()
      alice = create_user()
      {:ok, _} = Social.block(bob.id, alice.id)

      # Alice "accepts" Bob's relationship row (the block).
      assert {:error, :not_found} = Social.accept_follow(bob.id, alice.id)

      assert Social.is_blocked_between?(bob.id, alice.id)
      refute Social.is_friend?(alice.id, bob.id)
    end

    test "a real pending request is still accepted" do
      requester = create_user()
      target = create_user()
      create_relationship(%{follower_id: requester.id, following_id: target.id, status: :pending})

      assert {:ok, _} = Social.accept_follow(requester.id, target.id)
      assert Social.is_friend?(requester.id, target.id)
      assert Social.is_friend?(target.id, requester.id)
    end
  end

  test "blocking someone who already blocked you keeps their block" do
    a = create_user()
    b = create_user()
    {:ok, _} = Social.block(b.id, a.id)
    {:ok, _} = Social.block(a.id, b.id)
    :ok = Social.unblock(a.id, b.id)

    assert Social.is_blocked_between?(a.id, b.id), "B's block of A must survive"
  end

  describe "bookmarks only list entries the reader can see" do
    setup do
      %{author: create_user(), reader: create_user()}
    end

    test "public entries are listed", %{author: author, reader: reader} do
      e = publish(author, "public")
      {:ok, _} = Bookmarks.bookmark_entry(reader.id, e.id)
      assert e.id in saved_ids(reader)
    end

    test "private and pen-pals-only entries of someone you don't follow are not", %{author: author, reader: reader} do
      private = publish(author, "private")
      friends = publish(author, "friends_only")
      {:ok, _} = Bookmarks.bookmark_entry(reader.id, private.id)
      {:ok, _} = Bookmarks.bookmark_entry(reader.id, friends.id)

      assert saved_ids(reader) == []
    end

    test "pen-pals-only entries are listed for accepted followers", %{author: author, reader: reader} do
      friends = publish(author, "friends_only")
      create_relationship(%{follower_id: reader.id, following_id: author.id, status: :accepted})
      {:ok, _} = Bookmarks.bookmark_entry(reader.id, friends.id)
      assert friends.id in saved_ids(reader)
    end

    test "an entry made private after bookmarking disappears", %{author: author, reader: reader} do
      e = publish(author, "public")
      {:ok, _} = Bookmarks.bookmark_entry(reader.id, e.id)
      {:ok, _} = e |> Ecto.Changeset.change(privacy: :private) |> Inkwell.Repo.update()
      assert saved_ids(reader) == []
    end

    test "entries from someone who blocked you disappear", %{author: author, reader: reader} do
      e = publish(author, "public")
      {:ok, _} = Bookmarks.bookmark_entry(reader.id, e.id)
      {:ok, _} = Social.block(author.id, reader.id)
      assert saved_ids(reader) == []
    end

    test "your own private entries stay listed", %{author: author} do
      e = publish(author, "private")
      {:ok, _} = Bookmarks.bookmark_entry(author.id, e.id)
      assert e.id in saved_ids(author)
    end
  end

  describe "Journals.viewable_by?/2 (used for comments)" do
    setup do
      %{author: create_user(), follower: create_user(), stranger: create_user()}
    end

    test "private entries: author only, even for accepted followers", %{author: a, follower: f} do
      create_relationship(%{follower_id: f.id, following_id: a.id, status: :accepted})
      e = publish(a, "private")
      assert Journals.viewable_by?(e, a)
      refute Journals.viewable_by?(e, f)
      refute Journals.viewable_by?(e, nil)
    end

    test "pen-pals-only: followers yes, strangers no", %{author: a, follower: f, stranger: x} do
      create_relationship(%{follower_id: f.id, following_id: a.id, status: :accepted})
      e = publish(a, "friends_only")
      assert Journals.viewable_by?(e, f)
      refute Journals.viewable_by?(e, x)
    end

    test "custom lists: members only", %{author: a, follower: f, stranger: x} do
      create_relationship(%{follower_id: f.id, following_id: a.id, status: :accepted})
      {:ok, filter} = Social.create_friend_filter(%{user_id: a.id, name: "Close", member_ids: [f.id]})

      {:ok, d} =
        Journals.create_draft(%{"user_id" => a.id, "title" => "c", "body_html" => "<p>x</p>", "privacy" => "custom", "custom_filter_id" => filter.id})

      {:ok, e} = Journals.publish_draft(d, %{"privacy" => "custom", "custom_filter_id" => filter.id})
      assert Journals.viewable_by?(e, f)
      refute Journals.viewable_by?(e, x)
    end

    test "drafts: author only", %{author: a, stranger: x} do
      {:ok, d} = Journals.create_draft(%{"user_id" => a.id, "title" => "d", "body_html" => "<p>x</p>", "privacy" => "public"})
      assert Journals.viewable_by?(d, a)
      refute Journals.viewable_by?(d, x)
    end

    test "public entries: not across a block", %{author: a, stranger: x} do
      e = publish(a, "public")
      assert Journals.viewable_by?(e, x)
      {:ok, _} = Social.block(a.id, x.id)
      refute Journals.viewable_by?(e, x)
    end
  end
end

