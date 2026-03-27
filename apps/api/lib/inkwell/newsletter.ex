defmodule Inkwell.Newsletter do
  @moduledoc """
  Newsletter subscriber management and email delivery.
  Writers can build an email audience; subscribers (including non-Inkwell users)
  receive published entries as newsletter emails.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Newsletter.{Subscriber, Send}

  @free_subscriber_limit 500
  @free_send_limit 2
  @plus_send_limit 8

  # ── Subscriber Management ──

  @doc "Subscribe an email to a writer's newsletter. Returns a pending subscriber needing double opt-in confirmation."
  def subscribe(writer_id, email, opts \\ []) do
    source = Keyword.get(opts, :source, "subscribe_page")
    user_id = Keyword.get(opts, :user_id)
    email = email |> String.trim() |> String.downcase()

    case get_subscriber(writer_id, email) do
      nil ->
        %Subscriber{}
        |> Subscriber.changeset(%{
          writer_id: writer_id,
          email: email,
          user_id: user_id,
          source: source,
          status: "pending",
          confirm_token: generate_token(),
          unsubscribe_token: generate_token()
        })
        |> Repo.insert()

      %{status: "unsubscribed"} = sub ->
        sub
        |> Subscriber.changeset(%{
          status: "pending",
          confirm_token: generate_token(),
          unsubscribed_at: nil
        })
        |> Repo.update()

      %{status: "pending"} = sub ->
        {:ok, sub}

      %{status: "confirmed"} = sub ->
        {:ok, sub}
    end
  end

  @doc "Confirm a subscriber via their confirm_token (double opt-in)."
  def confirm_subscriber(token) when is_binary(token) do
    case Repo.get_by(Subscriber, confirm_token: token) do
      nil ->
        {:error, :not_found}

      %{status: "confirmed"} = sub ->
        {:ok, sub}

      sub ->
        sub
        |> Ecto.Changeset.change(%{
          status: "confirmed",
          confirmed_at: DateTime.utc_now(),
          confirm_token: nil
        })
        |> Repo.update()
    end
  end

  @doc "Unsubscribe via token (one-click, no auth needed). CAN-SPAM compliant."
  def unsubscribe_by_token(token) when is_binary(token) do
    case Repo.get_by(Subscriber, unsubscribe_token: token) do
      nil ->
        {:error, :not_found}

      %{status: "unsubscribed"} = sub ->
        {:ok, sub}

      sub ->
        sub
        |> Ecto.Changeset.change(%{
          status: "unsubscribed",
          unsubscribed_at: DateTime.utc_now()
        })
        |> Repo.update()
    end
  end

  @doc "Get a subscriber by writer_id and email."
  def get_subscriber(writer_id, email) do
    email = email |> String.trim() |> String.downcase()
    Repo.get_by(Subscriber, writer_id: writer_id, email: email)
  end

  @doc "Count confirmed subscribers for a writer."
  def count_subscribers(writer_id) do
    Subscriber
    |> where(writer_id: ^writer_id, status: "confirmed")
    |> Repo.aggregate(:count)
  end

  def count_pending_subscribers(writer_id) do
    Subscriber
    |> where(writer_id: ^writer_id, status: "pending")
    |> Repo.aggregate(:count)
  end

  @doc "Get all confirmed subscriber emails + unsubscribe tokens for delivery."
  def get_all_confirmed_emails(writer_id) do
    Subscriber
    |> where(writer_id: ^writer_id, status: "confirmed")
    |> select([s], %{email: s.email, unsubscribe_token: s.unsubscribe_token})
    |> Repo.all()
  end

  @doc "Stream confirmed subscribers in batches using keyset pagination. Memory-safe."
  def stream_confirmed_subscribers(writer_id, batch_size \\ 100) do
    Stream.unfold(nil, fn last_id ->
      query =
        Subscriber
        |> where(writer_id: ^writer_id, status: "confirmed")
        |> select([s], %{id: s.id, email: s.email, unsubscribe_token: s.unsubscribe_token})
        |> order_by(:id)
        |> limit(^batch_size)

      query = if last_id, do: where(query, [s], s.id > ^last_id), else: query

      case Repo.all(query) do
        [] -> nil
        batch -> {batch, List.last(batch).id}
      end
    end)
  end

  @doc "Count confirmed subscribers for a writer."
  def count_confirmed_subscribers(writer_id) do
    Subscriber
    |> where(writer_id: ^writer_id, status: "confirmed")
    |> Repo.aggregate(:count)
  end

  @doc "List subscribers for a writer (paginated, with optional status filter)."
  def list_subscribers(writer_id, opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 50)
    status_filter = Keyword.get(opts, :status)

    query =
      Subscriber
      |> where(writer_id: ^writer_id)
      |> order_by(desc: :inserted_at)

    query = if status_filter, do: where(query, status: ^status_filter), else: query

    total = Repo.aggregate(query, :count)

    subscribers =
      query
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> Repo.all()

    {subscribers, total}
  end

  @doc "Remove a subscriber (writer action from settings)."
  def remove_subscriber(subscriber_id, writer_id) do
    case Repo.get(Subscriber, subscriber_id) do
      %{writer_id: ^writer_id} = sub -> Repo.delete(sub)
      nil -> {:error, :not_found}
      _ -> {:error, :forbidden}
    end
  end

  @doc "Check if writer has reached their subscriber limit. Plus has unlimited."
  def at_subscriber_limit?(writer_id, subscription_tier) do
    if (subscription_tier || "free") == "plus" do
      false
    else
      count_subscribers(writer_id) >= @free_subscriber_limit
    end
  end

  @doc "Get the subscriber limit for a tier."
  def subscriber_limit(subscription_tier) do
    if (subscription_tier || "free") == "plus", do: nil, else: @free_subscriber_limit
  end

  # ── Send Limits ──

  @doc "Count newsletter sends this calendar month for a writer (queued, sending, or sent)."
  def count_sends_this_month(writer_id) do
    now = DateTime.utc_now()
    month_start = %DateTime{now | day: 1, hour: 0, minute: 0, second: 0, microsecond: {0, 6}}

    Send
    |> where([s], s.writer_id == ^writer_id)
    |> where([s], s.status in ["queued", "sending", "sent"])
    |> where([s], s.inserted_at >= ^month_start)
    |> Repo.aggregate(:count)
  end

  @doc "Get the monthly send limit for a subscription tier."
  def send_limit(subscription_tier) do
    if (subscription_tier || "free") == "plus", do: @plus_send_limit, else: @free_send_limit
  end

  @doc "Check if writer has reached their monthly send limit."
  def at_send_limit?(writer_id, subscription_tier) do
    count_sends_this_month(writer_id) >= send_limit(subscription_tier)
  end

  @doc "Get remaining sends this month for a writer."
  def remaining_sends(writer_id, subscription_tier) do
    limit = send_limit(subscription_tier)
    used = count_sends_this_month(writer_id)
    max(limit - used, 0)
  end

  # ── Newsletter Sends ──

  @doc "Create a send record and enqueue the delivery worker."
  def create_send(entry, writer, opts \\ []) do
    subject = Keyword.get(opts, :subject) || entry.title || "New post from #{writer.display_name || writer.username}"
    scheduled_at = Keyword.get(opts, :scheduled_at)
    recipient_count = count_subscribers(writer.id)

    cond do
      recipient_count == 0 ->
        {:error, :no_subscribers}

      at_send_limit?(writer.id, writer.subscription_tier) ->
        {:error, :send_limit_exceeded}

      true ->
        attrs = %{
          entry_id: entry.id,
          writer_id: writer.id,
          subject: subject,
          recipient_count: recipient_count,
          status: "queued",
          scheduled_at: scheduled_at
        }

        case %Send{} |> Send.changeset(attrs) |> Repo.insert() do
          {:ok, send} ->
            # Link send to entry
            entry
            |> Ecto.Changeset.change(%{newsletter_send_id: send.id})
            |> Repo.update()

            # Enqueue delivery worker
            worker_opts = if scheduled_at do
              [scheduled_at: scheduled_at]
            else
              []
            end

            %{send_id: send.id}
            |> Inkwell.Workers.NewsletterDeliveryWorker.new(worker_opts)
            |> Oban.insert()

            {:ok, send}

          error ->
            error
        end
    end
  end

  @doc "List send history for a writer."
  def list_sends(writer_id, opts \\ []) do
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, 20)

    query =
      Send
      |> where(writer_id: ^writer_id)
      |> order_by(desc: :inserted_at)

    total = Repo.aggregate(query, :count)

    sends =
      query
      |> limit(^per_page)
      |> offset(^((page - 1) * per_page))
      |> preload(:entry)
      |> Repo.all()

    {sends, total}
  end

  @doc "Cancel a queued (not yet started) send."
  def cancel_send(send_id, writer_id) do
    case Repo.get(Send, send_id) do
      %{writer_id: ^writer_id, status: "queued"} = send ->
        send
        |> Ecto.Changeset.change(%{status: "cancelled"})
        |> Repo.update()

      %{writer_id: ^writer_id} ->
        {:error, :cannot_cancel}

      nil ->
        {:error, :not_found}

      _ ->
        {:error, :forbidden}
    end
  end

  @doc "Get a send by ID."
  def get_send(send_id) do
    Repo.get(Send, send_id)
  end

  @doc "Update a send record (used by delivery worker)."
  def update_send(send, attrs) do
    send
    |> Send.changeset(attrs)
    |> Repo.update()
  end

  # ── Subscriber Import ──

  @free_import_cap 500
  @plus_import_cap 5_000

  @email_regex ~r/^[^\s]+@[^\s]+\.[^\s]+$/

  @doc """
  Bulk import subscribers from a list of email strings.
  Creates each as pending with source "import". Skips duplicates and invalid emails.
  Returns {:ok, %{imported: N, skipped: N, invalid: N, new_subscriber_ids: [ids]}}
  """
  def import_subscribers(writer_id, emails, subscription_tier) do
    cap = if (subscription_tier || "free") == "plus", do: @plus_import_cap, else: @free_import_cap
    emails = Enum.take(emails, cap)

    # Normalize all emails
    normalized =
      emails
      |> Enum.map(&(&1 |> String.trim() |> String.downcase()))
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()

    # Separate valid vs invalid
    {valid, invalid} = Enum.split_with(normalized, &Regex.match?(@email_regex, &1))

    # Find existing subscribers in one query
    existing_emails =
      Subscriber
      |> where(writer_id: ^writer_id)
      |> where([s], s.email in ^valid)
      |> select([s], s.email)
      |> Repo.all()
      |> MapSet.new()

    # Filter to only new emails
    new_emails = Enum.reject(valid, &MapSet.member?(existing_emails, &1))

    # Batch insert new subscribers
    now = DateTime.utc_now() |> DateTime.truncate(:microsecond)
    new_subscriber_ids =
      new_emails
      |> Enum.map(fn email ->
        id = Ecto.UUID.generate()
        %{
          id: id,
          email: email,
          writer_id: writer_id,
          status: "pending",
          source: "import",
          confirm_token: generate_token(),
          unsubscribe_token: generate_token(),
          inserted_at: now,
          updated_at: now
        }
      end)

    # Insert in batches of 500 (Postgres parameter limit)
    new_subscriber_ids
    |> Enum.chunk_every(500)
    |> Enum.each(fn batch ->
      Repo.insert_all(Subscriber, batch)
    end)

    ids = Enum.map(new_subscriber_ids, & &1.id)

    {:ok, %{
      imported: length(new_emails),
      skipped: MapSet.size(existing_emails),
      invalid: length(invalid),
      new_subscriber_ids: ids
    }}
  end

  @doc "Get the import cap for a tier."
  def import_cap(subscription_tier) do
    if (subscription_tier || "free") == "plus", do: @plus_import_cap, else: @free_import_cap
  end

  # ── Helpers ──

  defp generate_token do
    :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
  end
end
