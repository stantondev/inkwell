defmodule Inkwell.Workers.NewsletterDigestWorker do
  @moduledoc """
  Hourly: sends every newsletter digest that's due (`Inkwell.Newsletter.Digests`)
  — weekly digests on their day and hour, count digests whose oldest post has
  waited 30 days or whose count was reached while spacing held them back, and
  anything left waiting after a writer switched back to one email per post.
  A late run catches up: a weekly digest is due whenever a post queued before
  the latest send time is still waiting.
  """
  use Oban.Worker, queue: :default, max_attempts: 1, unique: [period: 3000]

  import Ecto.Query
  require Logger

  alias Inkwell.Repo
  alias Inkwell.Accounts.User
  alias Inkwell.Journals.Entry
  alias Inkwell.Newsletter.Digests

  @impl Oban.Worker
  def perform(_job) do
    writer_ids =
      from(e in Entry,
        where: not is_nil(e.newsletter_queued_at) and is_nil(e.newsletter_send_id),
        distinct: true,
        select: e.user_id
      )
      |> Repo.all()

    sent =
      from(u in User, where: u.id in ^writer_ids and u.newsletter_enabled == true and is_nil(u.blocked_at))
      |> Repo.all()
      |> Enum.count(fn user ->
        case Digests.maybe_send(user) do
          {:ok, _send} -> true
          _ -> false
        end
      end)

    if sent > 0, do: Logger.info("Sent #{sent} newsletter digests")
    :ok
  end
end
