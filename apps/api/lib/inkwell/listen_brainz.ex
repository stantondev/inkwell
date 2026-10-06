defmodule Inkwell.ListenBrainz do
  @moduledoc """
  "Listening to" from ListenBrainz (roadmap: open and self-hosted music
  support, @michael). A writer saves their ListenBrainz username; the editor's
  Now playing button and the API's `music_from: "listenbrainz"` fill the field
  from that account's public listens. ListenBrainz collects listens from
  Navidrome, Funkwhale, desktop players and anything else that scrobbles, so
  this works wherever the music is actually played.

  Only public endpoints, so no password or token: `playing-now`, and the
  latest listen when nothing is playing. Looked up only when a writer asks,
  cached briefly (ListenBrainz allows about 30 requests per 10 seconds).

  The track is saved with the entry as `music_metadata` (service
  "listenbrainz"); `sanitize/2` re-checks it on every save. Cover art comes
  from the Cover Art Archive via MusicBrainz ids, built from those ids on
  display: no image URL is ever taken from a client.
  """

  alias Inkwell.Federation.Http

  @api "https://api.listenbrainz.org/1"
  @cache :listenbrainz_cache
  @ttl_ms 30_000
  @failure_ttl_ms 10_000
  @uuid ~r/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/

  # MusicBrainz names: no slashes, control characters or surrounding spaces.
  @username ~r/\A[^\/\x00-\x1f\x7f]{1,64}\z/u

  def valid_username?(name) when is_binary(name),
    do: name == String.trim(name) and Regex.match?(@username, name)

  def valid_username?(_), do: false

  @doc "Trims a username and returns it, or nil when it can't be one."
  def clean_username(name) when is_binary(name) do
    name = String.trim(name)
    if valid_username?(name), do: name
  end

  def clean_username(_), do: nil

  @doc """
  What the account is playing now, or else its latest listen.

      {:ok, %{playing_now: true | false, listened_at: DateTime | nil,
              music: "Artist — Track", music_metadata: %{...}}}
      {:error, :not_found | :no_listens | :unavailable}
  """
  def now_playing(username) do
    if valid_username?(username) do
      cached({:now_playing, username}, fn -> fetch_now_playing(username) end)
    else
      {:error, :not_found}
    end
  end

  defp fetch_now_playing(username) do
    path = URI.encode(username, &URI.char_unreserved?/1)

    with {:ok, now} <- api_get("/user/#{path}/playing-now") do
      case listens(now) do
        [listen | _] ->
          track(listen, username, true)

        [] ->
          with {:ok, latest} <- api_get("/user/#{path}/listens?count=1") do
            case listens(latest) do
              [listen | _] -> track(listen, username, false)
              [] -> {:error, :no_listens}
            end
          end
      end
    end
  end

  defp listens(%{"payload" => %{"listens" => list}}) when is_list(list), do: list
  defp listens(_), do: []

  defp track(%{"track_metadata" => meta} = listen, username, playing_now) when is_map(meta) do
    info = if is_map(meta["additional_info"]), do: meta["additional_info"], else: %{}
    mapping = if is_map(meta["mbid_mapping"]), do: meta["mbid_mapping"], else: %{}

    artist = text(meta["artist_name"])
    title = text(meta["track_name"]) || text(mapping["recording_name"])

    if artist && title do
      metadata =
        %{
          "service" => "listenbrainz",
          "artist" => artist,
          "track" => title,
          "release" => text(meta["release_name"]),
          "recording_mbid" => uuid(mapping["recording_mbid"]) || uuid(info["recording_mbid"]),
          "release_mbid" => uuid(mapping["release_mbid"]) || uuid(info["release_mbid"]),
          "caa_release_mbid" => uuid(mapping["caa_release_mbid"]),
          "caa_id" => caa_id(mapping["caa_id"]),
          "username" => username
        }
        |> drop_nils()

      # Some scrobblers send no MusicBrainz ids; an exact search can still
      # find the song, so it gets a cover.
      metadata = with_searched_ids(metadata, artist, title)
      music = label(artist, title)

      {:ok,
       %{
         playing_now: playing_now,
         listened_at: listened_at(listen["listened_at"]),
         music: music,
         music_metadata: Map.put(metadata, "source_url", music)
       }}
    else
      {:error, :no_listens}
    end
  end

  defp track(_, _, _), do: {:error, :no_listens}

  defp with_searched_ids(%{"recording_mbid" => _} = metadata, _artist, _title), do: metadata
  defp with_searched_ids(%{"caa_release_mbid" => _} = metadata, _artist, _title), do: metadata

  defp with_searched_ids(metadata, artist, title) do
    case Inkwell.MusicBrainz.search(artist, title) do
      {:ok, ids} -> Map.merge(ids, metadata)
      _ -> metadata
    end
  end

  @doc "How a track reads in the Listening to field."
  def label(artist, track), do: "#{artist} — #{track}"

  # ── Checking what clients send ──────────────────────────────────────────

  @doc """
  Keeps saved ListenBrainz details only if they're well formed and describe
  exactly the current Listening to text (changing the text drops them, as
  with fediverse players). Ids must be MusicBrainz UUIDs; URLs aren't accepted.
  """
  def sanitize(%{"service" => "listenbrainz"} = meta, music) when is_binary(music) do
    music = String.trim(music)
    artist = text(meta["artist"])
    title = text(meta["track"])

    if artist && title && music != "" && music == String.trim(to_string(meta["source_url"])) do
      %{
        "service" => "listenbrainz",
        "artist" => artist,
        "track" => title,
        "release" => text(meta["release"]),
        "recording_mbid" => uuid(meta["recording_mbid"]),
        "release_mbid" => uuid(meta["release_mbid"]),
        "release_group_mbid" => uuid(meta["release_group_mbid"]),
        "caa_release_mbid" => uuid(meta["caa_release_mbid"]),
        "caa_id" => caa_id(meta["caa_id"]),
        "username" => clean_username(meta["username"]),
        "source_url" => music
      }
      |> drop_nils()
    end
  end

  def sanitize(_meta, _music), do: nil

  # ── Helpers ─────────────────────────────────────────────────────────────

  # Tests set `config :inkwell, :listenbrainz_fetcher` to answer without the network.
  defp api_get(path) do
    fetch = Application.get_env(:inkwell, :listenbrainz_fetcher, &http_get/1)

    case fetch.(@api <> path) do
      {:ok, {200, body}} ->
        case Jason.decode(body) do
          {:ok, %{} = json} -> {:ok, json}
          _ -> {:error, :unavailable}
        end

      {:ok, {404, _}} ->
        {:error, :not_found}

      _ ->
        {:error, :unavailable}
    end
  end

  defp http_get(url), do: Http.get(url, [{~c"accept", ~c"application/json"}], follow_redirects: false)

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

  @doc false
  # Shared with Inkwell.MusicBrainz.
  def clean_text(s), do: text(s)
  @doc false
  def clean_uuid(s), do: uuid(s)

  defp text(s) when is_binary(s) do
    case s |> String.replace(~r/[\x00-\x1f\x7f]/u, " ") |> String.trim() do
      "" -> nil
      t -> String.slice(t, 0, 200)
    end
  end

  defp text(_), do: nil

  defp uuid(s) when is_binary(s) do
    s = String.downcase(String.trim(s))
    if Regex.match?(@uuid, s), do: s
  end

  defp uuid(_), do: nil

  defp caa_id(n) when is_integer(n) and n > 0, do: n

  defp caa_id(s) when is_binary(s) do
    case Integer.parse(s) do
      {n, ""} when n > 0 -> n
      _ -> nil
    end
  end

  defp caa_id(_), do: nil

  defp listened_at(ts) when is_integer(ts) do
    case DateTime.from_unix(ts) do
      {:ok, dt} -> dt
      _ -> nil
    end
  end

  defp listened_at(_), do: nil

  defp drop_nils(map), do: Map.reject(map, fn {_k, v} -> is_nil(v) end)
end
