defmodule Inkwell.ApiKeys do
  @moduledoc """
  Context for managing API keys. Keys use an `ink_` prefix, are SHA-256
  hashed in the database (raw key shown once at creation), and support
  read/write scopes with per-tier enforcement.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.ApiKeys.ApiKey

  @max_keys_per_user 10

  @doc "Create a new API key for a user. Returns {:ok, %ApiKey{raw_key: ...}} or {:error, changeset/atom}."
  def create_api_key(user_id, attrs) do
    if count_api_keys(user_id) >= @max_keys_per_user do
      {:error, :key_limit_reached}
    else
      %ApiKey{}
      |> ApiKey.create_changeset(Map.put(attrs, "user_id", user_id))
      |> Repo.insert()
    end
  end

  @doc "List all active (non-revoked) API keys for a user."
  def list_api_keys(user_id) do
    from(k in ApiKey,
      where: k.user_id == ^user_id and is_nil(k.revoked_at),
      order_by: [desc: k.inserted_at],
      select: %{
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        scopes: k.scopes,
        last_used_at: k.last_used_at,
        expires_at: k.expires_at,
        inserted_at: k.inserted_at
      }
    )
    |> Repo.all()
  end

  @doc "Revoke an API key. Verifies ownership via user_id."
  def revoke_api_key(user_id, key_id) do
    case Repo.one(from k in ApiKey, where: k.id == ^key_id and k.user_id == ^user_id and is_nil(k.revoked_at)) do
      nil -> {:error, :not_found}
      key ->
        key
        |> ApiKey.revoke_changeset()
        |> Repo.update()
    end
  end

  @doc "Revoke all API keys for a user (used when blocking or deleting account)."
  def revoke_all_user_keys(user_id) do
    now = DateTime.utc_now()

    from(k in ApiKey, where: k.user_id == ^user_id and is_nil(k.revoked_at))
    |> Repo.update_all(set: [revoked_at: now])

    :ok
  end

  @doc """
  Verify an API key. Returns {:ok, %ApiKey{}} with user preloaded, or :error.
  Updates last_used_at asynchronously to avoid blocking auth.
  """
  def verify_api_key(raw_key) do
    key_hash = :crypto.hash(:sha256, raw_key) |> Base.encode16(case: :lower)
    now = DateTime.utc_now()

    case Repo.one(
           from k in ApiKey,
             where: k.key_hash == ^key_hash and is_nil(k.revoked_at) and
                      (is_nil(k.expires_at) or k.expires_at > ^now),
             preload: [:user]
         ) do
      nil ->
        :error

      api_key ->
        # Update last_used_at (fire-and-forget, don't block the request)
        Task.start(fn ->
          from(k in ApiKey, where: k.id == ^api_key.id)
          |> Repo.update_all(set: [last_used_at: now])
        end)

        {:ok, api_key}
    end
  end

  @doc "Count active (non-revoked) API keys for a user."
  def count_api_keys(user_id) do
    from(k in ApiKey, where: k.user_id == ^user_id and is_nil(k.revoked_at))
    |> Repo.aggregate(:count)
  end

  @doc "Delete revoked keys older than 90 days. Called by cleanup worker."
  def cleanup_revoked_keys do
    cutoff = DateTime.add(DateTime.utc_now(), -90 * 24 * 3600, :second)

    {count, _} =
      from(k in ApiKey, where: not is_nil(k.revoked_at) and k.revoked_at < ^cutoff)
      |> Repo.delete_all()

    {:ok, count}
  end
end
