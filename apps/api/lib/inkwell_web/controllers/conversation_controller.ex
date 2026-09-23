defmodule InkwellWeb.ConversationController do
  use InkwellWeb, :controller

  alias Inkwell.Letters
  alias InkwellWeb.LetterJSON

  # GET /api/conversations — list all conversations for current user
  def index(conn, _params) do
    user = conn.assigns.current_user

    json(conn, %{
      data:
        Enum.map(Letters.list_conversations(user.id), fn {conv, other, last_msg, unread} ->
          LetterJSON.conversation(conv, other, last_msg, unread)
        end)
    })
  end

  # POST /api/conversations — find or create a conversation with a pen pal
  def create(conn, %{"username" => username}) when is_binary(username) do
    user = conn.assigns.current_user

    case Letters.get_or_create_conversation(user.id, username) do
      {:ok, conv} ->
        other = if conv.participant_a == user.id, do: conv.participant_b_user, else: conv.participant_a_user
        conn |> put_status(:ok) |> json(%{data: %{id: conv.id, other_user: LetterJSON.user(other)}})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      {:error, :cannot_message_self} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Cannot write to yourself"})

      {:error, :not_pen_pals} ->
        conn |> put_status(:forbidden) |> json(%{error: "You can only exchange letters with accepted pen pals"})

      {:error, :blocked} ->
        conn |> put_status(:forbidden) |> json(%{error: "Unable to start a letter exchange with this user"})

      {:error, _} ->
        conn |> put_status(:internal_server_error) |> json(%{error: "Failed to create conversation"})
    end
  end

  def create(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "Missing username parameter"})
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
        other = if conv.participant_a == user.id, do: conv.participant_b_user, else: conv.participant_a_user

        json(conn, %{
          data: %{
            id: conv.id,
            other_user: LetterJSON.user(other),
            messages: Enum.map(messages, &LetterJSON.message(&1, user.id)),
            has_more: has_more
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
