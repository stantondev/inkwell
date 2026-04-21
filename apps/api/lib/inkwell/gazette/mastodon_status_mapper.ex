defmodule Inkwell.Gazette.MastodonStatusMapper do
  @moduledoc """
  Converts Mastodon API v1 status payloads (from
  `/api/v1/timelines/tag/:hashtag`) into `remote_entries` rows tagged with
  `source: "hashtag"` so the Gazette can surface them.

  Reuses the same quality filters (bot/short/link-only/mojibake checks) and
  HTML sanitization that the relay pipeline applies, so hashtag-sourced
  content is held to the same bar as relay-sourced content.
  """

  require Logger

  alias Inkwell.Federation.{RemoteActor, RemoteEntries}

  @min_word_count 30
  @bot_username_patterns ~w[
    rssbot fanbot newsbot feedbot mirrorbot
    rss_bot feed_bot news_bot mirror_bot
    bot@ relay activityrelay
  ]

  @doc """
  Processes a single Mastodon status. Returns one of:

  - `:stored`   — new `remote_entries` row inserted
  - `:updated`  — existing row updated (already stored from prior cycle)
  - `:skipped`  — filtered out (reply, non-public, failed quality check, etc.)
  - `{:error, reason}` — actor fetch or DB failure
  """
  def process_status(status) when is_map(status) do
    cond do
      reply?(status) ->
        :skipped

      not public?(status) ->
        :skipped

      true ->
        case derive_actor_ap_uri(status) do
          nil ->
            Logger.debug("MastodonStatusMapper: could not derive actor AP URI from status #{inspect(status["uri"])}")
            :skipped

          actor_uri ->
            store_with_actor(status, actor_uri)
        end
    end
  end

  def process_status(_), do: :skipped

  # ── Actor lookup ────────────────────────────────────────────────────────

  defp store_with_actor(status, actor_uri) do
    case RemoteActor.fetch(actor_uri) do
      {:ok, remote_actor} ->
        cond do
          mastodon_bot_flag?(status) ->
            :skipped

          bot_actor?(remote_actor) ->
            :skipped

          not passes_quality_check?(status) ->
            :skipped

          true ->
            upsert(status, remote_actor)
        end

      {:error, reason} ->
        Logger.debug("MastodonStatusMapper: actor fetch failed for #{actor_uri}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp upsert(status, remote_actor) do
    attrs = to_remote_entry_attrs(status, remote_actor)

    case RemoteEntries.upsert_remote_entry(attrs) do
      {:ok, :self_domain_skipped} ->
        :skipped

      {:ok, _entry} ->
        # Cheap signal of whether it was insert vs update: check if the entry
        # already existed before the call. We don't need this precision for
        # the caller, so collapse both to :stored.
        :stored

      {:error, reason} ->
        Logger.warning("MastodonStatusMapper: upsert failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Pure transformer from a Mastodon status + resolved RemoteActor into the
  attrs map expected by `RemoteEntries.upsert_remote_entry/1`. Exposed for
  unit testing without hitting the network or the DB.
  """
  def to_remote_entry_attrs(status, remote_actor) do
    tags = extract_hashtags(status["tags"])
    is_sensitive = status["sensitive"] == true
    content_warning = status["spoiler_text"]

    # Use the status `uri` (AP URI) as ap_id — that's what federation stores.
    ap_id = status["uri"] || status["url"]
    url = status["url"] || status["uri"]

    body_html =
      (status["content"] || "")
      |> Inkwell.HtmlSanitizer.sanitize()

    %{
      ap_id: ap_id,
      url: url,
      title: nil,
      body_html: body_html,
      tags: tags,
      published_at: parse_datetime(status["created_at"]),
      remote_actor_id: remote_actor.id,
      sensitive: is_sensitive,
      content_warning: if(is_sensitive and is_binary(content_warning) and content_warning != "", do: content_warning, else: nil),
      likes_count: int_or_zero(status["favourites_count"]),
      boosts_count: int_or_zero(status["reblogs_count"]),
      reply_count: int_or_zero(status["replies_count"]),
      source: "hashtag",
      relay_subscription_id: nil
    }
  end

  # ── Helpers ─────────────────────────────────────────────────────────────

  defp reply?(%{"in_reply_to_id" => id}) when not is_nil(id), do: true
  defp reply?(_), do: false

  # Public statuses only. Mastodon visibility: public/unlisted/private/direct.
  # Unlisted is still federation-public but excluded from hashtag timelines by
  # the source server anyway — defense in depth.
  defp public?(%{"visibility" => "public"}), do: true
  defp public?(%{"visibility" => _}), do: false
  # If visibility not present (non-Mastodon implementations), trust the
  # hashtag endpoint returned it publicly.
  defp public?(_), do: true

  # Mastodon API: `account.bot` boolean flag set by the user.
  defp mastodon_bot_flag?(%{"account" => %{"bot" => true}}), do: true
  defp mastodon_bot_flag?(_), do: false

  @doc false
  def derive_actor_ap_uri(%{"uri" => uri}) when is_binary(uri) do
    # Mastodon post URIs follow: https://host/users/{username}/statuses/{id}
    # Strip the trailing `/statuses/{id}` to get the actor AP URI.
    case Regex.run(~r{^(.+)/statuses/[^/]+/?$}, uri) do
      [_, actor_uri] -> actor_uri
      _ -> nil
    end
  end

  def derive_actor_ap_uri(_), do: nil

  defp extract_hashtags(tags) when is_list(tags) do
    tags
    |> Enum.map(fn
      %{"name" => name} when is_binary(name) -> name |> String.trim_leading("#") |> String.downcase()
      _ -> nil
    end)
    |> Enum.reject(&(&1 == nil or &1 == ""))
    |> Enum.uniq()
  end

  defp extract_hashtags(_), do: []

  defp parse_datetime(nil), do: nil

  defp parse_datetime(str) when is_binary(str) do
    case DateTime.from_iso8601(str) do
      {:ok, dt, _offset} -> dt
      _ -> nil
    end
  end

  defp parse_datetime(_), do: nil

  defp int_or_zero(n) when is_integer(n) and n >= 0, do: n
  defp int_or_zero(_), do: 0

  # ── Quality checks (mirror of RelayContentWorker) ──────────────────────

  defp passes_quality_check?(status) do
    content = status["content"] || ""

    cond do
      mojibake?(content) -> false
      too_short?(content) -> false
      link_only?(content) -> false
      true -> true
    end
  end

  defp bot_actor?(remote_actor) do
    actor_type =
      case remote_actor.raw_data do
        %{"type" => t} when is_binary(t) -> t
        _ -> "Person"
      end

    if actor_type in ~w[Service Application] do
      true
    else
      bot_username?(remote_actor)
    end
  end

  defp bot_username?(remote_actor) do
    username = String.downcase(remote_actor.username || "")
    display_name = String.downcase(remote_actor.display_name || "")

    Enum.any?(@bot_username_patterns, &String.contains?(username, &1)) or
      String.ends_with?(display_name, "bot") or
      String.ends_with?(display_name, "[bot]")
  end

  defp mojibake?(content) do
    plain = strip_html(content)
    len = String.length(plain)

    if len < 20 do
      false
    else
      mojibake_count =
        count_occurrences(plain, "Ã") +
          count_occurrences(plain, "â€") +
          count_occurrences(plain, "Â") +
          count_cyrillic_mojibake(plain)

      mojibake_count * 3 > len
    end
  end

  defp count_occurrences(string, pattern) do
    string |> String.split(pattern) |> length() |> Kernel.-(1) |> max(0)
  end

  defp count_cyrillic_mojibake(text) do
    matches = Regex.scan(~r/[ÐÑ][^\s]{0,2}[ÐÑ]/, text)
    length(matches)
  end

  defp too_short?(content) do
    plain = strip_html(content)
    word_count = plain |> String.split(~r/\s+/, trim: true) |> length()
    word_count < @min_word_count
  end

  defp link_only?(content) do
    full_text = strip_html(content) |> String.trim()
    without_links = Regex.replace(~r/<a[^>]*>.*?<\/a>/s, content, "") |> strip_html() |> String.trim()

    full_len = String.length(full_text)

    if full_len < 10 do
      false
    else
      String.length(without_links) / full_len < 0.2
    end
  end

  defp strip_html(html) when is_binary(html) do
    html
    |> String.replace(~r/<br\s*\/?>/, " ")
    |> String.replace(~r/<[^>]+>/, "")
    |> String.replace("&amp;", "&")
    |> String.replace("&lt;", "<")
    |> String.replace("&gt;", ">")
    |> String.replace("&quot;", "\"")
    |> String.replace("&#39;", "'")
    |> String.replace("&nbsp;", " ")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end

  defp strip_html(_), do: ""
end
