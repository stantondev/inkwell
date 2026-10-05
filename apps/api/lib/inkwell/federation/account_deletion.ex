defmodule Inkwell.Federation.AccountDeletion do
  @moduledoc """
  When a member deletes their account, every server that knows them gets a
  Delete{Person}, and Mastodon removes the account and everything it posted
  (entries, footnotes, letters). Until 2026-10-05 nothing was sent, so a deleted
  member's posts stayed on the fediverse indefinitely.

  Called before the account row goes. The deliveries run afterwards, so they
  carry the signing key encrypted (`DeliverActivityWorker.seal_signer/1`).
  """

  import Ecto.Query
  require Logger

  alias Inkwell.Repo
  alias Inkwell.Accounts.User
  alias Inkwell.Federation.{ActivityBuilder, RemoteActorSchema, RemoteEntry}
  alias Inkwell.Federation.Workers.{DeliverActivityWorker, FanOutWorker}
  alias Inkwell.Journals.Comment
  alias Inkwell.Letters.Conversation
  alias Inkwell.Social.Relationship

  def announce(%User{private_key: pem} = user) when is_binary(pem) and pem != "" do
    inboxes = inboxes(user.id)

    if inboxes != [] do
      activity = ActivityBuilder.build_delete_actor(user)
      signer = DeliverActivityWorker.seal_signer(user)

      Enum.each(inboxes, fn inbox_url ->
        %{activity: activity, inbox_url: inbox_url, signer: signer}
        |> DeliverActivityWorker.new()
        |> Oban.insert()
      end)

      Logger.info("Federating account deletion of #{user.username} to #{length(inboxes)} inboxes")
    end

    :ok
  rescue
    # Never stand in the way of someone deleting their account.
    e ->
      Logger.warning("Couldn't queue the fediverse Delete for account #{user.id}: #{inspect(e)}")
      :ok
  end

  def announce(_user), do: :ok

  @doc """
  Servers that know this member: their followers', the accounts they follow,
  authors of fediverse posts they wrote footnotes on, and people they wrote
  letters to.
  """
  def inboxes(user_id) do
    following =
      from(r in Relationship,
        join: ra in RemoteActorSchema, on: ra.id == r.remote_actor_id,
        where: r.follower_id == ^user_id,
        select: fragment("COALESCE(?, ?)", ra.shared_inbox, ra.inbox)
      )

    replied_to =
      from(c in Comment,
        join: re in RemoteEntry, on: re.id == c.remote_entry_id,
        join: ra in RemoteActorSchema, on: ra.id == re.remote_actor_id,
        where: c.user_id == ^user_id,
        select: fragment("COALESCE(?, ?)", ra.shared_inbox, ra.inbox)
      )

    wrote_to =
      from(cv in Conversation,
        join: ra in RemoteActorSchema, on: ra.id == cv.remote_actor_id,
        where: cv.participant_a == ^user_id,
        select: fragment("COALESCE(?, ?)", ra.shared_inbox, ra.inbox)
      )

    (FanOutWorker.collect_remote_inboxes(user_id) ++
       Repo.all(following) ++ Repo.all(replied_to) ++ Repo.all(wrote_to))
    |> Enum.reject(&is_nil/1)
    |> Enum.uniq()
  end
end
