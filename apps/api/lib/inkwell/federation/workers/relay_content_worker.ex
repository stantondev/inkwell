defmodule Inkwell.Federation.Workers.RelayContentWorker do
  @moduledoc """
  Oban worker that processes relay Announce activities.
  Fetches the announced object, validates it, and stores it as a remote entry.
  """

  use Oban.Worker,
    queue: :federation,
    max_attempts: 3,
    priority: 3

  require Logger

  alias Inkwell.Federation.{Http, Relays, RemoteEntries, RemoteActor}

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"object_uri" => object_uri, "relay_actor_uri" => relay_actor_uri}}) do
    # 1. Look up relay subscription — skip if not active
    subscription = Relays.get_subscription_by_url(relay_actor_uri)

    cond do
      is_nil(subscription) ->
        Logger.debug("Relay subscription not found for #{relay_actor_uri}, skipping")
        :ok

      subscription.status != "active" ->
        Logger.debug("Relay subscription #{relay_actor_uri} is #{subscription.status}, skipping")
        :ok

      true ->
        process_object(object_uri, subscription)
    end
  end

  defp process_object(object_uri, subscription) do
    # 2. Dedup — skip if already stored
    case RemoteEntries.get_by_ap_id(object_uri) do
      %{} ->
        Logger.debug("Remote entry already exists for #{object_uri}, skipping")
        :ok

      nil ->
        fetch_and_store(object_uri, subscription)
    end
  end

  defp fetch_and_store(object_uri, subscription) do
    # 3. HTTP GET the object
    headers = [{~c"accept", ~c"application/activity+json, application/ld+json"}]

    case Http.get(object_uri, headers) do
      {:ok, {status, body}} when status in 200..299 ->
        case Jason.decode(body) do
          {:ok, object} ->
            maybe_store_object(object, subscription)

          _ ->
            Logger.warning("RelayContentWorker: invalid JSON from #{object_uri}")
            :ok
        end

      {:ok, {status, _}} ->
        Logger.warning("RelayContentWorker: HTTP #{status} fetching #{object_uri}")
        # Retry on 5xx, discard on 4xx
        if status >= 500, do: {:error, "HTTP #{status}"}, else: :ok

      {:error, reason} ->
        Logger.warning("RelayContentWorker: failed to fetch #{object_uri}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp maybe_store_object(object, subscription) do
    type = object["type"]
    valid_types = ~w[Note Article Page]

    # 4. Validate: correct type, public, not a reply
    cond do
      type not in valid_types ->
        Logger.debug("RelayContentWorker: skipping type #{type}")
        :ok

      not is_public?(object) ->
        Logger.debug("RelayContentWorker: skipping non-public object")
        :ok

      is_reply?(object) ->
        Logger.debug("RelayContentWorker: skipping reply")
        :ok

      true ->
        # 5. Content filter — skip sensitive if filter says so
        if skip_by_filter?(object, subscription.content_filter) do
          Logger.debug("RelayContentWorker: filtered out by content filter")
          :ok
        else
          store_object(object, subscription)
        end
    end
  end

  defp store_object(object, subscription) do
    actor_uri = object["attributedTo"]

    unless is_binary(actor_uri) do
      Logger.debug("RelayContentWorker: no attributedTo, skipping")
      :ok
    else
      # 6. Fetch/cache remote actor
      case RemoteActor.fetch(actor_uri) do
        {:ok, remote_actor} ->
          # 6b. Quality check — skip bots, short posts, link-only posts
          unless passes_quality_check?(object, remote_actor) do
            Logger.debug("RelayContentWorker: failed quality check, skipping")
            :ok
          else
          tags = extract_hashtags(object["tag"])

          url =
            case object["url"] do
              u when is_binary(u) -> u
              _ -> object["id"]
            end

          is_sensitive = object["sensitive"] == true
          content_warning = if is_sensitive, do: object["summary"], else: nil

          # 7. Store with source: "relay"
          attrs = %{
            ap_id: object["id"],
            url: url,
            title: object["name"],
            body_html: object["content"] || "",
            tags: tags,
            published_at: parse_datetime(object["published"]),
            remote_actor_id: remote_actor.id,
            sensitive: is_sensitive,
            content_warning: content_warning,
            source: "relay",
            relay_subscription_id: subscription.id
          }

          case RemoteEntries.upsert_remote_entry(attrs) do
            {:ok, _} ->
              # 8. Mark activity on subscription
              Relays.mark_activity(subscription.id)
              Logger.info("Stored relay entry #{object["id"]} via #{subscription.relay_domain}")
              :ok

            {:error, reason} ->
              Logger.warning("RelayContentWorker: failed to store entry: #{inspect(reason)}")
              :ok
          end
          end  # end unless quality check

        {:error, reason} ->
          Logger.warning("RelayContentWorker: failed to fetch actor #{actor_uri}: #{inspect(reason)}")
          :ok
      end
    end
  end

  # ── Helpers ───────────────────────────────────────────────────────────

  defp is_public?(object) do
    public_uri = "https://www.w3.org/ns/activitystreams#Public"
    to = List.wrap(object["to"])
    cc = List.wrap(object["cc"])
    public_uri in to || public_uri in cc
  end

  defp is_reply?(object) do
    reply_to = object["inReplyTo"]
    is_binary(reply_to) && reply_to != ""
  end

  defp skip_by_filter?(object, filter) when is_map(filter) do
    # MVP: skip sensitive content if filter has skip_sensitive: true
    if filter["skip_sensitive"] && object["sensitive"] == true do
      true
    else
      false
    end
  end

  defp skip_by_filter?(_object, _filter), do: false

  defp extract_hashtags(nil), do: []

  defp extract_hashtags(tags) when is_list(tags) do
    tags
    |> Enum.filter(fn t -> is_map(t) && t["type"] == "Hashtag" end)
    |> Enum.map(fn t -> (t["name"] || "") |> String.trim_leading("#") end)
    |> Enum.reject(&(&1 == ""))
  end

  defp extract_hashtags(_), do: []

  defp parse_datetime(nil), do: nil

  defp parse_datetime(str) when is_binary(str) do
    case DateTime.from_iso8601(str) do
      {:ok, dt, _offset} -> dt
      _ -> nil
    end
  end

  # ── Quality Checks ──────────────────────────────────────────────────

  defp passes_quality_check?(object, remote_actor) do
    cond do
      is_bot_actor?(remote_actor) ->
        Logger.debug("RelayContentWorker: skipping bot actor #{remote_actor.username}@#{remote_actor.domain}")
        false

      has_bot_username?(remote_actor) ->
        Logger.debug("RelayContentWorker: skipping bot-pattern username #{remote_actor.username}@#{remote_actor.domain}")
        false

      has_mojibake?(object) ->
        Logger.debug("RelayContentWorker: skipping mojibake content")
        false

      # Articles and Pages bypass word count — they're long-form by definition
      object["type"] in ~w[Article Page] ->
        true

      too_short?(object) ->
        Logger.debug("RelayContentWorker: skipping short post (< 30 words)")
        false

      link_only?(object) ->
        Logger.debug("RelayContentWorker: skipping link-only post")
        false

      true ->
        true
    end
  end

  # Bot detection: AP convention is type "Service" or "Application" for bots
  defp is_bot_actor?(remote_actor) do
    actor_type =
      case remote_actor.raw_data do
        %{"type" => t} when is_binary(t) -> t
        _ -> "Person"
      end

    actor_type in ~w[Service Application]
  end

  # Common bot username patterns (RSS bridges, news aggregators, etc.)
  @bot_username_patterns ~w[
    rssbot fanbot newsbot feedbot mirrorbot
    rss_bot feed_bot news_bot mirror_bot
    bot@ relay activityrelay
  ]

  defp has_bot_username?(remote_actor) do
    username = String.downcase(remote_actor.username || "")
    display_name = String.downcase(remote_actor.display_name || "")

    # Check if username matches known bot patterns
    Enum.any?(@bot_username_patterns, fn pattern ->
      String.contains?(username, pattern)
    end) ||
    # Check if display name ends with "bot" or "[bot]"
    String.ends_with?(display_name, "bot") ||
    String.ends_with?(display_name, "[bot]") ||
    # Check AP actor data for bot flag
    get_in(remote_actor.raw_data || %{}, ["discoverable"]) == false &&
      get_in(remote_actor.raw_data || %{}, ["memorial"]) != true &&
      (String.contains?(username, "bot") || String.contains?(username, "feed"))
  end

  # Detect garbled text (mojibake) from bad encoding — lots of Ã, Ð, â€ sequences
  defp has_mojibake?(object) do
    content = object["content"] || ""
    plain = strip_html(content)
    len = String.length(plain)

    # Skip very short content (let other filters handle it)
    if len < 20 do
      false
    else
      # Count mojibake indicator characters/sequences
      mojibake_count =
        # Latin-1 mojibake markers (UTF-8 bytes misinterpreted as codepoints)
        (count_occurrences(plain, "Ã") +
         count_occurrences(plain, "â€") +
         count_occurrences(plain, "Â") +
         # Cyrillic/other script mojibake (Ð sequences mixed with Ñ)
         count_cyrillic_mojibake(plain))

      # If >15% of the text length is mojibake markers, it's garbled
      mojibake_count * 3 > len
    end
  end

  defp count_occurrences(string, pattern) do
    string
    |> String.split(pattern)
    |> length()
    |> Kernel.-(1)
    |> max(0)
  end

  # Detect Cyrillic text that was double-encoded: shows as scattered Ð and Ñ
  # with single Latin chars between them (real Cyrillic text has connected words)
  defp count_cyrillic_mojibake(text) do
    # Pattern: Ð or Ñ followed by a single non-Cyrillic char then another Ð/Ñ
    # This is characteristic of UTF-8 Cyrillic bytes being read as Latin-1
    matches = Regex.scan(~r/[ÐÑ][^\s]{0,2}[ÐÑ]/, text)
    length(matches)
  end

  # Minimum content length: 30 words of actual text (not HTML/links)
  defp too_short?(object) do
    plain = strip_html(object["content"] || "")
    word_count = plain |> String.split(~r/\s+/, trim: true) |> length()
    word_count < 30
  end

  # Link-only: if stripping <a> tags leaves < 20% of the content
  defp link_only?(object) do
    content = object["content"] || ""
    # Strip all HTML tags to get full text (including link text)
    full_text = strip_html(content) |> String.trim()
    # Strip <a> tags and their content, then strip remaining HTML
    without_links = Regex.replace(~r/<a[^>]*>.*?<\/a>/s, content, "") |> strip_html() |> String.trim()

    full_len = String.length(full_text)

    if full_len < 10 do
      # Very short content — let too_short? handle it
      false
    else
      # If removing links leaves less than 20% of the text, it's a link dump
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
