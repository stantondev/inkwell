defmodule Inkwell.Gazette.Conversation do
  @moduledoc """
  "What people are saying": fediverse posts that link to a Gazette story.

  Mastodon serves these publicly at `GET /api/v1/timelines/link?url=` (the
  same list its News tab opens). We ask the server where the story trended,
  only when someone opens the story, and keep the answer for 30 minutes in
  memory. Nothing is stored in the database.
  """

  require Logger

  alias Inkwell.Federation.Http
  alias Inkwell.Gazette.Story

  @table :gazette_conversation_cache
  @ttl_ms 30 * 60 * 1000
  @failure_ttl_ms 5 * 60 * 1000
  @limit 20
  @keep 16

  @doc """
  Posts about the story, most-engaged first. `blocked_domains` are hidden
  (the viewer's domain blocks plus the instance's defederations).
  Returns `{:ok, posts}` or `{:error, reason}`.
  """
  def for_story(%Story{} = story, blocked_domains \\ []) do
    result =
      case cached(story.id) do
        :miss -> fetch_and_cache(story)
        hit -> hit
      end

    with {:ok, posts} <- result, do: {:ok, filter_blocked(posts, blocked_domains)}
  end

  defp fetch_and_cache(story) do
    host = List.first(story.trending_on || []) || "mastodon.social"
    url = "https://#{host}/api/v1/timelines/link?url=#{URI.encode_www_form(story.url)}&limit=#{@limit}"

    result =
      case Http.get(url, [{~c"accept", ~c"application/json"}], follow_redirects: false, timeout: 12_000) do
        {:ok, {200, body}} ->
          case Jason.decode(body) do
            {:ok, list} when is_list(list) -> {:ok, parse(list, host)}
            _ -> {:error, :bad_json}
          end

        # A link that stopped trending can 404 on some Mastodon versions.
        {:ok, {404, _}} ->
          {:ok, []}

        {:ok, {status, _}} ->
          {:error, {:http, status}}

        {:error, reason} ->
          {:error, reason}
      end

    case result do
      {:ok, posts} -> put_cache(story.id, {:ok, posts}, @ttl_ms)
      err -> put_cache(story.id, err, @failure_ttl_ms)
    end

    result
  end

  @doc false
  def parse(statuses, host) do
    statuses
    |> Enum.filter(&keep?/1)
    |> Enum.map(&to_post(&1, host))
    |> Enum.reject(&is_nil/1)
    |> Enum.uniq_by(& &1.url)
    |> Enum.sort_by(fn p -> {p.reply?, -(p.boosts + p.likes)} end)
    |> Enum.take(@keep)
  end

  defp keep?(%{"visibility" => v}) when v not in ["public", nil], do: false
  defp keep?(%{"sensitive" => true}), do: false
  defp keep?(%{"account" => %{"bot" => true}}), do: false
  defp keep?(%{"reblog" => r}) when not is_nil(r), do: false
  defp keep?(%{"account" => %{}, "content" => c}) when is_binary(c), do: true
  defp keep?(_), do: false

  defp to_post(s, host) do
    account = s["account"]
    acct = full_acct(account["acct"], host)
    url = s["url"] || s["uri"]

    if is_binary(url) and String.starts_with?(url, "https://") do
      %{
        id: to_string(s["id"]),
        url: url,
        content_html: Inkwell.HtmlSanitizer.sanitize(s["content"] || ""),
        created_at: s["created_at"],
        reply?: not is_nil(s["in_reply_to_id"]),
        boosts: int(s["reblogs_count"]),
        likes: int(s["favourites_count"]),
        replies: int(s["replies_count"]),
        author: %{
          display_name: display_name(account),
          acct: acct,
          domain: acct |> String.split("@") |> List.last(),
          avatar_url: https(account["avatar_static"] || account["avatar"]),
          profile_url: https(account["url"])
        }
      }
    end
  end

  defp filter_blocked(posts, []), do: posts

  defp filter_blocked(posts, domains) do
    Enum.reject(posts, fn p ->
      Enum.any?(domains, fn d -> p.author.domain == d or String.ends_with?(p.author.domain, "." <> d) end)
    end)
  end

  # Mastodon's `acct` is bare ("alice") for the server's own accounts.
  defp full_acct(acct, host) when is_binary(acct) do
    if String.contains?(acct, "@"), do: acct, else: "#{acct}@#{host}"
  end

  defp full_acct(_, host), do: "unknown@#{host}"

  # Custom emoji arrive as ":shortcode:" in display names; drop them.
  defp display_name(account) do
    name =
      (account["display_name"] || "")
      |> String.replace(~r/:[a-zA-Z0-9_+-]+:/, "")
      |> String.replace(~r/\s+/u, " ")
      |> String.trim()

    if name == "", do: account["username"] || "someone", else: name
  end

  defp https(url) when is_binary(url) do
    if String.starts_with?(url, "https://"), do: url, else: nil
  end

  defp https(_), do: nil

  defp int(n) when is_integer(n) and n >= 0, do: n
  defp int(_), do: 0

  defp cached(id) do
    now = System.monotonic_time(:millisecond)

    case :ets.lookup(@table, id) do
      [{^id, expires, {:ok, posts}}] when expires > now -> {:ok, posts}
      # A recent failure isn't retried for a few minutes.
      [{^id, expires, {:error, reason}}] when expires > now -> {:error, reason}
      _ -> :miss
    end
  rescue
    ArgumentError -> :miss
  end

  defp put_cache(id, value, ttl) do
    :ets.insert(@table, {id, System.monotonic_time(:millisecond) + ttl, value})
  rescue
    ArgumentError -> :ok
  end
end
