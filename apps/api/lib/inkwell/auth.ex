defmodule Inkwell.Auth do
  @moduledoc """
  Authentication context — manages magic link tokens and API session tokens.
  All tokens are stored in Postgres (auth_tokens table).
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Auth.AuthToken

  @magic_link_ttl_seconds 900           # 15 minutes
  @api_session_ttl_seconds 7_776_000    # 90 days
  @refresh_after_seconds 604_800        # 7 days — refresh token if 7+ days old

  @doc "Create a magic link token for a user. Returns the raw token string."
  def create_magic_link_token(user_id) do
    token = generate_token()
    expires_at = DateTime.add(DateTime.utc_now(), @magic_link_ttl_seconds, :second)

    %AuthToken{}
    |> AuthToken.changeset(%{
      token: token,
      user_id: user_id,
      type: "magic_link",
      expires_at: expires_at
    })
    |> Repo.insert!()

    token
  end

  @doc "Verify and consume a magic link token. Returns {:ok, user_id} or :error."
  def verify_magic_link_token(token) do
    now = DateTime.utc_now()

    case Repo.one(
           from t in AuthToken,
             where: t.token == ^token and t.type == "magic_link" and t.expires_at > ^now
         ) do
      nil ->
        :error

      auth_token ->
        # Delete the token (one-time use)
        Repo.delete!(auth_token)
        {:ok, auth_token.user_id}
    end
  end

  @doc "Create a long-lived API session token. Returns the raw token string."
  def create_api_session_token(user_id) do
    token = generate_token()
    expires_at = DateTime.add(DateTime.utc_now(), @api_session_ttl_seconds, :second)

    %AuthToken{}
    |> AuthToken.changeset(%{
      token: token,
      user_id: user_id,
      type: "api_session",
      expires_at: expires_at
    })
    |> Repo.insert!()

    token
  end

  @doc """
  Look up a valid API session token. Returns user_id or nil.

  Implements sliding window expiration: if the token is more than 7 days old,
  its expires_at is extended by another 90 days. This means active users
  stay signed in indefinitely — they only need to re-authenticate after
  90 days of inactivity.
  """
  def verify_api_session_token(token) do
    now = DateTime.utc_now()

    case Repo.one(
           from t in AuthToken,
             where: t.token == ^token and t.type == "api_session" and t.expires_at > ^now
         ) do
      nil -> nil

      auth_token ->
        maybe_refresh_token(auth_token, now)
        auth_token.user_id
    end
  end

  @doc "Revoke an API session token (sign out)."
  def revoke_api_session_token(token) do
    from(t in AuthToken, where: t.token == ^token)
    |> Repo.delete_all()

    :ok
  end

  @doc "Clean up expired tokens (can be called periodically via Oban)."
  def cleanup_expired_tokens do
    now = DateTime.utc_now()

    {count, _} =
      from(t in AuthToken, where: t.expires_at < ^now)
      |> Repo.delete_all()

    {:ok, count}
  end

  # Extend the token's expires_at if more than @refresh_after_seconds have
  # elapsed since it was created/last refreshed. This avoids a DB write on
  # every single request while still keeping active sessions alive.
  defp maybe_refresh_token(auth_token, now) do
    remaining = DateTime.diff(auth_token.expires_at, now, :second)

    if remaining < @api_session_ttl_seconds - @refresh_after_seconds do
      new_expires = DateTime.add(now, @api_session_ttl_seconds, :second)

      from(t in AuthToken, where: t.id == ^auth_token.id)
      |> Repo.update_all(set: [expires_at: new_expires])
    end
  end

  defp generate_token do
    :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
  end
end
