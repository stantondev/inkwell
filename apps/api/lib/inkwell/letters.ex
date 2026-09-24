defmodule Inkwell.Letters do
  @moduledoc """
  Context for the Letters (private messaging) feature.

  ## Who can write to whom

  Pen pals (an accepted follow in either direction) can always write to each
  other. Starting a conversation needs the starter to follow the other
  person. Letters from an admin can always be answered, so account notices
  never become dead ends. Blocks stop everything, both ways.

  Anyone can also choose to take **letter requests** (`users.settings
  ["letters_from"] == "anyone"`; the default, "pen_pals", doesn't). Then a
  member who isn't a pen pal can send one letter, which starts a
  conversation with `request_status: "pending"`. It sits in the
  recipient's Requests tab, sends no push or email, and the sender can't
  add to it until the recipient accepts (or simply replies). Declining is
  silent: the sender keeps seeing "waiting". To send requests, an account
  must be 3 days old, not limited by moderation, and under 5 new requests
  a day.

  Before Sept 2026 the pen-pal check ran only when a conversation was first
  opened, so someone who had been dropped as a pen pal could keep writing
  into the old conversation for as long as it existed.

  ## Each person's own view

  `conversation_reads` holds one row per person per conversation: when they
  last read it, and their own archive / mute / "delete for me" state. None
  of it is visible to the other person.

    * archived: out of the Letterbox until a newer letter arrives
    * muted: no push, no email, not in the badge (still marked unread)
    * cleared ("delete for me"): letters up to then are hidden for them

  ## Letters with fediverse accounts

  A conversation can be with a fediverse account instead of a member: the
  member is `participant_a`, `participant_b` is nil and `remote_actor_id`
  names the account. Its letters from them have no `sender_id`, only
  `sender_remote_actor_id`, so every query about "letters from the other
  person" has to allow a NULL sender (`sender_id != me` is NULL, not true,
  for those). The member writes only to accounts they follow or that follow
  them (or that wrote to them and were accepted). Sending, receiving and
  routing live in `Inkwell.Letters.Federation`; this module keeps the
  conversation rules in one place.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Accounts
  alias Inkwell.Social.Relationship
  alias Inkwell.Letters.{Conversation, DirectMessage, ConversationRead}
  alias Inkwell.Federation.RemoteActorSchema

  @conv_preloads [:participant_a_user, :participant_b_user, :remote_actor]
  @message_preloads [:sender, :sender_remote_actor]

  @per_page 50
  @request_min_account_age_days 3
  @request_daily_limit 5
  @search_limit 30

  # ---------------------------------------------------------------------------
  # Conversations
  # ---------------------------------------------------------------------------

  @doc """
  Conversations for `user_id` in `folder` (`:inbox`, `:requests` or
  `:archived`), most recent letter first, as
  `{conversation, other_user, last_visible_letter, unread_count, view}` where
  `view` is `%{muted: bool, request: :incoming | :outgoing | nil}`.

  A fixed number of queries however many conversations there are.
  Conversations with nothing visible in them are left out: "Write a Letter"
  creates the conversation before anything is written, and "delete for me"
  clears it until a new letter arrives.
  """
  def list_conversations(user_id, folder \\ :inbox) do
    user_id
    |> all_conversation_rows()
    |> Enum.filter(fn row -> row.folder == folder end)
    |> Enum.map(fn row -> {row.conv, row.other, row.last, row.unread, row.view} end)
  end

  @doc """
  How many conversations wait in Requests and Archived, for the Letterbox
  tabs. `requests` counts every pending request, `requests_unread` the ones
  not yet opened.
  """
  def folder_counts(user_id) do
    rows = all_conversation_rows(user_id)

    %{
      requests: Enum.count(rows, &(&1.folder == :requests)),
      requests_unread: Enum.count(rows, &(&1.folder == :requests and &1.unread > 0)),
      archived: Enum.count(rows, &(&1.folder == :archived))
    }
  end

  defp all_conversation_rows(user_id) do
    conversations =
      Conversation
      |> where([c], c.participant_a == ^user_id or c.participant_b == ^user_id)
      |> order_by([c], desc_nulls_last: c.last_message_at)
      |> preload(^@conv_preloads)
      |> Repo.all()

    ids = Enum.map(conversations, & &1.id)
    last_messages = last_visible_messages(ids, user_id)
    unread_counts = unread_counts_by_conversation(user_id)
    views = reads_for(ids, user_id)

    Enum.flat_map(conversations, fn conv ->
      case Map.get(last_messages, conv.id) do
        nil ->
          []

        last ->
          read = Map.get(views, conv.id)

          [
            %{
              conv: conv,
              other: other_user(conv, user_id),
              last: last,
              unread: Map.get(unread_counts, conv.id, 0),
              view: view_of(conv, read, user_id),
              folder: folder_of(conv, read, user_id)
            }
          ]
      end
    end)
  end

  defp reads_for([], _user_id), do: %{}

  defp reads_for(ids, user_id) do
    ConversationRead
    |> where([r], r.user_id == ^user_id and r.conversation_id in ^ids)
    |> Repo.all()
    |> Map.new(&{&1.conversation_id, &1})
  end

  defp folder_of(conv, read, user_id) do
    cond do
      incoming_request?(conv, user_id) -> :requests
      archived?(conv, read) -> :archived
      true -> :inbox
    end
  end

  # Archived until a letter newer than the archiving arrives.
  defp archived?(_conv, nil), do: false
  defp archived?(_conv, %{archived_at: nil}), do: false

  defp archived?(conv, %{archived_at: archived_at}) do
    is_nil(conv.last_message_at) or DateTime.compare(conv.last_message_at, archived_at) != :gt
  end

  defp incoming_request?(%Conversation{request_status: "pending", requested_by_id: by}, user_id),
    do: by != user_id

  defp incoming_request?(_conv, _user_id), do: false

  defp view_of(conv, read, user_id) do
    %{
      muted: match?(%{muted_at: %DateTime{}}, read),
      archived: archived?(conv, read),
      request:
        cond do
          conv.request_status != "pending" and conv.request_status != "declined" -> nil
          conv.requested_by_id == user_id -> :outgoing
          conv.request_status == "pending" -> :incoming
          true -> nil
        end
    }
  end

  @doc """
  Whether `viewer` can start letters with `target`: `:letter` (pen pals, or
  an accepted request), `:request` (target takes letter requests and viewer
  may send one), or `nil`.
  """
  def letter_access(nil, _target), do: nil
  def letter_access(%{id: id}, %{id: id}), do: nil

  def letter_access(viewer, target) do
    cond do
      not is_nil(viewer.blocked_at) or not is_nil(target.blocked_at) -> nil
      blocked?(viewer.id, target.id) -> nil
      follows?(viewer.id, target.id) -> :letter
      accepted_request_between?(viewer.id, target.id) -> :letter
      takes_requests?(target) and request_eligible?(viewer) -> :request
      true -> nil
    end
  end

  @doc "True when `user` has chosen to take letter requests from anyone."
  def takes_requests?(user), do: (user.settings || %{})["letters_from"] == "anyone"

  defp request_eligible?(user) do
    user.moderation_state != "limited" and
      DateTime.diff(DateTime.utc_now(), user.inserted_at, :day) >= @request_min_account_age_days
  end

  defp accepted_request_between?(a, b) do
    {pa, pb} = canonical_order(a, b)

    Repo.exists?(
      from c in Conversation,
        where: c.participant_a == ^pa and c.participant_b == ^pb and c.request_status == "accepted"
    )
  end

  @doc """
  Find an existing conversation with `target_username`, or create one.
  Returns `{:ok, conversation}`, `{:error, :not_found}`, `{:error, :not_pen_pals}`,
  `{:error, :cannot_message_self}`, `{:error, :blocked}` or
  `{:error, :request_limit}`.
  """
  def get_or_create_conversation(user_id, target_username) do
    viewer = Repo.get(Accounts.User, user_id)

    case Accounts.get_user_by_username(target_username) do
      nil ->
        {:error, :not_found}

      %{id: ^user_id} ->
        {:error, :cannot_message_self}

      # Suspended accounts don't exist as far as other members can tell.
      %{blocked_at: blocked_at} when not is_nil(blocked_at) ->
        {:error, :not_found}

      target ->
        existing = conversation_between(user_id, target.id)

        cond do
          blocked?(user_id, target.id) ->
            {:error, :blocked}

          # Reopening a request you already sent (or one that was accepted,
          # declined, or became a pen-pal conversation) never makes another.
          existing && existing.request_status in ["pending", "accepted", "declined"] ->
            {:ok, existing}

          follows?(user_id, target.id) ->
            find_or_create(user_id, target.id)

          letter_access(viewer, target) == :request ->
            start_request(viewer, target, existing)

          true ->
            {:error, :not_pen_pals}
        end
    end
  end

  defp start_request(viewer, target, existing) do
    since = DateTime.add(DateTime.utc_now(), -1, :day)

    sent_today =
      Repo.aggregate(
        from(c in Conversation, where: c.requested_by_id == ^viewer.id and c.inserted_at >= ^since),
        :count
      )

    cond do
      # A conversation from before, now that they're no longer pen pals: it
      # becomes the request instead of a second conversation.
      existing ->
        existing
        |> Ecto.Changeset.change(
          request_status: "pending",
          requested_by_id: viewer.id,
          requested_at: DateTime.utc_now()
        )
        |> Repo.update()
        |> preload_participants()

      sent_today >= @request_daily_limit ->
        {:error, :request_limit}

      true ->
        {a, b} = canonical_order(viewer.id, target.id)

        %Conversation{}
        |> Conversation.changeset(%{participant_a: a, participant_b: b})
        |> Ecto.Changeset.put_change(:request_status, "pending")
        |> Ecto.Changeset.put_change(:requested_by_id, viewer.id)
        |> Ecto.Changeset.put_change(:requested_at, DateTime.utc_now())
        |> Repo.insert()
        |> preload_participants()
    end
  end

  defp preload_participants({:ok, conv}),
    do: {:ok, Repo.preload(conv, @conv_preloads, force: true)}

  defp preload_participants(error), do: error

  defp conversation_between(a, b) do
    {pa, pb} = canonical_order(a, b)

    Conversation
    |> where([c], c.participant_a == ^pa and c.participant_b == ^pb)
    |> preload(^@conv_preloads)
    |> Repo.one()
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
        |> preload(^@message_preloads)
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
        |> preload(^@message_preloads)
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

  @doc """
  How `user_id` sees the conversation, for the thread page: whether they can
  write, their own mute/archive state, and which side of a request they're
  on. `request_waiting` is true for someone who sent a request and can't
  write more until it's accepted.
  """
  def thread_view(%Conversation{remote_actor_id: actor_id} = conv, user_id) when not is_nil(actor_id) do
    read = Repo.get_by(ConversationRead, conversation_id: conv.id, user_id: user_id)

    Map.merge(view_of(conv, read, user_id), %{
      can_write: remote_can_write?(conv, user_id),
      request_waiting: false
    })
  end

  def thread_view(%Conversation{} = conv, user_id) do
    read = Repo.get_by(ConversationRead, conversation_id: conv.id, user_id: user_id)
    view = view_of(conv, read, user_id)
    other_id = other_participant_id(conv, user_id)

    waiting = request_sender_waiting?(conv, user_id)

    Map.merge(view, %{
      can_write: not waiting and not blocked?(user_id, other_id) and can_write?(conv, user_id, other_id),
      request_waiting: waiting
    })
  end

  # ---------------------------------------------------------------------------
  # Per-person controls
  # ---------------------------------------------------------------------------

  @doc """
  Apply one of `user_id`'s own controls to a conversation:
  `"archive"`, `"unarchive"`, `"mute"`, `"unmute"`, `"unread"` (marks the
  newest letter from the other person unread), `"delete"` (delete for me),
  `"accept"` / `"decline"` (a request sent to them).

  Returns `{:ok, conv}`, `{:error, :not_found}` or `{:error, :invalid}`.
  """
  def apply_action(conversation_id, user_id, action) do
    with {:ok, id} <- Ecto.UUID.cast(conversation_id),
         %Conversation{} = conv <- get_participant_conversation(id, user_id) do
      now = DateTime.utc_now()

      case action do
        "archive" -> put_view(conv, user_id, archived_at: now)
        "unarchive" -> put_view(conv, user_id, archived_at: nil)
        "mute" -> put_view(conv, user_id, muted_at: now)
        "unmute" -> put_view(conv, user_id, muted_at: nil)
        "unread" -> mark_unread(conv, user_id)
        "delete" -> delete_for(conv, user_id, now)
        "accept" -> answer_request(conv, user_id, "accepted")
        "decline" -> answer_request(conv, user_id, "declined")
        _ -> {:error, :invalid}
      end
    else
      _ -> {:error, :not_found}
    end
  end

  defp put_view(conv, user_id, fields) do
    upsert_view(conv.id, user_id, fields)
    {:ok, conv}
  end

  # Insert the person's row if they've never opened the conversation (the
  # epoch as last_read_at means "read nothing", the same as no row), or set
  # just these fields on the row they have.
  defp upsert_view(conversation_id, user_id, fields) do
    Repo.insert!(
      struct(
        ConversationRead,
        Keyword.merge(
          [conversation_id: conversation_id, user_id: user_id, last_read_at: DateTime.from_unix!(0, :microsecond)],
          fields
        )
      ),
      on_conflict: [set: fields],
      conflict_target: [:conversation_id, :user_id]
    )
  end

  defp mark_unread(conv, user_id) do
    newest_from_them =
      DirectMessage
      |> where([m], m.conversation_id == ^conv.id and (is_nil(m.sender_id) or m.sender_id != ^user_id))
      |> visible_to(conv, user_id)
      |> select([m], max(m.inserted_at))
      |> Repo.one()

    case newest_from_them do
      nil -> {:error, :invalid}
      at -> put_view(conv, user_id, last_read_at: DateTime.add(at, -1, :microsecond))
    end
  end

  defp delete_for(conv, user_id, now) do
    # Deleting a request you were sent is declining it.
    if incoming_request?(conv, user_id), do: set_request_status(conv, "declined")
    put_view(conv, user_id, cleared_at: now, last_read_at: now, archived_at: nil)
  end

  defp answer_request(%Conversation{request_status: status} = conv, user_id, answer)
       when status in ["pending", "declined"] do
    if conv.requested_by_id == user_id do
      {:error, :invalid}
    else
      {:ok, conv} = set_request_status(conv, answer)

      if answer == "declined",
        do: put_view(conv, user_id, cleared_at: DateTime.utc_now(), archived_at: nil),
        else: {:ok, conv}
    end
  end

  defp answer_request(_conv, _user_id, _answer), do: {:error, :invalid}

  defp set_request_status(conv, status) do
    conv
    |> Ecto.Changeset.change(request_status: status)
    |> Repo.update()
    |> preload_participants()
  end

  # ---------------------------------------------------------------------------
  # Search
  # ---------------------------------------------------------------------------

  @doc """
  Letters `user_id` can see whose text contains `query` (case-insensitive),
  newest first, at most #{@search_limit}. Letters they removed or deleted
  for themselves never match. Returns letters with sender and conversation
  (with its participants) loaded.
  """
  def search_letters(user_id, query) when is_binary(query) do
    term = String.trim(query)

    if String.length(term) < 2 do
      []
    else
      pattern = "%" <> escape_like(String.slice(term, 0, 100)) <> "%"

      from(m in DirectMessage,
        join: c in Conversation,
        on: c.id == m.conversation_id,
        left_join: r in ConversationRead,
        on: r.conversation_id == c.id and r.user_id == ^user_id,
        where: c.participant_a == ^user_id or c.participant_b == ^user_id,
        where:
          (c.participant_a == ^user_id and m.deleted_by_a == false) or
            (c.participant_b == ^user_id and m.deleted_by_b == false),
        where: is_nil(r.cleared_at) or m.inserted_at > r.cleared_at,
        where: ilike(m.body, ^pattern),
        order_by: [desc: m.inserted_at],
        limit: @search_limit,
        preload: [:sender, :sender_remote_actor, conversation: ^@conv_preloads]
      )
      |> Repo.all()
    end
  end

  def search_letters(_user_id, _query), do: []

  defp escape_like(term), do: String.replace(term, ~r/[\\%_]/, "\\\\\\0")

  # ---------------------------------------------------------------------------
  # Letters (messages)
  # ---------------------------------------------------------------------------

  @doc """
  Send a letter in `conversation_id` from `sender_id`: plain-text `body` and
  optional rich `body_html` (sanitized by the schema).

  In a request, the person who sent it can't add a second letter until it's
  accepted (`{:error, :request_pending}`); the person it was sent to
  accepts it by replying.
  """
  def send_letter(conversation_id, sender_id, body, body_html \\ nil) do
    with {:ok, conversation_id} <- Ecto.UUID.cast(conversation_id),
         %Conversation{} = conv <- get_participant_conversation(conversation_id, sender_id) do
      if conv.remote_actor_id,
        do: send_remote_letter(conv, sender_id, body, body_html),
        else: send_local_letter(conv, sender_id, body, body_html)
    else
      _ -> {:error, :not_found}
    end
  end

  defp send_local_letter(conv, sender_id, body, body_html) do
    recipient_id = other_participant_id(conv, sender_id)

    cond do
        blocked?(sender_id, recipient_id) ->
          {:error, :blocked}

        request_sender_waiting?(conv, sender_id) ->
          {:error, :request_pending}

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
              conv =
                if incoming_request?(conv, sender_id) or
                     (conv.request_status == "declined" and conv.requested_by_id != sender_id) do
                  {:ok, accepted} = set_request_status(conv, "accepted")
                  accepted
                else
                  conv
                end

              conv
              |> Ecto.Changeset.change(last_message_at: message.inserted_at)
              |> Repo.update()

              # A request lands quietly: no push, no email, just the Requests tab.
              unless conv.request_status == "pending" do
                notify_recipient(conv, sender_id, recipient_id)
                schedule_letter_email(conv.id, recipient_id)
              end

              {:ok, Repo.preload(message, @message_preloads)}

            error ->
              error
          end
      end
  end

  # A member writing to a fediverse account. It goes out as a private mention
  # (`Inkwell.Letters.Federation.deliver/3`); there are no push or email on
  # our side, since the other person isn't here.
  defp send_remote_letter(conv, sender_id, body, body_html) do
    cond do
      remote_blocked?(conv, sender_id) ->
        {:error, :blocked}

      not remote_can_write?(conv, sender_id) ->
        {:error, :not_pen_pals}

      true ->
        attrs = %{conversation_id: conv.id, sender_id: sender_id, body: String.trim(body), body_html: body_html}

        with {:ok, message} <- %DirectMessage{} |> DirectMessage.changeset(attrs) |> Repo.insert() do
          message =
            message
            |> Ecto.Changeset.change(ap_id: Inkwell.Letters.Federation.note_id(message))
            |> Repo.update!()

          # Writing back to a request accepts it, as between members.
          changes =
            if conv.request_status in ["pending", "declined"],
              do: [last_message_at: message.inserted_at, request_status: "accepted"],
              else: [last_message_at: message.inserted_at]

          {:ok, conv} = conv |> Ecto.Changeset.change(changes) |> Repo.update()

          message = Repo.preload(message, @message_preloads)
          Inkwell.Letters.Federation.deliver(message, conv, :create)
          {:ok, message}
        end
    end
  end

  # The requester has had their one letter; more wait for an answer. Only
  # letters since the request count: an old conversation between former pen
  # pals can become a request, and its history mustn't use up the letter.
  defp request_sender_waiting?(%Conversation{request_status: status, requested_by_id: by} = conv, sender_id)
       when status in ["pending", "declined"] and by == sender_id do
    since = conv.requested_at || DateTime.from_unix!(0, :microsecond)

    Repo.exists?(
      from m in DirectMessage,
        where: m.conversation_id == ^conv.id and m.sender_id == ^sender_id and m.inserted_at >= ^since
    )
  end

  defp request_sender_waiting?(_conv, _sender_id), do: false

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
      blocked =
        if conv.remote_actor_id,
          do: remote_blocked?(conv, sender_id),
          else: blocked?(sender_id, other_participant_id(conv, sender_id))

      if blocked do
        {:error, :blocked}
      else
        message
        |> DirectMessage.edit_changeset(attrs)
        |> Repo.update()
        |> case do
          {:ok, msg} ->
            msg = Repo.preload(msg, @message_preloads)

            if conv.remote_actor_id,
              do: Inkwell.Letters.Federation.deliver(msg, Repo.preload(conv, :remote_actor), :update)

            {:ok, msg}

          error ->
            error
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
  # Email about unread letters
  # ---------------------------------------------------------------------------

  @letter_email_delay_seconds 600

  # Ten minutes after a letter arrives, email the recipient if it's still
  # unread. Oban uniqueness folds a burst of letters into one job.
  defp schedule_letter_email(conversation_id, recipient_id) do
    %{conversation_id: conversation_id, recipient_id: recipient_id}
    |> Inkwell.Workers.LetterEmailWorker.new(schedule_in: @letter_email_delay_seconds)
    |> Oban.insert()
  rescue
    e ->
      require Logger
      Logger.warning("[LetterEmail] Failed to schedule: #{inspect(e)}")
  end

  @doc """
  Whether `recipient_id` should get an email about `conversation_id` now:
  they have unread letters there, haven't muted it, and haven't been emailed
  about it since they last read it. So each unread stretch sends at most one
  email, however many letters arrive during it.
  """
  def letter_email_due?(conversation_id, recipient_id) do
    read = Repo.get_by(ConversationRead, conversation_id: conversation_id, user_id: recipient_id)

    already_emailed =
      case read do
        %{emailed_at: %DateTime{} = emailed_at, last_read_at: last_read_at} ->
          DateTime.compare(emailed_at, last_read_at) != :lt

        _ ->
          false
      end

    muted = match?(%{muted_at: %DateTime{}}, read)

    not already_emailed and not muted and
      Repo.exists?(
        unread_letters_query(recipient_id)
        |> where([m], m.conversation_id == ^conversation_id)
      )
  end

  @doc "Record that `recipient_id` was emailed about `conversation_id`."
  def mark_emailed(conversation_id, recipient_id) do
    upsert_view(conversation_id, recipient_id, emailed_at: DateTime.utc_now())
  end

  @doc """
  The conversation plus who's in it, for the letter email worker. Returns
  `{:ok, conv, sender}` where sender is the other participant, or `:error`
  when the recipient isn't in it, the two have blocked each other, or it's a
  request that hasn't been accepted.
  """
  def letter_email_context(conversation_id, recipient_id) do
    case get_participant_conversation(conversation_id, recipient_id) do
      %Conversation{remote_actor_id: actor_id} = conv when not is_nil(actor_id) ->
        if incoming_request?(conv, recipient_id) or remote_blocked?(conv, recipient_id),
          do: :error,
          else: {:ok, conv, remote_sender(conv.remote_actor)}

      _ ->
        local_letter_email_context(conversation_id, recipient_id)
    end
  end

  # The fields the email needs, for a fediverse account.
  defp remote_sender(actor) do
    %{
      id: nil,
      blocked_at: nil,
      display_name: actor.display_name || actor.username,
      username: "#{actor.username}@#{actor.domain}",
      profile_url: remote_profile_url(actor)
    }
  end

  @doc "Where a fediverse account's profile is, for people (not the AP id)."
  def remote_profile_url(%{raw_data: %{"url" => url}}) when is_binary(url), do: url
  def remote_profile_url(actor), do: actor.ap_id

  defp local_letter_email_context(conversation_id, recipient_id) do
    with %Conversation{} = conv <- get_participant_conversation(conversation_id, recipient_id),
         false <- incoming_request?(conv, recipient_id),
         sender = other_user(conv, recipient_id),
         false <- blocked?(sender.id, recipient_id) do
      {:ok, conv, sender}
    else
      _ -> :error
    end
  end

  # ---------------------------------------------------------------------------
  # Unread counts
  # ---------------------------------------------------------------------------

  @doc """
  Number of conversations with at least one unread letter for `user_id`, not
  counting muted ones. Part of every `GET /api/auth/me`, which every open tab
  polls every 15 seconds, so it's a single query.
  """
  def count_unread_letters(user_id) do
    unread_letters_query(user_id)
    |> where([_m, _c, r], is_nil(r.muted_at))
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
      # A letter from a fediverse account has no sender_id.
      where: is_nil(m.sender_id) or m.sender_id != ^user_id,
      where:
        (c.participant_a == ^user_id and m.deleted_by_a == false) or
          (c.participant_b == ^user_id and m.deleted_by_b == false),
      where: is_nil(r.cleared_at) or m.inserted_at > r.cleared_at,
      where: is_nil(r.last_read_at) or m.inserted_at > r.last_read_at
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  @doc """
  Whether `user_id` can send a letter in `conv` right now. The thread uses
  `thread_view/2`, which also accounts for a request waiting on an answer.
  """
  def can_write_in?(%Conversation{remote_actor_id: actor_id} = conv, user_id) when not is_nil(actor_id),
    do: remote_can_write?(conv, user_id)

  def can_write_in?(%Conversation{} = conv, user_id) do
    other_id = other_participant_id(conv, user_id)

    not blocked?(user_id, other_id) and not request_sender_waiting?(conv, user_id) and
      can_write?(conv, user_id, other_id)
  end

  @doc false
  # Whether `sender_id` may write in `conv` right now (blocks and waiting
  # requests are checked separately). See the moduledoc.
  def can_write?(conv, sender_id, recipient_id) do
    conv.request_status == "accepted" or
      (conv.request_status in ["pending", "declined"] and
         (conv.requested_by_id == sender_id or conv.requested_by_id == recipient_id)) or
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

  # ---------------------------------------------------------------------------
  # Conversations with fediverse accounts
  # ---------------------------------------------------------------------------

  @doc """
  Find or open a conversation between member `user_id` and a fediverse
  account. Allowed when one follows the other (accepted), or when there's
  already a conversation that isn't waiting on anyone. Returns
  `{:ok, conv}`, `{:error, :not_found}`, `{:error, :blocked}` or
  `{:error, :not_pen_pals}`.
  """
  def get_or_create_remote_conversation(user_id, remote_actor_id) do
    with {:ok, remote_actor_id} <- Ecto.UUID.cast(remote_actor_id),
         %RemoteActorSchema{} = actor <- Repo.get(RemoteActorSchema, remote_actor_id) do
      existing = remote_conversation(user_id, actor.id)

      cond do
        actor_blocked?(user_id, actor) -> {:error, :blocked}
        existing && existing.request_status in ["pending", "accepted", "declined"] -> {:ok, existing}
        remote_connected?(user_id, actor.id) -> ensure_remote_conversation(user_id, actor, existing)
        true -> {:error, :not_pen_pals}
      end
    else
      _ -> {:error, :not_found}
    end
  end

  @doc false
  def remote_conversation(user_id, remote_actor_id) do
    Conversation
    |> where([c], c.participant_a == ^user_id and c.remote_actor_id == ^remote_actor_id)
    |> preload(^@conv_preloads)
    |> Repo.one()
  end

  @doc false
  def ensure_remote_conversation(_user_id, _actor, %Conversation{} = existing), do: {:ok, existing}

  def ensure_remote_conversation(user_id, actor, nil) do
    %Conversation{participant_a: user_id, remote_actor_id: actor.id}
    |> Ecto.Changeset.change()
    |> Ecto.Changeset.unique_constraint([:participant_a, :remote_actor_id],
      name: :conversations_participant_a_remote_actor_id_index
    )
    |> Repo.insert()
    |> case do
      {:ok, conv} -> preload_participants({:ok, conv})
      # Two deliveries at once: the other one made it.
      {:error, _} -> {:ok, remote_conversation(user_id, actor.id)}
    end
  end

  @doc "True when the member follows the account or the account follows the member."
  def remote_connected?(user_id, remote_actor_id) do
    Repo.exists?(
      from r in Relationship,
        where: r.remote_actor_id == ^remote_actor_id and r.status == :accepted,
        where: r.follower_id == ^user_id or r.following_id == ^user_id
    )
  end

  @doc "The member blocked the account or its server, or the server is defederated."
  def actor_blocked?(user_id, actor) do
    Inkwell.Moderation.FediverseBlocks.should_reject_actor?(user_id, actor.id, actor.domain || "")
  end

  defp remote_blocked?(conv, user_id) do
    conv = Repo.preload(conv, :remote_actor)
    is_nil(conv.remote_actor) or actor_blocked?(user_id, conv.remote_actor)
  end

  # Whether the member may write in a conversation with a fediverse account
  # (blocks aside): still connected, or they wrote in and it was accepted
  # (or is waiting for the member, who accepts it by replying).
  defp remote_can_write?(conv, user_id) do
    not remote_blocked?(conv, user_id) and
      (conv.request_status in ["accepted", "pending", "declined"] or
         remote_connected?(user_id, conv.remote_actor_id))
  end

  @doc false
  def preloads, do: {@conv_preloads, @message_preloads}

  defp find_or_create(user_id, target_id) do
    case conversation_between(user_id, target_id) do
      %Conversation{} = conv ->
        {:ok, conv}

      nil ->
        {a, b} = canonical_order(user_id, target_id)

        %Conversation{}
        |> Conversation.changeset(%{participant_a: a, participant_b: b})
        |> Repo.insert()
        |> preload_participants()
    end
  end

  defp get_participant_conversation(id, user_id) do
    Conversation
    |> where([c], c.id == ^id and (c.participant_a == ^user_id or c.participant_b == ^user_id))
    |> preload(^@conv_preloads)
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

  @doc "The other person in a conversation: a member, or a fediverse account (`RemoteActorSchema`)."
  def other_party(conv, user_id), do: other_user(conv, user_id)

  defp other_user(%Conversation{remote_actor_id: actor_id} = conv, _user_id) when not is_nil(actor_id),
    do: conv.remote_actor

  defp other_user(conv, user_id) do
    if conv.participant_a == user_id, do: conv.participant_b_user, else: conv.participant_a_user
  end

  # Canonical ordering: lower UUID string goes into participant_a
  defp canonical_order(a, b), do: if(a < b, do: {a, b}, else: {b, a})

  # Hide letters the viewer removed from their side, and everything up to
  # when they deleted the conversation for themselves.
  defp visible_to(query, conv, viewer_id) do
    query =
      if conv.participant_a == viewer_id,
        do: where(query, [m], m.deleted_by_a == false),
        else: where(query, [m], m.deleted_by_b == false)

    cleared_at =
      ConversationRead
      |> where([r], r.conversation_id == ^conv.id and r.user_id == ^viewer_id)
      |> select([r], r.cleared_at)
      |> Repo.one()

    if cleared_at, do: where(query, [m], m.inserted_at > ^cleared_at), else: query
  end

  # Newest letter each viewer can see, per conversation, in one query.
  defp last_visible_messages([], _user_id), do: %{}

  defp last_visible_messages(conversation_ids, user_id) do
    from(m in DirectMessage,
      join: c in Conversation,
      on: c.id == m.conversation_id,
      left_join: r in ConversationRead,
      on: r.conversation_id == c.id and r.user_id == ^user_id,
      where: m.conversation_id in ^conversation_ids,
      where:
        (c.participant_a == ^user_id and m.deleted_by_a == false) or
          (c.participant_b == ^user_id and m.deleted_by_b == false),
      where: is_nil(r.cleared_at) or m.inserted_at > r.cleared_at,
      distinct: m.conversation_id,
      order_by: [asc: m.conversation_id, desc: m.inserted_at]
    )
    |> Repo.all()
    |> Map.new(&{&1.conversation_id, &1})
  end

  # No database notification: the Letterbox badge covers in-app state. A web
  # push goes out so people hear about letters when they're away, unless they
  # muted the conversation. It names the sender but never shows the letter
  # itself, since it can land on a lock screen. One tag per conversation, so
  # a run of letters replaces a single notification instead of stacking.
  defp notify_recipient(conv, sender_id, recipient_id) do
    sender = Repo.get(Accounts.User, sender_id)
    notify_recipient_named(conv, (sender && (sender.display_name || sender.username)) || "Someone", recipient_id)
  end

  @doc false
  # Push + email for a letter to `recipient_id`, from whoever `actor_name` is.
  def notify_new_letter(conv, actor_name, recipient_id) do
    notify_recipient_named(conv, actor_name, recipient_id)
    schedule_letter_email(conv.id, recipient_id)
  end

  defp notify_recipient_named(conv, actor_name, recipient_id) do
    if Inkwell.Push.configured?() do
      try do
        recipient = Repo.get(Accounts.User, recipient_id)
        push_disabled = match?(%{settings: %{"push_notifications_disabled" => true}}, recipient)

        muted =
          Repo.exists?(
            from r in ConversationRead,
              where: r.conversation_id == ^conv.id and r.user_id == ^recipient_id and not is_nil(r.muted_at)
          )

        unless push_disabled or muted do
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
