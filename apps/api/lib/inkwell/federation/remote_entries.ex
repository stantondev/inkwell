defmodule Inkwell.Federation.RemoteEntries do
  import Ecto.Query
  require Logger
  alias Inkwell.Repo
  alias Inkwell.Federation.RemoteEntry

  def upsert_remote_entry(attrs) do
    if points_to_self?(attrs) do
      Logger.info("[RemoteEntries] Skipping self-domain entry: #{attrs.ap_id || attrs[:url]}")
      {:ok, :self_domain_skipped}
    else
      case Repo.get_by(RemoteEntry, ap_id: attrs.ap_id) do
        nil ->
          %RemoteEntry{}
          |> RemoteEntry.changeset(attrs)
          |> Repo.insert()

        existing ->
          existing
          |> RemoteEntry.changeset(attrs)
          |> Repo.update()
      end
    end
  end

  @doc """
  Returns true if the remote entry is a crosspost that links back to our own domain.
  Catches two cases:
  1. The AP ID or URL directly points to our domain (e.g., relay loopback)
  2. The body content is primarily a link back to an Inkwell entry (crosspost from Mastodon)
  """
  def points_to_self?(attrs) do
    frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")
    self_host = URI.parse(frontend_url).host

    url_points_to_self =
      Enum.any?([:url, :ap_id], fn key ->
        case Map.get(attrs, key) do
          url when is_binary(url) ->
            case URI.parse(url) do
              %URI{host: host} when is_binary(host) -> String.downcase(host) == self_host
              _ -> false
            end
          _ -> false
        end
      end)

    body_links_to_self =
      case Map.get(attrs, :body_html) do
        html when is_binary(html) ->
          # Check if body contains a prominent link back to our domain
          # Crossposts typically have a link like "inkwell.social/username/slug"
          Regex.match?(~r/href="https?:\/\/#{Regex.escape(self_host)}\/[^"]*\/[^"]*"/, html)
        _ -> false
      end

    url_points_to_self || body_links_to_self
  end

  def get_remote_entry!(id), do: Repo.get!(RemoteEntry, id)

  def get_remote_entry(id), do: Repo.get(RemoteEntry, id)

  def get_by_ap_id(ap_id) do
    Repo.get_by(RemoteEntry, ap_id: ap_id)
  end

  def delete_by_ap_id(ap_id) do
    case Repo.get_by(RemoteEntry, ap_id: ap_id) do
      nil -> {:ok, nil}
      entry -> Repo.delete(entry)
    end
  end

  @doc """
  Lists remote entries from actors that the given user follows.
  Used by the Feed to include federated posts alongside local entries.
  """
  def list_followed_remote_entries(user_id, opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)
    filter_tags = Keyword.get(opts, :tags, nil)

    # Find remote_actor_ids that this user follows
    followed_actor_ids =
      Inkwell.Social.Relationship
      |> where([r], r.follower_id == ^user_id and r.status == :accepted and not is_nil(r.remote_actor_id))
      |> select([r], r.remote_actor_id)
      |> Repo.all()

    if followed_actor_ids == [] do
      []
    else
      query =
        RemoteEntry
        |> where([e], e.remote_actor_id in ^followed_actor_ids)
        |> where([e], not is_nil(e.published_at))
        |> order_by(desc: :published_at)
        |> limit(^per_page)
        |> offset(^((page - 1) * per_page))
        |> preload(:remote_actor)

      query =
        if is_list(filter_tags) && filter_tags != [] do
          where(query, [e],
            fragment(
              "EXISTS (SELECT 1 FROM unnest(?) AS t(tag) WHERE LOWER(t.tag) = ANY(?))",
              e.tags,
              ^filter_tags
            )
          )
        else
          query
        end

      Repo.all(query)
    end
  end

  def list_public_remote_entries(opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)
    filter_tags = Keyword.get(opts, :tags, nil)
    filter_tag = Keyword.get(opts, :tag, nil)

    query =
      RemoteEntry
      |> where([e], not is_nil(e.published_at))
      |> order_by(desc: :published_at)
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> preload(:remote_actor)

    query =
      cond do
        is_list(filter_tags) && filter_tags != [] ->
          # Category filter: match if any of the entry's tags overlap with the hashtag list
          where(query, [e],
            fragment(
              "EXISTS (SELECT 1 FROM unnest(?) AS t(tag) WHERE LOWER(t.tag) = ANY(?))",
              e.tags,
              ^filter_tags
            )
          )

        is_binary(filter_tag) && filter_tag != "" ->
          # Single tag filter: match if the entry's tags contain this tag
          lower_tag = String.downcase(filter_tag)
          where(query, [e],
            fragment(
              "EXISTS (SELECT 1 FROM unnest(?) AS t(tag) WHERE LOWER(t.tag) = ?)",
              e.tags,
              ^lower_tag
            )
          )

        true ->
          query
      end

    Repo.all(query)
  end

  @doc """
  Deletes remote entries with garbled (mojibake) content.
  These are entries stored before the UTF-8 encoding fix.
  Returns the count of deleted entries.
  """
  def cleanup_mojibake_entries do
    all_entries = Repo.all(RemoteEntry)

    mojibake_entries =
      Enum.filter(all_entries, fn re ->
        Inkwell.Federation.ContentQuality.has_mojibake?(re.body_html)
      end)

    {count, _} =
      if mojibake_entries == [] do
        {0, nil}
      else
        ids = Enum.map(mojibake_entries, & &1.id)

        RemoteEntry
        |> where([e], e.id in ^ids)
        |> Repo.delete_all()
      end

    {:ok, count}
  end

  @doc "Update just the body_html of a remote entry (used by LinkPreviewWorker)."
  def update_body_html(entry, new_body_html) do
    entry
    |> Ecto.Changeset.change(%{body_html: new_body_html})
    |> Repo.update()
  end

  @doc """
  Lists remote entries that contain links but no link preview embeds.
  Used for backfilling existing entries with link previews.
  """
  def list_entries_needing_link_previews(limit \\ 100) do
    RemoteEntry
    |> where([e], not is_nil(e.body_html))
    |> where([e], fragment("? LIKE '%<a %'", e.body_html))
    |> where([e], fragment("? NOT LIKE '%data-link-embed%'", e.body_html))
    |> order_by(desc: :inserted_at)
    |> limit(^limit)
    |> select([e], e.id)
    |> Repo.all()
  end

  def cleanup_old_entries(days \\ 90) do
    cutoff = DateTime.add(DateTime.utc_now(), -days, :day)

    {count, _} =
      RemoteEntry
      |> where([e], e.inserted_at < ^cutoff)
      |> where([e], is_nil(e.source) or e.source != "relay")
      |> Repo.delete_all()

    {:ok, count}
  end

  @doc """
  Deletes relay-sourced remote entries older than the given number of days.
  Relay content has a shorter TTL (default 14 days) than follow-sourced content.
  """
  def cleanup_relay_entries(days \\ 14) do
    cutoff = DateTime.add(DateTime.utc_now(), -days, :day)

    {count, _} =
      RemoteEntry
      |> where([e], e.source == "relay" and e.inserted_at < ^cutoff)
      |> Repo.delete_all()

    {:ok, count}
  end

  @doc """
  Returns entries that need verification — never verified or verified >24h ago.
  Ordered: NULL last_verified_at first, then oldest verified.
  """
  def list_entries_needing_verification(limit \\ 50) do
    cutoff = DateTime.add(DateTime.utc_now(), -24, :hour)

    RemoteEntry
    |> where([e], is_nil(e.last_verified_at) or e.last_verified_at < ^cutoff)
    |> order_by([e], asc_nulls_first: e.last_verified_at)
    |> limit(^limit)
    |> Repo.all()
  end

  @doc """
  Updates last_verified_at to now for a single entry.
  """
  def mark_verified(entry_id) do
    RemoteEntry
    |> where([e], e.id == ^entry_id)
    |> Repo.update_all(set: [last_verified_at: DateTime.utc_now()])
  end

  @doc """
  Verifies a batch of remote entries via HTTP HEAD requests.
  - 200-399 → mark verified
  - 404/410 → delete (entry removed at source)
  - anything else → skip (server may be temporarily down)

  Groups by domain with 500ms delay between same-domain requests.
  Returns %{verified: N, deleted: N, skipped: N}.
  """
  def verify_and_cleanup_batch(entries) do
    grouped =
      Enum.group_by(entries, fn entry ->
        url = entry.url || entry.ap_id

        case URI.parse(url) do
          %URI{host: host} when is_binary(host) -> host
          _ -> "unknown"
        end
      end)

    results =
      Enum.flat_map(grouped, fn {_domain, domain_entries} ->
        domain_entries
        |> Enum.with_index()
        |> Enum.map(fn {entry, index} ->
          if index > 0, do: Process.sleep(500)
          verify_single_entry(entry)
        end)
      end)

    %{
      verified: Enum.count(results, &(&1 == :verified)),
      deleted: Enum.count(results, &(&1 == :deleted)),
      skipped: Enum.count(results, &(&1 == :skipped))
    }
  end

  defp verify_single_entry(entry) do
    url = entry.url || entry.ap_id

    case head_request(url) do
      {:ok, status} when status in 200..399 ->
        mark_verified(entry.id)
        :verified

      {:ok, status} when status in [404, 410] ->
        Repo.delete(entry)
        Logger.info("Deleted stale remote entry #{entry.ap_id} — source returned #{status}")
        :deleted

      {:ok, status} ->
        Logger.debug("Skipped verification for #{entry.ap_id} — HTTP #{status}")
        :skipped

      {:error, reason} ->
        Logger.debug("Skipped verification for #{entry.ap_id} — #{inspect(reason)}")
        :skipped
    end
  end

  # ── Engagement Count Refresh ──────────────────────────────────────────

  @doc """
  Extracts a count from an AP Collection field (likes, shares, replies).
  Handles various formats: `%{"totalItems" => N}`, `%{"first" => %{"totalItems" => N}}`, nil.
  """
  def extract_collection_count(%{"totalItems" => count}) when is_integer(count), do: count
  def extract_collection_count(%{"first" => %{"totalItems" => count}}) when is_integer(count), do: count
  def extract_collection_count(_), do: 0

  @doc """
  Lists remote entries that need engagement count refresh.
  Targets entries published in the last 7 days that haven't been refreshed in 2 hours.
  """
  def list_entries_needing_engagement_refresh(limit \\ 100) do
    seven_days_ago = DateTime.add(DateTime.utc_now(), -7, :day)
    two_hours_ago = DateTime.add(DateTime.utc_now(), -2, :hour)

    RemoteEntry
    |> where([e], e.published_at > ^seven_days_ago)
    |> where([e], is_nil(e.engagement_refreshed_at) or e.engagement_refreshed_at < ^two_hours_ago)
    |> order_by([e], asc_nulls_first: e.engagement_refreshed_at)
    |> limit(^limit)
    |> Repo.all()
  end

  @doc """
  Updates engagement counts for a remote entry.
  """
  def update_engagement_counts(entry_id, likes_count, boosts_count, reply_count) do
    RemoteEntry
    |> where([e], e.id == ^entry_id)
    |> Repo.update_all(set: [
      likes_count: likes_count,
      boosts_count: boosts_count,
      reply_count: reply_count,
      engagement_refreshed_at: DateTime.utc_now()
    ])
  end

  @doc """
  Fetches AP objects for a batch of remote entries and updates their engagement counts.
  Groups by domain with 500ms delay between same-domain requests.
  Returns %{refreshed: N, skipped: N, errors: N}.
  """
  def refresh_engagement_batch(entries) do
    accept_headers = [{~c"accept", ~c"application/activity+json, application/ld+json"}]

    grouped =
      Enum.group_by(entries, fn entry ->
        url = entry.ap_id || entry.url
        case URI.parse(url) do
          %URI{host: host} when is_binary(host) -> host
          _ -> "unknown"
        end
      end)

    results =
      Enum.flat_map(grouped, fn {_domain, domain_entries} ->
        domain_entries
        |> Enum.with_index()
        |> Enum.map(fn {entry, index} ->
          if index > 0, do: Process.sleep(500)
          refresh_single_entry(entry, accept_headers)
        end)
      end)

    %{
      refreshed: Enum.count(results, &(&1 == :refreshed)),
      skipped: Enum.count(results, &(&1 == :skipped)),
      errors: Enum.count(results, &(&1 == :error))
    }
  end

  defp refresh_single_entry(entry, accept_headers) do
    url = entry.ap_id || entry.url

    case Inkwell.Federation.Http.get(url, accept_headers) do
      {:ok, {status, body}} when status in 200..299 ->
        case Jason.decode(body) do
          {:ok, ap_object} ->
            likes = extract_collection_count(ap_object["likes"])
            boosts = extract_collection_count(ap_object["shares"])
            replies = Inkwell.Federation.ReplyFetcher.extract_reply_count(ap_object["replies"])
            update_engagement_counts(entry.id, likes, boosts, replies)
            :refreshed

          {:error, _} ->
            Logger.debug("RefreshEngagement: failed to parse JSON for #{url}")
            :error
        end

      {:ok, {status, _}} ->
        Logger.debug("RefreshEngagement: HTTP #{status} for #{url}")
        :skipped

      {:error, reason} ->
        Logger.debug("RefreshEngagement: network error for #{url}: #{inspect(reason)}")
        :error
    end
  end

  # ── Entry Verification ──────────────────────────────────────────────

  defp head_request(url) when is_binary(url) do
    url_cl = String.to_charlist(url)

    headers = [
      {~c"user-agent", ~c"Inkwell/0.1 (+https://inkwell.social)"},
      {~c"accept", ~c"text/html, application/activity+json"}
    ]

    http_opts = [
      {:ssl, Inkwell.SSL.httpc_opts()},
      {:timeout, 10_000},
      {:connect_timeout, 10_000}
    ]

    case :httpc.request(:head, {url_cl, headers}, http_opts, []) do
      {:ok, {{_, status, _}, _resp_headers, _body}} ->
        {:ok, status}

      {:error, reason} ->
        {:error, reason}
    end
  end
end
