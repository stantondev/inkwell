defmodule Inkwell.Workers.NewsletterImportWorker do
  @moduledoc """
  Oban worker that sends confirmation emails to imported newsletter subscribers.
  Processes in batches of 50 with 1-second delay between batches to avoid rate limiting.
  """
  use Oban.Worker, queue: :email, max_attempts: 3

  import Ecto.Query

  alias Inkwell.{Accounts, Repo}
  alias Inkwell.Newsletter.Subscriber

  require Logger

  @batch_size 50

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"writer_id" => writer_id, "subscriber_ids" => subscriber_ids}}) do
    writer = Accounts.get_user!(writer_id)
    frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")

    subscriber_ids
    |> Enum.chunk_every(@batch_size)
    |> Enum.with_index()
    |> Enum.each(fn {batch_ids, index} ->
      # Delay between batches (skip first)
      if index > 0, do: Process.sleep(1_000)

      subscribers =
        Subscriber
        |> Ecto.Query.where([s], s.id in ^batch_ids)
        |> Ecto.Query.where(status: "pending")
        |> Repo.all()

      Enum.each(subscribers, fn subscriber ->
        confirm_url = "#{frontend_url}/newsletter/confirm?token=#{subscriber.confirm_token}"

        case Inkwell.Email.send_newsletter_confirmation(subscriber.email, writer, confirm_url) do
          {:ok, _} ->
            :ok

          {:error, reason} ->
            Logger.warning("[NewsletterImport] Failed to send confirmation to #{subscriber.email}: #{inspect(reason)}")
        end
      end)
    end)

    :ok
  end
end
