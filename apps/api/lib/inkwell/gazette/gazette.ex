defmodule Inkwell.Gazette do
  @moduledoc """
  The Inkwell Gazette: a twice-daily paper of the stories the fediverse is
  sharing (`Inkwell.Gazette.Trends` + `Inkwell.Gazette.Editions`), with what
  people are saying about each (`Inkwell.Gazette.Conversation`) and the
  journal entries Inkwell writers wrote in response.

  Responses are public, published entries that either came from "Write about
  this" (`entries.gazette_story_id`) or link to the story's address.
  """

  import Ecto.Query

  alias Inkwell.Repo
  alias Inkwell.Journals.Entry
  alias Inkwell.Gazette.Story

  def get_story(id) do
    case Ecto.UUID.cast(id) do
      {:ok, uuid} -> Repo.get(Story, uuid)
      :error -> nil
    end
  end

  @doc "How many public responses each story has, as `%{story_id => n}`."
  def response_counts([]), do: %{}

  def response_counts(story_ids) do
    public_responses()
    |> where([e], e.gazette_story_id in ^story_ids)
    |> group_by([e], e.gazette_story_id)
    |> select([e], {e.gazette_story_id, count(e.id)})
    |> Repo.all()
    |> Map.new()
  end

  @doc "Responses to one story, newest first."
  def responses_for(%Story{} = story, opts \\ []) do
    limit = Keyword.get(opts, :limit, 20)
    exclude_user_ids = Keyword.get(opts, :exclude_user_ids, [])
    pattern = "%" <> escape_like(story.url) <> "%"

    public_responses()
    |> where([e], e.gazette_story_id == ^story.id or like(e.body_html, ^pattern))
    |> exclude_users(exclude_user_ids)
    |> order_by([e], desc: e.published_at)
    |> limit(^limit)
    |> preload(:user)
    |> Repo.all()
  end

  @doc "The newest responses to any of the given stories (for the front page)."
  def recent_responses(story_ids, opts \\ [])
  def recent_responses([], _opts), do: []

  def recent_responses(story_ids, opts) do
    limit = Keyword.get(opts, :limit, 6)
    exclude_user_ids = Keyword.get(opts, :exclude_user_ids, [])

    public_responses()
    |> where([e], e.gazette_story_id in ^story_ids)
    |> exclude_users(exclude_user_ids)
    |> order_by([e], desc: e.published_at)
    |> limit(^limit)
    |> preload(:user)
    |> Repo.all()
  end

  defp public_responses do
    Entry
    |> where([e], e.status == :published and e.privacy == :public)
    |> where([e], e.user_id not in subquery(blocked_user_ids()))
  end

  defp blocked_user_ids do
    from u in Inkwell.Accounts.User, where: not is_nil(u.blocked_at), select: u.id
  end

  defp exclude_users(query, []), do: query
  defp exclude_users(query, ids), do: where(query, [e], e.user_id not in ^ids)

  defp escape_like(s), do: String.replace(s, ~r/([\\%_])/, "\\\\\\1")
end
