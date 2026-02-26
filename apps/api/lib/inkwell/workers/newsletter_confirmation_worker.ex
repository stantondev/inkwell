defmodule Inkwell.Workers.NewsletterConfirmationWorker do
  @moduledoc """
  Oban worker that sends newsletter subscription confirmation emails (double opt-in).
  """
  use Oban.Worker, queue: :email, max_attempts: 3

  alias Inkwell.{Accounts, Repo}
  alias Inkwell.Newsletter.Subscriber

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"subscriber_id" => subscriber_id}}) do
    subscriber = Repo.get(Subscriber, subscriber_id)

    if is_nil(subscriber) or subscriber.status != "pending" do
      :ok
    else
      writer = Accounts.get_user!(subscriber.writer_id)
      frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")
      confirm_url = "#{frontend_url}/newsletter/confirm?token=#{subscriber.confirm_token}"

      Inkwell.Email.send_newsletter_confirmation(subscriber.email, writer, confirm_url)
      :ok
    end
  end
end
