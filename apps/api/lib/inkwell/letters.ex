defmodule Inkwell.Letters do
  @moduledoc """
  Context for the Letters (private messaging) feature.
  Only accepted pen pals may exchange letters.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Accounts
  alias Inkwell.Social.Relationship
  alias Inkwell.Letters.{Conversation, DirectMessage, ConversationRead}

  # ---------------------------------------------------------------------------
  # Conversations
  # ---------------------------------------------------------------------------

  @doc """
  List all conversations for `user_id`, ordered by most recent letter.
  Returns each conversation with the other participant, the latest message
  preview, and an unread count.
  """
  def list_conversations(user_id) do
    conversations =
      Conversation
      |> where([c], c.participant_a == ^user_id or c.participant_b == ^user_id)
      |> order_by([c], desc_nulls_last: c.last_message_at)
      |> preload([:participant_a_user, :participant_b_user])
      |> Repo.all()

    Enum.map(conversations, fn conv ->
      other = other_user(conv, user_id)
      last_msg = get_last_visible_message(conv, user_id)
      unread = count_unread_in_conversation(conv.id, user_id)
      {conv, other, last_msg, unread}
    end)
  end

  @doc """
  Find an existing conversation with `target_username`, or create one.
  Returns `{:ok, conversation}`, `{:error, :not_found}`, `{:error, :not_pen_pals}`,
  or `{:error, :blocked}`.
  """
  def get_or_create_conversation(user_id, target_username) do
    case Accounts.get_user_by_username(target_username) do
      nil ->
        {:error, :not_found}

      target when target.id == user_id ->
        {:error, :cannot_message_self}

      target ->
        cond do
          blocked?(user_id, target.id) ->
            {:error, :blocked}

          not are_pen_pals?(user_id, target.id) ->
            {:error, :not_pen_pals}

          true ->
            find_or_create(user_id, target.id)
        end
    end
  end

  @doc """
  Get a conversation by ID, verifying `viewer_id` is a participant.
  Returns messages (last 50, oldest-first for display) and marks as read.
  """
  def get_conversation(id, viewer_id, opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = 50

    case get_participant_conversation(id, viewer_id) do
      nil ->
        {:error, :not_found}

      conv ->
        is_participant_a = conv.participant_a == viewer_id

        total =
          DirectMessage
          |> where([m], m.conversation_id == ^id)
          |> filter_deleted_for(is_participant_a)
          |> Repo.aggregate(:count)

        messages =
          DirectMessage
          |> where([m], m.conversation_id == ^id)
          |> filter_deleted_for(is_participant_a)
          |> order_by([m], desc: m.inserted_at)
          |> limit(^per_page)
          |> offset(^((page - 1) * per_page))
          |> preload(:sender)
          |> Repo.all()
          |> Enum.reverse()

        mark_read(id, viewer_id)

        {:ok, conv, messages, total, page}
    end
  end

  @doc """
  Return messages inserted after `since_id` (for 5-second polling).
  """
  def list_messages_since(conversation_id, viewer_id, since_id) do
    case get_participant_conversation(conversation_id, viewer_id) do
      nil ->
        {:error, :not_found}

      conv ->
        is_participant_a = conv.participant_a == viewer_id

        since_at =
          DirectMessage
          |> where([m], m.id == ^since_id)
          |> select([m], m.inserted_at)
          |> Repo.one()

        if is_nil(since_at) do
          {:ok, []}
        else
          messages =
            DirectMessage
            |> where([m], m.conversation_id == ^conversation_id)
            |> where([m], m.inserted_at > ^since_at)
            |> filter_deleted_for(is_participant_a)
            |> order_by([m], asc: m.inserted_at)
            |> preload(:sender)
            |> Repo.all()

          {:ok, messages}
        end
    end
  end

  # ---------------------------------------------------------------------------
  # Letters (messages)
  # ---------------------------------------------------------------------------

  @doc """
  Send a letter in `conversation_id` from `sender_id`.
  """
  def send_letter(conversation_id, sender_id, body) do
    case get_participant_conversation(conversation_id, sender_id) do
      nil ->
        {:error, :not_found}

      conv ->
        recipient_id = other_participant_id(conv, sender_id)

        if blocked?(sender_id, recipient_id) do
          {:error, :blocked}
        else
          attrs = %{
            conversation_id: conversation_id,
            sender_id: sender_id,
            body: String.trim(body)
          }

          case %DirectMessage{} |> DirectMessage.changeset(attrs) |> Repo.insert() do
            {:ok, message} ->
              conv
              |> Ecto.Changeset.change(last_message_at: message.inserted_at)
              |> Repo.update()

              maybe_notify_recipient(conv, message, sender_id, recipient_id)

              {:ok, Repo.preload(message, :sender)}

            error ->
              error
          end
        end
    end
  end

  @doc """
  Soft-delete a letter on the sender's side.
  """
  def delete_letter(message_id, deleter_id) do
    case Repo.get(DirectMessage, message_id) do
      nil ->
        {:error, :not_found}

      message ->
        if message.sender_id != deleter_id do
          {:error, :forbidden}
        else
          conv = Repo.get!(Conversation, message.conversation_id)

          update_attrs =
            if conv.participant_a == deleter_id,
              do: %{deleted_by_a: true},
              else: %{deleted_by_b: true}

          message
          |> Ecto.Changeset.change(update_attrs)
          |> Repo.update()
        end
    end
  end

  # ---------------------------------------------------------------------------
  # Read state
  # ---------------------------------------------------------------------------

  @doc """
  Mark all messages in `conversation_id` as read for `user_id`.
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
  Count conversations that have at least one unread letter for `user_id`.
  Used in GET /api/auth/me for the nav badge.
  """
  def count_unread_letters(user_id) do
    convs =
      Conversation
      |> where([c], c.participant_a == ^user_id or c.participant_b == ^user_id)
      |> Repo.all()

    Enum.count(convs, fn conv ->
      count_unread_in_conversation(conv.id, user_id) > 0
    end)
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  # Pen pal = the viewer follows the target with accepted status
  defp are_pen_pals?(user_id, other_id) do
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

  defp other_participant_id(conv, user_id) do
    if conv.participant_a == user_id, do: conv.participant_b, else: conv.participant_a
  end

  defp other_user(conv, user_id) do
    if conv.participant_a == user_id, do: conv.participant_b_user, else: conv.participant_a_user
  end

  # Canonical ordering: lower UUID string goes into participant_a
  defp canonical_order(a, b), do: if(a < b, do: {a, b}, else: {b, a})

  # Add a where clause to hide messages deleted by the viewer.
  # `is_participant_a` is a boolean determined before the query.
  defp filter_deleted_for(query, true = _is_participant_a) do
    where(query, [m], m.deleted_by_a == false)
  end

  defp filter_deleted_for(query, false = _is_participant_b) do
    where(query, [m], m.deleted_by_b == false)
  end

  defp get_last_visible_message(conv, viewer_id) do
    is_participant_a = conv.participant_a == viewer_id

    DirectMessage
    |> where([m], m.conversation_id == ^conv.id)
    |> filter_deleted_for(is_participant_a)
    |> order_by([m], desc: m.inserted_at)
    |> limit(1)
    |> Repo.one()
  end

  defp count_unread_in_conversation(conversation_id, user_id) do
    conv = Repo.get(Conversation, conversation_id)

    if is_nil(conv) do
      0
    else
      is_participant_a = conv.participant_a == user_id

      last_read =
        ConversationRead
        |> where([r], r.conversation_id == ^conversation_id and r.user_id == ^user_id)
        |> select([r], r.last_read_at)
        |> Repo.one()

      query =
        DirectMessage
        |> where([m], m.conversation_id == ^conversation_id)
        |> where([m], m.sender_id != ^user_id)
        |> filter_deleted_for(is_participant_a)

      query =
        if last_read,
          do: where(query, [m], m.inserted_at > ^last_read),
          else: query

      Repo.aggregate(query, :count)
    end
  end

  defp maybe_notify_recipient(_conv, _message, _sender_id, _recipient_id) do
    # Letter indicator badge in nav is sufficient — no separate notification needed
    :ok
  end
end
