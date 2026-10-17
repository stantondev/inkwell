defmodule InkwellWeb.StampJSON do
  @moduledoc """
  How stamps are rendered. Readers get marks (design + date); the writer a
  stamp was sent to gets letters (sender + note); the album adds the entry.
  """
  alias Inkwell.{Avatars, Stamps}
  alias Inkwell.Stamps.Stamp
  alias Inkwell.Accounts.User
  alias Inkwell.Federation.RemoteActorSchema

  def mark(%Stamp{} = s), do: Stamps.mark(s)

  @doc "A stamp with its sender and note — only for the writer it was sent to (or its sender)."
  def letter(%Stamp{} = s) do
    s
    |> mark()
    |> Map.merge(%{
      note: s.note,
      emoji_name: s.emoji,
      stamped_at: s.inserted_at,
      sender: sender(s.user || s.remote_actor)
    })
  end

  def sender(%User{} = u) do
    %{
      id: u.id,
      username: u.username,
      display_name: u.display_name || u.username,
      avatar_url: Avatars.avatar_url(u),
      avatar_frame: u.avatar_frame,
      remote: false
    }
  end

  def sender(%RemoteActorSchema{} = a) do
    %{
      id: a.id,
      username: "#{a.username}@#{a.domain}",
      display_name: a.display_name || a.username,
      avatar_url: a.avatar_url,
      remote: true,
      handle: "@#{a.username}@#{a.domain}",
      profile_url: profile_url(a)
    }
  end

  def sender(_), do: %{username: nil, display_name: "Someone", avatar_url: nil, remote: false}

  def profile_url(%RemoteActorSchema{raw_data: %{"url" => url}}) when is_binary(url), do: url
  def profile_url(%RemoteActorSchema{ap_id: ap_id}), do: ap_id

  @doc "One stamp in the album."
  def album_item(%Stamp{} = s) do
    s
    |> letter()
    |> Map.merge(%{
      entry: album_entry(s.entry),
      remote_entry: album_remote_entry(s.remote_entry),
      recipient: recipient(s)
    })
  end

  defp album_entry(%Inkwell.Journals.Entry{} = e) do
    %{
      id: e.id,
      title: e.title,
      slug: e.slug,
      username: e.user && e.user.username,
      kind: e.kind,
      excerpt: e.excerpt && String.slice(e.excerpt, 0, 160)
    }
  end

  defp album_entry(_), do: nil

  defp album_remote_entry(%Inkwell.Federation.RemoteEntry{} = re) do
    actor = re.remote_actor

    %{
      id: re.id,
      title: re.title,
      url: re.url,
      author_handle: actor && "@#{actor.username}@#{actor.domain}"
    }
  end

  defp album_remote_entry(_), do: nil

  defp recipient(%Stamp{entry: %Inkwell.Journals.Entry{user: %User{} = u}}), do: sender(u)

  defp recipient(%Stamp{remote_entry: %Inkwell.Federation.RemoteEntry{remote_actor: %RemoteActorSchema{} = a}}),
    do: sender(a)

  defp recipient(_), do: nil
end
