defmodule Inkwell.Federation.Workers.ProcessInboxActivityWorker do
  @moduledoc """
  Processes an inbound ActivityPub activity asynchronously.

  Inbox endpoints (`/inbox`, `/users/:u/inbox`) verify the HTTP signature and
  validate the actor origin synchronously inside the request, then enqueue this
  worker and return 202 immediately. All downstream work — DB writes, remote
  actor fetches, notification creation, fan-out — happens here, decoupled from
  the request lifecycle.

  This matches how every other major ActivityPub implementation (Mastodon,
  Pleroma, Akkoma, GoToSocial) handles inbox traffic. It prevents Mastodon
  Delete fan-outs and other bursts from saturating the Phoenix request pool
  and starving real user requests.

  Args:
    - `"activity"` — the ActivityPub activity (full JSON-decoded map)
    - `"target_username"` — local username for `/users/:u/inbox`, or nil for
      shared inbox (`/inbox`)
  """

  use Oban.Worker, queue: :federation, max_attempts: 3

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    activity = Map.get(args, "activity")
    target_username = Map.get(args, "target_username")

    target_user =
      case target_username do
        nil ->
          nil

        "" ->
          nil

        username when is_binary(username) ->
          Inkwell.Accounts.get_user_by_username(username)
      end

    # Shared inbox without a target_username, or username that doesn't resolve,
    # both pass `nil` — handlers branch on whether target_user is set.
    InkwellWeb.FederationController.process_activity_async(activity, target_user)
    :ok
  rescue
    error ->
      Logger.error(
        "ProcessInboxActivityWorker crashed: #{Exception.message(error)} — #{inspect(error)}"
      )

      # Re-raise so Oban records the failure and retries with backoff.
      reraise error, __STACKTRACE__
  end
end
