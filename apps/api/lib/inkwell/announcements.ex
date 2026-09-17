defmodule Inkwell.Announcements do
  @moduledoc """
  One-off founder emails to every account (e.g. asking the community to help
  fund Inkwell).

  Recipients exclude blocked accounts, fediverse sign-ins with placeholder
  addresses, and anyone who has turned off Inkwell emails. Delivery is one
  Oban job per person, spaced out to stay under the email provider's rate
  limit, and unique per person + subject so a double-click or retry can
  never email someone twice.
  """

  alias Inkwell.Accounts.User
  alias Inkwell.Repo

  import Ecto.Query

  @spacing_seconds 1

  def recipients_query do
    from(u in User,
      where: is_nil(u.blocked_at),
      where: not is_nil(u.email),
      where: not like(u.email, "%.fediverse.inkwell.social"),
      where:
        is_nil(u.settings) or
          fragment("coalesce((?->>'email_notifications_disabled')::boolean, false) = false", u.settings)
    )
  end

  def recipient_count, do: recipients_query() |> select([u], count(u.id)) |> Repo.one()

  def validate(subject, body) do
    cond do
      not is_binary(subject) or String.trim(subject) == "" -> {:error, "Subject is required"}
      String.length(subject) > 150 -> {:error, "Subject is too long"}
      not is_binary(body) or String.trim(body) == "" -> {:error, "Message is required"}
      String.length(body) > 10_000 -> {:error, "Message is too long"}
      true -> :ok
    end
  end

  @doc "Send the email to a single user now (used for the admin's test send)."
  def send_test(%User{} = user, subject, body) do
    with :ok <- validate(subject, body) do
      Inkwell.Email.send_announcement(user, "[Test] " <> subject, body)
    end
  end

  @doc "Queue the email for every recipient. Returns {:ok, queued_count}."
  def enqueue_all(subject, body) do
    with :ok <- validate(subject, body) do
      ids = recipients_query() |> order_by([u], asc: u.inserted_at) |> select([u], u.id) |> Repo.all()

      jobs =
        ids
        |> Enum.with_index()
        |> Enum.map(fn {id, i} ->
          Inkwell.Workers.AnnouncementWorker.new(
            %{"user_id" => id, "subject" => subject, "body" => body},
            schedule_in: i * @spacing_seconds
          )
        end)

      # Oban.insert/1 one at a time: insert_all/1 skips uniqueness checks in
      # open-source Oban, and uniqueness is what prevents double sends.
      queued =
        Enum.count(jobs, fn job ->
          match?({:ok, %Oban.Job{conflict?: false}}, Oban.insert(job))
        end)

      {:ok, queued}
    end
  end
end
