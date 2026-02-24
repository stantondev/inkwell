defmodule InkwellWeb.ConversationController do
  use InkwellWeb, :controller

  alias Inkwell.Letters

  # GET /api/conversations — list all conversations for current user
  def index(conn, _params) do
    user = conn.assigns.current_user

    conversations = Letters.list_conversations(user.id)

    json(conn, %{
      data: Enum.map(conversations, fn {conv, other, last_msg, unread} ->
        render_conversation(conv, other, last_msg, unread)
      end)
    })
  end

  # POST /api/conversations — find or create a conversation with a pen pal
  def create(conn, %{"username" => username}) do
    user = conn.assigns.current_user

    case Letters.get_or_create_conversation(user.id, username) do
      {:ok, conv} ->
        other = if conv.participant_a == user.id, do: conv.participant_b_user, else: conv.participant_a_user
        conn |> put_status(:ok) |> json(%{data: %{id: conv.id, other_user: render_user(other)}})

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

  # GET /api/conversations/:id — load thread with messages, mark as read
  def show(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user
    page = String.to_integer(Map.get(params, "page", "1"))

    case Letters.get_conversation(id, user.id, page: page) do
      {:ok, conv, messages, total, page} ->
        other = if conv.participant_a == user.id, do: conv.participant_b_user, else: conv.participant_a_user
        per_page = 50
        has_more = total > page * per_page

        json(conn, %{
          data: %{
            id: conv.id,
            other_user: render_user(other),
            messages: Enum.map(messages, &render_message(&1, user.id)),
            page: page,
            has_more: has_more,
            total: total
          }
        })

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Conversation not found"})
    end
  end

  # GET /api/conversations/:id?since=<message_id> — poll for new messages
  def show(conn, %{"id" => id, "since" => since_id}) do
    user = conn.assigns.current_user

    case Letters.list_messages_since(id, user.id, since_id) do
      {:ok, messages} ->
        json(conn, %{data: Enum.map(messages, &render_message(&1, user.id))})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Conversation not found"})
    end
  end

  # POST /api/conversations/:id/read — mark all as read
  def mark_read(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    # Verify the user is a participant by trying to get the conversation
    case Letters.get_conversation(id, user.id) do
      {:ok, _, _, _, _} ->
        Letters.mark_read(id, user.id)
        json(conn, %{ok: true})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Conversation not found"})
    end
  end

  # ---------------------------------------------------------------------------
  # Render helpers
  # ---------------------------------------------------------------------------

  defp render_conversation(conv, other, last_msg, unread) do
    %{
      id: conv.id,
      other_user: render_user(other),
      last_message: if(last_msg, do: render_message_preview(last_msg), else: nil),
      unread_count: unread,
      last_message_at: conv.last_message_at
    }
  end

  defp render_user(nil), do: nil
  defp render_user(user) do
    %{
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url
    }
  end

  defp render_message(message, viewer_id) do
    %{
      id: message.id,
      body: message.body,
      sender_username: message.sender.username,
      sender_display_name: message.sender.display_name,
      sender_avatar_url: message.sender.avatar_url,
      is_mine: message.sender_id == viewer_id,
      inserted_at: message.inserted_at
    }
  end

  defp render_message_preview(message) do
    %{
      body: String.slice(message.body, 0, 80),
      inserted_at: message.inserted_at
    }
  end
end
