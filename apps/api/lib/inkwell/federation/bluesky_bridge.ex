defmodule Inkwell.Federation.BlueskyBridge do
  @moduledoc """
  Opt-in sharing to Bluesky through Bridgy Fed (https://fed.brid.gy).

  Bridgy Fed bridges a fediverse account to Bluesky once that account follows
  its bot `@bsky.brid.gy@bsky.brid.gy`; the bot follows back and from then on
  the writer's public posts appear on Bluesky as
  `@<username>.inkwell.social.ap.brid.gy`. Entries (AP Articles) become a
  Bluesky post built from our FEP-b2b8 `preview` Note plus a link card, and a
  `site.standard.document` record with the full text. Blocking the bot is how
  Bridgy Fed switches bridging off.

  Bridgy Fed's own rules: a profile picture is required, only public posts
  bridge, and posts older than two weeks are never backfilled.

  State lives in `users.settings["bluesky_bridge"]` ("on" / "off"); whether
  the bridge is actually live is read from the bot's follow of the writer.
  """

  import Ecto.Query
  require Logger

  alias Inkwell.Repo
  alias Inkwell.Accounts.User
  alias Inkwell.Social.Relationship
  alias Inkwell.Federation.{ActivityBuilder, RemoteActor}
  alias Inkwell.Federation.Workers.DeliverActivityWorker

  @bot_ap_id "https://bsky.brid.gy/bsky.brid.gy"

  def bot_ap_id, do: @bot_ap_id

  @doc "True for Bridgy Fed's own bot actors (no follower notification for them)."
  def bridge_actor?(%{domain: domain}) when is_binary(domain),
    do: domain == "brid.gy" or String.ends_with?(domain, ".brid.gy")

  def bridge_actor?(_), do: false

  @doc "The writer's handle on Bluesky once bridged."
  def handle(%User{username: username}), do: "#{username}.#{instance_host()}.ap.brid.gy"

  def profile_url(%User{} = user), do: "https://bsky.app/profile/#{handle(user)}"

  @doc """
  `"off"`, `"pending"` (asked, bridge hasn't followed back yet) or `"active"`,
  plus what Bridgy Fed needs from the account.
  """
  def status(%User{} = user) do
    state =
      cond do
        # Also true if they opted in on Bridgy Fed's own site.
        bot_follows?(user) -> "active"
        (user.settings || %{})["bluesky_bridge"] == "on" -> "pending"
        true -> "off"
      end

    %{
      status: state,
      handle: handle(user),
      profile_url: profile_url(user),
      has_avatar: is_binary(user.avatar_url) and user.avatar_url != "",
      requested_at: (user.settings || %{})["bluesky_bridge_requested_at"]
    }
  end

  @doc "Follow the bridge bot. Re-enabling after `disable/1` unblocks it first."
  def enable(%User{} = user) do
    with {:ok, bot} <- bot_actor() do
      if block_id = (user.settings || %{})["bluesky_bridge_block_id"] do
        deliver(user, bot, ActivityBuilder.build_undo_block(bot.ap_id, user, block_id))
      end

      Repo.delete_all(from(r in Relationship, where: r.follower_id == ^user.id and r.remote_actor_id == ^bot.id))

      {:ok, _} =
        %Relationship{}
        |> Relationship.changeset(%{follower_id: user.id, remote_actor_id: bot.id, status: :pending})
        |> Repo.insert()

      # Bridgy Fed ignores activity ids it has seen before, so a Follow sent
      # after switching off and on again needs a fresh id.
      deliver(user, bot, ActivityBuilder.build_follow(bot.ap_id, user, unique: true))

      put_settings(user, %{
        "bluesky_bridge" => "on",
        "bluesky_bridge_requested_at" => DateTime.utc_now() |> DateTime.to_iso8601(),
        "bluesky_bridge_block_id" => nil
      })
    end
  end

  @doc "Block the bridge bot, which is how Bridgy Fed stops bridging an account."
  def disable(%User{} = user) do
    with {:ok, bot} <- bot_actor() do
      block = ActivityBuilder.build_block(bot.ap_id, user)
      deliver(user, bot, block)

      Repo.delete_all(
        from(r in Relationship,
          where:
            r.remote_actor_id == ^bot.id and
              (r.follower_id == ^user.id or r.following_id == ^user.id)
        )
      )

      put_settings(user, %{"bluesky_bridge" => "off", "bluesky_bridge_block_id" => block["id"]})
    end
  end

  defp bot_follows?(user) do
    from(r in Relationship,
      join: a in assoc(r, :remote_actor),
      where: r.following_id == ^user.id and r.status == :accepted and a.ap_id == ^@bot_ap_id
    )
    |> Repo.exists?()
  end

  defp bot_actor do
    case RemoteActor.get_by_ap_id(@bot_ap_id) do
      nil -> RemoteActor.fetch(@bot_ap_id)
      actor -> {:ok, actor}
    end
    |> case do
      {:ok, actor} -> {:ok, actor}
      error ->
        Logger.warning("[BlueskyBridge] couldn't reach Bridgy Fed: #{inspect(error)}")
        {:error, :bridge_unreachable}
    end
  end

  defp deliver(user, bot, activity) do
    %{activity: activity, inbox_url: bot.shared_inbox || bot.inbox, user_id: user.id}
    |> DeliverActivityWorker.new()
    |> Oban.insert()
  end

  defp put_settings(user, changes) do
    settings = Map.merge(user.settings || %{}, changes) |> Map.reject(fn {_k, v} -> is_nil(v) end)
    user |> Ecto.Changeset.change(settings: settings) |> Repo.update()
  end

  defp instance_host do
    Application.get_env(:inkwell, :federation, []) |> Keyword.get(:instance_host, "inkwell.social")
  end
end
