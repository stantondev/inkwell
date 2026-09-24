defmodule InkwellWeb.GazetteController do
  use InkwellWeb, :controller

  alias Inkwell.{Avatars, Gazette, Redactions}
  alias Inkwell.Gazette.{Conversation, Editions, Topics, Trends}
  alias Inkwell.Moderation.FediverseBlocks

  # GET /api/gazette — the latest edition, or ?edition=N
  def index(conn, params) do
    viewer = conn.assigns[:current_user]

    requested = params["edition"]

    edition =
      case parse_int(requested) do
        nil -> Editions.latest()
        n -> Editions.get_by_number(n)
      end

    case edition do
      nil when is_nil(requested) ->
        json(conn, %{edition: nil, stories: [], responses: [], sections: section_list(), my_sections: my_sections(viewer)})

      nil ->
        conn |> put_status(:not_found) |> json(%{error: "No such edition"})

      edition ->
        {prev, next} = Editions.neighbours(edition)
        blocked = blocked_domains(viewer)
        words = if viewer, do: Redactions.get_redacted_words(viewer), else: []

        items =
          edition
          |> Editions.items()
          |> Enum.reject(&blocked_url?(&1["url"], blocked))
          |> Enum.reject(fn i -> words != [] and Redactions.matches_redaction?("#{i["title"]} #{i["description"]}", words) end)

        ids = Enum.map(items, & &1["id"])
        counts = Gazette.response_counts(ids)
        exclude = if viewer, do: Inkwell.Social.get_blocked_user_ids(viewer.id), else: []

        stories = Enum.map(items, &Map.put(&1, "response_count", Map.get(counts, &1["id"], 0)))

        json(conn, %{
          edition: %{
            number: edition.number,
            slot: edition.slot,
            published_at: edition.published_at,
            story_count: length(stories),
            publisher_count: stories |> Enum.map(& &1["provider_name"]) |> Enum.uniq() |> length(),
            people_sharing: stories |> Enum.map(&(&1["shares_today"] || 0)) |> Enum.sum(),
            previous_number: prev,
            next_number: next,
            latest: is_nil(next)
          },
          stories: stories,
          responses: Gazette.recent_responses(ids, exclude_user_ids: exclude) |> Enum.map(&render_response/1),
          sections: section_list(),
          my_sections: my_sections(viewer),
          method: method()
        })
    end
  end

  # GET /api/gazette/editions — the archive
  def editions(conn, params) do
    page = parse_int(params["page"]) || 1
    {editions, total} = Editions.list(page, 30)

    json(conn, %{
      data:
        Enum.map(editions, fn e ->
          lead = e |> Editions.items() |> List.first()

          %{
            number: e.number,
            slot: e.slot,
            published_at: e.published_at,
            story_count: e.story_count,
            lead: lead && %{title: lead["title"], provider_name: lead["provider_name"], image_url: lead["image_url"]}
          }
        end),
      pagination: %{page: page, per_page: 30, total: total}
    })
  end

  # GET /api/gazette/stories/:id
  def story(conn, %{"id" => id}) do
    viewer = conn.assigns[:current_user]

    case Gazette.get_story(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Story not found"})

      story ->
        if blocked_url?(story.url, blocked_domains(viewer)) do
          conn |> put_status(:not_found) |> json(%{error: "Story not found"})
        else
          exclude = if viewer, do: Inkwell.Social.get_blocked_user_ids(viewer.id), else: []

          json(conn, %{
            data: render_story(story),
            responses: story |> Gazette.responses_for(exclude_user_ids: exclude) |> Enum.map(&render_response/1),
            sections: section_list()
          })
        end
    end
  end

  # GET /api/gazette/stories/:id/conversation
  def conversation(conn, %{"id" => id}) do
    viewer = conn.assigns[:current_user]

    case Gazette.get_story(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Story not found"})

      story ->
        case Conversation.for_story(story, blocked_domains(viewer)) do
          {:ok, posts} ->
            json(conn, %{data: posts, source: List.first(story.trending_on || []) || "mastodon.social"})

          {:error, _} ->
            conn |> put_status(:bad_gateway) |> json(%{error: "Couldn't reach the fediverse just now"})
        end
    end
  end

  # GET /api/gazette/topics
  def topics(conn, _params) do
    json(conn, %{topics: section_list(), user_topics: my_sections(conn.assigns[:current_user])})
  end

  # ── rendering ───────────────────────────────────────────────────────

  defp render_story(s) do
    %{
      id: s.id,
      url: s.url,
      title: s.title,
      description: s.description,
      image_url: s.image_url,
      image_description: s.image_description,
      provider_name: s.provider_name,
      provider_url: s.provider_url,
      author_name: s.author_name,
      article_published_at: s.article_published_at,
      opinion: s.opinion,
      topics: s.topics,
      shares_today: s.shares_today,
      shares_week: s.shares_week,
      trending_on: s.trending_on,
      first_seen_at: s.first_seen_at,
      last_seen_at: s.last_seen_at
    }
  end

  defp render_response(entry) do
    user = entry.user

    %{
      id: entry.id,
      title: entry.title,
      slug: entry.slug,
      excerpt: entry.excerpt,
      kind: entry.kind,
      published_at: entry.published_at,
      word_count: entry.word_count,
      gazette_story_id: entry.gazette_story_id,
      author: %{
        username: user.username,
        display_name: user.display_name || user.username,
        avatar_url: Avatars.avatar_url(user),
        avatar_frame: user.avatar_frame
      }
    }
  end

  # Methodology shown at the foot of the page, generated from the real
  # settings so the explanation can't drift from what the code does.
  defp method do
    %{
      sources: Trends.sources(),
      per_publisher: Editions.max_per_publisher()
    }
  end

  defp section_list do
    Enum.map(Topics.list_topics(), &Map.take(&1, [:id, :label]))
  end

  defp my_sections(nil), do: []
  defp my_sections(viewer), do: Topics.get_user_topics(viewer)

  defp blocked_domains(nil) do
    FediverseBlocks.list_admin_blocked_domains() |> Enum.map(&String.downcase(&1.domain))
  end

  defp blocked_domains(viewer) do
    FediverseBlocks.get_all_blocks_for_user(viewer.id).blocked_domains |> Enum.map(&String.downcase/1)
  end

  defp blocked_url?(_url, []), do: false

  defp blocked_url?(url, domains) when is_binary(url) do
    case URI.parse(url) do
      %URI{host: host} when is_binary(host) ->
        Enum.any?(domains, fn d -> host == d or String.ends_with?(host, "." <> d) end)

      _ ->
        false
    end
  end

  defp blocked_url?(_, _), do: false

  defp parse_int(nil), do: nil

  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, ""} when n > 0 -> n
      _ -> nil
    end
  end

  defp parse_int(_), do: nil
end
