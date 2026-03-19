defmodule Inkwell.Federation.RemoteActor do
  @moduledoc """
  Fetches and caches remote ActivityPub actors.
  Actors are cached in the `remote_actors` table and refreshed after 24 hours.
  """

  alias Inkwell.Repo
  alias Inkwell.Federation.{Http, HttpSignature, RemoteActorSchema}

  require Logger

  @cache_ttl_seconds 14_400  # 4 hours (reduced from 24h for faster key rotation detection)

  @doc """
  Fetches a remote actor by their AP ID.
  Returns from cache if fresh, otherwise fetches from the remote server.

  Options:
    - `force: true` — bypass cache and always fetch fresh (used for key rotation retry)
  """
  def fetch(actor_uri, opts \\ [])

  def fetch(actor_uri, opts) when is_binary(actor_uri) do
    if Keyword.get(opts, :force, false) do
      refresh(actor_uri)
    else
      case get_cached(actor_uri) do
        {:ok, actor} -> {:ok, actor}
        :stale -> refresh(actor_uri)
        :miss -> refresh(actor_uri)
      end
    end
  end

  @doc """
  Gets a cached remote actor by AP ID without fetching.
  """
  def get_by_ap_id(ap_id) do
    Repo.get_by(RemoteActorSchema, ap_id: ap_id)
  end

  @doc """
  Gets a cached remote actor by ID.
  """
  def get(id), do: Repo.get(RemoteActorSchema, id)

  # ── Cache logic ────────────────────────────────────────────────────────

  defp get_cached(ap_id) do
    case Repo.get_by(RemoteActorSchema, ap_id: ap_id) do
      nil ->
        :miss

      actor ->
        age = DateTime.diff(DateTime.utc_now(), actor.updated_at, :second)
        if age < @cache_ttl_seconds, do: {:ok, actor}, else: :stale
    end
  end

  defp refresh(actor_uri) do
    case fetch_remote(actor_uri) do
      {:ok, data} ->
        upsert_actor(data)

      {:error, reason} ->
        # If we have a stale cache, return it as fallback
        case Repo.get_by(RemoteActorSchema, ap_id: actor_uri) do
          nil -> {:error, reason}
          stale -> {:ok, stale}
        end
    end
  end

  # ── HTTP fetch ─────────────────────────────────────────────────────────

  defp fetch_remote(actor_uri) do
    Logger.info("Fetching remote actor: #{actor_uri}")

    # Use signed GET for authorized fetch compatibility (GoToSocial, Mastodon secure mode).
    # Signs with the instance actor's key so the remote server can verify our identity.
    headers = case get_instance_signing_headers(actor_uri) do
      {:ok, signed_headers} -> signed_headers
      :error -> [{~c"accept", ~c"application/activity+json, application/ld+json"}]
    end

    case Http.get(actor_uri, headers) do
      {:ok, {status, body}} when status in 200..299 ->
        case Jason.decode(body) do
          {:ok, data} when is_map(data) -> {:ok, data}
          _ ->
            Logger.warning("Failed to parse actor JSON from #{actor_uri}")
            {:error, :invalid_json}
        end

      {:ok, {401, _}} ->
        # If unsigned GET was used (no instance actor yet) and we got 401,
        # the remote requires authorized fetch. Log it — we can't retry without keys.
        Logger.warning("Remote server requires authorized fetch for #{actor_uri} (401)")
        {:error, {:http_error, 401}}

      {:ok, {status, _}} ->
        Logger.warning("Failed to fetch actor #{actor_uri}: HTTP #{status}")
        {:error, {:http_error, status}}

      {:error, reason} ->
        Logger.warning("Failed to fetch actor #{actor_uri}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # Signs a GET request using the instance actor's key.
  # Returns {:ok, charlist_headers} or :error if no instance actor exists.
  defp get_instance_signing_headers(url) do
    # Use the instance actor (relay user) to sign outbound GETs.
    # Lazy lookup — don't create the actor just for signing GETs.
    case Repo.get_by(Inkwell.Accounts.User, username: "relay") do
      nil ->
        :error

      instance_actor ->
        instance_host = federation_config(:instance_host) || "inkwell.social"
        key_id = "https://#{instance_host}/users/#{instance_actor.username}#main-key"

        signed = HttpSignature.sign_get(url, instance_actor.private_key, key_id)

        # Convert string tuples to charlist tuples for :httpc
        charlist_headers =
          Enum.map(signed, fn {k, v} ->
            {String.to_charlist(k), String.to_charlist(v)}
          end)

        {:ok, charlist_headers}
    end
  end

  defp federation_config(key) do
    config = Application.get_env(:inkwell, :federation, [])
    Keyword.get(config, key)
  end

  # ── Upsert ─────────────────────────────────────────────────────────────

  defp upsert_actor(data) do
    ap_id = data["id"]
    uri = URI.parse(ap_id)

    # Extract public key PEM
    public_key_pem =
      case data["publicKey"] do
        %{"publicKeyPem" => pem} -> pem
        _ -> nil
      end

    # Extract shared inbox
    shared_inbox =
      case data["endpoints"] do
        %{"sharedInbox" => si} -> si
        _ -> nil
      end

    attrs = %{
      ap_id: ap_id,
      username: data["preferredUsername"] || data["name"],
      domain: uri.host,
      display_name: data["name"] || data["preferredUsername"],
      avatar_url: get_in(data, ["icon", "url"]),
      banner_url: get_in(data, ["image", "url"]),
      inbox: data["inbox"],
      shared_inbox: shared_inbox,
      public_key_pem: public_key_pem,
      raw_data: data
    }

    # Require at minimum inbox and public key
    if attrs.inbox && attrs.public_key_pem do
      case Repo.get_by(RemoteActorSchema, ap_id: ap_id) do
        nil ->
          %RemoteActorSchema{}
          |> RemoteActorSchema.changeset(attrs)
          |> Repo.insert()

        existing ->
          existing
          |> RemoteActorSchema.changeset(attrs)
          |> Repo.update()
      end
    else
      Logger.warning("Remote actor #{ap_id} missing inbox or public key")
      {:error, :incomplete_actor}
    end
  end
end
