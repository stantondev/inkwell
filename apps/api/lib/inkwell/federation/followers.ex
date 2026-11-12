defmodule Inkwell.Federation.Followers do
  @moduledoc """
  A member's followers on other fediverse servers: removing one, and keeping
  bot accounts out.

  Removing a follower deletes the follow here (so `FanOutWorker` stops sending
  them new posts) and sends their server a `Reject` of the old `Follow`, which
  is how Mastodon and others learn "you no longer follow this account". We
  don't keep the id of the original Follow, so the Reject embeds a Follow with
  `actor`/`object`; Mastodon matches that by actor (`reject_embedded_follow`)
  and Pleroma/Akkoma fall back to the latest follow between the two.

  A bot is an account that says it is one: actor `type` `Service` or
  `Application` (Mastodon's "This is an automated account" box sends
  `Service`). The Bluesky bridge is never counted.
  """

  import Ecto.Query

  alias Inkwell.Repo
  alias Inkwell.Accounts.User
  alias Inkwell.Social.Relationship
  alias Inkwell.Federation.{ActivityBuilder, RemoteActorSchema}
  alias Inkwell.Federation.Workers.DeliverActivityWorker

  require Logger

  @bot_types ["Service", "Application"]

  @doc "Whether a fediverse account says it is automated."
  def bot?(%RemoteActorSchema{} = actor) do
    not Inkwell.Federation.BlueskyBridge.bridge_actor?(actor) and
      match?(%{"type" => t} when t in @bot_types, actor.raw_data || %{})
  end

  def bot?(_), do: false

  @doc "Whether the member has asked not to be followed by bot accounts."
  def declines_bots?(%User{settings: %{"decline_bot_follows" => true}}), do: true
  def declines_bots?(_), do: false

  @doc "Whether this fediverse account follows the member."
  def follower?(user_id, remote_actor_id) do
    Repo.exists?(follower_query(user_id) |> where([r], r.remote_actor_id == ^remote_actor_id))
  end

  @doc """
  Stops a fediverse account following the member: deletes the follow and tells
  their server. `{:error, :not_following}` when it doesn't follow them.
  """
  def remove(%User{} = user, remote_actor_id) do
    rels =
      Relationship
      |> where([r], r.following_id == ^user.id and r.remote_actor_id == ^remote_actor_id)
      |> Repo.all()

    case rels do
      [] ->
        {:error, :not_following}

      _ ->
        Enum.each(rels, &Repo.delete/1)

        case Repo.get(RemoteActorSchema, remote_actor_id) do
          nil -> :ok
          actor -> send_reject(user, actor)
        end

        :ok
    end
  end

  @doc """
  Stops the member following a fediverse account (deletes the follow and sends
  Undo{Follow}). `:ok` whether or not they followed it.
  """
  def stop_following(%User{} = user, remote_actor_id) do
    case Inkwell.Social.unfollow_remote(user.id, remote_actor_id) do
      {:ok, _} ->
        case Repo.get(RemoteActorSchema, remote_actor_id) do
          nil -> :ok
          actor -> deliver(user, actor, ActivityBuilder.build_undo_follow(actor.ap_id, user))
        end

      _ ->
        :ok
    end
  end

  @doc "Removes every follower from `domain` (and its subdomains). Returns how many."
  def remove_from_domain(%User{} = user, domain) when is_binary(domain) do
    domain = String.downcase(String.trim(domain))

    follower_query(user.id)
    |> join(:inner, [r], ra in RemoteActorSchema, on: ra.id == r.remote_actor_id)
    |> where([r, ra], ra.domain == ^domain or like(ra.domain, ^"%.#{domain}"))
    |> select([r, ra], ra.id)
    |> Repo.all()
    |> Enum.count(&(remove(user, &1) == :ok))
  end

  @doc "The member's fediverse followers that are bots."
  def bot_followers(user_id) do
    follower_query(user_id)
    |> join(:inner, [r], ra in RemoteActorSchema, on: ra.id == r.remote_actor_id)
    |> where([r, ra], fragment("?->>'type'", ra.raw_data) in @bot_types)
    |> select([r, ra], ra)
    |> order_by([r, ra], asc: ra.domain, asc: ra.username)
    |> Repo.all()
    |> Enum.filter(&bot?/1)
  end

  @doc "Removes every bot follower. Returns how many were removed."
  def remove_bots(%User{} = user) do
    user.id
    |> bot_followers()
    |> Enum.count(&(remove(user, &1.id) == :ok))
  end

  @doc """
  Turns down a Follow we received, quoting it (used when the member declines
  bots). Nothing is stored.
  """
  def reject_follow(%User{} = user, follow_activity, %RemoteActorSchema{} = actor) do
    deliver(user, actor, ActivityBuilder.build_reject(follow_activity, user))
  end

  defp send_reject(user, actor) do
    follow = %{
      "type" => "Follow",
      "actor" => actor.ap_id,
      "object" => ActivityBuilder.actor_url(user)
    }

    deliver(user, actor, ActivityBuilder.build_reject(follow, user))
  end

  defp deliver(user, actor, activity) do
    case actor.shared_inbox || actor.inbox do
      inbox when is_binary(inbox) ->
        %{activity: activity, inbox_url: inbox, user_id: user.id}
        |> DeliverActivityWorker.new()
        |> Oban.insert()

        :ok

      _ ->
        Logger.warning("No inbox for #{actor.ap_id}; follow removed here only")
        :ok
    end
  end

  defp follower_query(user_id) do
    Relationship
    |> where([r], r.following_id == ^user_id and not is_nil(r.remote_actor_id))
  end
end
