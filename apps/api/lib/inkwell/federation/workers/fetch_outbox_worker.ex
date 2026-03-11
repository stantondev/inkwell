defmodule Inkwell.Federation.Workers.FetchOutboxWorker do
  @moduledoc """
  Fetches a remote actor's recent outbox posts after a follow is accepted.
  Stores public, non-reply Notes/Articles in remote_entries for the Explore feed.
  """

  use Oban.Worker,
    queue: :federation,
    max_attempts: 3,
    priority: 3

  alias Inkwell.Federation.{Http, RemoteActor, RemoteEntries}

  require Logger

  @max_items 20
  @public_uri "https://www.w3.org/ns/activitystreams#Public"

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"remote_actor_id" => remote_actor_id}}) do
    case RemoteActor.get(remote_actor_id) do
      nil ->
        Logger.warning("FetchOutboxWorker: remote actor #{remote_actor_id} not found")
        :ok

      remote_actor ->
        fetch_and_store_outbox(remote_actor)
    end
  end

  defp fetch_and_store_outbox(remote_actor) do
    outbox_url = get_outbox_url(remote_actor)

    if outbox_url do
      case fetch_json(outbox_url) do
        {:ok, %{"first" => first_url}} when is_binary(first_url) ->
          fetch_outbox_page(first_url, remote_actor)

        {:ok, %{"orderedItems" => items}} when is_list(items) ->
          process_items(items, remote_actor)

        {:ok, _} ->
          Logger.info("Could not parse outbox for #{remote_actor.ap_id}")

        {:error, reason} ->
          Logger.info("Failed to fetch outbox for #{remote_actor.ap_id}: #{inspect(reason)}")
      end
    else
      Logger.info("No outbox URL found for #{remote_actor.ap_id}")
    end

    :ok
  end

  defp get_outbox_url(remote_actor) do
    case remote_actor.raw_data do
      %{"outbox" => outbox} when is_binary(outbox) -> outbox
      _ -> nil
    end
  end

  defp fetch_outbox_page(url, remote_actor) do
    case fetch_json(url) do
      {:ok, %{"orderedItems" => items}} when is_list(items) ->
        process_items(Enum.take(items, @max_items), remote_actor)

      _ ->
        :ok
    end
  end

  @ingestible_types ["Note", "Article", "Page"]

  defp process_items(items, remote_actor) do
    stored =
      Enum.reduce(items, 0, fn item, count ->
        case item do
          %{"type" => "Create", "object" => %{"type" => type} = object}
              when type in @ingestible_types ->
            if store_if_public(object, remote_actor), do: count + 1, else: count

          %{"type" => type} = object when type in @ingestible_types ->
            # Some servers put Notes/Articles directly in outbox
            if store_if_public(object, remote_actor), do: count + 1, else: count

          _ ->
            count
        end
      end)

    if stored > 0 do
      Logger.info("Backfilled #{stored} entries from #{remote_actor.ap_id}")
    end
  end

  defp store_if_public(note, remote_actor) do
    to = note["to"] || []
    cc = note["cc"] || []
    in_reply_to = note["inReplyTo"]

    is_public = @public_uri in to || @public_uri in cc
    is_reply = is_binary(in_reply_to) && in_reply_to != ""

    if is_public && !is_reply do
      tags = extract_hashtags(note["tag"])

      url =
        case note["url"] do
          u when is_binary(u) -> u
          _ -> note["id"]
        end

      attrs = %{
        ap_id: note["id"],
        url: url,
        title: note["name"],
        body_html: note["content"] || "",
        tags: tags,
        published_at: parse_datetime(note["published"]),
        remote_actor_id: remote_actor.id
      }

      case RemoteEntries.upsert_remote_entry(attrs) do
        {:ok, _} -> true
        {:error, _} -> false
      end
    else
      false
    end
  end

  defp extract_hashtags(nil), do: []

  defp extract_hashtags(tags) when is_list(tags) do
    tags
    |> Enum.filter(fn t -> is_map(t) && t["type"] == "Hashtag" end)
    |> Enum.map(fn t -> (t["name"] || "") |> String.trim_leading("#") |> String.downcase() end)
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

  defp fetch_json(url) do
    headers = [{~c"accept", ~c"application/activity+json, application/ld+json"}]

    case Http.get(url, headers) do
      {:ok, {status, body}} when status in 200..299 ->
        Jason.decode(body)

      {:ok, {status, _}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end
end
