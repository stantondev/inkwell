defmodule Inkwell.Guestbook.Federation do
  @moduledoc """
  The guestbook as an FEP-400e publicly-appendable collection.

  Each member's actor advertises `guestbook`, an OrderedCollection at
  `/users/:username/guestbook`. Anyone on the fediverse signs it by sending a
  public `Create{Note}` whose `target` is that collection; the owner's server
  (us) keeps it and answers with `Add{object: note, target: guestbook}`. When the
  owner takes a remote signature down we send `Remove`. Signatures written on
  Inkwell are served as Notes at `/users/:username/guestbook/:id`.

  The older way (replying to `/users/:username/guestbook-post` from Mastodon)
  still works; it lands in the same place.
  """

  import Ecto.Query
  require Logger

  alias Inkwell.Repo
  alias Inkwell.Accounts
  alias Inkwell.Accounts.User
  alias Inkwell.Guestbook.GuestbookEntry
  alias Inkwell.Federation.{ActivityBuilder, RemoteActor}
  alias Inkwell.Federation.Workers.DeliverActivityWorker

  @public "https://www.w3.org/ns/activitystreams#Public"
  @page_size 20

  def collection_url(%User{} = owner), do: "#{ActivityBuilder.actor_url(owner)}/guestbook"

  def entry_url(%User{} = owner, %GuestbookEntry{id: id}), do: "#{collection_url(owner)}/#{id}"

  # ── Serving ─────────────────────────────────────────────────────────────

  @doc """
  The collection itself, or one page of it (`page` ≥ 1). Newest first. Items
  are ids: our Note URLs for signatures written here, the signer's own id for
  fediverse ones.
  """
  def collection(%User{} = owner, page \\ nil) do
    base = collection_url(owner)
    total = count_visible(owner)

    case page do
      nil ->
        %{
          "@context" => "https://www.w3.org/ns/activitystreams",
          "type" => "OrderedCollection",
          "id" => base,
          "attributedTo" => ActivityBuilder.actor_url(owner),
          "totalItems" => total,
          "first" => "#{base}?page=1"
        }

      n ->
        items =
          visible(owner)
          |> limit(^@page_size)
          |> offset(^((n - 1) * @page_size))
          |> Repo.all()
          |> Enum.map(&item_id(owner, &1))

        page = %{
          "@context" => "https://www.w3.org/ns/activitystreams",
          "type" => "OrderedCollectionPage",
          "id" => "#{base}?page=#{n}",
          "partOf" => base,
          "orderedItems" => items
        }

        if n * @page_size < total, do: Map.put(page, "next", "#{base}?page=#{n + 1}"), else: page
    end
  end

  @doc "The Note for a signature written on Inkwell, or nil (fediverse ones live on their own server)."
  def note(%User{} = owner, entry_id) do
    with {:ok, _} <- Ecto.UUID.cast(entry_id),
         %GuestbookEntry{author_id: author_id} = entry when not is_nil(author_id) <-
           visible(owner) |> where([e], e.id == ^entry_id) |> Repo.one() do
      build_note(owner, entry, entry.author)
    else
      _ -> nil
    end
  end

  defp build_note(owner, entry, author) do
    owner_url = ActivityBuilder.actor_url(owner)
    frontend_host = Application.get_env(:inkwell, :federation, []) |> Keyword.get(:frontend_host)

    %{
      "@context" => "https://www.w3.org/ns/activitystreams",
      "type" => "Note",
      "id" => entry_url(owner, entry),
      "attributedTo" => ActivityBuilder.actor_url(author),
      "content" => body_html(entry.body),
      "published" => DateTime.to_iso8601(entry.inserted_at),
      "to" => [@public],
      "cc" => [owner_url],
      "url" => "#{frontend_host}/#{owner.username}#guestbook",
      "target" => target(owner)
    }
  end

  defp target(owner) do
    %{
      "type" => "OrderedCollection",
      "id" => collection_url(owner),
      "attributedTo" => ActivityBuilder.actor_url(owner)
    }
  end

  defp body_html(body) do
    body
    |> String.split(~r/\n\s*\n/, trim: true)
    |> Enum.map_join(fn para ->
      text =
        para
        |> Phoenix.HTML.html_escape()
        |> Phoenix.HTML.safe_to_string()
        |> String.replace("\n", "<br>")

      "<p>#{text}</p>"
    end)
  end

  # What the public page shows: signatures from suspended local accounts are hidden.
  defp visible(owner) do
    from(e in GuestbookEntry,
      left_join: a in assoc(e, :author),
      where: e.profile_user_id == ^owner.id,
      where: is_nil(e.author_id) or is_nil(a.blocked_at),
      order_by: [desc: e.inserted_at],
      preload: [author: a]
    )
  end

  defp count_visible(owner) do
    from(e in GuestbookEntry,
      left_join: a in assoc(e, :author),
      where: e.profile_user_id == ^owner.id,
      where: is_nil(e.author_id) or is_nil(a.blocked_at)
    )
    |> Repo.aggregate(:count)
  end

  defp item_id(_owner, %GuestbookEntry{ap_id: ap_id, author_id: nil}) when is_binary(ap_id), do: ap_id
  defp item_id(owner, entry), do: entry_url(owner, entry)

  # ── Receiving ───────────────────────────────────────────────────────────

  @doc """
  The member whose guestbook an object's `target` names, or nil. `target` may
  be the collection's id or an object carrying it; the id must be on one of our
  hosts and end in `/users/:username/guestbook`.
  """
  def target_owner(%{"target" => target}) do
    id =
      case target do
        %{"id" => id} when is_binary(id) -> id
        id when is_binary(id) -> id
        _ -> nil
      end

    with id when is_binary(id) <- id,
         %URI{host: host, path: path} when is_binary(host) and is_binary(path) <- URI.parse(id),
         true <- local_host?(host),
         ["users", username, "guestbook"] <- path |> String.trim("/") |> String.split("/"),
         %User{blocked_at: nil} = owner <- Accounts.get_user_by_username(username) do
      owner
    else
      _ -> nil
    end
  end

  def target_owner(_), do: nil

  defp local_host?(host) do
    config = Application.get_env(:inkwell, :federation, [])

    ours =
      [
        "https://#{Keyword.get(config, :instance_host)}",
        Keyword.get(config, :frontend_host),
        InkwellWeb.Endpoint.url()
      ]
      |> Enum.filter(&is_binary/1)
      |> Enum.map(&URI.parse(&1).host)
      |> Kernel.++(~w(inkwell.social www.inkwell.social api.inkwell.social inkwell-api.fly.dev))

    String.downcase(host) in ours
  end

  @doc "Tell the signer's server we kept their signature (FEP-400e `Add`)."
  def send_add(%User{} = owner, note_id, signer_ap_id) do
    owner_url = ActivityBuilder.actor_url(owner)

    activity = %{
      "@context" => "https://www.w3.org/ns/activitystreams",
      "type" => "Add",
      "id" => "#{owner_url}#guestbook-add-#{hash(note_id)}",
      "actor" => owner_url,
      "object" => note_id,
      "target" => collection_url(owner),
      "to" => [signer_ap_id]
    }

    deliver(owner, activity, signer_ap_id)
  end

  @doc "Tell the signer's server their signature was taken down (FEP-400e)."
  def send_remove(%User{} = owner, %GuestbookEntry{ap_id: note_id, remote_author: %{} = remote})
      when is_binary(note_id) do
    signer = remote["ap_id"] || remote[:ap_id]
    owner_url = ActivityBuilder.actor_url(owner)

    activity = %{
      "@context" => "https://www.w3.org/ns/activitystreams",
      "type" => "Remove",
      "id" => "#{owner_url}#guestbook-remove-#{hash(note_id)}",
      "actor" => owner_url,
      "object" => note_id,
      "target" => collection_url(owner),
      "to" => Enum.filter([signer], &is_binary/1)
    }

    deliver(owner, activity, signer)
  end

  def send_remove(_owner, _entry), do: :ok

  defp deliver(owner, activity, recipient) when is_binary(recipient) do
    Inkwell.Federation.Background.run(fn ->
      case RemoteActor.fetch(recipient) do
        {:ok, actor} ->
          %{activity: activity, inbox_url: actor.inbox, user_id: owner.id}
          |> DeliverActivityWorker.new()
          |> Oban.insert()

        {:error, reason} ->
          Logger.info("[Guestbook] Couldn't reach #{recipient} for #{activity["type"]}: #{inspect(reason)}")
      end
    end)

    :ok
  end

  defp deliver(_owner, _activity, _recipient), do: :ok

  defp hash(value) do
    :crypto.hash(:sha256, value) |> Base.url_encode64(padding: false) |> binary_part(0, 12)
  end
end
