defmodule Inkwell.Federation.Workers.CommentFederationWorker do
  @moduledoc """
  Sends the fediverse Delete for a footnote that's gone. The job carries ids
  only (see `Inkwell.Federation.CommentFederation`), so it works after the
  footnote and its entry have left the database.
  """

  use Oban.Worker,
    queue: :federation,
    max_attempts: 3,
    priority: 2

  alias Inkwell.Federation.CommentFederation

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"action" => "delete"} = args}) do
    CommentFederation.deliver_retraction(args)
  end
end
