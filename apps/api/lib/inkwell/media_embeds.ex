defmodule Inkwell.MediaEmbeds do
  @moduledoc """
  Players for fediverse media links in an entry's media field: PeerTube videos,
  Funkwhale music, Castopod podcast episodes and Owncast live streams (roadmap
  item from @strypey). These run on thousands of independent servers, so unlike
  YouTube they can't be recognised by domain.

  `resolve/1` runs only when a writer pastes a link. It asks the server what
  software it runs (NodeInfo) and gets the player from that same server's
  oEmbed, then the result is saved with the entry (`music_metadata`). Readers
  never cause a lookup, and the player streams straight from the other server,
  so none of the media passes through Inkwell.

  Castopod has no usable NodeInfo, so an episode link is accepted when its own
  server answers the episode's oEmbed with a player on that same server.

  `sanitize/2` re-checks saved metadata without any network call: the player
  must be on the link's own server, at that software's player path.
  """

  alias Inkwell.Federation.Http

  @services ~w(peertube funkwhale castopod owncast)
  @cache :media_embed_cache
  @ttl_ms :timer.hours(24)
  @failure_ttl_ms :timer.minutes(10)

  @labels %{
    "peertube" => "PeerTube",
    "funkwhale" => "Funkwhale",
    "castopod" => "Castopod",
    "owncast" => "Owncast"
  }

  @doc "Resolve a pasted link to player metadata, or `{:error, reason}`."
  def resolve(url) when is_binary(url) do
    url = String.trim(url)

    with {:ok, uri} <- parse(url) do
      cached(url, fn -> do_resolve(uri, url) end)
    end
  end

  def resolve(_), do: {:error, :invalid_url}

  @doc """
  Metadata from a client is kept only if it describes a player for `music` on
  that link's own server; anything else becomes nil.
  """
  def sanitize(meta, music) when is_map(meta) and is_binary(music) do
    with service when service in @services <- meta["service"],
         embed when is_binary(embed) <- meta["embed_url"],
         {:ok, link} <- parse(String.trim(music)),
         {:ok, player} <- parse(embed),
         true <- player.host == link.host,
         true <- player_path?(service, player.path || "") do
      %{
        "service" => service,
        "embed_url" => embed,
        "label" => @labels[service],
        "title" => meta["title"] |> string_or_nil() |> truncate(200),
        "height" => clamp_height(meta["height"]),
        "aspect" => if(meta["aspect"] == "video", do: "video"),
        "source_url" => String.trim(music)
      }
      |> Map.reject(fn {_k, v} -> is_nil(v) end)
    else
      _ -> nil
    end
  end

  def sanitize(_meta, _music), do: nil

  # ── Resolution ──────────────────────────────────────────────────────────

  defp do_resolve(uri, url) do
    case software(uri.host) do
      "peertube" ->
        uri |> oembed("https://#{uri.host}/services/oembed", url) |> player("peertube", uri, url)

      "funkwhale" ->
        # Funkwhale 2 moved oEmbed to /api/v2; older servers still use v1.
        case oembed(uri, "https://#{uri.host}/api/v2/oembed/", url) do
          {:ok, _} = ok -> player(ok, "funkwhale", uri, url)
          _ -> uri |> oembed("https://#{uri.host}/api/v1/oembed/", url) |> player("funkwhale", uri, url)
        end

      "owncast" ->
        if uri.path in [nil, "", "/"] do
          meta("owncast", "https://#{uri.host}/embed/video/", url, title: nil, height: nil, aspect: "video")
        else
          {:error, :unsupported}
        end

      _ ->
        if castopod_episode?(uri) do
          json_get("#{String.trim_trailing(url, "/")}/oembed.json") |> player("castopod", uri, url)
        else
          {:error, :unsupported}
        end
    end
  end

  defp oembed(_uri, endpoint, url),
    do: json_get(endpoint <> "?" <> URI.encode_query(%{"format" => "json", "url" => url}))

  # Builds metadata from an oEmbed answer, keeping the player only if it's on
  # the link's own server at that software's player path.
  defp player({:ok, %{"html" => html} = oembed}, service, uri, url) when is_binary(html) do
    with [_, src] <- Regex.run(~r/<iframe[^>]+src="([^"]+)"/i, html),
         src = String.replace(src, "&amp;", "&"),
         {:ok, player} <- parse(src),
         true <- player.host == uri.host and player_path?(service, player.path || "") do
      video? = oembed["type"] == "video" or service == "peertube"

      meta(service, src, url,
        title: oembed["title"],
        height: if(video?, do: nil, else: oembed["height"]),
        aspect: if(video?, do: "video")
      )
    else
      _ -> {:error, :no_player}
    end
  end

  defp player(_, _service, _uri, _url), do: {:error, :no_player}

  defp meta(service, embed_url, url, opts) do
    %{
      "service" => service,
      "embed_url" => embed_url,
      "title" => opts[:title],
      "height" => opts[:height],
      "aspect" => opts[:aspect]
    }
    |> sanitize(url)
    |> case do
      nil -> {:error, :no_player}
      meta -> {:ok, meta}
    end
  end

  # What software a server runs, from its NodeInfo. Funkwhale 2 labels its
  # NodeInfo link with a non-standard rel, so any NodeInfo link on the same
  # server is accepted when the standard one is missing.
  defp software(host) do
    cached({:software, host}, fn ->
      with {:ok, %{"links" => links}} when is_list(links) <- json_get("https://#{host}/.well-known/nodeinfo"),
           href when is_binary(href) <- nodeinfo_href(links, host),
           {:ok, %{"software" => %{"name" => name}}} when is_binary(name) <- json_get(href) do
        {:ok, String.downcase(name)}
      else
        _ -> {:error, :unknown}
      end
    end)
    |> case do
      {:ok, name} -> name
      _ -> nil
    end
  end

  defp nodeinfo_href(links, host) do
    hrefs =
      for %{"href" => href} = link <- links,
          is_binary(href),
          URI.parse(href).host == host,
          do: {link["rel"] || "", href}

    standard = for {rel, href} <- hrefs, rel =~ "nodeinfo.diaspora.software/ns/schema/2", do: href
    any = for {_rel, href} <- hrefs, href =~ "nodeinfo", do: href

    List.last(standard) || List.first(any)
  end

  defp castopod_episode?(%URI{path: path}) when is_binary(path),
    do: Regex.match?(~r{^/@[^/]+/episodes/[^/]+/?$}, path)

  defp castopod_episode?(_), do: false

  defp player_path?("peertube", path), do: String.starts_with?(path, "/videos/embed/")
  defp player_path?("funkwhale", path), do: path in ["/embed.html", "/front/embed.html"]
  defp player_path?("castopod", path), do: Regex.match?(~r{^/@[^/]+/episodes/[^/]+/embed(/[a-z-]+)?$}, path)
  defp player_path?("owncast", path), do: String.starts_with?(path, "/embed/video")
  defp player_path?(_, _), do: false

  # ── Helpers ─────────────────────────────────────────────────────────────

  defp parse(url) do
    case URI.parse(url) do
      %URI{scheme: "https", host: host} = uri when is_binary(host) and host != "" -> {:ok, uri}
      _ -> {:error, :invalid_url}
    end
  end

  defp json_get(url) do
    case Http.get(url, [{~c"accept", ~c"application/json"}], follow_redirects: false) do
      {:ok, {200, body}} ->
        case Jason.decode(body) do
          {:ok, json} when is_map(json) -> {:ok, json}
          _ -> {:error, :bad_json}
        end

      {:ok, {status, _}} ->
        {:error, {:http, status}}

      error ->
        error
    end
  end

  # Results (and, briefly, failures) are remembered so repeat pastes and a
  # busy writer don't send the same requests again.
  defp cached(key, fun) do
    now = System.monotonic_time(:millisecond)

    case :ets.lookup(@cache, key) do
      [{^key, result, expires}] when expires > now ->
        result

      _ ->
        result = fun.()
        ttl = if match?({:ok, _}, result), do: @ttl_ms, else: @failure_ttl_ms
        :ets.insert(@cache, {key, result, now + ttl})
        result
    end
  end

  defp string_or_nil(s) when is_binary(s) and s != "", do: s
  defp string_or_nil(_), do: nil

  defp truncate(nil, _), do: nil
  defp truncate(s, n), do: String.slice(s, 0, n)

  defp clamp_height(h) when is_integer(h), do: h |> max(60) |> min(600)

  defp clamp_height(h) when is_binary(h) do
    case Integer.parse(h) do
      {n, _} -> clamp_height(n)
      :error -> nil
    end
  end

  defp clamp_height(_), do: nil
end
