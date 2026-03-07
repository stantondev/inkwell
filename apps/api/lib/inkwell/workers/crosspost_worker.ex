defmodule Inkwell.Workers.CrosspostWorker do
  @moduledoc """
  Oban worker for cross-posting Inkwell entries to linked Mastodon accounts.

  Enqueued when a user publishes an entry with `crosspost_to` account IDs.
  Posts a preview status on the linked Mastodon account with a link back to
  the entry on Inkwell.

  Args: %{"entry_id" => uuid, "fediverse_account_id" => uuid}
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  alias Inkwell.{Journals, OAuth, Repo}
  alias Inkwell.Federation.MastodonClient

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"entry_id" => entry_id, "fediverse_account_id" => account_id}}) do
    with {:entry, entry} when not is_nil(entry) <- {:entry, get_entry(entry_id)},
         {:account, account} when not is_nil(account) <- {:account, get_account(account_id)},
         {:scope, true} <- {:scope, has_write_scope?(account.token_scope)} do

      username = get_entry_author_username(entry)
      status_text = MastodonClient.build_crosspost_text(entry, username)

      # Optionally upload cover image
      media_ids =
        case maybe_upload_cover_image(entry, account) do
          {:ok, media_id} -> [media_id]
          _ -> []
        end

      params = %{
        "status" => status_text,
        "visibility" => "public",
        "media_ids" => media_ids,
        "language" => "en"
      }

      # Add content warning if entry is sensitive
      params =
        if entry.sensitive && entry.content_warning do
          Map.put(params, "spoiler_text", entry.content_warning)
          |> Map.put("sensitive", true)
        else
          params
        end

      case MastodonClient.post_status(account.domain, account.access_token, params) do
        {:ok, %{id: status_id, url: status_url}} ->
          # Store the crosspost result on the entry
          results = entry.crosspost_results || %{}
          updated_results = Map.put(results, account_id, %{
            "status_id" => status_id,
            "url" => status_url,
            "domain" => account.domain,
            "posted_at" => DateTime.utc_now() |> DateTime.to_iso8601()
          })

          entry
          |> Ecto.Changeset.change(%{crosspost_results: updated_results})
          |> Repo.update()

          Logger.info("Cross-posted entry #{entry_id} to #{account.domain} — status #{status_id}")
          :ok

        {:error, {:http_error, 401}} ->
          Logger.warning("Cross-post failed: token expired for account #{account_id} on #{account.domain}")
          {:error, "Token expired — user needs to re-link their fediverse account"}

        {:error, {:http_error, 422}} ->
          Logger.warning("Cross-post rejected by #{account.domain} for entry #{entry_id}")
          # Don't retry validation errors
          :ok

        {:error, reason} ->
          Logger.warning("Cross-post failed for entry #{entry_id} to #{account.domain}: #{inspect(reason)}")
          {:error, "Cross-post failed: #{inspect(reason)}"}
      end
    else
      {:entry, nil} ->
        Logger.warning("CrosspostWorker: entry #{entry_id} not found (may have been deleted)")
        :ok

      {:account, nil} ->
        Logger.warning("CrosspostWorker: fediverse account #{account_id} not found (may have been unlinked)")
        :ok

      {:scope, false} ->
        Logger.warning("CrosspostWorker: account #{account_id} lacks write scope — skipping")
        :ok
    end
  end

  # ── Private helpers ──────────────────────────────────────────────

  defp get_entry(entry_id) do
    Journals.get_entry!(entry_id)
  rescue
    Ecto.NoResultsError -> nil
  end

  defp get_account(account_id) do
    try do
      OAuth.get_fediverse_account!(account_id)
    rescue
      Ecto.NoResultsError -> nil
    end
  end

  defp has_write_scope?(nil), do: false
  defp has_write_scope?(scope) when is_binary(scope) do
    scope_set = scope |> String.split() |> MapSet.new()
    MapSet.member?(scope_set, "write:statuses") || MapSet.member?(scope_set, "write")
  end

  defp get_entry_author_username(entry) do
    entry = Repo.preload(entry, :user)
    entry.user.username
  end

  defp maybe_upload_cover_image(entry, account) do
    if entry.cover_image_id do
      case Repo.get(Inkwell.Journals.EntryImage, entry.cover_image_id) do
        nil ->
          {:error, :no_image}

        image ->
          # Decode from data URI
          case parse_data_uri(image.data) do
            {:ok, binary, content_type} ->
              MastodonClient.upload_media(account.domain, account.access_token, binary, content_type)

            _ ->
              {:error, :invalid_data_uri}
          end
      end
    else
      {:error, :no_cover_image}
    end
  end

  defp parse_data_uri("data:" <> rest) do
    case String.split(rest, ",", parts: 2) do
      [meta, encoded] ->
        content_type =
          meta
          |> String.split(";")
          |> List.first()
          |> String.trim()

        case Base.decode64(encoded) do
          {:ok, binary} -> {:ok, binary, content_type}
          :error -> {:error, :decode_failed}
        end

      _ ->
        {:error, :invalid_format}
    end
  end
  defp parse_data_uri(_), do: {:error, :not_data_uri}
end
