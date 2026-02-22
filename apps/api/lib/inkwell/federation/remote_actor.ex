defmodule Inkwell.Federation.RemoteActor do
  @moduledoc """
  Fetches and caches remote ActivityPub actors.
  Actors are cached in the `remote_actors` table and refreshed after 24 hours.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Federation.RemoteActorSchema

  require Logger

  @cache_ttl_seconds 86_400  # 24 hours

  @doc """
  Fetches a remote actor by their AP ID.
  Returns from cache if fresh, otherwise fetches from the remote server.
  """
  def fetch(actor_uri) when is_binary(actor_uri) do
    case get_cached(actor_uri) do
      {:ok, actor} -> {:ok, actor}
      :stale -> refresh(actor_uri)
      :miss -> refresh(actor_uri)
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

    headers = [
      {~c"accept", ~c"application/activity+json, application/ld+json"},
      {~c"user-agent", ~c"Inkwell/0.1 (+https://inkwell.social)"}
    ]

    case :httpc.request(:get, {String.to_charlist(actor_uri), headers}, [{:timeout, 10_000}], []) do
      {:ok, {{_, status, _}, _headers, body}} when status in 200..299 ->
        case Jason.decode(to_string(body)) do
          {:ok, data} when is_map(data) -> {:ok, data}
          _ -> {:error, :invalid_json}
        end

      {:ok, {{_, status, _}, _, _}} ->
        Logger.warning("Failed to fetch actor #{actor_uri}: HTTP #{status}")
        {:error, {:http_error, status}}

      {:error, reason} ->
        Logger.warning("Failed to fetch actor #{actor_uri}: #{inspect(reason)}")
        {:error, reason}
    end
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
