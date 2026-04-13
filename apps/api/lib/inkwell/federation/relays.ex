defmodule Inkwell.Federation.Relays do
  @moduledoc """
  Context module for managing ActivityPub relay subscriptions.
  Handles subscribing/unsubscribing to relays, processing relay Accept activities,
  and tracking relay activity statistics.
  """

  import Ecto.Query
  require Logger

  alias Inkwell.Repo
  alias Inkwell.Federation.{ActivityBuilder, Http, InstanceActor, RelaySubscription}
  alias Inkwell.Federation.Workers.DeliverActivityWorker

  # ── Public API ─────────────────────────────────────────────────────────

  @doc """
  Subscribe to a fediverse relay by its actor URL.
  Fetches the relay actor document, creates a subscription record,
  and sends a Follow activity.
  """
  def subscribe(relay_url) do
    # Normalize the URL: trim whitespace and strip trailing slash
    relay_url =
      relay_url
      |> String.trim()
      |> String.trim_trailing("/")

    # Check for existing subscription against the normalized URL *and* any
    # discovered canonical actor URL (handled inside discover_actor)
    with :ok <- validate_not_subscribed(relay_url),
         {:ok, relay_user} <- InstanceActor.get_or_create(),
         {:ok, {canonical_url, actor_doc}} <- discover_actor(relay_url),
         :ok <- validate_not_subscribed(canonical_url),
         {:ok, inbox} <- extract_inbox(actor_doc),
         {:ok, domain} <- extract_domain(canonical_url),
         {:ok, subscription} <-
           create_subscription(canonical_url, inbox, domain, relay_user.id),
         :ok <- send_follow(canonical_url, relay_user) do
      {:ok, subscription}
    end
  end

  defp validate_not_subscribed(relay_url) do
    case Repo.get_by(RelaySubscription, relay_url: relay_url) do
      %RelaySubscription{} -> {:error, :already_subscribed}
      nil -> :ok
    end
  end

  @doc """
  Unsubscribe from a relay. Sends Undo { Follow } and deletes the subscription.
  """
  def unsubscribe(id) do
    case Repo.get(RelaySubscription, id) do
      nil ->
        {:error, :not_found}

      subscription ->
        # Send Undo Follow
        case InstanceActor.get_or_create() do
          {:ok, relay_user} ->
            send_undo_follow(subscription.relay_url, subscription.relay_inbox, relay_user)

          _ ->
            :ok
        end

        # FK cascade (on_delete: :delete_all) automatically deletes
        # associated remote entries when the subscription is deleted
        Repo.delete(subscription)
    end
  end

  @doc """
  Pause a relay subscription. Incoming Announces will be ignored.
  """
  def pause(id) do
    case Repo.get(RelaySubscription, id) do
      nil ->
        {:error, :not_found}

      subscription ->
        subscription
        |> RelaySubscription.changeset(%{status: "paused"})
        |> Repo.update()
    end
  end

  @doc """
  Resume a paused relay subscription.
  """
  def resume(id) do
    case Repo.get(RelaySubscription, id) do
      nil ->
        {:error, :not_found}

      subscription ->
        subscription
        |> RelaySubscription.changeset(%{status: "active"})
        |> Repo.update()
    end
  end

  @doc """
  List all relay subscriptions ordered by creation date.
  """
  def list_subscriptions do
    RelaySubscription
    |> order_by(asc: :inserted_at)
    |> Repo.all()
  end

  @doc """
  Get a relay subscription by ID.
  """
  def get_subscription(id), do: Repo.get(RelaySubscription, id)

  @doc """
  Get a relay subscription by relay actor URL.
  """
  def get_subscription_by_url(relay_url) do
    Repo.get_by(RelaySubscription, relay_url: relay_url)
  end

  @doc """
  Check if an AP actor ID belongs to a known active relay.
  Used by handle_announce to detect relay-sourced Announces.
  """
  def is_relay_actor?(ap_id) do
    RelaySubscription
    |> where([s], s.relay_url == ^ap_id and s.status in ["active", "pending"])
    |> Repo.exists?()
  end

  @doc """
  Called when a relay sends an Accept { Follow } activity.
  Updates the subscription status from "pending" to "active".
  """
  def handle_relay_accept(remote_actor_uri) do
    case Repo.get_by(RelaySubscription, relay_url: remote_actor_uri) do
      nil ->
        Logger.warning("Received relay Accept from unknown relay: #{remote_actor_uri}")
        :ok

      subscription ->
        subscription
        |> RelaySubscription.changeset(%{status: "active", error_message: nil})
        |> Repo.update()

        Logger.info("Relay subscription activated: #{remote_actor_uri}")
        :ok
    end
  end

  @doc """
  Record activity from a relay: increment entry count and update last_activity_at.
  """
  def mark_activity(subscription_id) do
    RelaySubscription
    |> where([s], s.id == ^subscription_id)
    |> Repo.update_all(
      inc: [entry_count: 1],
      set: [last_activity_at: DateTime.utc_now() |> DateTime.truncate(:microsecond)]
    )
  end

  # ── Private helpers ─────────────────────────────────────────────────────

  # Tries to discover the relay's ActivityPub actor document starting from
  # the URL the user provided. Relay operators follow different conventions:
  #
  #   https://relay.fedi.buzz/actor            ← reiver's buzz relay
  #   https://relay.toot.io/actor              ← toot.io
  #   https://relay.fediverse.blog/inbox       ← some Pleroma-based relays
  #   https://relay.example.com/relay          ← ActivityRelay
  #   https://relay.example.com/               ← content-negotiated root
  #
  # Users naturally paste the root URL ("https://relay.fedi.buzz") and expect
  # it to work. We try common actor paths in order and return the first one
  # that resolves to a valid ActivityPub actor document.
  #
  # Returns {:ok, {canonical_url, actor_doc}} — canonical_url is the URL that
  # actually served the actor JSON, which we store in the subscription so
  # future operations (Undo, comparisons) use the authoritative path.
  @actor_path_candidates ["/actor", "/inbox", "/instance/actor", "/relay"]

  defp discover_actor(relay_url) do
    candidates = build_candidate_urls(relay_url)

    Enum.reduce_while(candidates, {:error, :no_candidates}, fn url, _acc ->
      case try_fetch_actor(url) do
        {:ok, doc} ->
          if valid_actor_doc?(doc) do
            {:halt, {:ok, {url, doc}}}
          else
            {:cont, {:error, :not_an_actor}}
          end

        {:error, reason} ->
          {:cont, {:error, reason}}
      end
    end)
    |> case do
      {:ok, result} -> {:ok, result}
      {:error, :no_candidates} -> {:error, :fetch_failed}
      {:error, reason} -> {:error, reason}
    end
  end

  # Build candidate URLs to try, in order of likelihood:
  # 1. The user's URL as-is (they may have already provided the actor URL)
  # 2. Root + each known actor path suffix
  # 3. If user provided a URL with a path, also try root + each suffix
  defp build_candidate_urls(relay_url) do
    parsed = URI.parse(relay_url)
    root = "#{parsed.scheme}://#{parsed.host}#{port_suffix(parsed)}"

    paths =
      if parsed.path in [nil, "", "/"] do
        @actor_path_candidates
      else
        # User gave us a path — try it first, then fall back to standard ones
        [parsed.path | @actor_path_candidates]
      end

    paths
    |> Enum.map(&(root <> &1))
    |> Enum.uniq()
  end

  defp port_suffix(%URI{port: nil}), do: ""
  defp port_suffix(%URI{scheme: "https", port: 443}), do: ""
  defp port_suffix(%URI{scheme: "http", port: 80}), do: ""
  defp port_suffix(%URI{port: port}), do: ":#{port}"

  defp try_fetch_actor(url) do
    headers = [{~c"accept", ~c"application/activity+json, application/ld+json"}]

    case Http.get(url, headers) do
      {:ok, {status, body}} when status in 200..299 ->
        case Jason.decode(body) do
          {:ok, doc} ->
            {:ok, doc}

          _ ->
            Logger.debug("Relay candidate #{url} returned non-JSON (status #{status})")
            {:error, :invalid_json}
        end

      {:ok, {status, _}} ->
        Logger.debug("Relay candidate #{url} returned HTTP #{status}")
        {:error, :fetch_failed}

      {:error, reason} ->
        Logger.debug("Relay candidate #{url} network error: #{inspect(reason)}")
        {:error, :fetch_failed}
    end
  end

  # An ActivityPub actor document must have at least an `id` and a `type`
  # that's one of the Actor types. We accept the common ones used by relays.
  defp valid_actor_doc?(%{"id" => id, "type" => type})
       when is_binary(id) and is_binary(type) do
    type in ~w(Application Service Person Group Organization)
  end

  defp valid_actor_doc?(_), do: false

  defp extract_inbox(actor_doc) do
    inbox =
      get_in(actor_doc, ["endpoints", "sharedInbox"]) ||
        actor_doc["inbox"]

    if is_binary(inbox) do
      {:ok, inbox}
    else
      {:error, :no_inbox}
    end
  end

  defp extract_domain(url) do
    case URI.parse(url) do
      %URI{host: host} when is_binary(host) -> {:ok, host}
      _ -> {:error, :invalid_url}
    end
  end

  defp create_subscription(relay_url, inbox, domain, actor_id) do
    %RelaySubscription{}
    |> RelaySubscription.changeset(%{
      relay_url: relay_url,
      relay_inbox: inbox,
      relay_domain: domain,
      status: "pending",
      instance_actor_id: actor_id
    })
    |> Repo.insert()
  end

  defp send_follow(relay_url, relay_user) do
    activity = ActivityBuilder.build_follow(relay_url, relay_user)
    inbox = get_relay_inbox(relay_url)

    if inbox do
      %{activity: activity, inbox_url: inbox, user_id: relay_user.id}
      |> DeliverActivityWorker.new()
      |> Oban.insert()

      :ok
    else
      {:error, :no_inbox}
    end
  end

  defp send_undo_follow(relay_url, relay_inbox, relay_user) do
    activity = ActivityBuilder.build_undo_follow(relay_url, relay_user)

    %{activity: activity, inbox_url: relay_inbox, user_id: relay_user.id}
    |> DeliverActivityWorker.new()
    |> Oban.insert()

    :ok
  end

  defp get_relay_inbox(relay_url) do
    case Repo.get_by(RelaySubscription, relay_url: relay_url) do
      %{relay_inbox: inbox} -> inbox
      nil -> nil
    end
  end
end
