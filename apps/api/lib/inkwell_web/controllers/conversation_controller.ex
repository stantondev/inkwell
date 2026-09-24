defmodule InkwellWeb.ConversationController do
  use InkwellWeb, :controller

  alias Inkwell.Letters
  alias InkwellWeb.LetterJSON

  @folders %{"inbox" => :inbox, "requests" => :requests, "archived" => :archived}

  # GET /api/conversations[?folder=inbox|requests|archived] — one Letterbox
  # tab, plus how many are waiting in the other two.
  def index(conn, params) do
    user = conn.assigns.current_user
    folder = Map.get(@folders, params["folder"], :inbox)

    json(conn, %{
      data:
        Enum.map(Letters.list_conversations(user.id, folder), fn {conv, other, last_msg, unread, view} ->
          LetterJSON.conversation(conv, other, last_msg, unread, view)
        end),
      meta: %{
        folder: folder,
        counts: Letters.folder_counts(user.id),
        letters_from: (user.settings || %{})["letters_from"] || "pen_pals"
      }
    })
  end

  # GET /api/conversations/search?q= — letters you can see that mention q
  def search(conn, params) do
    user = conn.assigns.current_user
    q = if is_binary(params["q"]), do: params["q"], else: ""

    json(conn, %{data: Enum.map(Letters.search_letters(user.id, q), &LetterJSON.search_hit(&1, user.id))})
  end

  # POST /api/conversations/:id/actions {"action": ...} — your own archive,
  # mute, mark unread, delete for me, and answers to letter requests.
  # (Not named `action/2`: that's the function every Phoenix controller
  # dispatches through, and defining it swallowed every request.)
  def update_view(conn, %{"id" => id, "action" => action}) when is_binary(action) do
    user = conn.assigns.current_user

    case Letters.apply_action(id, user.id, action) do
      {:ok, _conv} ->
        json(conn, %{ok: true})

      {:error, :invalid} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "That can't be done to this conversation"})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Conversation not found"})
    end
  end

  def update_view(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "Missing action"})
  end

  # POST /api/conversations {"remote_actor_id"} — a conversation with a
  # fediverse account you follow or that follows you
  def create(conn, %{"remote_actor_id" => actor_id}) when is_binary(actor_id) do
    user = conn.assigns.current_user
    create_result(conn, user, Letters.get_or_create_remote_conversation(user.id, actor_id))
  end

  # POST /api/conversations {"username"} — find or create a conversation with a pen pal
  def create(conn, %{"username" => username}) when is_binary(username) do
    user = conn.assigns.current_user
    create_result(conn, user, Letters.get_or_create_conversation(user.id, username))
  end

  def create(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "Missing username parameter"})
  end

  defp create_result(conn, user, result) do
    case result do
      {:ok, conv} ->
        other = Letters.other_party(conv, user.id)
        conn |> put_status(:ok) |> json(%{data: %{id: conv.id, other_user: LetterJSON.user(other)}})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      {:error, :cannot_message_self} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Cannot write to yourself"})

      {:error, :not_pen_pals} ->
        conn |> put_status(:forbidden) |> json(%{error: "You can only exchange letters with accepted pen pals"})

      {:error, :blocked} ->
        conn |> put_status(:forbidden) |> json(%{error: "Unable to start a letter exchange with this user"})

      {:error, :request_limit} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{error: "You've sent as many letter requests as you can today. Try again tomorrow."})

      {:error, _} ->
        conn |> put_status(:internal_server_error) |> json(%{error: "Failed to create conversation"})
    end
  end

  # GET /api/conversations/:id?since=<letter_id> — letters newer than one the
  # open thread already has. Must come before the general clause below, which
  # matches every request: until Sept 2026 it came after, so polling got the
  # whole thread back, the page couldn't read it, and new letters only showed
  # up on reload.
  def show(conn, %{"id" => id, "since" => since_id}) do
    user = conn.assigns.current_user

    case Letters.list_messages_since(id, user.id, since_id) do
      {:ok, messages} ->
        json(conn, %{data: Enum.map(messages, &LetterJSON.message(&1, user.id))})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Conversation not found"})
    end
  end

  # GET /api/conversations/:id[?before=<letter_id>] — the newest 50 letters,
  # or the 50 before a given letter. Opening the newest page marks it read.
  def show(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    case Letters.get_conversation(id, user.id, before: params["before"]) do
      {:ok, conv, messages, has_more} ->
        other = Letters.other_party(conv, user.id)
        view = Letters.thread_view(conv, user.id)

        json(conn, %{
          data: %{
            id: conv.id,
            other_user: LetterJSON.user(other),
            messages: Enum.map(messages, &LetterJSON.message(&1, user.id)),
            has_more: has_more,
            can_write: view.can_write,
            muted: view.muted,
            archived: view.archived,
            request: LetterJSON.request(view.request),
            request_waiting: view.request_waiting
          }
        })

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Conversation not found"})
    end
  end

  # POST /api/conversations/:id/read — mark all as read
  def mark_read(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    if Letters.participant?(id, user.id) do
      Letters.mark_read(id, user.id)
      json(conn, %{ok: true})
    else
      conn |> put_status(:not_found) |> json(%{error: "Conversation not found"})
    end
  end
end
