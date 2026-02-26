defmodule Inkwell.Workers.NewsletterDeliveryWorker do
  @moduledoc """
  Oban worker that sends newsletter emails in batches via Resend's batch API.
  Enqueued when a writer publishes an entry with "Send to subscribers" enabled.
  """
  use Oban.Worker, queue: :email, max_attempts: 3, priority: 1

  alias Inkwell.{Newsletter, Accounts, Journals, Email, Repo}

  @batch_size 100
  @batch_delay_ms 600

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"send_id" => send_id}}) do
    send = Newsletter.get_send(send_id)

    if is_nil(send) do
      {:error, "Send record not found"}
    else
      if send.status not in ["queued", "sending"] do
        :ok
      else
        do_deliver(send)
      end
    end
  end

  defp do_deliver(send) do
    # Mark as sending
    {:ok, send} = Newsletter.update_send(send, %{
      status: "sending",
      started_at: DateTime.utc_now()
    })

    entry = Journals.get_entry(send.entry_id)
    writer = Accounts.get_user!(send.writer_id)

    if is_nil(entry) do
      Newsletter.update_send(send, %{
        status: "failed",
        error_message: "Entry not found",
        completed_at: DateTime.utc_now()
      })
      :ok
    else
      # Build the newsletter email HTML
      template = Email.build_newsletter_html(entry, writer)

      # Get all confirmed subscribers
      subscribers = Newsletter.get_all_confirmed_emails(writer.id)

      # Send in batches
      {total_sent, total_failed} = send_in_batches(subscribers, send, writer, template)

      # Mark complete
      Newsletter.update_send(send, %{
        status: "sent",
        sent_count: total_sent,
        failed_count: total_failed,
        recipient_count: length(subscribers),
        completed_at: DateTime.utc_now()
      })

      # Update entry with newsletter_sent_at
      entry
      |> Ecto.Changeset.change(%{newsletter_sent_at: DateTime.utc_now()})
      |> Repo.update()

      :ok
    end
  end

  defp send_in_batches(subscribers, send, writer, template) do
    subscribers
    |> Enum.chunk_every(@batch_size)
    |> Enum.reduce({0, 0}, fn batch, {sent_acc, failed_acc} ->
      case send_batch(batch, send, writer, template) do
        {:ok, count} ->
          Process.sleep(@batch_delay_ms)
          {sent_acc + count, failed_acc}

        {:error, sent, failed} ->
          Process.sleep(@batch_delay_ms)
          {sent_acc + sent, failed_acc + failed}
      end
    end)
  end

  defp send_batch(subscribers, send, writer, template) do
    frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")
    from_name = writer.newsletter_name || writer.display_name || writer.username
    from = "#{from_name} via Inkwell <noreply@inkwell.social>"
    reply_to = if writer.newsletter_reply_to, do: writer.newsletter_reply_to, else: nil

    emails = Enum.map(subscribers, fn %{email: email, unsubscribe_token: token} ->
      unsubscribe_url = "#{frontend_url}/newsletter/unsubscribe?token=#{token}"
      personalized_html = String.replace(template, "{{UNSUBSCRIBE_URL}}", unsubscribe_url)

      email_map = %{
        from: from,
        to: [email],
        subject: send.subject,
        html: personalized_html,
        headers: %{
          "List-Unsubscribe" => "<#{unsubscribe_url}>",
          "List-Unsubscribe-Post" => "List-Unsubscribe=One-Click"
        }
      }

      if reply_to do
        Map.put(email_map, :reply_to, reply_to)
      else
        email_map
      end
    end)

    Email.send_batch(emails)
  end
end
