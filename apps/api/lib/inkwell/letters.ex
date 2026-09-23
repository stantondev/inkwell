defmodule Inkwell.Letters do
  @moduledoc """
  Context for the Letters (private messaging) feature.

  Who can write to whom (`can_write?/3`): two people can exchange letters
  while either follows the other with an accepted follow, i.e. they are pen
  pals, and neither has blocked the other. Starting a conversation needs the
  starter to follow the other person. Letters from an admin can always be
  answered, so account notices never become dead ends.

  Before Sept 2026 the pen-pal check ran only when a conversation was first
  opened, so someone who had been dropped as a pen pal could keep writing
  into the old conversation for as long as it existed.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Accounts
  alias Inkwell.Social.Relationship
  alias Inkwell.Letters.{Conversation, DirectMessage, ConversationRead}

  @per_page 50

  # ---------------------------------------------------------------------------
  # Conversations
  # ---------------------------------------------------------------------------

  @doc """
  List conversations for `user_id`, most recent letter first, as
  `{conversation, other_user, last_visible_letter, unread_count}`.

  Three queries in all however many conversations there are (this used to
  run three per conversation).

  A conversation with nothing visible in it is left out: "Write a Letter"
  creates the conversation before anything is written, and one abandoned
  click used to leave an empty envelope in the Letterbox for good.
  """
  def list_conversations(user_id) do
    conversations =
      Conversation
      |> where([c], c.participant_a == ^user_id or c.participant_b == ^user_id)
      |> order_by([c], desc_nulls_last: c.last_message_at)
      |> preload([:participant_a_user, :participant_b_user])
      |> Repo.all()

    last_messages = last_visible_messages(Enum.map(conversations, & &1.id), user_id)
    unread_counts = unread_counts_by_conversation(user_id)

    Enum.flat_map(conversations, fn conv ->
      case Map.get(last_messages, conv.id) do
        nil -> []
        last -> [{conv, other_user(conv, user_id), last, Map.get(unread_counts, conv.id, 0)}]
      end
    end)
  end

  @doc """
  Find an existing conversation with `target_username`, or create one.
  Returns `{:ok, conversation}`, `{:error, :not_found}`, `{:error, :not_pen_pals}`,
  `{:error, :cannot_message_self}` or `{:error, :blocked}`.
  """
  def get_or_create_conversation(user_id, target_username) do
    case Accounts.get_user_by_username(target_username) do
      nil ->
        {:error, :not_found}

      %{id: ^user_id} ->
        {:error, :cannot_message_self}

      # Suspended accounts don't exist as far as other members can tell.
      %{blocked_at: blocked_at} when not is_nil(blocked_at) ->
        {:error, :not_found}

      target ->
        cond do
          blocked?(user_id, target.id) -> {:error, :blocked}
          not follows?(user_id, target.id) -> {:error, :not_pen_pals}
          true -> find_or_create(user_id, target.id)
        end
    end
  end

  @doc """
  Load a conversation `viewer_id` is part of, with up to 50 letters, oldest
  first for display.

  With `before: letter_id`, returns the 50 letters written before that one: a
  cursor, so a letter arriving while someone reads back can't shift the pages
  and show a letter twice (page offsets did).

  Returns `{:ok, conv, letters, has_more}` or `{:error, :not_found}` (also for
  a malformed id or cursor). Opening the newest page marks the conversation
  read; reading back through older letters doesn't.
  """
  def get_conversation(id, viewer_id, opts \\ []) do
    with {:ok, id} <- Ecto.UUID.cast(id),
         %Conversation{} = conv <- get_participant_conversation(id, viewer_id),
         {:ok, before_at} <- cursor_time(Keyword.get(opts, :before), id) do
      query =
        DirectMessage
        |> where([m], m.conversation_id == ^id)
        |> visible_to(conv, viewer_id)

      query = if before_at, do: where(query, [m], m.inserted_at < ^before_at), else: query

      rows =
        query
        |> order_by([m], desc: m.inserted_at)
        |> limit(^(@per_page + 1))
        |> preload(:sender)
        |> Repo.all()

      unless before_at, do: mark_read(id, viewer_id)

      {:ok, conv, rows |> Enum.take(@per_page) |> Enum.reverse(), length(rows) > @per_page}
    else
      _ -> {:error, :not_found}
    end
  end

  @doc """
  Letters written after `since_id` in the conversation, oldest first. Used by
  the open thread to pick up new letters. Doesn't mark anything read.
  """
  def list_messages_since(conversation_id, viewer_id, since_id) do
    with {:ok, conversation_id} <- Ecto.UUID.cast(conversation_id),
         %Conversation{} = conv <- get_participant_conversation(conversation_id, viewer_id),
         {:ok, since_at} when not is_nil(since_at) <- cursor_time(since_id, conversation_id) do
      messages =
        DirectMessage
        |> where([m], m.conversation_id == ^conversation_id and m.inserted_at > ^since_at)
        |> visible_to(conv, viewer_id)
        |> order_by([m], asc: m.inserted_at)
        |> preload(:sender)
        |> Repo.all()

      {:ok, messages}
    else
      _ -> {:error, :not_found}
    end
  end

  @doc "True when `user_id` is one of the two people in the conversation."
  def participant?(conversation_id, user_id) do
    case Ecto.UUID.cast(conversation_id) do
      {:ok, id} -> not is_nil(get_participant_conversation(id, user_id))
      :error -> false
    end
  end

  # ---------------------------------------------------------------------------
  # Letters (messages)
  # ---------------------------------------------------------------------------

  @doc """
  Send a letter in `conversation_id` from `sender_id`: plain-text `body` and
  optional rich `body_html` (sanitized by the schema).
  """
  def send_letter(conversation_id, sender_id, body, body_html \\ nil) do
    with {:ok, conversation_id} <- Ecto.UUID.cast(conversation_id),
         %Conversation{} = conv <- get_participant_conversation(conversation_id, sender_id) do
      recipient_id = other_participant_id(conv, sender_id)

      cond do
        blocked?(sender_id, recipient_id) ->
          {:error, :blocked}

        not can_write?(conv, sender_id, recipient_id) ->
          {:error, :not_pen_pals}

        true ->
          attrs = %{
            conversation_id: conv.id,
            sender_id: sender_id,
            body: String.trim(body),
            body_html: body_html
          }

          case %DirectMessage{} |> DirectMessage.changeset(attrs) |> Repo.insert() do
            {:ok, message} ->
              conv
              |> Ecto.Changeset.change(last_message_at: message.inserted_at)
              |> Repo.update()

              notify_recipient(conv, sender_id, recipient_id)

              {:ok, Repo.preload(message, :sender)}

            error ->
              error
          end
      end
    else
      _ -> {:error, :not_found}
    end
  end

  @doc """
  Edit a letter. Only its sender can, only while they can still write to the
  other person (so a blocked sender can't rewrite what's already delivered),
  and not after they've removed it from their side.
  """
  def update_letter(message_id, sender_id, attrs) do
    with {:ok, message_id} <- Ecto.UUID.cast(message_id),
         %DirectMessage{} = message <- Repo.get(DirectMessage, message_id),
         :ok <- own_letter(message, sender_id),
         %Conversation{} = conv <- Repo.get(Conversation, message.conversation_id),
         false <- removed_by?(message, conv, sender_id) do
      recipient_id = other_participant_id(conv, sender_id)

      if blocked?(sender_id, recipient_id) do
        {:error, :blocked}
      else
        message
        |> DirectMessage.edit_changeset(attrs)
        |> Repo.update()
        |> case do
          {:ok, msg} -> {:ok, Repo.preload(msg, :sender)}
          error -> error
        end
      end
    else
      {:error, :forbidden} -> {:error, :forbidden}
      _ -> {:error, :not_found}
    end
  end

  @doc """
  Remove a letter from its sender's own view. The recipient keeps their copy.
  """
  def delete_letter(message_id, deleter_id) do
    with {:ok, message_id} <- Ecto.UUID.cast(message_id),
         %DirectMessage{} = message <- Repo.get(DirectMessage, message_id),
         :ok <- own_letter(message, deleter_id),
         %Conversation{} = conv <- Repo.get(Conversation, message.conversation_id) do
      update_attrs =
        if conv.participant_a == deleter_id,
          do: %{deleted_by_a: true},
          else: %{deleted_by_b: true}

      message
      |> Ecto.Changeset.change(update_attrs)
      |> Repo.update()
    else
      {:error, :forbidden} -> {:error, :forbidden}
      _ -> {:error, :not_found}
    end
  end

  defp own_letter(%DirectMessage{sender_id: sender_id}, sender_id), do: :ok
  defp own_letter(_, _), do: {:error, :forbidden}

  defp removed_by?(message, %Conversation{participant_a: user_id}, user_id), do: message.deleted_by_a
  defp removed_by?(message, _conv, _user_id), do: message.deleted_by_b

  # ---------------------------------------------------------------------------
  # Read state
  # ---------------------------------------------------------------------------

  @doc """
  Mark all letters in `conversation_id` as read for `user_id`.
  """
  def mark_read(conversation_id, user_id) do
    now = DateTime.utc_now()

    Repo.insert!(
      %ConversationRead{
        conversation_id: conversation_id,
        user_id: user_id,
        last_read_at: now
      },
      on_conflict: [set: [last_read_at: now]],
      conflict_target: [:conversation_id, :user_id]
    )
  end

  # ---------------------------------------------------------------------------
  # Unread counts
  # ---------------------------------------------------------------------------

  @doc """
  Number of conversations with at least one unread letter for `user_id`.
  Part of every `GET /api/auth/me`, which every open tab polls every 15
  seconds, so it's a single query (it used to be three per conversation).
  """
  def count_unread_letters(user_id) do
    unread_letters_query(user_id)
    |> select([m], count(m.conversation_id, :distinct))
    |> Repo.one()
  end

  defp unread_counts_by_conversation(user_id) do
    unread_letters_query(user_id)
    |> group_by([m], m.conversation_id)
    |> select([m], {m.conversation_id, count(m.id)})
    |> Repo.all()
    |> Map.new()
  end

  # Letters to `user_id` that they can see and haven't read.
  defp unread_letters_query(user_id) do
    from m in DirectMessage,
      join: c in Conversation,
      on: c.id == m.conversation_id,
      left_join: r in ConversationRead,
      on: r.conversation_id == c.id and r.user_id == ^user_id,
      where: c.participant_a == ^user_id or c.participant_b == ^user_id,
      where: m.sender_id != ^user_id,
      where:
        (c.participant_a == ^user_id and m.deleted_by_a == false) or
          (c.participant_b == ^user_id and m.deleted_by_b == false),
      where: is_nil(r.last_read_at) or m.inserted_at > r.last_read_at
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  @doc false
  # Whether `sender_id` may write in `conv` right now (blocks are checked
  # separately). See the moduledoc.
  def can_write?(conv, sender_id, recipient_id) do
    follows?(sender_id, recipient_id) or follows?(recipient_id, sender_id) or
      admin_letter_to_answer?(conv, sender_id, recipient_id)
  end

  defp admin_letter_to_answer?(conv, sender_id, recipient_id) do
    Accounts.is_admin?(Repo.get(Accounts.User, sender_id)) or
      (Accounts.is_admin?(Repo.get(Accounts.User, recipient_id)) and
         Repo.exists?(
           from m in DirectMessage,
             where: m.conversation_id == ^conv.id and m.sender_id == ^recipient_id
         ))
  end

  defp follows?(user_id, other_id) do
    Relationship
    |> where([r],
      r.follower_id == ^user_id and
      r.following_id == ^other_id and
      r.status == :accepted
    )
    |> Repo.exists?()
  end

  defp blocked?(user_id, other_id) do
    Relationship
    |> where([r],
      (r.follower_id == ^user_id and r.following_id == ^other_id and r.status == :blocked) or
      (r.follower_id == ^other_id and r.following_id == ^user_id and r.status == :blocked)
    )
    |> Repo.exists?()
  end

  defp find_or_create(user_id, target_id) do
    {a, b} = canonical_order(user_id, target_id)

    case Repo.get_by(Conversation, participant_a: a, participant_b: b) do
      %Conversation{} = conv ->
        {:ok, Repo.preload(conv, [:participant_a_user, :participant_b_user])}

      nil ->
        %Conversation{}
        |> Conversation.changeset(%{participant_a: a, participant_b: b})
        |> Repo.insert()
        |> case do
          {:ok, conv} -> {:ok, Repo.preload(conv, [:participant_a_user, :participant_b_user])}
          error -> error
        end
    end
  end

  defp get_participant_conversation(id, user_id) do
    Conversation
    |> where([c], c.id == ^id and (c.participant_a == ^user_id or c.participant_b == ^user_id))
    |> preload([:participant_a_user, :participant_b_user])
    |> Repo.one()
  end

  # A letter id from this conversation, as a timestamp to page or poll from.
  defp cursor_time(nil, _conversation_id), do: {:ok, nil}

  defp cursor_time(letter_id, conversation_id) do
    with {:ok, letter_id} <- Ecto.UUID.cast(letter_id),
         %DateTime{} = at <-
           DirectMessage
           |> where([m], m.id == ^letter_id and m.conversation_id == ^conversation_id)
           |> select([m], m.inserted_at)
           |> Repo.one() do
      {:ok, at}
    else
      _ -> :error
    end
  end

  defp other_participant_id(conv, user_id) do
    if conv.participant_a == user_id, do: conv.participant_b, else: conv.participant_a
  end

  defp other_user(conv, user_id) do
    if conv.participant_a == user_id, do: conv.participant_b_user, else: conv.participant_a_user
  end

  # Canonical ordering: lower UUID string goes into participant_a
  defp canonical_order(a, b), do: if(a < b, do: {a, b}, else: {b, a})

  # Hide letters the viewer removed from their side.
  defp visible_to(query, %Conversation{participant_a: viewer_id}, viewer_id),
    do: where(query, [m], m.deleted_by_a == false)

  defp visible_to(query, _conv, _viewer_id),
    do: where(query, [m], m.deleted_by_b == false)

  # Newest letter each viewer can see, per conversation, in one query.
  defp last_visible_messages([], _user_id), do: %{}

  defp last_visible_messages(conversation_ids, user_id) do
    from(m in DirectMessage,
      join: c in Conversation,
      on: c.id == m.conversation_id,
      where: m.conversation_id in ^conversation_ids,
      where:
        (c.participant_a == ^user_id and m.deleted_by_a == false) or
          (c.participant_b == ^user_id and m.deleted_by_b == false),
      distinct: m.conversation_id,
      order_by: [asc: m.conversation_id, desc: m.inserted_at]
    )
    |> Repo.all()
    |> Map.new(&{&1.conversation_id, &1})
  end

  # No database notification: the Letterbox badge covers in-app state. A web
  # push goes out so people hear about letters when they're away. It names the
  # sender but never shows the letter itself, since it can land on a lock
  # screen. One tag per conversation, so a run of letters replaces a single
  # notification instead of stacking.
  defp notify_recipient(conv, sender_id, recipient_id) do
    if Inkwell.Push.configured?() do
      try do
        recipient = Repo.get(Accounts.User, recipient_id)
        push_disabled = match?(%{settings: %{"push_notifications_disabled" => true}}, recipient)

        unless push_disabled do
          sender = Repo.get(Accounts.User, sender_id)
          actor_name = (sender && (sender.display_name || sender.username)) || "Someone"

          Inkwell.Push.deliver(recipient_id, %{
            title: "New letter",
            body: "#{actor_name} sent you a letter",
            icon: "/favicon.svg",
            badge: "/favicon.svg",
            tag: "inkwell-letter-#{conv.id}",
            data: %{url: "/letters/#{conv.id}"}
          })
        end
      rescue
        e ->
          require Logger
          Logger.warning("[Push] Failed to send letter push: #{inspect(e)}")
      end
    end

    :ok
  end
end
