defmodule Inkwell.Workers.LetterEmailWorker do
  @moduledoc """
  Emails someone that a letter is waiting, ten minutes after it arrives, if
  they still haven't read it. Scheduled by `Inkwell.Letters.send_letter/4`.

  One email per unread stretch per conversation (`Letters.letter_email_due?/2`),
  so a back-and-forth while both people are on the site sends nothing, and a
  run of letters while someone is away sends one.

  The email names the sender and links to the conversation. It never carries
  the letter itself: letters are private, and email isn't.

  Skipped for suspended accounts, fediverse placeholder addresses, anyone who
  turned off email notifications (or letter emails alone), and pairs who have
  blocked each other since.
  """

  use Oban.Worker,
    queue: :default,
    max_attempts: 3,
    unique: [
      period: 600,
      keys: [:conversation_id, :recipient_id],
      states: [:available, :scheduled]
    ]

  alias Inkwell.{Email, Letters, Repo}
  alias Inkwell.Accounts.User

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"conversation_id" => conversation_id, "recipient_id" => recipient_id}}) do
    with %User{} = recipient <- Repo.get(User, recipient_id),
         true <- emailable?(recipient),
         {:ok, conv, sender} <- Letters.letter_email_context(conversation_id, recipient_id),
         true <- is_nil(sender.blocked_at),
         true <- Letters.letter_email_due?(conversation_id, recipient_id) do
      frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")

      case Email.send_letter_notification(recipient, sender, "#{frontend_url}/letters/#{conv.id}") do
        {:ok, _} ->
          Letters.mark_emailed(conversation_id, recipient_id)
          :ok

        {:error, reason} ->
          Logger.warning("[LetterEmail] Send failed for #{recipient_id}: #{inspect(reason)}")
          {:error, reason}
      end
    else
      _ -> :ok
    end
  end

  @doc false
  def emailable?(%User{} = user) do
    settings = user.settings || %{}

    is_nil(user.blocked_at) and is_binary(user.email) and
      not String.ends_with?(user.email, ".fediverse.inkwell.social") and
      settings["email_notifications_disabled"] != true and
      settings["letter_emails_disabled"] != true
  end
end
