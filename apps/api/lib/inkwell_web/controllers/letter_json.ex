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
  alias Inkwell.Federation.RemoteActorSchema

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
    other = Inkwell.Letters.other_party(conv, viewer_id)

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

  # A fediverse account. `username` is user@domain so it can't be mistaken
  # for a member's; `profile_url` is where their profile lives.
  def user(%RemoteActorSchema{} = actor) do
    %{
      id: actor.id,
      username: "#{actor.username}@#{actor.domain}",
      display_name: actor.display_name || actor.username,
      avatar_url: actor.avatar_url,
      avatar_frame: nil,
      remote: true,
      handle: "@#{actor.username}@#{actor.domain}",
      profile_url: Inkwell.Letters.remote_profile_url(actor)
    }
  end

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
    sender = message.sender || message.sender_remote_actor
    who = user(sender) || %{username: nil, display_name: "Someone", avatar_url: nil}

    %{
      id: message.id,
      body: message.body,
      body_html: message.body_html,
      edited_at: message.edited_at,
      sender_username: who.username,
      sender_display_name: who.display_name,
      sender_avatar_url: who.avatar_url,
      sender_profile_url: Map.get(who, :profile_url),
      is_mine: not is_nil(message.sender_id) and message.sender_id == viewer_id,
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
