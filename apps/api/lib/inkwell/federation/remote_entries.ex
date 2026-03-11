defmodule Inkwell.Federation.RemoteEntries do
  import Ecto.Query
  require Logger
  alias Inkwell.Repo
  alias Inkwell.Federation.RemoteEntry

  def upsert_remote_entry(attrs) do
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

    # Find remote_actor_ids that this user follows
    followed_actor_ids =
      Inkwell.Social.Relationship
      |> where([r], r.follower_id == ^user_id and r.status == :accepted and not is_nil(r.remote_actor_id))
      |> select([r], r.remote_actor_id)
      |> Repo.all()

    if followed_actor_ids == [] do
      []
    else
      RemoteEntry
      |> where([e], e.remote_actor_id in ^followed_actor_ids)
      |> where([e], not is_nil(e.published_at))
      |> order_by(desc: :published_at)
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> preload(:remote_actor)
      |> Repo.all()
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

  defp head_request(url) when is_binary(url) do
    url_cl = String.to_charlist(url)

    headers = [
      {~c"user-agent", ~c"Inkwell/0.1 (+https://inkwell.social)"},
      {~c"accept", ~c"text/html, application/activity+json"}
    ]

    ssl_opts = [
      {:verify, :verify_peer},
      {:cacerts, :public_key.cacerts_get()},
      {:depth, 3},
      {:customize_hostname_check,
       [{:match_fun, :public_key.pkix_verify_hostname_match_fun(:https)}]}
    ]

    http_opts = [
      {:ssl, ssl_opts},
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
