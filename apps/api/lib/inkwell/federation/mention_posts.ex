defmodule Inkwell.Federation.MentionPosts do
  @moduledoc """
  Answering a fediverse post that mentions a member.

  A mention only leaves a notification behind (the post itself isn't stored),
  so there was nothing on Inkwell to reply to. When the member presses Reply,
  `for_notification/2` fetches the post from its server and saves it as a
  remote entry (source "mention"); a footnote there goes out as a real reply,
  threaded under their post.

  Only the member's own `:fediverse_mention` notifications can be resolved, so
  this can't be used to fetch arbitrary URLs. Saved posts stay off Explore
  (`RemoteEntries.list_public_remote_entries/1` leaves the source out).
  """

  import Ecto.Query
  require Logger

  alias Inkwell.Repo
  alias Inkwell.Accounts.Notification
  alias Inkwell.Federation.{Http, RemoteActor, RemoteEntries, RemoteEntry}
  alias Inkwell.Moderation.FediverseBlocks

  @public "https://www.w3.org/ns/activitystreams#Public"
  @types ~w[Note Article Page Question]

  @doc """
  Returns `{:ok, remote_entry}` for the post a mention notification is about,
  saving it first if needed. Errors: `:not_found`, `:not_public`, `:blocked`,
  `:unavailable` (their server didn't give us the post).
  """
  def for_notification(user, notification_id) do
    with {:ok, notification} <- find_notification(user, notification_id),
         {:ok, url} <- post_address(notification) do
      case existing(url) do
        %RemoteEntry{} = entry -> {:ok, entry}
        nil -> fetch_and_save(user, notification, url)
      end
    end
  end

  defp find_notification(user, id) do
    with {:ok, uuid} <- Ecto.UUID.cast(id),
         %Notification{} = n <-
           Repo.get_by(Notification, id: uuid, user_id: user.id, type: :fediverse_mention) do
      {:ok, n}
    else
      _ -> {:error, :not_found}
    end
  end

  # Direct and followers-only posts are only for the people they were sent
  # to; they never become a remote entry (see `publicly_addressed?`).
  defp post_address(%Notification{data: data}) do
    url = data["post_id"] || data["post_url"]

    cond do
      data["public"] != true -> {:error, :not_public}
      is_binary(url) and url != "" -> {:ok, url}
      true -> {:error, :not_found}
    end
  end

  defp existing(url) do
    RemoteEntries.get_by_ap_id(url) ||
      Repo.one(from e in RemoteEntry, where: e.url == ^url, limit: 1)
  end

  defp fetch_and_save(user, notification, url) do
    fetcher = Application.get_env(:inkwell, :mention_post_fetcher, &Http.get_object/1)
    sender = get_in(notification.data, ["remote_actor", "ap_id"])

    with {:ok, object} when is_map(object) <- fetcher.(url),
         :ok <- check_object(object, sender),
         {:ok, actor} <- fetch_actor(object),
         :ok <- check_blocks(user, actor) do
      save(object, actor)
    else
      {:error, reason} when reason in [:not_public, :blocked] ->
        {:error, reason}

      other ->
        Logger.info("MentionPosts: couldn't get #{url}: #{inspect(other)}")
        {:error, :unavailable}
    end
  end

  # The post must be the one the notification is about: written by the
  # account that mentioned the member, served from that account's server, and
  # still public.
  defp check_object(object, sender) do
    author = author_of(object)

    cond do
      object["type"] not in @types -> {:error, :wrong_type}
      not is_binary(object["id"]) -> {:error, :no_id}
      is_binary(sender) and author != sender -> {:error, :wrong_author}
      host(author) == nil or host(author) != host(object["id"]) -> {:error, :wrong_host}
      not public?(object) -> {:error, :not_public}
      true -> :ok
    end
  end

  defp author_of(%{"attributedTo" => a}) when is_binary(a), do: a
  defp author_of(%{"attributedTo" => %{"id" => a}}) when is_binary(a), do: a
  defp author_of(%{"attributedTo" => [first | _]}), do: author_of(%{"attributedTo" => first})
  defp author_of(_), do: nil

  defp host(url) when is_binary(url) do
    case URI.parse(url) do
      %URI{host: h} when is_binary(h) -> String.downcase(h)
      _ -> nil
    end
  end

  defp host(_), do: nil

  defp public?(object) do
    @public in (List.wrap(object["to"]) ++ List.wrap(object["cc"]))
  end

  defp fetch_actor(object), do: RemoteActor.fetch(author_of(object))

  defp check_blocks(user, actor) do
    if FediverseBlocks.should_reject_actor?(user.id, actor.id, actor.domain || ""),
      do: {:error, :blocked},
      else: :ok
  end

  defp save(object, actor) do
    sensitive = object["sensitive"] == true

    attrs =
      %{
        ap_id: object["id"],
        url: if(is_binary(object["url"]), do: object["url"], else: object["id"]),
        title: Inkwell.HtmlSanitizer.sanitize(object["name"]),
        body_html:
          (object["content"] || "")
          |> Inkwell.HtmlSanitizer.sanitize()
          |> Inkwell.Federation.AttachmentHelper.append_media_attachments(object),
        tags: hashtags(object["tag"]),
        published_at: parse_datetime(object["published"]),
        remote_actor_id: actor.id,
        sensitive: sensitive,
        content_warning: if(sensitive, do: object["summary"]),
        source: "mention"
      }
      |> Map.merge(Inkwell.Federation.Engagement.ingest_attrs(object))

    case RemoteEntries.upsert_remote_entry(attrs) do
      {:ok, %RemoteEntry{} = entry} -> {:ok, entry}
      other ->
        Logger.warning("MentionPosts: couldn't save #{object["id"]}: #{inspect(other)}")
        {:error, :unavailable}
    end
  end

  defp hashtags(tags) when is_list(tags) do
    tags
    |> Enum.filter(&(is_map(&1) and &1["type"] == "Hashtag"))
    |> Enum.map(&((&1["name"] || "") |> String.trim_leading("#") |> String.downcase()))
    |> Enum.reject(&(&1 == ""))
  end

  defp hashtags(_), do: []

  defp parse_datetime(str) when is_binary(str) do
    case DateTime.from_iso8601(str) do
      {:ok, dt, _} -> dt
      _ -> nil
    end
  end

  defp parse_datetime(_), do: nil
end
