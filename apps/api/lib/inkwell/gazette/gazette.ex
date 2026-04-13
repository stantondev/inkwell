defmodule Inkwell.Gazette do
  @moduledoc """
  Context module for the Gazette — fediverse news discovery.
  Queries relay-sourced remote entries filtered by topic hashtags,
  applies heuristic quality scoring, and supports optional AI scoring for Plus users.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Federation.RemoteEntry
  alias Inkwell.Gazette.{Heuristics, Topics}

  @doc """
  Lists Gazette entries for the given topics, applying heuristic filtering and scoring.

  Options:
    - :topics — list of topic IDs (required for filtering)
    - :page — page number (default 1)
    - :per_page — entries per page (default 30, max 50)
    - :blocked_remote_actor_ids — IDs of blocked fediverse actors to exclude
    - :blocked_domains — list of blocked domain strings to exclude
    - :include_sensitive — whether to include sensitive content (default false)
    - :redacted_words — list of words to filter out
  """
  def list_entries(opts \\ []) do
    topics = Keyword.get(opts, :topics, [])
    page = Keyword.get(opts, :page, 1)
    per_page = min(Keyword.get(opts, :per_page, 30), 50)
    blocked_actor_ids = Keyword.get(opts, :blocked_remote_actor_ids, [])
    blocked_domains = Keyword.get(opts, :blocked_domains, [])
    include_sensitive = Keyword.get(opts, :include_sensitive, false)
    redacted_words = Keyword.get(opts, :redacted_words, [])

    hashtags = Topics.hashtags_for_topics(topics)

    # If no topics selected or no hashtags match, return empty
    if hashtags == [] do
      {[], 0}
    else
      # Fetch more than needed so we can post-filter with heuristics
      fetch_limit = per_page * 3

      entries =
        base_query()
        |> filter_by_hashtags(hashtags)
        |> exclude_blocked_actors(blocked_actor_ids)
        |> exclude_blocked_domains(blocked_domains)
        |> maybe_exclude_sensitive(include_sensitive)
        |> order_by([e], [desc: fragment("(COALESCE(?, 0) + COALESCE(?, 0))", e.boosts_count, e.likes_count), desc: e.published_at])
        |> limit(^fetch_limit)
        |> preload(:remote_actor)
        |> Repo.all()

      # Apply heuristic filtering and scoring
      scored_entries =
        entries
        |> Enum.filter(&Heuristics.passes_gazette_filter?/1)
        |> filter_redacted(redacted_words)
        |> Enum.map(fn entry ->
          score = Heuristics.quality_score(entry)
          {entry, score}
        end)
        |> Enum.sort_by(fn {_entry, score} -> -score end)

      total = length(scored_entries)

      paged =
        scored_entries
        |> Enum.drop((page - 1) * per_page)
        |> Enum.take(per_page)
        |> Enum.map(fn {entry, score} ->
          Map.put(entry, :gazette_quality_score, score)
        end)

      {paged, total}
    end
  end

  @doc "Counts total Gazette-eligible entries for the given topics (for pagination)."
  def count_entries(topics) do
    hashtags = Topics.hashtags_for_topics(topics)

    if hashtags == [] do
      0
    else
      base_query()
      |> filter_by_hashtags(hashtags)
      |> Repo.aggregate(:count)
    end
  end

  # Base query: relay- or follow-sourced entries with published_at.
  # - `relay`: broad sweep of fediverse content from relay subscriptions (14-day TTL)
  # - `follow`: content from fediverse accounts directly followed by Inkwell users (90-day TTL)
  #   This means following a journalist from Inkwell feeds the Gazette with their posts.
  defp base_query do
    RemoteEntry
    |> where([e], e.source in ["relay", "follow"])
    |> where([e], not is_nil(e.published_at))
  end

  defp filter_by_hashtags(query, hashtags) do
    where(query, [e],
      fragment(
        "EXISTS (SELECT 1 FROM unnest(?) AS t(tag) WHERE LOWER(t.tag) = ANY(?))",
        e.tags,
        ^hashtags
      )
    )
  end

  defp exclude_blocked_actors(query, []), do: query

  defp exclude_blocked_actors(query, actor_ids) do
    where(query, [e], e.remote_actor_id not in ^actor_ids)
  end

  defp exclude_blocked_domains(query, []), do: query

  defp exclude_blocked_domains(query, domains) do
    Enum.reduce(domains, query, fn domain, q ->
      where(q, [e], fragment("? NOT LIKE ?", e.url, ^"%#{domain}%"))
    end)
  end

  defp maybe_exclude_sensitive(query, true), do: query

  defp maybe_exclude_sensitive(query, false) do
    where(query, [e], e.sensitive == false or is_nil(e.sensitive))
  end

  defp filter_redacted(entries, []), do: entries

  defp filter_redacted(entries, words) do
    Enum.reject(entries, fn entry ->
      Inkwell.Redactions.matches_redaction?(entry_text(entry), words)
    end)
  end

  defp entry_text(entry) do
    title = entry.title || ""
    body = (entry.body_html || "") |> String.replace(~r/<[^>]+>/, " ")
    tags = (entry.tags || []) |> Enum.join(" ")
    "#{title} #{body} #{tags}"
  end
end
