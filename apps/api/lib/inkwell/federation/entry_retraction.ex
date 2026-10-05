defmodule Inkwell.Federation.EntryRetraction do
  @moduledoc """
  An entry the fediverse could see is going away (deleted by its writer or an
  admin, made non-public, hidden by moderation): its followers' servers get a
  Delete for the entry and for every Inkwell footnote on it.

  Mastodon keeps replies when the post they answer is deleted, so without the
  footnote Deletes the thread lingered there under a missing post.

  Call it only for entries that were public and published, and before the
  entry is deleted (the footnotes go with it).
  """

  alias Inkwell.Federation.CommentFederation
  alias Inkwell.Federation.Workers.FanOutWorker

  def retract(%{id: id, ap_id: ap_id, user_id: user_id}) when is_binary(ap_id) do
    CommentFederation.retract_on_entry(id)

    %{entry_ap_id: ap_id, action: "delete", user_id: user_id}
    |> FanOutWorker.new()
    |> Oban.insert()

    :ok
  end

  def retract(_entry), do: :ok
end
