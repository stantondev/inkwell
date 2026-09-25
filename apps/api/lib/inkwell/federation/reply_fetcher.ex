defmodule Inkwell.Federation.ReplyFetcher do
  @moduledoc """
  Fetches a fediverse post's replies from its home server and stores them as
  comments (the `remote_author` pattern), so they show on Inkwell.

  - Mastodon: the public context API (`/api/v1/statuses/:id/context`) returns
    the whole public thread in one request, replies to replies included, with
    each account's details. Direct replies the home server no longer shows
    (deleted, or made private) are removed, but only when the thread came back
    complete and nobody here has answered them.
  - Everything else: the ActivityPub `replies` collection, following pages and
    dereferencing item links (signed when the server requires it).

  Only public and unlisted replies are kept, never ones written here (our own
  comments come back in these lists) or from defederated servers. Each reply
  keeps the time it was written.

  Runs when someone opens a post's comments (`needs_fetch?/1`, 15 minutes) and
  when the engagement refresh sees new replies (`Engagement`).
  """

  import Ecto.Query

  alias Inkwell.Federation.{AttachmentHelper, Engagement, Http, RemoteActor, RemoteEntry}
  alias Inkwell.Journals
  alias Inkwell.Journals.Comment
  alias Inkwell.Letters.Federation, as: LetterFederation
  alias Inkwell.Moderation.FediverseBlocks
  alias Inkwell.Repo

  require Logger

  @public_addresses ["https://www.w3.org/ns/activitystreams#Public", "as:Public", "Public"]
  @fetch_ttl_seconds 15 * 60
  @max_items 100
  @max_pages 3
  @max_dereferences 20
  @domain_delay_ms 500
  # Mastodon's context API gives signed-out callers at most 60 replies.
  @mastodon_context_limit 60

  @doc "True if the post's replies should be (re)fetched."
  def needs_fetch?(%RemoteEntry{replies_fetched_at: nil}), do: true

  def needs_fetch?(%RemoteEntry{replies_fetched_at: fetched_at}) do
    DateTime.diff(DateTime.utc_now(), fetched_at, :second) > @fetch_ttl_seconds
  end

  @doc """
  Fetches the post's replies and stores the new ones. `:ok` (even with no
  replies) or `{:error, reason}`.
  """
  def fetch_replies(%RemoteEntry{} = entry) do
    result =
      case Engagement.api_ref(entry.ap_id) do
        {:mastodon, host, status_id} ->
          case Http.get_json("https://#{host}/api/v1/statuses/#{status_id}/context") do
            {:ok, %{"descendants" => descendants}} when is_list(descendants) ->
              store_mastodon_thread(entry, status_id, descendants)

            _ ->
              fetch_via_activitypub(entry)
          end

        _ ->
          fetch_via_activitypub(entry)
      end

    if result == :ok do
      from(e in RemoteEntry, where: e.id == ^entry.id)
      |> Repo.update_all(set: [replies_fetched_at: DateTime.utc_now()])
    end

    result
  end

  # ── Mastodon ───────────────────────────────────────────────────────────

  @doc """
  Stores a thread from Mastodon's context API. `status_id` is the post's id on
  its home server; `descendants` come in thread order (parents first).
  """
  def store_mastodon_thread(%RemoteEntry{} = entry, status_id, descendants) do
    home = URI.parse(entry.ap_id).host
    by_id = Map.new(descendants, &{&1["id"], &1})
    known = existing_ap_ids(entry.id, Enum.map(descendants, & &1["uri"]))

    Enum.reduce(descendants, known, fn status, seen ->
      uri = status["uri"]

      if is_binary(uri) and not MapSet.member?(seen, uri) and storable_status?(status) do
        parent_uri =
          case status["in_reply_to_id"] do
            ^status_id -> nil
            id -> get_in(by_id, [id, "uri"])
          end

        reply = %{
          ap_id: uri,
          url: status["url"],
          body_html: AttachmentHelper.append_media_attachments(status["content"] || "", %{"attachment" => api_media(status)}),
          published: status["created_at"],
          parent_ap_id: parent_uri,
          author: author_from_account(status["account"], home)
        }

        if store_reply(entry, reply) == :ok, do: MapSet.put(seen, uri), else: seen
      else
        seen
      end
    end)

    direct = Enum.filter(descendants, &(&1["in_reply_to_id"] == status_id))

    # Complete: under the API's cap, and every reply the home server counts
    # (read from its own API, `engagement_refreshed_at`) is here.
    if length(descendants) < @mastodon_context_limit and entry.engagement_refreshed_at != nil and
         length(direct) >= (entry.reply_count || 0) do
      prune_missing_direct_replies(entry, direct |> Enum.map(& &1["uri"]) |> Enum.filter(&is_binary/1))
    end

    :ok
  end

  defp storable_status?(%{"visibility" => v, "uri" => uri, "account" => %{} = account})
       when v in ["public", "unlisted"] do
    not LetterFederation.local_url?(uri) and not defederated?(uri) and
      not defederated?(account["uri"] || account["url"])
  end

  defp storable_status?(_), do: false

  defp author_from_account(account, home) do
    acct = account["acct"] || account["username"] || ""

    {username, domain} =
      case String.split(acct, "@", parts: 2) do
        [u, d] -> {u, d}
        [u] -> {u, home}
      end

    display_name =
      case account["display_name"] do
        name when is_binary(name) and name != "" -> name
        _ -> username
      end

    %{
      "ap_id" => account["uri"],
      "username" => username,
      "domain" => domain,
      "display_name" => display_name,
      "avatar_url" => account["avatar_static"] || account["avatar"],
      "profile_url" => account["url"]
    }
  end

  # Mastodon API media → ActivityPub-style attachments for AttachmentHelper.
  defp api_media(%{"media_attachments" => media}) when is_list(media) do
    Enum.flat_map(media, fn
      %{"type" => "image", "url" => url} = m when is_binary(url) ->
        [%{"type" => "Image", "mediaType" => image_type(url), "url" => url, "name" => m["description"]}]

      %{"type" => type, "url" => url} when type in ["video", "gifv"] and is_binary(url) ->
        [%{"type" => "Video", "url" => url}]

      %{"type" => "audio", "url" => url} when is_binary(url) ->
        [%{"type" => "Audio", "url" => url}]

      _ ->
        []
    end)
  end

  defp api_media(_), do: []

  defp image_type(url) do
    case url |> URI.parse() |> Map.get(:path, "") |> to_string() |> Path.extname() |> String.downcase() do
      ".png" -> "image/png"
      ".gif" -> "image/gif"
      ".webp" -> "image/webp"
      ".avif" -> "image/avif"
      _ -> "image/jpeg"
    end
  end

  # A direct reply the home server no longer lists was deleted or made private.
  # Replies someone here answered stay, so the answer keeps its context.
  defp prune_missing_direct_replies(entry, direct_uris) do
    from(c in Comment,
      as: :comment,
      where:
        c.remote_entry_id == ^entry.id and is_nil(c.user_id) and not is_nil(c.remote_author) and
          is_nil(c.parent_comment_id) and c.ap_id not in ^direct_uris,
      where:
        not exists(
          from(r in Comment, where: r.parent_comment_id == parent_as(:comment).id, select: 1)
        )
    )
    |> Repo.delete_all()
    |> case do
      {0, _} -> :ok
      {n, _} -> Logger.info("ReplyFetcher: removed #{n} replies no longer on #{entry.ap_id}")
    end
  end

  # ── ActivityPub ────────────────────────────────────────────────────────

  defp fetch_via_activitypub(entry) do
    case Http.get_object(entry.ap_id) do
      {:ok, object} ->
        items = collection_items(object["replies"])
        Logger.info("ReplyFetcher: #{length(items)} reply items for #{entry.ap_id}")
        store_ap_items(items, entry)
        :ok

      {:error, reason} ->
        Logger.warning("ReplyFetcher: couldn't fetch #{entry.ap_id}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp collection_items(nil), do: []

  defp collection_items(url) when is_binary(url) do
    case Http.get_object(url) do
      {:ok, collection} -> collection_items(collection)
      _ -> []
    end
  end

  defp collection_items(%{} = collection) do
    first =
      case collection["first"] do
        url when is_binary(url) ->
          case Http.get_object(url) do
            {:ok, page} -> page_items(page, 1)
            _ -> []
          end

        %{} = page ->
          page_items(page, 1)

        _ ->
          []
      end

    Enum.take(items(collection) ++ first, @max_items)
  end

  defp collection_items(_), do: []

  # Mastodon's first page holds the author's own replies; others are on `next`.
  defp page_items(page, n) do
    rest =
      with true <- n < @max_pages,
           next when is_binary(next) <- page["next"],
           _ = Process.sleep(@domain_delay_ms),
           {:ok, next_page} <- Http.get_object(next) do
        page_items(next_page, n + 1)
      else
        _ -> []
      end

    items(page) ++ rest
  end

  defp items(%{"orderedItems" => items}) when is_list(items), do: items
  defp items(%{"items" => items}) when is_list(items), do: items
  defp items(_), do: []

  defp store_ap_items(items, entry) do
    {resolved, _derefs} =
      items
      |> Enum.take(@max_items)
      |> Enum.map_reduce(0, &resolve_item/2)

    resolved = Enum.filter(resolved, &storable_object?/1)
    known = existing_ap_ids(entry.id, Enum.map(resolved, & &1["id"]))

    resolved
    |> Enum.reject(&MapSet.member?(known, &1["id"]))
    |> Enum.each(fn obj ->
      with actor_uri when is_binary(actor_uri) <- attributed_to(obj),
           {:ok, actor} <- RemoteActor.fetch(actor_uri) do
        store_reply(entry, %{
          ap_id: obj["id"],
          url: if(is_binary(obj["url"]), do: obj["url"]),
          body_html: AttachmentHelper.append_media_attachments(obj["content"] || "", obj),
          published: obj["published"],
          parent_ap_id: if(obj["inReplyTo"] == entry.ap_id, do: nil, else: obj["inReplyTo"]),
          author: %{
            "ap_id" => actor.ap_id,
            "username" => actor.username,
            "domain" => actor.domain,
            "display_name" => actor.display_name,
            "avatar_url" => actor.avatar_url,
            "profile_url" => profile_url(actor)
          }
        })
      else
        _ -> Logger.debug("ReplyFetcher: couldn't resolve the author of #{obj["id"]}")
      end
    end)
  end

  # Inline objects are used as they are; links are fetched, at most @max_dereferences.
  defp resolve_item(%{} = obj, derefs), do: {obj, derefs}

  defp resolve_item(url, derefs) when is_binary(url) and derefs < @max_dereferences do
    if derefs > 0, do: Process.sleep(div(@domain_delay_ms, 2))

    case Http.get_object(url) do
      {:ok, obj} -> {obj, derefs + 1}
      _ -> {nil, derefs + 1}
    end
  end

  defp resolve_item(_, derefs), do: {nil, derefs}

  defp storable_object?(%{"type" => type, "id" => id} = obj)
       when type in ["Note", "Article", "Page"] and is_binary(id) do
    public?(obj) and not LetterFederation.local_url?(id) and not defederated?(id)
  end

  defp storable_object?(_), do: false

  defp public?(obj) do
    [obj["to"], obj["cc"]] |> List.flatten() |> Enum.any?(&(&1 in @public_addresses))
  end

  defp attributed_to(%{"attributedTo" => uri}) when is_binary(uri), do: uri
  defp attributed_to(%{"attributedTo" => [uri | _]}) when is_binary(uri), do: uri
  defp attributed_to(%{"attributedTo" => %{"id" => uri}}) when is_binary(uri), do: uri
  defp attributed_to(_), do: nil

  defp profile_url(actor) do
    case actor.raw_data do
      %{"url" => url} when is_binary(url) -> url
      _ -> actor.ap_id
    end
  end

  # ── Storing ────────────────────────────────────────────────────────────

  defp store_reply(entry, reply) do
    attrs =
      %{
        "remote_entry_id" => entry.id,
        "body_html" => reply.body_html,
        "ap_id" => reply.ap_id,
        "url" => reply.url,
        "remote_author" => reply.author
      }

    attrs =
      case parent_comment_id(entry, reply.parent_ap_id) do
        nil -> attrs
        parent_id -> Map.put(attrs, "parent_comment_id", parent_id)
      end

    case Journals.create_comment(attrs) do
      {:ok, comment} ->
        backdate(comment, reply.published)
        :ok

      {:error, _changeset} ->
        # Usually a blank reply, or the same reply arriving through the inbox.
        :error
    end
  end

  # The comment this reply answers, on the same post: a fetched reply, or one
  # of ours (`https://inkwell.social/comments/<id>`).
  defp parent_comment_id(_entry, nil), do: nil

  defp parent_comment_id(entry, parent_ap_id) do
    by_ap_id =
      Repo.one(
        from(c in Comment,
          where: c.remote_entry_id == ^entry.id and c.ap_id == ^parent_ap_id,
          select: c.id,
          limit: 1
        )
      )

    by_ap_id || local_comment_id(entry, parent_ap_id)
  end

  defp local_comment_id(entry, url) do
    with true <- LetterFederation.local_url?(url),
         [_, id] <- Regex.run(~r"/comments/([0-9a-fA-F-]{36})\z", url),
         {:ok, id} <- Ecto.UUID.cast(id),
         %Comment{remote_entry_id: remote_entry_id} when remote_entry_id == entry.id <- Repo.get(Comment, id) do
      id
    else
      _ -> nil
    end
  end

  defp backdate(comment, published) when is_binary(published) do
    case DateTime.from_iso8601(published) do
      {:ok, at, _offset} ->
        if DateTime.compare(at, DateTime.utc_now()) == :lt do
          at = %{at | microsecond: {elem(at.microsecond, 0), 6}}
          from(c in Comment, where: c.id == ^comment.id) |> Repo.update_all(set: [inserted_at: at])
        end

      _ ->
        :ok
    end
  end

  defp backdate(_comment, _published), do: :ok

  defp existing_ap_ids(remote_entry_id, ap_ids) do
    ap_ids = Enum.filter(ap_ids, &is_binary/1)

    if ap_ids == [] do
      MapSet.new()
    else
      from(c in Comment,
        where: c.remote_entry_id == ^remote_entry_id and c.ap_id in ^ap_ids,
        select: c.ap_id
      )
      |> Repo.all()
      |> MapSet.new()
    end
  end

  defp defederated?(url) when is_binary(url) do
    case URI.parse(url) do
      %URI{host: host} when is_binary(host) -> FediverseBlocks.is_domain_defederated?(String.downcase(host))
      _ -> false
    end
  end

  defp defederated?(_), do: false
end
