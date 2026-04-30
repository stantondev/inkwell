defmodule Inkwell.Federation.ReplyBackfill do
  @moduledoc """
  One-time recovery for Mastodon replies-to-comments that were silently dropped
  before the inbound reply-to-comment fix landed.

  The bug: when a fediverse user replied to one of our users' comments on a
  remote (Mastodon) post, our inbox handler couldn't match the reply's
  `inReplyTo` (a comment URL) to a known target and dropped it. The fix in
  `FederationController.handle_incoming_reply/2` handles this going forward,
  but historical replies need to be recovered manually.

  This module walks Mastodon's `/api/v1/statuses/:id/context` for each remote
  entry our users have commented on, finds descendant Notes whose `inReplyTo`
  points to one of our comments, fetches the AP representation, and ingests
  it via the now-fixed inbox path.

  ## Operational characteristics

  - **Mastodon-API specific.** The descendants endpoint is a Mastodon
    convention; non-Mastodon servers (Pleroma works, Akkoma works, weredreaming
    is custom) may 404. We log and skip.
  - **Rate limited.** Per-domain delay between requests, configurable.
  - **Sequential.** One remote_entry processed at a time, one descendant fetch
    at a time. Designed to be called from IEx so it can be Ctrl-C'd.
  - **Idempotent.** Each ingested reply uses the existing comment-creation path
    which deduplicates on `ap_id`, so re-running is safe.

  ## Usage from `fly ssh console --app inkwell-api` → IEx:

      # Recover replies for a single remote entry (recommended for testing):
      Inkwell.Federation.ReplyBackfill.backfill_remote_entry("2d5f9b25-727d-47ab-ba7f-a13b01025df2")

      # Recover for all remote entries that have local comments:
      Inkwell.Federation.ReplyBackfill.backfill_all()

      # Custom pacing (defaults: 1500ms between API calls, 5000ms between entries):
      Inkwell.Federation.ReplyBackfill.backfill_all(api_delay_ms: 2000, entry_delay_ms: 10_000)
  """

  alias Inkwell.Federation.{Http, RemoteEntry}
  alias Inkwell.Journals.Comment
  alias Inkwell.Repo
  alias InkwellWeb.FederationController

  import Ecto.Query

  require Logger

  @default_api_delay_ms 1_500
  @default_entry_delay_ms 5_000

  @ap_accept_headers [{~c"accept", ~c"application/activity+json, application/ld+json"}]
  @json_accept_headers [{~c"accept", ~c"application/json"}]

  @doc """
  Backfill replies for every remote_entry that has at least one local comment.

  Returns a summary map after processing all entries.
  """
  def backfill_all(opts \\ []) do
    api_delay = Keyword.get(opts, :api_delay_ms, @default_api_delay_ms)
    entry_delay = Keyword.get(opts, :entry_delay_ms, @default_entry_delay_ms)

    remote_entry_ids =
      from(c in Comment,
        where: not is_nil(c.remote_entry_id),
        distinct: true,
        select: c.remote_entry_id
      )
      |> Repo.all()

    Logger.info("ReplyBackfill: starting backfill for #{length(remote_entry_ids)} remote entries")

    summary =
      Enum.reduce(remote_entry_ids, %{processed: 0, replies_ingested: 0, errors: []}, fn id, acc ->
        result = backfill_remote_entry(id, api_delay_ms: api_delay)
        Process.sleep(entry_delay)

        %{
          processed: acc.processed + 1,
          replies_ingested: acc.replies_ingested + (result[:replies_ingested] || 0),
          errors: acc.errors ++ (result[:errors] || [])
        }
      end)

    Logger.info("ReplyBackfill: complete. #{inspect(summary)}")
    summary
  end

  @doc """
  Backfill replies for a single remote_entry by id.

  Returns `%{replies_ingested: N, errors: [...]}`.
  """
  def backfill_remote_entry(remote_entry_id, opts \\ []) when is_binary(remote_entry_id) do
    api_delay = Keyword.get(opts, :api_delay_ms, @default_api_delay_ms)

    case Repo.get(RemoteEntry, remote_entry_id) do
      nil ->
        Logger.warning("ReplyBackfill: remote_entry #{remote_entry_id} not found")
        %{replies_ingested: 0, errors: [:remote_entry_not_found]}

      remote_entry ->
        do_backfill(remote_entry, api_delay)
    end
  end

  # ── Implementation ─────────────────────────────────────────────────────

  defp do_backfill(%RemoteEntry{} = remote_entry, api_delay) do
    Logger.info("ReplyBackfill: starting #{remote_entry.id} (#{remote_entry.ap_id})")

    case fetch_mastodon_context(remote_entry.ap_id) do
      {:ok, %{"descendants" => descendants}} when is_list(descendants) ->
        Logger.info("ReplyBackfill: #{length(descendants)} descendants for #{remote_entry.id}")
        Process.sleep(api_delay)

        process_descendants(descendants, remote_entry, api_delay)

      {:ok, _} ->
        Logger.info("ReplyBackfill: no descendants in context for #{remote_entry.id}")
        %{replies_ingested: 0, errors: []}

      {:error, reason} ->
        Logger.warning("ReplyBackfill: failed to fetch context for #{remote_entry.ap_id}: #{inspect(reason)}")
        %{replies_ingested: 0, errors: [{remote_entry.id, reason}]}
    end
  end

  # Mastodon's REST API: /api/v1/statuses/:id/context
  # Derives the API URL from the remote entry's ap_id by extracting the status id
  # from the path and reconstructing as <host>/api/v1/statuses/<id>/context.
  defp fetch_mastodon_context(ap_id) do
    with {:ok, status_id, host} <- parse_mastodon_status_url(ap_id),
         api_url = "https://#{host}/api/v1/statuses/#{status_id}/context",
         {:ok, {status, body}} when status in 200..299 <- Http.get(api_url, @json_accept_headers) do
      Jason.decode(body)
    else
      {:ok, {status, _body}} -> {:error, {:http_error, status}}
      {:error, reason} -> {:error, reason}
      :not_mastodon_url -> {:error, :not_mastodon_url}
    end
  end

  # Extract the status id from a Mastodon-style URL.
  # Recognizes:
  #   https://host/users/:user/statuses/:id
  #   https://host/ap/users/:user/statuses/:id
  #   https://host/@:user/:id
  #   https://host/notice/:id  (Pleroma)
  defp parse_mastodon_status_url(url) when is_binary(url) do
    uri = URI.parse(url)

    case uri.path do
      nil ->
        :not_mastodon_url

      path ->
        cond do
          match = Regex.run(~r{/statuses/(\d+)$}, path) ->
            [_, id] = match
            {:ok, id, uri.host}

          match = Regex.run(~r{^/@[^/]+/(\d+)$}, path) ->
            [_, id] = match
            {:ok, id, uri.host}

          match = Regex.run(~r{^/notice/(\d+)$}, path) ->
            [_, id] = match
            {:ok, id, uri.host}

          true ->
            :not_mastodon_url
        end
    end
  end

  defp parse_mastodon_status_url(_), do: :not_mastodon_url

  defp process_descendants(descendants, remote_entry, api_delay) do
    # We're looking for descendants whose `in_reply_to_id` (Mastodon API field)
    # corresponds to one of OUR comment URLs on this remote entry. Mastodon
    # doesn't give us the actual `inReplyTo` URL in /context — it gives a
    # numeric `in_reply_to_account_id` and `in_reply_to_id`. The URL shape we
    # need to verify is in the AP representation, so we have to fetch each
    # descendant's AP Note.
    #
    # Optimization: only fetch descendants that aren't already in our comments
    # table (by URL). For each unknown descendant, fetch its AP Note, check
    # `inReplyTo` against our comment URLs, and if matched, hand to the inbox
    # path.

    our_comment_url_set = our_comment_urls_for_remote_entry(remote_entry.id)

    Enum.reduce(descendants, %{replies_ingested: 0, errors: []}, fn desc, acc ->
      desc_url = desc["url"] || desc["uri"]

      cond do
        is_nil(desc_url) ->
          acc

        already_have_comment?(desc_url) ->
          Logger.debug("ReplyBackfill: skip #{desc_url} (already ingested)")
          acc

        true ->
          result = process_one_descendant(desc_url, our_comment_url_set, remote_entry)
          Process.sleep(api_delay)

          %{
            replies_ingested: acc.replies_ingested + (result[:replies_ingested] || 0),
            errors: acc.errors ++ (result[:errors] || [])
          }
      end
    end)
  end

  # Build the set of our comment URLs (both ap_id-based AND db-id-based formats)
  # for this remote entry, used to recognize which descendants are replying
  # to one of our users.
  defp our_comment_urls_for_remote_entry(remote_entry_id) do
    instance_host =
      Application.get_env(:inkwell, :federation, []) |> Keyword.get(:instance_host, "inkwell.social")

    from(c in Comment,
      where: c.remote_entry_id == ^remote_entry_id,
      select: %{id: c.id, ap_id: c.ap_id}
    )
    |> Repo.all()
    |> Enum.flat_map(fn %{id: id, ap_id: ap_id} ->
      [ap_id, "https://#{instance_host}/comments/#{id}"]
    end)
    |> Enum.reject(&is_nil/1)
    |> MapSet.new()
  end

  defp already_have_comment?(url) do
    from(c in Comment, where: c.ap_id == ^url, select: c.id)
    |> Repo.one()
    |> Kernel.!=(nil)
  end

  defp process_one_descendant(url, our_comment_url_set, _remote_entry) do
    Logger.info("ReplyBackfill: fetching descendant AP Note: #{url}")

    case Http.get(url, @ap_accept_headers) do
      {:ok, {status, body}} when status in 200..299 ->
        case Jason.decode(body) do
          {:ok, note} ->
            in_reply_to = note["inReplyTo"]

            if in_reply_to in our_comment_url_set do
              Logger.info("ReplyBackfill: matched — inReplyTo=#{in_reply_to}")
              ingest_via_inbox_path(note)
              %{replies_ingested: 1, errors: []}
            else
              Logger.debug("ReplyBackfill: descendant #{url} inReplyTo=#{in_reply_to} not one of our comments — skipping")
              %{replies_ingested: 0, errors: []}
            end

          {:error, reason} ->
            Logger.warning("ReplyBackfill: JSON decode failed for #{url}: #{inspect(reason)}")
            %{replies_ingested: 0, errors: [{url, :decode_failed}]}
        end

      {:ok, {status, _}} ->
        Logger.warning("ReplyBackfill: HTTP #{status} for #{url}")
        %{replies_ingested: 0, errors: [{url, {:http_error, status}}]}

      {:error, reason} ->
        Logger.warning("ReplyBackfill: HTTP error for #{url}: #{inspect(reason)}")
        %{replies_ingested: 0, errors: [{url, reason}]}
    end
  end

  # Hand the AP Note off to the same handler the inbox uses. This keeps the
  # ingestion path identical for backfilled replies and live replies — we only
  # diverge on how the activity arrives.
  defp ingest_via_inbox_path(note) do
    actor_uri = note["attributedTo"] || note["actor"]
    FederationController.process_incoming_reply_for_backfill(note, actor_uri)
  end
end
