defmodule Inkwell.Workers.EmailNotificationWorker do
  @moduledoc """
  Oban worker that sends an email notification for a comment, reply, or mention.
  One job per notification (enqueued from Accounts.maybe_send_email_notification/2).
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  alias Inkwell.Repo
  alias Inkwell.Accounts.User
  alias Inkwell.Email

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    %{
      "user_id" => user_id,
      "actor_name" => actor_name,
      "type" => type,
      "entry_title" => entry_title,
      "entry_url" => entry_url
    } = args

    # New fields (optional for backward compat with in-flight jobs)
    actor_username = args["actor_username"]
    comment_id = args["comment_id"]

    user = Repo.get(User, user_id)

    if is_nil(user) do
      Logger.debug("[EmailNotification] User #{user_id} not found, skipping")
      :ok
    else
      comment_body = resolve_comment_body(comment_id)
      actor_avatar_url = resolve_avatar_url(actor_username)

      Email.send_comment_notification(user, actor_name, actor_username, type, entry_title, entry_url, %{
        comment_body: comment_body,
        actor_avatar_url: actor_avatar_url
      })
    end
  end

  defp resolve_comment_body(nil), do: nil

  defp resolve_comment_body(comment_id) do
    case Repo.get(Inkwell.Journals.Comment, comment_id) do
      nil -> nil
      comment -> strip_and_truncate(comment.body_html, 300)
    end
  end

  defp resolve_avatar_url(nil), do: nil

  defp resolve_avatar_url(username) do
    # Remote fediverse actors (user@domain) don't have local avatars
    if String.contains?(username, "@") do
      nil
    else
      api_url = Application.get_env(:inkwell, :api_url, "http://localhost:4000")
      "#{api_url}/api/avatars/#{username}"
    end
  end

  defp strip_and_truncate(nil, _max), do: nil

  defp strip_and_truncate(html, max) do
    plain =
      html
      |> String.replace(~r/<br\s*\/?>/, " ")
      |> String.replace(~r/<[^>]+>/, "")
      |> String.replace("&amp;", "&")
      |> String.replace("&lt;", "<")
      |> String.replace("&gt;", ">")
      |> String.replace("&quot;", "\"")
      |> String.replace("&#39;", "'")
      |> String.replace("&nbsp;", " ")
      |> String.replace(~r/\s+/, " ")
      |> String.trim()

    if String.length(plain) > max do
      plain
      |> String.slice(0, max)
      |> String.replace(~r/\s+\S*$/, "")
      |> Kernel.<>("...")
    else
      plain
    end
  end
end
