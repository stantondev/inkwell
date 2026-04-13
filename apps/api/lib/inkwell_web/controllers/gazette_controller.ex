defmodule InkwellWeb.GazetteController do
  use InkwellWeb, :controller

  alias Inkwell.{Redactions, Social}
  alias Inkwell.Gazette
  alias Inkwell.Gazette.{AiScorer, Topics}

  # GET /api/gazette — paginated fediverse news entries filtered by topics
  def index(conn, params) do
    page = parse_int(params["page"], 1)
    per_page = min(parse_int(params["per_page"], 30), 50)
    viewer = conn.assigns[:current_user]

    # Determine topics: explicit ?topic= param, or user's saved topics
    topics =
      cond do
        is_binary(params["topic"]) && params["topic"] != "" ->
          [params["topic"]] |> Enum.filter(&Topics.valid_topic?/1)

        viewer ->
          Topics.get_user_topics(viewer)

        true ->
          []
      end

    if topics == [] do
      json(conn, %{
        data: [],
        topics: [],
        needs_topic_selection: true,
        pagination: %{page: 1, per_page: per_page, total: 0}
      })
    else
      # Build block filters
      blocked_actor_ids =
        if viewer do
          fediverse_blocks = Inkwell.Moderation.FediverseBlocks.get_all_blocks_for_user(viewer.id)
          fediverse_blocks.blocked_remote_actor_ids
        else
          []
        end

      blocked_domains =
        admin_domains = Inkwell.Moderation.FediverseBlocks.list_admin_blocked_domains()
        admin_domain_list = Enum.map(admin_domains, & &1.domain)

        user_domains =
          if viewer do
            fediverse_blocks = Inkwell.Moderation.FediverseBlocks.get_all_blocks_for_user(viewer.id)
            fediverse_blocks.blocked_domains
          else
            []
          end

        Enum.uniq(admin_domain_list ++ user_domains)

      include_sensitive =
        case viewer do
          %{settings: %{"show_sensitive_content" => true}} -> true
          _ -> false
        end

      redacted_words = if viewer, do: Redactions.get_redacted_words(viewer), else: []

      is_plus = viewer && viewer.subscription_tier == "plus"

      {entries, total} =
        Gazette.list_entries(
          topics: topics,
          page: page,
          per_page: per_page,
          blocked_remote_actor_ids: blocked_actor_ids,
          blocked_domains: blocked_domains,
          include_sensitive: include_sensitive,
          redacted_words: redacted_words
        )

      # Plus users: on-demand AI scoring (cached on entries)
      {entries, ai_active} =
        if is_plus && AiScorer.configured?() do
          scored = AiScorer.score_and_cache(entries)

          # Filter to news-only and re-sort by relevance
          filtered =
            scored
            |> Enum.filter(fn e ->
              # Keep entries classified as news, or unscored entries (graceful degradation)
              is_nil(e.gazette_is_news) || e.gazette_is_news == true
            end)
            |> Enum.sort_by(fn e -> -(e.gazette_relevance || 0.0) end)

          {filtered, true}
        else
          {entries, false}
        end

      data = Enum.map(entries, &render_gazette_entry/1)

      json(conn, %{
        data: data,
        topics: topics,
        needs_topic_selection: false,
        ai_curated: ai_active,
        pagination: %{page: page, per_page: per_page, total: total}
      })
    end
  end

  # GET /api/gazette/topics — returns all available topics
  def topics(conn, _params) do
    viewer = conn.assigns[:current_user]
    user_topics = if viewer, do: Topics.get_user_topics(viewer), else: []

    all_topics =
      Topics.list_topics()
      |> Enum.map(fn topic ->
        Map.put(topic, :subscribed, topic.id in user_topics)
      end)

    json(conn, %{topics: all_topics, user_topics: user_topics})
  end

  defp render_gazette_entry(entry) do
    actor = entry.remote_actor

    %{
      id: entry.id,
      ap_id: entry.ap_id,
      url: entry.url,
      title: entry.title,
      body_html: entry.body_html,
      tags: entry.tags || [],
      published_at: entry.published_at,
      sensitive: entry.sensitive || false,
      content_warning: entry.content_warning,
      quality_score: Map.get(entry, :gazette_quality_score),
      author: %{
        username: actor && actor.username,
        display_name: actor && (actor.display_name || actor.username),
        avatar_url: actor && actor.avatar_url,
        domain: actor && actor.domain,
        ap_id: actor && actor.ap_id,
        profile_url: get_profile_url(actor)
      },
      engagement: %{
        boosts: entry.boosts_count || 0,
        likes: entry.likes_count || 0,
        replies: entry.reply_count || 0
      }
    }
  end

  defp get_profile_url(%{ap_id: ap_id, url: url}) do
    cond do
      url && url != "" -> url
      ap_id && ap_id != "" -> ap_id
      true -> nil
    end
  end

  defp get_profile_url(_), do: nil

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
  defp parse_int(val, _default) when is_integer(val), do: max(val, 1)
  defp parse_int(_, default), do: default
end
