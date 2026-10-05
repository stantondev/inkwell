defmodule Inkwell.Federation.CommentFederation do
  @moduledoc """
  Footnotes written on Inkwell, as the fediverse sees them.

  Posting one sends a Create{Note}, editing it an Update{Note}. When one stops
  being visible, a Delete goes to the same servers: when it's deleted, when
  the entry under it is deleted, made non-public or hidden by moderation, and
  when its writer is suspended for spam.

  Until 2026-10-05 only the Create was ever sent, so a footnote deleted or
  edited on Inkwell stayed as it was on Mastodon (roadmap: "ActivityPub Delete
  not propagating for deleted footnotes", @michael).

  Deletes are queued as `CommentFederationWorker` jobs carrying ids only, so
  they still work after the footnote (or its entry) is gone from the database.
  """

  import Ecto.Query
  require Logger

  alias Inkwell.Repo
  alias Inkwell.Journals.Comment
  alias Inkwell.Federation.{ActivityBuilder, Background, RemoteActor}
  alias Inkwell.Federation.Workers.{CommentFederationWorker, DeliverActivityWorker, FanOutWorker}

  @public "https://www.w3.org/ns/activitystreams#Public"
  @preloads [:user, :parent_comment, entry: :user, remote_entry: :remote_actor]

  # ── Posting and editing ──────────────────────────────────────────────────

  @doc """
  Sends a footnote just posted (`:create`) or just edited (`:update`). Does
  nothing for footnotes the fediverse can't see.

  `replied_to:` is the comment it answers, when that differs from its stored
  parent (replies past the depth limit are re-parented).
  """
  def deliver(%Comment{} = comment, kind, opts \\ []) when kind in [:create, :update] do
    comment = Repo.preload(comment, @preloads, force: true)

    if federated?(comment) do
      replied_to = Keyword.get(opts, :replied_to, comment.parent_comment)

      Background.run(fn ->
        try do
          activity = activity(comment, kind, replied_to)
          inboxes = inboxes(audience(comment, replied_to), kind)
          enqueue_deliveries(activity, inboxes, comment.user_id)

          Logger.info("Federating #{kind} of comment #{comment.id} by user #{comment.user_id} to #{length(inboxes)} inboxes")
        rescue
          e -> Logger.warning("Failed to federate #{kind} of comment #{comment.id}: #{inspect(e)}")
        end
      end)
    end

    :ok
  end

  # ── Taking footnotes back ────────────────────────────────────────────────

  @doc """
  Queues the fediverse Delete for a footnote that's about to be deleted. Call
  it before the row goes.
  """
  def retract(%Comment{} = comment) do
    comment = Repo.preload(comment, @preloads, force: true)
    if federated?(comment), do: enqueue_retraction(comment)
    :ok
  end

  @doc """
  Queues Deletes for every Inkwell footnote on an entry that is being deleted,
  made non-public or hidden. Call it while the footnotes still exist (before
  deleting the entry). Pass only entries the fediverse could see until now;
  the entry's current state isn't checked, because by the time a privacy change
  calls this the entry is already private.
  """
  def retract_on_entry(entry_id) do
    from(c in Comment, where: c.entry_id == ^entry_id and not is_nil(c.user_id))
    |> Repo.all()
    |> Repo.preload(@preloads)
    |> Enum.each(&enqueue_retraction/1)
  end

  @doc """
  Queues Deletes for everything a member wrote as footnotes the fediverse saw
  (moderation suspended them as spam).
  """
  def retract_by_author(user_id) do
    from(c in Comment, where: c.user_id == ^user_id)
    |> Repo.all()
    |> Repo.preload(@preloads)
    |> Enum.filter(&federated?/1)
    |> Enum.each(&enqueue_retraction/1)
  end

  @doc false
  # Run by CommentFederationWorker.
  def deliver_retraction(%{"note_id" => note_id, "author_id" => author_id} = args) do
    case Repo.get(Inkwell.Accounts.User, author_id) do
      # The account was deleted; its Delete{Person} took everything with it.
      nil ->
        :ok

      user ->
        audience = %{
          author_id: author_id,
          entry_author_id: args["entry_author_id"],
          remote_ap_ids: args["remote_ap_ids"] || []
        }

        inboxes = inboxes(audience, :delete)
        enqueue_deliveries(ActivityBuilder.build_delete(note_id, user), inboxes, user.id)
        Logger.info("Federating delete of #{note_id} to #{length(inboxes)} inboxes")
        :ok
    end
  end

  defp enqueue_retraction(%Comment{} = comment) do
    audience = audience(comment, comment.parent_comment)

    %{
      action: "delete",
      note_id: ActivityBuilder.comment_ap_url(comment),
      author_id: comment.user_id,
      entry_author_id: audience.entry_author_id,
      remote_ap_ids: audience.remote_ap_ids
    }
    |> CommentFederationWorker.new()
    |> Oban.insert()
  end

  # ── Who saw it ───────────────────────────────────────────────────────────

  @doc """
  Whether the fediverse was sent this footnote: written on Inkwell, on a public
  entry or on a fediverse post. Expects the comment's entry/remote entry loaded.
  """
  def federated?(%Comment{user_id: nil}), do: false
  def federated?(%Comment{entry: %{privacy: :public, status: :published}}), do: true
  def federated?(%Comment{remote_entry: %{remote_actor: %{}}}), do: true
  def federated?(_), do: false

  # Who the footnote reached: the entry author's followers for an entry here,
  # the post author's server for a fediverse post, and the server of a
  # fediverse commenter being answered.
  defp audience(comment, replied_to) do
    parent_author = ActivityBuilder.remote_comment_author(replied_to)

    case comment do
      %{entry: %{user_id: entry_author_id}} when not is_nil(entry_author_id) ->
        %{author_id: comment.user_id, entry_author_id: entry_author_id, remote_ap_ids: List.wrap(parent_author)}

      %{remote_entry: %{remote_actor: %{ap_id: post_author}}} ->
        %{author_id: comment.user_id, entry_author_id: nil, remote_ap_ids: Enum.uniq([post_author | List.wrap(parent_author)])}
    end
  end

  # An edit or delete also goes to the writer's own followers' servers: they
  # may have the footnote from a boost or from opening the thread.
  defp inboxes(audience, kind) do
    entry_followers =
      if audience.entry_author_id, do: FanOutWorker.collect_remote_inboxes(audience.entry_author_id), else: []

    own_followers = if kind == :create, do: [], else: FanOutWorker.collect_remote_inboxes(audience.author_id)

    (entry_followers ++ Enum.map(audience.remote_ap_ids, &inbox_of/1) ++ own_followers)
    |> Enum.reject(&is_nil/1)
    |> Enum.uniq()
  end

  defp inbox_of(ap_id) do
    case RemoteActor.get_by_ap_id(ap_id) do
      %{shared_inbox: shared, inbox: inbox} when is_binary(shared) or is_binary(inbox) -> shared || inbox
      _ -> RemoteActor.inbox_for(ap_id)
    end
  end

  defp enqueue_deliveries(activity, inboxes, user_id) do
    Enum.each(inboxes, fn inbox_url ->
      %{activity: activity, inbox_url: inbox_url, user_id: user_id}
      |> DeliverActivityWorker.new()
      |> Oban.insert()
    end)
  end

  # ── The activities ───────────────────────────────────────────────────────

  @doc false
  def activity(comment, :create, replied_to), do: create_activity(comment, replied_to)

  def activity(comment, :update, replied_to) do
    created = create_activity(comment, replied_to)
    note_id = created["object"]["id"]
    now = DateTime.utc_now()

    created
    |> Map.merge(%{
      "type" => "Update",
      "id" => "#{note_id}#update-#{System.system_time(:nanosecond)}",
      "published" => DateTime.to_iso8601(now)
    })
    |> Map.update!("object", fn note ->
      Map.merge(note, %{
        "published" => DateTime.to_iso8601(comment.inserted_at),
        "updated" => DateTime.to_iso8601(comment.edited_at || now)
      })
    end)
  end

  # A footnote on an entry here is public, addressed to the entry's author and
  # copied to both writers' followers so the thread shows on Mastodon.
  defp create_activity(%Comment{entry: %{user: entry_author} = entry} = comment, replied_to)
       when not is_nil(entry_author) do
    author_ap_id = ActivityBuilder.actor_url(entry_author)
    commenter_followers = "#{ActivityBuilder.actor_url(comment.user)}/followers"
    to = [@public, author_ap_id]
    cc = [commenter_followers, "#{author_ap_id}/followers"]

    comment.body_html
    |> ActivityBuilder.build_reply_note(ActivityBuilder.entry_ap_url(entry), comment.user, comment.id, author_ap_id)
    |> Map.merge(%{"to" => to, "cc" => cc})
    # Keep the Mention tag from build_reply_note: Mastodon needs it to thread.
    |> Map.update!("object", &Map.merge(&1, %{"to" => to, "cc" => cc}))
    |> ActivityBuilder.thread_reply(replied_to)
  end

  # A footnote on a fediverse post is a reply to that post's author.
  defp create_activity(%Comment{remote_entry: %{remote_actor: actor} = remote_entry} = comment, replied_to) do
    comment.body_html
    |> ActivityBuilder.build_reply_note(remote_entry.ap_id, comment.user, comment.id, actor.ap_id)
    |> ActivityBuilder.thread_reply(replied_to)
  end
end
