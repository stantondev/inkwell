defmodule InkwellWeb.LetterController do
  use InkwellWeb, :controller

  alias Inkwell.Letters

  # POST /api/conversations/:id/letters — send a letter
  def create(conn, %{"id" => conversation_id, "body" => body}) do
    user = conn.assigns.current_user

    case Letters.send_letter(conversation_id, user.id, body) do
      {:ok, message} ->
        conn
        |> put_status(:created)
        |> json(%{
          data: %{
            id: message.id,
            body: message.body,
            sender_username: message.sender.username,
            sender_display_name: message.sender.display_name,
            sender_avatar_url: message.sender.avatar_url,
            is_mine: true,
            inserted_at: message.inserted_at
          }
        })

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Conversation not found"})

      {:error, :blocked} ->
        conn |> put_status(:forbidden) |> json(%{error: "Unable to send letter to this user"})

      {:error, %Ecto.Changeset{} = changeset} ->
        errors = Ecto.Changeset.traverse_errors(changeset, fn {msg, _opts} -> msg end)
        conn |> put_status(:unprocessable_entity) |> json(%{errors: errors})

      {:error, _} ->
        conn |> put_status(:internal_server_error) |> json(%{error: "Failed to send letter"})
    end
  end

  def create(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "Missing body parameter"})
  end

  # DELETE /api/conversations/:id/letters/:letter_id — soft-delete a letter
  def delete(conn, %{"letter_id" => message_id}) do
    user = conn.assigns.current_user

    case Letters.delete_letter(message_id, user.id) do
      {:ok, _} ->
        json(conn, %{ok: true})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Letter not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "You can only delete your own letters"})

      {:error, _} ->
        conn |> put_status(:internal_server_error) |> json(%{error: "Failed to delete letter"})
    end
  end
end
