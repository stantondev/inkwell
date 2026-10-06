defmodule Inkwell.MusicBrainz do
  @moduledoc """
  Songs and albums from MusicBrainz, for "Listening to" (roadmap: open and
  self-hosted music support, @michael, part 2).

  - A pasted MusicBrainz link (`/recording/`, `/release/`, `/release-group/`)
    or ListenBrainz link (`/track/`, `/album/`, the player's `recording_mbids`)
    is looked up once, when the writer pastes it, through the same
    `/api/media/resolve` call as fediverse players, and saved with the entry as
    `music_metadata` (service "musicbrainz"). Readers see a card with the
    title, artist and cover; there's no player, because MusicBrainz knows what
    a song is, not where to stream it.
  - A "Now playing" listen that arrives without MusicBrainz ids is matched by
    a search (exact title and artist only), so it can still get a cover.

  MusicBrainz's API is public (no token) but allows one request a second per
  IP, so requests are spaced out and results cached for a day. Cover art comes
  from the Cover Art Archive, built on display from the ids saved here.
  """

  alias Inkwell.Federation.Http
  alias Inkwell.ListenBrainz

  @api "https://musicbrainz.org/ws/2"
  @cache :musicbrainz_cache
  @ttl_ms :timer.hours(24)
  @failure_ttl_ms :timer.minutes(10)

  # ── Recognising links ─────────────────────────────────────────────────────

  @doc "What a MusicBrainz or ListenBrainz link points at: `{:ok, {kind, mbid}}` or `:error`."
  def parse(url) when is_binary(url) do
    case URI.parse(String.trim(url)) do
      %URI{scheme: scheme, host: host, path: path, query: query}
      when scheme in ["https", "http"] and is_binary(host) ->
        host = host |> String.downcase() |> String.replace_prefix("www.", "")
        segments = String.split(path || "", "/", trim: true)

        cond do
          host in ["musicbrainz.org", "beta.musicbrainz.org"] -> musicbrainz_path(segments)
          host == "listenbrainz.org" -> listenbrainz_path(segments, query)
          true -> :error
        end

      _ ->
        :error
    end
  end

  def parse(_), do: :error

  @doc "A link this module can turn into a song card."
  def link?(url), do: parse(url) != :error

  defp musicbrainz_path(["recording", id | _]), do: with_id(:recording, id)
  defp musicbrainz_path(["release", id | _]), do: with_id(:release, id)
  defp musicbrainz_path(["release-group", id | _]), do: with_id(:release_group, id)
  defp musicbrainz_path(_), do: :error

  defp listenbrainz_path(["track", id | _], _), do: with_id(:recording, id)
  defp listenbrainz_path(["album", id | _], _), do: with_id(:release_group, id)

  defp listenbrainz_path(["player" | _], query) when is_binary(query) do
    case URI.decode_query(query)["recording_mbids"] do
      ids when is_binary(ids) -> ids |> String.split(",") |> List.first() |> then(&with_id(:recording, &1))
      _ -> :error
    end
  end

  defp listenbrainz_path(_, _), do: :error

  defp with_id(kind, id) do
    case ListenBrainz.clean_uuid(id) do
      nil -> :error
      mbid -> {:ok, {kind, mbid}}
    end
  end

  # ── Looking links up ──────────────────────────────────────────────────────

  @doc "The card metadata for a pasted link, or `{:error, reason}`."
  def resolve(url) when is_binary(url) do
    url = String.trim(url)

    with {:ok, {kind, mbid}} <- parse(url),
         {:ok, meta} <- cached({kind, mbid}, fn -> lookup(kind, mbid) end) do
      {:ok, Map.put(meta, "source_url", url)}
    else
      :error -> {:error, :unsupported}
      error -> error
    end
  end

  def resolve(_), do: {:error, :unsupported}

  defp lookup(:recording, mbid) do
    with {:ok, rec} <- api_get("/recording/#{mbid}?inc=artist-credits+releases+release-groups&fmt=json"),
         title when is_binary(title) <- ListenBrainz.clean_text(rec["title"]) do
      release = pick_release(rec["releases"])

      {:ok,
       drop_nils(%{
         "service" => "musicbrainz",
         "kind" => "recording",
         "track" => title,
         "artist" => artist_credit(rec["artist-credit"]),
         "release" => release && ListenBrainz.clean_text(release["title"]),
         "recording_mbid" => mbid,
         "release_mbid" => release && ListenBrainz.clean_uuid(release["id"]),
         "release_group_mbid" => release && ListenBrainz.clean_uuid(get_in(release, ["release-group", "id"]))
       })}
    else
      {:error, _} = error -> error
      _ -> {:error, :not_found}
    end
  end

  defp lookup(:release, mbid) do
    with {:ok, rel} <- api_get("/release/#{mbid}?inc=artist-credits+release-groups&fmt=json"),
         title when is_binary(title) <- ListenBrainz.clean_text(rel["title"]) do
      {:ok,
       drop_nils(%{
         "service" => "musicbrainz",
         "kind" => "release",
         "release" => title,
         "artist" => artist_credit(rel["artist-credit"]),
         "release_mbid" => mbid,
         "release_group_mbid" => ListenBrainz.clean_uuid(get_in(rel, ["release-group", "id"]))
       })}
    else
      {:error, _} = error -> error
      _ -> {:error, :not_found}
    end
  end

  defp lookup(:release_group, mbid) do
    with {:ok, group} <- api_get("/release-group/#{mbid}?inc=artist-credits&fmt=json"),
         title when is_binary(title) <- ListenBrainz.clean_text(group["title"]) do
      {:ok,
       drop_nils(%{
         "service" => "musicbrainz",
         "kind" => "release_group",
         "release" => title,
         "artist" => artist_credit(group["artist-credit"]),
         "release_group_mbid" => mbid
       })}
    else
      {:error, _} = error -> error
      _ -> {:error, :not_found}
    end
  end

  @doc """
  MusicBrainz ids for a song known only by its words (a ListenBrainz listen
  that arrived without ids). Only an exact title and artist match counts, so a
  wrong cover is far less likely than no cover.
  """
  def search(artist, track) when is_binary(artist) and is_binary(track) do
    key = {:search, String.downcase(artist), String.downcase(track)}

    cached(key, fn ->
      query = ~s(recording:"#{lucene(track)}" AND artist:"#{lucene(artist)}")

      with {:ok, %{"recordings" => recordings}} when is_list(recordings) <-
             api_get("/recording/?query=#{URI.encode_www_form(query)}&limit=5&fmt=json") do
        case Enum.find(recordings, &exact_match?(&1, artist, track)) do
          nil ->
            {:error, :no_match}

          rec ->
            release = pick_release(rec["releases"])

            {:ok,
             drop_nils(%{
               "recording_mbid" => ListenBrainz.clean_uuid(rec["id"]),
               "release_mbid" => release && ListenBrainz.clean_uuid(release["id"]),
               "release_group_mbid" => release && ListenBrainz.clean_uuid(get_in(release, ["release-group", "id"]))
             })}
        end
      else
        {:error, _} = error -> error
        _ -> {:error, :no_match}
      end
    end)
  end

  def search(_, _), do: {:error, :no_match}

  defp exact_match?(rec, artist, track) do
    (rec["score"] || 0) >= 90 and
      same?(rec["title"], track) and
      same?(artist_credit(rec["artist-credit"]), artist)
  end

  defp same?(a, b) when is_binary(a) and is_binary(b),
    do: String.downcase(String.trim(a)) == String.downcase(String.trim(b))

  defp same?(_, _), do: false

  # An official release if there is one, else the first.
  defp pick_release(releases) when is_list(releases) and releases != [] do
    Enum.find(releases, &(&1["status"] == "Official")) || hd(releases)
  end

  defp pick_release(_), do: nil

  # "Artist feat. Other" from MusicBrainz's credit list.
  defp artist_credit(credits) when is_list(credits) do
    credits
    |> Enum.map_join(fn c -> to_string(c["name"] || "") <> to_string(c["joinphrase"] || "") end)
    |> ListenBrainz.clean_text()
  end

  defp artist_credit(_), do: nil

  defp lucene(s), do: s |> String.replace("\\", "\\\\") |> String.replace(~s("), ~s(\\"))

  # ── Checking what clients send ────────────────────────────────────────────

  @doc """
  Saved MusicBrainz details are kept only for exactly the link in Listening to,
  and only when their id is the one in that link.
  """
  def sanitize(%{"service" => "musicbrainz"} = meta, music) when is_binary(music) do
    music = String.trim(music)

    with true <- music == String.trim(to_string(meta["source_url"])),
         {:ok, {kind, mbid}} <- parse(music),
         true <- meta["kind"] == Atom.to_string(kind),
         true <- ListenBrainz.clean_uuid(meta[id_field(kind)]) == mbid,
         title when is_binary(title) <- ListenBrainz.clean_text(meta[title_field(kind)]) do
      drop_nils(%{
        "service" => "musicbrainz",
        "kind" => Atom.to_string(kind),
        "track" => kind == :recording && title || nil,
        "release" => ListenBrainz.clean_text(meta["release"]),
        "artist" => ListenBrainz.clean_text(meta["artist"]),
        "recording_mbid" => ListenBrainz.clean_uuid(meta["recording_mbid"]),
        "release_mbid" => ListenBrainz.clean_uuid(meta["release_mbid"]),
        "release_group_mbid" => ListenBrainz.clean_uuid(meta["release_group_mbid"]),
        "source_url" => music
      })
    else
      _ -> nil
    end
  end

  def sanitize(_meta, _music), do: nil

  defp id_field(:recording), do: "recording_mbid"
  defp id_field(:release), do: "release_mbid"
  defp id_field(:release_group), do: "release_group_mbid"

  defp title_field(:recording), do: "track"
  defp title_field(_), do: "release"

  # ── Requests ──────────────────────────────────────────────────────────────

  # Tests set `config :inkwell, :musicbrainz_fetcher`; with
  # `:musicbrainz_network` false (the test default) nothing is fetched.
  defp api_get(path) do
    fetch =
      Application.get_env(:inkwell, :musicbrainz_fetcher) ||
        if Application.get_env(:inkwell, :musicbrainz_network, true), do: &http_get/1

    case fetch && fetch.(@api <> path) do
      {:ok, {200, body}} ->
        case Jason.decode(body) do
          {:ok, %{} = json} -> {:ok, json}
          _ -> {:error, :unavailable}
        end

      {:ok, {status, _}} when status in [400, 404] -> {:error, :not_found}
      nil -> {:error, :unavailable}
      _ -> {:error, :unavailable}
    end
  end

  # MusicBrainz allows one request a second per IP: wait for our turn.
  defp http_get(url) do
    wait_for_turn()
    Http.get(url, [{~c"accept", ~c"application/json"}], follow_redirects: false, timeout: 8_000)
  end

  defp wait_for_turn do
    gap = Application.get_env(:inkwell, :musicbrainz_min_gap_ms, 1_100)
    now = System.monotonic_time(:millisecond)

    slot =
      case :ets.lookup(@cache, :next_slot) do
        [{:next_slot, next}] when next > now -> next
        _ -> now
      end

    :ets.insert(@cache, {:next_slot, slot + gap})
    if slot > now, do: Process.sleep(min(slot - now, 5 * gap))
  end

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

  defp drop_nils(map), do: Map.reject(map, fn {_k, v} -> is_nil(v) or v == false end)
end
