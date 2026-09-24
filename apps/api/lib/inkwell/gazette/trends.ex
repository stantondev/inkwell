defmodule Inkwell.Gazette.Trends do
  @moduledoc """
  Fills the Gazette from the links the fediverse is sharing.

  Every Mastodon server publishes its trending links at
  `GET /api/v1/trends/links` without sign-in: the article's own headline,
  description and image (from its Open Graph card), the publisher, and how
  many different accounts shared it each day. We read that list from a few
  servers, merge the same article seen on several of them, and keep one
  `gazette_stories` row per article.

  The ranking signal is people sharing a link — no engagement model, no AI.
  One small request per server per run; nothing is fetched from publishers.
  """

  require Logger
  import Ecto.Query

  alias Inkwell.Repo
  alias Inkwell.Federation.Http
  alias Inkwell.Gazette.{Classifier, Story}

  # General servers plus two journalism servers, so the paper isn't only what
  # mastodon.social's crowd shares. Override with GAZETTE_TREND_SOURCES.
  @default_sources ~w(
    mastodon.social
    mastodon.online
    mstdn.social
    mas.to
    hachyderm.io
    infosec.exchange
    journa.host
    newsie.social
  )

  @tracking_params ~w(utm_source utm_medium utm_campaign utm_term utm_content utm_name
                      fbclid gclid mc_cid mc_eid cmpid ref_src ref at_medium at_campaign)

  def sources do
    case Application.get_env(:inkwell, :gazette_trend_sources) do
      list when is_list(list) and list != [] -> list
      _ -> @default_sources
    end
  end

  @doc """
  Reads every source, merges and stores the stories.
  Returns `{:ok, %{fetched: n, stored: n, failed_sources: [host]}}`.
  """
  def ingest do
    results =
      sources()
      |> Task.async_stream(&fetch_source/1, timeout: 15_000, on_timeout: :kill_task, max_concurrency: 4)
      |> Enum.zip(sources())
      |> Enum.map(fn
        {{:ok, {:ok, links}}, host} -> {host, links}
        {_, host} -> {host, :error}
      end)

    failed = for {host, :error} <- results, do: host
    links = for {host, list} when is_list(list) <- results, link <- list, do: {host, link}

    merged = merge(links)
    now = DateTime.utc_now()
    blocked = blocked_domains()

    stored =
      merged
      |> Enum.reject(&blocked_host?(&1.url, blocked))
      |> Enum.count(fn attrs -> match?({:ok, _}, upsert(attrs, now)) end)

    if failed != [], do: Logger.info("Gazette trends: no answer from #{Enum.join(failed, ", ")}")
    Logger.info("Gazette trends: #{length(links)} links from #{length(sources()) - length(failed)} servers, #{stored} stories stored")

    {:ok, %{fetched: length(links), stored: stored, failed_sources: failed}}
  end

  @doc "Fetches one server's trending links, parsed into story attrs."
  def fetch_source(host) do
    url = "https://#{host}/api/v1/trends/links?limit=20"

    case Http.get(url, [{~c"accept", ~c"application/json"}], follow_redirects: false) do
      {:ok, {200, body}} ->
        case Jason.decode(body) do
          {:ok, list} when is_list(list) -> {:ok, Enum.flat_map(list, &parse_link/1)}
          _ -> {:error, :bad_json}
        end

      {:ok, {status, _}} ->
        {:error, {:http, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc false
  # One entry of Mastodon's trends/links response → story attrs (or []).
  def parse_link(%{"url" => url, "title" => title} = link) when is_binary(url) and is_binary(title) do
    title = clean_text(title, 300)

    with {:ok, url} <- normalize_url(url),
         true <- title != "" do
      history = link["history"] || []

      [
        %{
          url: url,
          title: title,
          description: link["description"] |> clean_text(600) |> blank_to_nil(),
          image_url: https_or_nil(link["image"]),
          image_description: link["image_description"] |> clean_text(400) |> blank_to_nil(),
          blurhash: link["blurhash"] |> clean_text(100) |> blank_to_nil(),
          provider_name: (link["provider_name"] |> clean_text(120) |> blank_to_nil()) || host_label(url),
          provider_url: https_or_nil(link["provider_url"]),
          author_name: link["author_name"] |> clean_text(120) |> blank_to_nil(),
          language: link["language"] |> clean_text(16) |> blank_to_nil(),
          article_published_at: parse_time(link["published_at"]),
          shares_today: history |> List.first() |> accounts(),
          shares_week: history |> Enum.map(&accounts/1) |> Enum.sum()
        }
      ]
    else
      _ -> []
    end
  end

  def parse_link(_), do: []

  @doc false
  # The same article trending on several servers → one story. Share counts
  # overlap between servers (each counts every account it saw share the link,
  # local or not), so we take the highest rather than adding them up.
  def merge(host_links) do
    host_links
    |> Enum.group_by(fn {_host, link} -> link.url end)
    |> Enum.map(fn {_url, group} ->
      hosts = group |> Enum.map(&elem(&1, 0)) |> Enum.uniq()
      links = Enum.map(group, &elem(&1, 1))
      best = Enum.max_by(links, & &1.shares_today)

      filled =
        Enum.reduce(links, best, fn link, acc ->
          Map.merge(acc, link, fn _k, a, b -> if is_nil(a), do: b, else: a end)
        end)

      filled
      |> Map.put(:shares_today, links |> Enum.map(& &1.shares_today) |> Enum.max())
      |> Map.put(:shares_week, links |> Enum.map(& &1.shares_week) |> Enum.max())
      |> Map.put(:trending_on, hosts)
      |> Map.put(:topics, Classifier.topics(filled))
      |> Map.put(:opinion, Classifier.opinion?(filled.url))
    end)
  end

  defp upsert(attrs, now) do
    case Repo.get_by(Story, url: attrs.url) do
      nil ->
        %Story{}
        |> Story.changeset(Map.merge(attrs, %{first_seen_at: now, last_seen_at: now}))
        |> Repo.insert()

      story ->
        story
        |> Story.changeset(Map.put(attrs, :last_seen_at, now))
        |> Repo.update()
    end
  rescue
    e ->
      Logger.warning("Gazette trends: could not store #{attrs.url}: #{Exception.message(e)}")
      {:error, e}
  end

  @doc "Deletes stories nobody has seen trend for `days` days, unless an entry responds to one."
  def prune(days \\ 14) do
    cutoff = DateTime.add(DateTime.utc_now(), -days, :day)

    {count, _} =
      Story
      |> where([s], s.last_seen_at < ^cutoff)
      |> where([s], fragment("NOT EXISTS (SELECT 1 FROM entries e WHERE e.gazette_story_id = ?)", s.id))
      |> Repo.delete_all()

    {:ok, count}
  end

  # ── helpers ──────────────────────────────────────────────────────────

  @doc false
  def normalize_url(url) do
    case URI.parse(String.trim(url)) do
      %URI{scheme: scheme, host: host} = uri when scheme in ["http", "https"] and is_binary(host) and host != "" ->
        query =
          case uri.query do
            nil ->
              nil

            q ->
              kept =
                q
                |> URI.decode_query()
                |> Enum.reject(fn {k, _} -> String.downcase(k) in @tracking_params end)

              if kept == [], do: nil, else: URI.encode_query(kept)
          end

        {:ok, URI.to_string(%URI{uri | scheme: "https", host: String.downcase(host), query: query, fragment: nil})}

      _ ->
        :error
    end
  end

  defp accounts(%{"accounts" => n}) when is_integer(n), do: n

  defp accounts(%{"accounts" => n}) when is_binary(n) do
    case Integer.parse(n) do
      {i, _} -> i
      :error -> 0
    end
  end

  defp accounts(_), do: 0

  defp clean_text(nil, _max), do: ""

  defp clean_text(text, max) when is_binary(text) do
    text
    |> String.replace(~r/<[^>]*>/, " ")
    |> decode_entities()
    |> String.replace(~r/\s+/u, " ")
    |> String.trim()
    |> String.slice(0, max)
  end

  defp clean_text(_, _), do: ""

  defp decode_entities(text) do
    text
    |> String.replace(~r/&#(\d+);/, fn m ->
      [_, n] = Regex.run(~r/&#(\d+);/, m)
      safe_codepoint(String.to_integer(n))
    end)
    |> String.replace(~r/&#x([0-9a-fA-F]+);/, fn m ->
      [_, n] = Regex.run(~r/&#x([0-9a-fA-F]+);/, m)
      safe_codepoint(String.to_integer(n, 16))
    end)
    # Named entities (&ntilde;, &rsquo;, &amp; …) via mochiweb, which
    # html_sanitize_ex already depends on.
    |> String.replace(~r/&([a-zA-Z][a-zA-Z0-9]{1,31});/, fn m ->
      name = m |> String.slice(1..-2//1) |> String.to_charlist()

      case :mochiweb_charref.charref(name) do
        cp when is_integer(cp) -> safe_codepoint(cp)
        [_ | _] = cps -> cps |> Enum.map(&safe_codepoint/1) |> Enum.join()
        _ -> m
      end
    end)
  end

  defp safe_codepoint(n) when n > 0 and n < 0x110000 and (n < 0xD800 or n > 0xDFFF), do: <<n::utf8>>
  defp safe_codepoint(_), do: ""

  defp blank_to_nil(""), do: nil
  defp blank_to_nil(s), do: s

  defp https_or_nil(url) when is_binary(url) do
    if String.starts_with?(url, "https://") and String.length(url) < 2000, do: url, else: nil
  end

  defp https_or_nil(_), do: nil

  defp host_label(url) do
    case URI.parse(url) do
      %URI{host: host} when is_binary(host) -> String.replace_prefix(host, "www.", "")
      _ -> nil
    end
  end

  defp parse_time(s) when is_binary(s) do
    case DateTime.from_iso8601(s) do
      {:ok, dt, _} -> dt
      _ -> nil
    end
  end

  defp parse_time(_), do: nil

  defp blocked_domains do
    Inkwell.Moderation.FediverseBlocks.list_admin_blocked_domains()
    |> Enum.map(&String.downcase(&1.domain))
  rescue
    _ -> []
  end

  defp blocked_host?(url, blocked) do
    case URI.parse(url) do
      %URI{host: host} when is_binary(host) ->
        Enum.any?(blocked, fn d -> host == d or String.ends_with?(host, "." <> d) end)

      _ ->
        false
    end
  end
end
