defmodule Inkwell.Workers.ExportDataWorker do
  @moduledoc """
  Background worker that gathers all user data, compresses it as gzipped JSON,
  and stores it in the data_exports table. Sends an email when complete.
  """

  use Oban.Worker, queue: :default, max_attempts: 2

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Export
  alias Inkwell.Export.DataExport
  alias Inkwell.Accounts.{User, Notification}
  alias Inkwell.Journals.{Entry, EntryImage, Comment}
  alias Inkwell.Stamps.Stamp
  alias Inkwell.Social.{Relationship, TopFriend, FriendFilter}
  alias Inkwell.Guestbook.GuestbookEntry
  alias Inkwell.Feedback.{FeedbackPost, FeedbackVote, FeedbackComment}

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"export_id" => export_id, "user_id" => user_id}}) do
    export = Repo.get!(DataExport, export_id)

    if export.status != "pending" do
      :ok
    else
      {:ok, export} = Export.mark_processing(export)

      try do
        user = Repo.get!(User, user_id)
        data = build_export_data(user)

        json_string = Jason.encode!(data, pretty: true)
        compressed = :zlib.gzip(json_string)
        file_size = byte_size(compressed)

        {:ok, _} = Export.mark_completed(export, compressed, file_size)

        # Send notification email
        frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")
        Inkwell.Email.send_export_ready(user.email, "#{frontend_url}/settings")

        :ok
      rescue
        e ->
          Export.mark_failed(export, Exception.message(e))
          {:error, Exception.message(e)}
      end
    end
  end

  defp build_export_data(user) do
    %{
      export_version: "1.0",
      exported_at: DateTime.utc_now() |> DateTime.to_iso8601(),
      platform: "Inkwell (inkwell.social)",
      profile: build_profile(user),
      entries: build_entries(user.id),
      drafts: build_drafts(user.id),
      entry_images: build_entry_images(user.id),
      comments: build_comments(user.id),
      stamps: build_stamps(user.id),
      relationships: build_relationships(user.id),
      top_friends: build_top_friends(user.id),
      friend_filters: build_friend_filters(user.id),
      guestbook_received: build_guestbook_received(user.id),
      guestbook_written: build_guestbook_written(user.id),
      feedback_posts: build_feedback_posts(user.id),
      feedback_votes: build_feedback_votes(user.id),
      feedback_comments: build_feedback_comments(user.id),
      notifications: build_notifications(user.id)
    }
  end

  defp build_profile(user) do
    %{
      username: user.username,
      email: user.email,
      display_name: user.display_name,
      bio: user.bio,
      pronouns: user.pronouns,
      avatar_url: user.avatar_url,
      profile_theme: user.profile_theme,
      profile_font: user.profile_font,
      profile_layout: user.profile_layout,
      profile_widgets: user.profile_widgets,
      profile_status: user.profile_status,
      profile_music: user.profile_music,
      profile_background_url: user.profile_background_url,
      profile_background_color: user.profile_background_color,
      profile_accent_color: user.profile_accent_color,
      profile_foreground_color: user.profile_foreground_color,
      profile_html: user.profile_html,
      profile_css: user.profile_css,
      subscription_tier: user.subscription_tier,
      subscription_status: user.subscription_status,
      created_at: user.inserted_at,
      terms_accepted_at: user.terms_accepted_at
    }
  end

  defp build_entries(user_id) do
    Entry
    |> where(user_id: ^user_id, status: :published)
    |> order_by(desc: :published_at)
    |> Repo.all()
    |> Enum.map(fn e ->
      %{
        title: e.title,
        body_html: e.body_html,
        body_raw: e.body_raw,
        mood: e.mood,
        music: e.music,
        music_metadata: e.music_metadata,
        tags: e.tags,
        privacy: e.privacy,
        slug: e.slug,
        published_at: e.published_at,
        created_at: e.inserted_at,
        updated_at: e.updated_at
      }
    end)
  end

  defp build_drafts(user_id) do
    Entry
    |> where(user_id: ^user_id, status: :draft)
    |> order_by(desc: :inserted_at)
    |> Repo.all()
    |> Enum.map(fn e ->
      %{
        title: e.title,
        body_html: e.body_html,
        body_raw: e.body_raw,
        mood: e.mood,
        music: e.music,
        tags: e.tags,
        privacy: e.privacy,
        created_at: e.inserted_at,
        updated_at: e.updated_at
      }
    end)
  end

  defp build_entry_images(user_id) do
    EntryImage
    |> where(user_id: ^user_id)
    |> order_by(desc: :inserted_at)
    |> Repo.all()
    |> Enum.map(fn img ->
      %{
        id: img.id,
        filename: img.filename,
        content_type: img.content_type,
        byte_size: img.byte_size,
        data: img.data,
        created_at: img.inserted_at
      }
    end)
  end

  defp build_comments(user_id) do
    Comment
    |> where(user_id: ^user_id)
    |> preload(entry: :user)
    |> order_by(desc: :inserted_at)
    |> Repo.all()
    |> Enum.map(fn c ->
      %{
        body_html: c.body_html,
        entry_title: if(c.entry, do: c.entry.title, else: nil),
        entry_author: if(c.entry && c.entry.user, do: c.entry.user.username, else: nil),
        created_at: c.inserted_at
      }
    end)
  end

  defp build_stamps(user_id) do
    Stamp
    |> where(user_id: ^user_id)
    |> preload(entry: :user)
    |> order_by(desc: :inserted_at)
    |> Repo.all()
    |> Enum.map(fn s ->
      %{
        stamp_type: s.stamp_type,
        entry_title: if(s.entry, do: s.entry.title, else: nil),
        entry_author: if(s.entry && s.entry.user, do: s.entry.user.username, else: nil),
        created_at: s.inserted_at
      }
    end)
  end

  defp build_relationships(user_id) do
    following =
      Relationship
      |> where(follower_id: ^user_id)
      |> where([r], r.status in [:accepted, :pending])
      |> preload(:following)
      |> Repo.all()
      |> Enum.map(fn r ->
        %{
          username: if(r.following, do: r.following.username, else: nil),
          status: r.status,
          is_mutual: r.is_mutual,
          since: r.inserted_at
        }
      end)

    followers =
      Relationship
      |> where(following_id: ^user_id)
      |> where([r], r.status in [:accepted, :pending])
      |> preload(:follower)
      |> Repo.all()
      |> Enum.map(fn r ->
        %{
          username: if(r.follower, do: r.follower.username, else: nil),
          status: r.status,
          is_mutual: r.is_mutual,
          since: r.inserted_at
        }
      end)

    blocked =
      Relationship
      |> where(follower_id: ^user_id, status: :blocked)
      |> preload(:following)
      |> Repo.all()
      |> Enum.map(fn r ->
        %{
          username: if(r.following, do: r.following.username, else: nil),
          since: r.inserted_at
        }
      end)

    %{following: following, followers: followers, blocked: blocked}
  end

  defp build_top_friends(user_id) do
    TopFriend
    |> where(user_id: ^user_id)
    |> preload(:friend)
    |> order_by(:position)
    |> Repo.all()
    |> Enum.map(fn tf ->
      %{
        position: tf.position,
        username: if(tf.friend, do: tf.friend.username, else: nil)
      }
    end)
  end

  defp build_friend_filters(user_id) do
    FriendFilter
    |> where(user_id: ^user_id)
    |> order_by(:inserted_at)
    |> Repo.all()
    |> Enum.map(fn f ->
      %{
        name: f.name,
        member_count: length(f.member_ids || []),
        created_at: f.inserted_at
      }
    end)
  end

  defp build_guestbook_received(user_id) do
    GuestbookEntry
    |> where(profile_user_id: ^user_id)
    |> preload(:author)
    |> order_by(desc: :inserted_at)
    |> Repo.all()
    |> Enum.map(fn g ->
      %{
        body: g.body,
        author_username: if(g.author, do: g.author.username, else: "(deleted user)"),
        created_at: g.inserted_at
      }
    end)
  end

  defp build_guestbook_written(user_id) do
    GuestbookEntry
    |> where(author_id: ^user_id)
    |> preload(:profile_user)
    |> order_by(desc: :inserted_at)
    |> Repo.all()
    |> Enum.map(fn g ->
      %{
        body: g.body,
        profile_username: if(g.profile_user, do: g.profile_user.username, else: "(deleted user)"),
        created_at: g.inserted_at
      }
    end)
  end

  defp build_feedback_posts(user_id) do
    FeedbackPost
    |> where(user_id: ^user_id)
    |> order_by(desc: :inserted_at)
    |> Repo.all()
    |> Enum.map(fn fp ->
      %{
        title: fp.title,
        body: fp.body,
        category: fp.category,
        status: fp.status,
        vote_count: fp.vote_count,
        created_at: fp.inserted_at
      }
    end)
  end

  defp build_feedback_votes(user_id) do
    FeedbackVote
    |> where(user_id: ^user_id)
    |> preload(:feedback_post)
    |> order_by(desc: :inserted_at)
    |> Repo.all()
    |> Enum.map(fn fv ->
      %{
        post_title: if(fv.feedback_post, do: fv.feedback_post.title, else: nil),
        voted_at: fv.inserted_at
      }
    end)
  end

  defp build_feedback_comments(user_id) do
    FeedbackComment
    |> where(user_id: ^user_id)
    |> preload(:feedback_post)
    |> order_by(desc: :inserted_at)
    |> Repo.all()
    |> Enum.map(fn fc ->
      %{
        body: fc.body,
        post_title: if(fc.feedback_post, do: fc.feedback_post.title, else: nil),
        created_at: fc.inserted_at
      }
    end)
  end

  defp build_notifications(user_id) do
    Notification
    |> where(user_id: ^user_id)
    |> order_by(desc: :inserted_at)
    |> Repo.all()
    |> Enum.map(fn n ->
      %{
        type: n.type,
        data: n.data,
        read: n.read,
        created_at: n.inserted_at
      }
    end)
  end
end
