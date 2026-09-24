defmodule Inkwell.Letters.Federation do
  @moduledoc """
  Letters with fediverse accounts, both ways.

  ## Out

  A letter from a member to a fediverse account goes out as a private
  mention: a Note addressed only to that account, with a Mention tag, which
  Mastodon and most others show as a direct message. Its id
  (`note_id/1`) 404s for anyone who looks it up, as private posts do on
  Mastodon. Editing a letter sends an Update; "remove for me" sends nothing,
  since the other person keeps their copy (the same as between members).

  ## In

  A Create{Note} becomes a letter only when it is plainly a private message
  to one member (`direct_message_recipient/3`): not public, addressed to
  exactly one account besides its author, that account is a member, the
  author wrote it, and it isn't a reply to something on Inkwell (a reply to
  an earlier letter, or to anything on another server, is fine). Everything
  else keeps its old path (a private reply to an entry still arrives as a
  mention notification).

  Where it lands:

    * one follows the other, or there's an accepted conversation: a letter
    * the member takes letter requests, and the account is 3+ days old and
      hasn't started 5 requests on Inkwell today: a request (quiet, in the
      Requests tab), capped at 5 letters until it's answered
    * a request that was declined: dropped, silently
    * otherwise: the mention notification it always became

  Blocked accounts and servers (the member's own blocks and defederation)
  never get through, and a Note can only be added once (`ap_id`).
  """

  import Ecto.Query
  require Logger

  alias Inkwell.{Letters, Repo}
  alias Inkwell.Accounts.User
  alias Inkwell.Letters.{Conversation, DirectMessage}
  alias Inkwell.Federation.{ActivityBuilder, RemoteActor, AttachmentHelper}
  alias Inkwell.Federation.Workers.DeliverActivityWorker

  @public ["https://www.w3.org/ns/activitystreams#Public", "as:Public", "Public"]
  @request_min_actor_age_days 3
  @requests_per_actor_per_day 5
  @pending_letter_cap 5

  # ---------------------------------------------------------------------------
  # Out
  # ---------------------------------------------------------------------------

  @doc "The ActivityPub id of a letter we send to a fediverse account."
  def note_id(%DirectMessage{id: id}), do: "https://#{instance_host()}/letters/notes/#{id}"

  @doc """
  Send a letter (`:create`) or its edit (`:update`) to the fediverse account
  in `conv`. `message` must have `sender` loaded and `ap_id` set.
  """
  def deliver(%DirectMessage{} = message, %Conversation{} = conv, kind)
      when kind in [:create, :update] do
    conv = Repo.preload(conv, :remote_actor)
    actor = conv.remote_actor

    if actor && message.sender && message.ap_id do
      activity =
        ActivityBuilder.build_letter_activity(kind, message, message.sender, actor,
          in_reply_to: previous_note(conv, message),
          context: conv.ap_context
        )

      # An edit waits a little, so it can't reach them before the letter itself.
      opts = if kind == :update, do: [schedule_in: 20], else: []

      %{activity: activity, inbox_url: actor.inbox, user_id: message.sender_id}
      |> DeliverActivityWorker.new(opts)
      |> Oban.insert()
    end

    :ok
  rescue
    e ->
      Logger.warning("[Letters] Couldn't queue fediverse letter #{message.id}: #{inspect(e)}")
      :ok
  end

  # The newest note before this one, from either side, so the letter threads.
  defp previous_note(conv, message) do
    DirectMessage
    |> where([m], m.conversation_id == ^conv.id and m.id != ^message.id and not is_nil(m.ap_id))
    |> where([m], m.inserted_at <= ^message.inserted_at)
    |> order_by([m], desc: m.inserted_at)
    |> limit(1)
    |> select([m], m.ap_id)
    |> Repo.one()
  end

  # ---------------------------------------------------------------------------
  # In
  # ---------------------------------------------------------------------------

  @doc """
  Take an inbound Note as a letter if it is one. Returns `:handled` (it was
  a letter, a request, or dropped on purpose) or `:not_a_letter` (the caller
  handles it as before). `target_user` is the inbox owner for a personal
  inbox delivery, nil for the shared inbox.
  """
  def receive_note(object, actor_uri, target_user) when is_map(object) and is_binary(actor_uri) do
    with {:ok, user} <- direct_message_recipient(object, actor_uri, target_user),
         {:ok, actor} <- RemoteActor.fetch(actor_uri) do
      cond do
        not is_nil(user.blocked_at) -> :handled
        Letters.actor_blocked?(user.id, actor) -> log_drop(object, "blocked")
        already_have?(object["id"]) -> :handled
        true -> route(object, user, actor)
      end
    else
      _ -> :not_a_letter
    end
  rescue
    # Whatever went wrong here, the Note still gets its old handling.
    e ->
      Logger.warning(
        "[Letters] Couldn't take #{inspect(object["id"])} as a letter: #{inspect(e)}"
      )

      :not_a_letter
  end

  def receive_note(_, _, _), do: :not_a_letter

  @doc """
  The member a Note is a private message to, or `:error`. See the moduledoc
  for what counts.
  """
  def direct_message_recipient(object, actor_uri, target_user) do
    addressees =
      [object["to"], object["cc"], object["bto"], object["bcc"]]
      |> List.flatten()
      |> Enum.filter(&is_binary/1)
      |> Enum.uniq()
      |> Kernel.--([actor_uri])

    with "Note" <- object["type"],
         true <- is_binary(object["id"]),
         false <- Enum.any?(addressees, &(&1 in @public)),
         true <- attributed_to(object) == actor_uri,
         [addressee] <- addressees,
         %User{} = user <- local_user(addressee),
         true <- is_nil(target_user) or target_user.id == user.id,
         true <- letter_thread?(object["inReplyTo"], user, actor_uri) do
      {:ok, user}
    else
      _ -> :error
    end
  end

  defp attributed_to(%{"attributedTo" => by}) when is_binary(by), do: by
  defp attributed_to(%{"attributedTo" => %{"id" => by}}) when is_binary(by), do: by
  defp attributed_to(_), do: nil

  # Not a reply; a reply to a letter already in this conversation; or a reply
  # to something on another server. Chat software (NodeBB) points every
  # message at the one before it, so if that one never reached us the whole
  # conversation would fall out of Letters. What isn't a letter is a private
  # reply to something *here* (an entry, a comment, a guestbook): that keeps
  # arriving as a mention notification about that thing.
  defp letter_thread?(nil, _user, _actor_uri), do: true

  defp letter_thread?(reply_to, user, actor_uri) when is_binary(reply_to) do
    not local_url?(reply_to) or
      Repo.exists?(
        from(m in DirectMessage,
          join: c in Conversation,
          on: c.id == m.conversation_id,
          join: a in assoc(c, :remote_actor),
          where: m.ap_id == ^reply_to and c.participant_a == ^user.id and a.ap_id == ^actor_uri
        )
      )
  end

  defp letter_thread?(_, _, _), do: false

  @doc "The member whose ActivityPub actor URL this is, or nil."
  def local_user(url) when is_binary(url) do
    hosts =
      [
        "https://#{instance_host()}",
        Application.get_env(:inkwell, :frontend_url),
        InkwellWeb.Endpoint.url()
      ]
      |> Enum.filter(&is_binary/1)
      |> Enum.map(&String.trim_trailing(&1, "/"))
      |> Enum.uniq()

    Enum.find_value(hosts, fn host ->
      case String.split(url, host <> "/users/", parts: 2) do
        ["", username] when username != "" ->
          if String.contains?(username, ["/", "#", "?"]),
            do: nil,
            else: Inkwell.Accounts.get_user_by_username(username)

        _ ->
          nil
      end
    end)
  end

  def local_user(_), do: nil

  # Hosts our content has ever had ids on. Entry ids are always stored on
  # inkwell.social, and older ones on the Fly hostnames.
  @known_hosts ~w(inkwell.social www.inkwell.social api.inkwell.social inkwell-api.fly.dev inkwell-web.fly.dev)

  # Whether a URL is on one of our own hosts (so it names something here).
  defp local_url?(url) do
    hosts =
      [
        "https://#{instance_host()}",
        Application.get_env(:inkwell, :frontend_url),
        Application.get_env(:inkwell, :api_url),
        InkwellWeb.Endpoint.url(),
        Application.get_env(:inkwell, :federation, []) |> Keyword.get(:frontend_host)
      ]
      |> Enum.filter(&is_binary/1)
      |> Enum.map(&URI.parse(&1).host)
      |> Enum.reject(&is_nil/1)
      |> Kernel.++(@known_hosts)

    case URI.parse(url) do
      %URI{host: host} when is_binary(host) -> String.downcase(host) in hosts
      _ -> true
    end
  end

  defp already_have?(ap_id), do: Repo.exists?(from(m in DirectMessage, where: m.ap_id == ^ap_id))

  defp route(object, user, actor) do
    conv = Letters.remote_conversation(user.id, actor.id)

    cond do
      Letters.remote_connected?(user.id, actor.id) or match?(%{request_status: "accepted"}, conv) ->
        {:ok, conv} = Letters.ensure_remote_conversation(user.id, actor, conv)
        add_letter(object, conv, user, actor)

      match?(%{request_status: "pending"}, conv) ->
        if pending_letters(conv) < @pending_letter_cap,
          do: add_letter(object, conv, user, actor),
          else: log_drop(object, "request letter cap")

      match?(%{request_status: "declined"}, conv) ->
        log_drop(object, "declined request")

      Letters.takes_requests?(user) and old_enough?(actor) and
          requests_today(actor) < @requests_per_actor_per_day ->
        {:ok, conv} = start_request(user, actor, conv)
        add_letter(object, conv, user, actor)

      true ->
        :not_a_letter
    end
  end

  defp start_request(user, actor, existing) do
    conv =
      case existing do
        nil ->
          {:ok, conv} = Letters.ensure_remote_conversation(user.id, actor, nil)
          conv

        conv ->
          conv
      end

    conv
    |> Ecto.Changeset.change(
      request_status: "pending",
      requested_by_id: nil,
      requested_at: DateTime.utc_now()
    )
    |> Repo.update()
  end

  defp pending_letters(conv) do
    since = conv.requested_at || DateTime.from_unix!(0, :microsecond)

    Repo.aggregate(
      from(m in DirectMessage,
        where: m.conversation_id == ^conv.id and is_nil(m.sender_id) and m.inserted_at >= ^since
      ),
      :count
    )
  end

  defp requests_today(actor) do
    since = DateTime.add(DateTime.utc_now(), -1, :day)

    Repo.aggregate(
      from(c in Conversation,
        where:
          c.remote_actor_id == ^actor.id and is_nil(c.requested_by_id) and
            c.requested_at >= ^since
      ),
      :count
    )
  end

  # The account's own creation date, as its server reports it. Without one
  # we can't tell, so it doesn't get to send requests.
  defp old_enough?(%{raw_data: %{"published" => published}}) when is_binary(published) do
    case DateTime.from_iso8601(published) do
      {:ok, at, _} -> DateTime.diff(DateTime.utc_now(), at, :day) >= @request_min_actor_age_days
      _ -> false
    end
  end

  defp old_enough?(_), do: false

  defp add_letter(object, conv, user, actor) do
    {body, body_html} = letter_content(object)

    attrs = %{
      conversation_id: conv.id,
      sender_remote_actor_id: actor.id,
      ap_id: object["id"],
      body: body,
      body_html: body_html
    }

    case %DirectMessage{} |> DirectMessage.remote_changeset(attrs) |> Repo.insert() do
      {:ok, message} ->
        context = object_context(object)

        changes =
          if context && is_nil(conv.ap_context),
            do: [last_message_at: message.inserted_at, ap_context: context],
            else: [last_message_at: message.inserted_at]

        {:ok, conv} = conv |> Ecto.Changeset.change(changes) |> Repo.update()

        # A request lands quietly, as between members.
        unless conv.request_status == "pending" do
          Letters.notify_new_letter(
            conv,
            actor.display_name || actor.username || "Someone",
            user.id
          )
        end

        Logger.info(
          "[Letters] Letter from #{actor.ap_id} to @#{user.username} (#{conv.request_status || "letter"})"
        )

        :handled

      {:error, changeset} ->
        Logger.info(
          "[Letters] Couldn't store letter #{object["id"]}: #{inspect(changeset.errors)}"
        )

        :handled
    end
  end

  defp object_context(object) do
    Enum.find_value(["context", "conversation"], fn key ->
      case object[key] do
        v when is_binary(v) and byte_size(v) <= 2000 -> v
        _ -> nil
      end
    end)
  end

  @doc """
  The letter text of a Note: its HTML without the leading @mention of the
  recipient (Mastodon starts every direct message with one), plus any
  pictures, video or audio attached. Returns `{plain_text, html}`.
  """
  def letter_content(object) do
    html =
      (object["content"] || "")
      |> strip_leading_mentions()
      |> AttachmentHelper.append_media_attachments(object)
      |> Inkwell.HtmlSanitizer.sanitize()
      |> Kernel.||("")
      |> String.slice(0, 190_000)

    text =
      html
      |> String.replace(~r/<br\s*\/?>/, "\n")
      |> String.replace(~r/<\/p>\s*<p[^>]*>/, "\n\n")
      |> String.replace(~r/<[^>]*>/, "")
      |> InkwellWeb.FederationController.decode_html_entities()
      |> String.replace(~r/\n{3,}/, "\n\n")
      |> String.trim()
      |> String.slice(0, 10_000)

    text =
      cond do
        text != "" -> text
        String.contains?(html, "<img") -> "(a picture)"
        String.contains?(html, ["<video", "<audio"]) -> "(a recording)"
        true -> "(empty letter)"
      end

    {text, if(html == "", do: nil, else: html)}
  end

  @mention ~r/^\s*(?:<span class="h-card"[^>]*>\s*)?<a [^>]*class="[^"]*\bmention\b[^"]*"[^>]*>.*?<\/a>(?:\s*<\/span>)?\s*/s

  defp strip_leading_mentions(html) do
    case Regex.run(~r/^(\s*<p[^>]*>)(.*)$/s, html) do
      [_, open, rest] ->
        stripped = strip_mentions(rest)
        # A paragraph that held only the mention goes away entirely.
        if Regex.match?(~r/^\s*<\/p>/, stripped),
          do: Regex.replace(~r/^\s*<\/p>\s*/, stripped, ""),
          else: open <> stripped

      _ ->
        strip_mentions(html)
    end
  end

  defp strip_mentions(html) do
    stripped = Regex.replace(@mention, html, "", global: false)
    if stripped == html, do: html, else: strip_mentions(stripped)
  end

  @doc """
  An edit of a letter from a fediverse account. `:handled` when it was one
  (from its own author), else `:not_a_letter`.
  """
  def receive_update(%{"id" => ap_id} = object, actor_uri)
      when is_binary(ap_id) and is_binary(actor_uri) do
    case letter_from(ap_id, actor_uri) do
      nil ->
        :not_a_letter

      message ->
        {body, body_html} = letter_content(object)

        case message
             |> DirectMessage.edit_changeset(%{body: body, body_html: body_html})
             |> Repo.update() do
          {:ok, _} ->
            :ok

          {:error, e} ->
            Logger.info("[Letters] Couldn't apply edit to #{ap_id}: #{inspect(e.errors)}")
        end

        :handled
    end
  end

  def receive_update(_, _), do: :not_a_letter

  @doc "Its author deleted a letter they sent: it goes for both sides."
  def receive_delete(ap_id, actor_uri) when is_binary(ap_id) and is_binary(actor_uri) do
    case letter_from(ap_id, actor_uri) do
      nil -> :not_a_letter
      message -> Repo.delete(message) && :handled
    end
  end

  def receive_delete(_, _), do: :not_a_letter

  defp letter_from(ap_id, actor_uri) do
    Repo.one(
      from(m in DirectMessage,
        join: a in assoc(m, :sender_remote_actor),
        where: m.ap_id == ^ap_id and a.ap_id == ^actor_uri
      )
    )
  end

  defp log_drop(object, why) do
    Logger.info("[Letters] Dropped #{inspect(object["id"])}: #{why}")
    :handled
  end

  defp instance_host do
    Application.get_env(:inkwell, :federation, [])
    |> Keyword.get(:instance_host, "inkwell.social")
  end
end
