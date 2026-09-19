defmodule InkwellWeb.EntryPublishing do
  @moduledoc """
  Everything that happens when an entry goes live: @mention notifications,
  delivery to fediverse followers, the new-account spam check, the newsletter
  and Mastodon cross-posts the writer asked for, and search indexing.

  Shared by publishing from the editor and by `PublishScheduledEntriesWorker`,
  so a scheduled post goes out exactly like one published by hand.

  `options` are the writer's choices, string-keyed as the editor sends them:
  `"send_newsletter"`, `"newsletter_subject"`, `"newsletter_scheduled_at"`,
  `"crosspost_to"`.
  """

  alias Inkwell.{Accounts, Newsletter, OAuth, Repo}
  alias Inkwell.Federation.Workers.FanOutWorker
  alias Inkwell.Workers.{CrosspostWorker, SearchIndexWorker}
  alias InkwellWeb.Helpers.MentionHelper

  def after_publish(entry, user, options) do
    entry = process_mentions(entry, user.id)

    if entry.privacy == :public do
      %{entry_id: entry.id, action: "create", user_id: user.id}
      |> FanOutWorker.new()
      |> Oban.insert()
    end

    maybe_queue_spam_check(user, entry)
    maybe_send_newsletter(entry, user, options)
    maybe_enqueue_crossposts(entry, user, options)

    %{action: "index_entry", entry_id: entry.id}
    |> SearchIndexWorker.new()
    |> Oban.insert()

    entry
  end

  @doc """
  Turns @username in an entry into profile links and, once the entry is
  published, notifies each person mentioned (once per entry).
  """
  def process_mentions(entry, author_id) do
    case entry.body_html do
      nil -> entry
      body_html ->
        {processed_html, mentioned_users} = MentionHelper.process_mentions(body_html)

        # Update the entry HTML with processed mentions (converts @username to links)
        entry =
          if processed_html != body_html do
            {:ok, updated} =
              entry
              |> Ecto.Changeset.change(%{body_html: Inkwell.HtmlSanitizer.sanitize(processed_html)})
              |> Repo.update()
            updated
          else
            entry
          end

        # Notify mentioned users — but only once per entry, and only for
        # published entries.
        #
        # This ran on every save. The editor autosaves while you write, so
        # mentioning someone in a post sent them a fresh notification *and
        # email* every few seconds (one entry produced 35 of each before this
        # was fixed). Drafts notified too, before anyone could read the post.
        if entry.status == :published do
          for user <- mentioned_users,
              user.id != author_id,
              not Accounts.already_notified_mention?(user.id, "entry", entry.id) do
            Accounts.create_notification(%{
              type: :mention,
              user_id: user.id,
              actor_id: author_id,
              target_type: "entry",
              target_id: entry.id
            })
          end
        end

        entry
    end
  end

  # New accounts publishing publicly get a spam check within a minute instead
  # of waiting for the hourly scan (spam posts land within minutes of signup).
  defp maybe_queue_spam_check(user, %{status: :published, privacy: privacy})
       when privacy in [:public, :paid] do
    if DateTime.diff(DateTime.utc_now(), user.inserted_at, :day) < 7 do
      Inkwell.Workers.AutoModerationWorker.enqueue_user(user.id)
    end

    :ok
  end

  defp maybe_queue_spam_check(_, _), do: :ok

  defp maybe_send_newsletter(entry, user, params) do
    send_newsletter = params["send_newsletter"]

    if send_newsletter == true and entry.privacy == :public and (user.newsletter_enabled || false) do
      scheduled_at = case params["newsletter_scheduled_at"] do
        nil -> nil
        dt_string when is_binary(dt_string) ->
          case DateTime.from_iso8601(dt_string) do
            {:ok, dt, _} -> dt
            _ -> nil
          end
        _ -> nil
      end

      Newsletter.create_send(entry, user,
        subject: params["newsletter_subject"],
        scheduled_at: scheduled_at
      )
    end
  end

  defp maybe_enqueue_crossposts(entry, user, params) do
    crosspost_to = params["crosspost_to"]

    if is_list(crosspost_to) and entry.privacy == :public do
      accounts = OAuth.list_fediverse_accounts(user.id)
      account_ids = Enum.map(accounts, & &1.id) |> MapSet.new()

      Enum.each(crosspost_to, fn account_id ->
        if MapSet.member?(account_ids, account_id) do
          %{entry_id: entry.id, fediverse_account_id: account_id}
          |> CrosspostWorker.new()
          |> Oban.insert()
        end
      end)
    end
  end
end
