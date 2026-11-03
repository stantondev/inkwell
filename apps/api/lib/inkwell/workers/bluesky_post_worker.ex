defmodule Inkwell.Workers.BlueskyPostWorker do
  @moduledoc """
  Shares a published public entry from the writer's linked Bluesky account
  (`Inkwell.Bluesky.Poster`). Queued from the editor's Cross-post section
  alongside Mastodon accounts. The result goes into `entry.crosspost_results`
  under the Bluesky account's id, which also stops a retry from posting twice.

  Args: %{"entry_id" => uuid, "bluesky_account_id" => uuid}
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  alias Inkwell.{Bluesky, Repo}
  alias Inkwell.Bluesky.{Account, Poster}
  alias Inkwell.Journals.Entry

  require Logger

  @impl Oban.Worker
  def timeout(_job), do: :timer.minutes(2)

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"entry_id" => entry_id, "bluesky_account_id" => account_id}}) do
    entry = Repo.get(Entry, entry_id) |> then(&(&1 && Repo.preload(&1, :user)))
    account = Bluesky.get(account_id)

    cond do
      is_nil(entry) or is_nil(account) ->
        :ok

      entry.status != :published or entry.privacy != :public or entry.user_id != account.user_id ->
        :ok

      Map.has_key?(entry.crosspost_results || %{}, account_id) ->
        :ok

      not Account.can_post?(account) ->
        Logger.info("Bluesky share skipped for entry #{entry_id}: account can't post")
        :ok

      true ->
        case Poster.post(entry, account) do
          {:ok, %{uri: uri, url: url}} ->
            results =
              Map.put(entry.crosspost_results || %{}, account_id, %{
                "uri" => uri,
                "url" => url,
                "domain" => "bsky.app",
                "posted_at" => DateTime.utc_now() |> DateTime.to_iso8601()
              })

            entry |> Ecto.Changeset.change(crosspost_results: results) |> Repo.update()
            :ok

          {:error, :session_ended} ->
            Logger.info("Bluesky share for entry #{entry_id}: session ended, member must reconnect")
            :ok

          {:error, {:http_error, status, _}} when status in 400..499 and status not in [408, 429] ->
            Logger.warning("Bluesky refused entry #{entry_id}: #{status}")
            :ok

          {:error, reason} ->
            {:error, "Bluesky share failed: #{inspect(reason)}"}
        end
    end
  end
end
