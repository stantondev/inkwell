defmodule InkwellWeb.LetterJSON do
  @moduledoc """
  How letters, conversations and their people appear in API responses.
  Shared by `ConversationController` and `LetterController` so the two can't
  drift apart.

  Avatars go through `Inkwell.Avatars.avatar_url/1`, never the stored value:
  that's a base64 data URI, and returning it put the whole picture into every
  letter in a thread.
  """

  alias Inkwell.Avatars

  def conversation(conv, other, last_msg, unread, view \\ %{}) do
    %{
      id: conv.id,
      other_user: user(other),
      last_message: if(last_msg, do: preview(last_msg), else: nil),
      unread_count: unread,
      last_message_at: conv.last_message_at,
      muted: Map.get(view, :muted, false),
      request: view |> Map.get(:request) |> request()
    }
  end

  @doc "`:incoming` / `:outgoing` / nil as a string for the page."
  def request(nil), do: nil
  def request(side), do: to_string(side)

  @doc "A search hit: the letter plus who the conversation is with."
  def search_hit(message, viewer_id) do
    conv = message.conversation
    other = if conv.participant_a == viewer_id, do: conv.participant_b_user, else: conv.participant_a_user

    %{
      conversation_id: conv.id,
      letter_id: message.id,
      other_user: user(other),
      is_mine: message.sender_id == viewer_id,
      body: String.slice(message.body, 0, 400),
      inserted_at: message.inserted_at
    }
  end

  def user(nil), do: nil

  def user(user) do
    %{
      id: user.id,
      username: user.username,
      display_name: user.display_name || user.username,
      avatar_url: Avatars.avatar_url(user),
      avatar_frame: user.avatar_frame
    }
  end

  def message(message, viewer_id) do
    %{
      id: message.id,
      body: message.body,
      body_html: message.body_html,
      edited_at: message.edited_at,
      sender_username: message.sender.username,
      sender_display_name: message.sender.display_name || message.sender.username,
      sender_avatar_url: Avatars.avatar_url(message.sender),
      is_mine: message.sender_id == viewer_id,
      inserted_at: message.inserted_at
    }
  end

  defp preview(message) do
    %{
      body: String.slice(message.body, 0, 80),
      inserted_at: message.inserted_at
    }
  end
end
