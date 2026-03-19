defmodule Inkwell.Federation.ReplyFetcher do
  @moduledoc """
  Fetches reply threads from fediverse servers for remote entries displayed on Inkwell.

  When a user views comments on a remote entry, this module fetches the AP object's
  `replies` collection, parses the reply Notes, and stores them as comments in the
  existing comments table using the `remote_author` pattern.
  """

  alias Inkwell.Federation.{Http, RemoteActor, RemoteEntry}
  alias Inkwell.Journals
  alias Inkwell.Repo

  require Logger

  @doc """
  Extracts the reply count from an AP object's `replies` field.
  Used at ingestion time (relay, follow, inbox) to store the count without
  needing to fetch the full reply thread.

  Handles the various forms of `replies`:
  - `%{"totalItems" => N}` — inline Collection with count
  - `%{"first" => %{"totalItems" => N}}` — Mastodon pattern (count on first page)
  - nil or missing — returns 0
  """
  def extract_reply_count(nil), do: 0

  def extract_reply_count(%{"totalItems" => count}) when is_integer(count), do: count

  def extract_reply_count(%{"first" => %{"totalItems" => count}}) when is_integer(count), do: count

  def extract_reply_count(_), do: 0

  @accept_headers [{~c"accept", ~c"application/activity+json, application/ld+json"}]
  @max_items 100
  @max_pages 2
  @max_dereferences 5
  @fetch_ttl_seconds 15 * 60
  @domain_delay_ms 500

  @doc """
  Returns true if the remote entry's replies should be (re)fetched.
  """
  def needs_fetch?(%RemoteEntry{replies_fetched_at: nil}), do: true

  def needs_fetch?(%RemoteEntry{replies_fetched_at: fetched_at}) do
    DateTime.diff(DateTime.utc_now(), fetched_at, :second) > @fetch_ttl_seconds
  end

  @doc """
  Fetches replies for a remote entry from the origin server and stores them as comments.
  Returns :ok on success (even if 0 replies found), {:error, reason} on failure.
  """
  def fetch_replies(%RemoteEntry{} = entry) do
    Logger.info("ReplyFetcher: fetching replies for #{entry.ap_id}")

    case fetch_ap_object(entry.ap_id) do
      {:ok, ap_object} ->
        replies_data = ap_object["replies"]
        items = extract_reply_items(replies_data)
        reply_count = extract_reply_count(replies_data)
        Logger.info("ReplyFetcher: found #{length(items)} reply items (totalItems: #{reply_count}) for #{entry.ap_id}")

        process_items(items, entry)
        mark_fetched(entry, reply_count)
        :ok

      {:error, reason} ->
        Logger.warning("ReplyFetcher: failed to fetch AP object #{entry.ap_id}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # ── AP Object Fetching ──────────────────────────────────────────────────

  defp fetch_ap_object(url) do
    case Http.get(url, @accept_headers) do
      {:ok, {status, body}} when status in 200..299 ->
        Jason.decode(body)

      {:ok, {status, _}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  # ── Replies Collection Parsing ──────────────────────────────────────────

  # Handle the various forms of the `replies` field in AP objects
  defp extract_reply_items(nil), do: []
  defp extract_reply_items(replies) when is_binary(replies) do
    # `replies` is a URL — fetch the Collection
    case fetch_ap_object(replies) do
      {:ok, collection} -> extract_from_collection(collection, 1)
      {:error, _} -> []
    end
  end

  defp extract_reply_items(%{} = replies) do
    # `replies` is an inline Collection object
    extract_from_collection(replies, 1)
  end

  defp extract_reply_items(_), do: []

  # Extract items from a Collection/OrderedCollection, following pagination
  defp extract_from_collection(collection, page_num) when page_num > @max_pages, do: []

  defp extract_from_collection(collection, page_num) do
    # Get items from this level (Collection might have items directly)
    direct_items = get_items(collection)

    # Check for a `first` page (common in Mastodon — Collection wraps a CollectionPage)
    first_items =
      case collection["first"] do
        nil ->
          []

        first_url when is_binary(first_url) ->
          case fetch_ap_object(first_url) do
            {:ok, page} -> extract_from_page(page, page_num)
            {:error, _} -> []
          end

        %{} = first_page ->
          extract_from_page(first_page, page_num)
      end

    items = direct_items ++ first_items
    Enum.take(items, @max_items)
  end

  # Extract items from a CollectionPage, optionally following `next`
  defp extract_from_page(page, page_num) do
    items = get_items(page)

    next_items =
      if page_num < @max_pages do
        case page["next"] do
          nil -> []
          next_url when is_binary(next_url) ->
            # Small delay before following pagination
            Process.sleep(@domain_delay_ms)
            case fetch_ap_object(next_url) do
              {:ok, next_page} -> extract_from_page(next_page, page_num + 1)
              {:error, _} -> []
            end
          _ -> []
        end
      else
        []
      end

    items ++ next_items
  end

  # Get items/orderedItems from a collection or page
  defp get_items(%{"orderedItems" => items}) when is_list(items), do: items
  defp get_items(%{"items" => items}) when is_list(items), do: items
  defp get_items(_), do: []

  # ── Item Processing ─────────────────────────────────────────────────────

  defp process_items(items, entry) do
    # Track domains for rate limiting
    domain_tracker = :ets.new(:reply_fetch_domains, [:set, :private])
    deref_count = :counters.new(1, [:atomics])

    # First pass: resolve all items to full objects
    resolved =
      items
      |> Enum.take(@max_items)
      |> Enum.map(fn item ->
        resolve_item(item, domain_tracker, deref_count)
      end)
      |> Enum.reject(&is_nil/1)

    # Build ap_id → resolved map for threading
    ap_id_map =
      resolved
      |> Enum.filter(fn obj -> is_binary(obj["id"]) end)
      |> Map.new(fn obj -> {obj["id"], obj} end)

    # Check which ap_ids already exist as comments
    existing_ap_ids = get_existing_comment_ap_ids(entry.id, Map.keys(ap_id_map))

    # Second pass: create comments with threading
    resolved
    |> Enum.reject(fn obj -> obj["id"] in existing_ap_ids end)
    |> Enum.each(fn obj ->
      create_reply_comment(obj, entry, ap_id_map)
    end)

    :ets.delete(domain_tracker)
  end

  defp resolve_item(item, _domain_tracker, _deref_count) when is_map(item) do
    # Inline object — validate type
    if valid_reply_type?(item), do: item, else: nil
  end

  defp resolve_item(item, domain_tracker, deref_count) when is_binary(item) do
    # URI reference — need to dereference
    current = :counters.get(deref_count, 1)
    if current >= @max_dereferences do
      nil
    else
      :counters.add(deref_count, 1, 1)
      maybe_rate_limit_domain(item, domain_tracker)

      case fetch_ap_object(item) do
        {:ok, obj} when is_map(obj) ->
          if valid_reply_type?(obj), do: obj, else: nil
        _ ->
          nil
      end
    end
  end

  defp resolve_item(_, _, _), do: nil

  defp valid_reply_type?(%{"type" => type}) when type in ["Note", "Article", "Page"], do: true
  defp valid_reply_type?(_), do: false

  defp maybe_rate_limit_domain(url, domain_tracker) do
    case URI.parse(url) do
      %URI{host: host} when is_binary(host) ->
        case :ets.lookup(domain_tracker, host) do
          [{^host, _}] ->
            Process.sleep(@domain_delay_ms)

          [] ->
            :ok
        end
        :ets.insert(domain_tracker, {host, true})

      _ ->
        :ok
    end
  end

  # Query existing comment ap_ids to avoid duplicates
  defp get_existing_comment_ap_ids(remote_entry_id, ap_ids) when ap_ids == [], do: MapSet.new()

  defp get_existing_comment_ap_ids(remote_entry_id, ap_ids) do
    import Ecto.Query

    Journals.Comment
    |> where([c], c.remote_entry_id == ^remote_entry_id)
    |> where([c], c.ap_id in ^ap_ids)
    |> select([c], c.ap_id)
    |> Repo.all()
    |> MapSet.new()
  end

  # Create a comment from a resolved AP reply object
  defp create_reply_comment(obj, entry, ap_id_map) do
    actor_uri = obj["attributedTo"]

    unless is_binary(actor_uri) do
      Logger.debug("ReplyFetcher: skipping reply without attributedTo: #{obj["id"]}")
      :skip
    end

    case RemoteActor.fetch(actor_uri) do
      {:ok, remote_actor} ->
        profile_url =
          case remote_actor.raw_data do
            %{"url" => url} when is_binary(url) -> url
            _ -> remote_actor.ap_id
          end

        # Determine threading parent
        in_reply_to = obj["inReplyTo"]
        parent_comment_id = resolve_parent(in_reply_to, entry, ap_id_map)

        # Use string keys throughout — compute_and_enforce_depth adds "depth" as string key
        comment_attrs = %{
          "remote_entry_id" => entry.id,
          "body_html" => obj["content"] || "",
          "ap_id" => obj["id"],
          "remote_author" => %{
            "ap_id" => remote_actor.ap_id,
            "username" => remote_actor.username,
            "domain" => remote_actor.domain,
            "display_name" => remote_actor.display_name,
            "avatar_url" => remote_actor.avatar_url,
            "profile_url" => profile_url
          }
        }

        # Add parent for threading — depth is computed by Journals.create_comment
        comment_attrs =
          if parent_comment_id do
            Map.put(comment_attrs, "parent_comment_id", parent_comment_id)
          else
            comment_attrs
          end

        case Journals.create_comment(comment_attrs) do
          {:ok, comment} ->
            Logger.debug("ReplyFetcher: created comment #{comment.id} from #{actor_uri}")

          {:error, reason} ->
            Logger.debug("ReplyFetcher: failed to create comment from #{actor_uri}: #{inspect(reason)}")
        end

      {:error, reason} ->
        Logger.debug("ReplyFetcher: failed to fetch actor #{actor_uri}: #{inspect(reason)}")
    end
  end

  # Resolve parent: find parent comment ID if inReplyTo matches a sibling
  defp resolve_parent(in_reply_to, entry, _ap_id_map) when in_reply_to == entry.ap_id do
    # Direct reply to the entry — root level
    nil
  end

  defp resolve_parent(in_reply_to, _entry, ap_id_map) when is_binary(in_reply_to) do
    # Check if it's a reply to another comment we've fetched/stored
    if Map.has_key?(ap_id_map, in_reply_to) do
      import Ecto.Query

      Repo.one(
        from c in Journals.Comment,
          where: c.ap_id == ^in_reply_to,
          select: c.id
      )
    else
      nil
    end
  end

  defp resolve_parent(_, _, _), do: nil

  # ── Mark as fetched ─────────────────────────────────────────────────────

  defp mark_fetched(entry, reply_count \\ 0) do
    changes = %{replies_fetched_at: DateTime.utc_now()}
    changes = if reply_count > 0, do: Map.put(changes, :reply_count, reply_count), else: changes

    entry
    |> Ecto.Changeset.change(changes)
    |> Repo.update()
  end
end
