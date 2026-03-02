defmodule InkwellWeb.LetterController do
  use InkwellWeb, :controller

  alias Inkwell.Letters

  # POST /api/conversations/:id/letters — send a letter
  def create(conn, %{"id" => conversation_id} = params) do
    user = conn.assigns.current_user
    body_html = sanitize_html(params["body_html"])
    body = derive_plain_text(body_html) || String.trim(params["body"] || "")

    if body == "" do
      conn |> put_status(:unprocessable_entity) |> json(%{error: "Missing body parameter"})
    else
      case Letters.send_letter(conversation_id, user.id, body, body_html) do
        {:ok, message} ->
          conn
          |> put_status(:created)
          |> json(%{data: render_message(message, user.id)})

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
  end

  # PATCH /api/conversations/:id/letters/:letter_id — edit a letter
  def update(conn, %{"id" => _conversation_id, "letter_id" => message_id} = params) do
    user = conn.assigns.current_user
    body_html = sanitize_html(params["body_html"])
    body = derive_plain_text(body_html) || String.trim(params["body"] || "")

    if body == "" do
      conn |> put_status(:unprocessable_entity) |> json(%{error: "Missing body parameter"})
    else
      attrs = %{body: body, body_html: body_html}

      case Letters.update_letter(message_id, user.id, attrs) do
        {:ok, message} ->
          json(conn, %{data: render_message(message, user.id)})

        {:error, :not_found} ->
          conn |> put_status(:not_found) |> json(%{error: "Letter not found"})

        {:error, :forbidden} ->
          conn |> put_status(:forbidden) |> json(%{error: "You can only edit your own letters"})

        {:error, %Ecto.Changeset{} = changeset} ->
          errors = Ecto.Changeset.traverse_errors(changeset, fn {msg, _opts} -> msg end)
          conn |> put_status(:unprocessable_entity) |> json(%{errors: errors})

        {:error, _} ->
          conn |> put_status(:internal_server_error) |> json(%{error: "Failed to update letter"})
      end
    end
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

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp render_message(message, viewer_id) do
    %{
      id: message.id,
      body: message.body,
      body_html: message.body_html,
      edited_at: message.edited_at,
      sender_username: message.sender.username,
      sender_display_name: message.sender.display_name,
      sender_avatar_url: message.sender.avatar_url,
      is_mine: message.sender_id == viewer_id,
      inserted_at: message.inserted_at
    }
  end

  defp sanitize_html(nil), do: nil
  defp sanitize_html(""), do: nil

  defp sanitize_html(html) do
    sanitized =
      html
      |> String.replace(~r/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/is, "")
      |> String.replace(~r/<script\b[^>]*\/?\s*>/is, "")
      |> String.replace(~r/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "")
      |> String.replace(~r/(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/i, "\\1=\"\"")
      |> String.replace(~r/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/is, "")
      |> String.replace(~r/<iframe\b[^>]*\/?\s*>/is, "")
      |> String.replace(~r/<(object|embed|applet)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/is, "")
      |> String.replace(~r/<(object|embed|applet)\b[^>]*\/?\s*>/is, "")

    case String.trim(sanitized) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  defp derive_plain_text(nil), do: nil

  defp derive_plain_text(html) do
    html
    |> String.replace(~r/<br\s*\/?>/, "\n")
    |> String.replace(~r/<\/p>\s*<p[^>]*>/, "\n\n")
    |> String.replace(~r/<[^>]*>/, "")
    |> String.replace(~r/&amp;/, "&")
    |> String.replace(~r/&lt;/, "<")
    |> String.replace(~r/&gt;/, ">")
    |> String.replace(~r/&quot;/, "\"")
    |> String.replace(~r/&#39;/, "'")
    |> String.replace(~r/&nbsp;/, " ")
    |> String.replace(~r/&[^;]+;/, " ")
    |> String.replace(~r/\n{3,}/, "\n\n")
    |> String.trim()
    |> String.slice(0, 10_000)
  end
end
