defmodule Inkwell.Bluesky do
  @moduledoc """
  Bluesky accounts on Inkwell: signing in with Bluesky, linking an account
  to an existing member, and sharing entries there (`Inkwell.Bluesky.Poster`).

  The OAuth handshake lives in `Inkwell.Bluesky.OAuth`; this module keeps
  the stored account and its session fresh.

  Who can use it is set by `BLUESKY_SIGNIN` (`:bluesky_signin`): `"on"` for
  everyone, `"admins"` to let admins link and post while it is tested, else
  off.
  """

  import Ecto.Query

  alias Inkwell.Repo
  alias Inkwell.Accounts
  alias Inkwell.Bluesky.{Account, Keys, Net, OAuth}

  require Logger

  @appview "https://public.api.bsky.app"

  # ── Who can use it ─────────────────────────────────────────────────

  def mode, do: Application.get_env(:inkwell, :bluesky_signin, "off")

  @doc "Sign in / sign up with Bluesky (signed out)."
  def sign_in_enabled?, do: mode() == "on" and OAuth.available?()

  @doc "Link an account / share to Bluesky (signed in)."
  def enabled_for?(nil), do: sign_in_enabled?()

  def enabled_for?(user) do
    OAuth.available?() and (mode() == "on" or (mode() == "admins" and Accounts.is_admin?(user)))
  end

  # ── Accounts ───────────────────────────────────────────────────────

  def get_by_did(did), do: Repo.get_by(Account, did: did)
  def get_for_user(user_id), do: Repo.get_by(Account, user_id: user_id)
  def get(id), do: Repo.get(Account, id)

  @doc """
  Store a finished sign-in (`OAuth.finish/3` result) for `user_id`, with
  the public profile. Updates the existing link for that DID.
  """
  def save_session(user_id, session, profile) do
    attrs = %{
      user_id: user_id,
      did: session.did,
      handle: profile["handle"] || session.handle,
      display_name: blank_to_nil(profile["displayName"]),
      avatar_url: profile["avatar"],
      pds_url: session.pds_url,
      auth_server: session.issuer,
      scope: session.scope,
      session:
        Keys.encrypt(%{
          "access_token" => session.access_token,
          "refresh_token" => session.refresh_token,
          "dpop_key" => session.dpop_key
        }),
      access_expires_at: session.expires_at,
      remote_created_at: parse_time(profile["createdAt"]),
      posts_count: profile["postsCount"],
      followers_count: profile["followersCount"],
      last_verified_at: DateTime.utc_now()
    }

    case get_by_did(session.did) do
      nil -> %Account{} |> Account.changeset(attrs) |> Repo.insert()
      account -> account |> Account.changeset(attrs) |> Repo.update()
    end
  end

  @doc "Update the public profile details on a link (handle, name, picture, counts)."
  def refresh_profile(%Account{} = account, profile) do
    account
    |> Account.changeset(%{
      handle: profile["handle"] || account.handle,
      display_name: blank_to_nil(profile["displayName"]),
      avatar_url: profile["avatar"],
      remote_created_at: parse_time(profile["createdAt"]),
      posts_count: profile["postsCount"],
      followers_count: profile["followersCount"],
      last_verified_at: DateTime.utc_now()
    })
    |> Repo.update()
  end

  @doc "Unlink. Asks Bluesky to end the session too (best effort, in the background)."
  def unlink(%Account{} = account) do
    session = Keys.decrypt(account.session)
    issuer = account.auth_server

    Inkwell.Federation.Background.run(fn ->
      with {:ok, %{"refresh_token" => token}} when is_binary(token) <- session,
           {:ok, meta} <- Inkwell.Bluesky.Identity.server_metadata(issuer),
           url when is_binary(url) <- meta["revocation_endpoint"] do
        Net.request(:post, url, form: %{"token" => token, "client_id" => OAuth.client_id()})
      end
    end)

    Repo.delete(account)
  end

  # ── Public profile ─────────────────────────────────────────────────

  @doc """
  Public profile from Bluesky's AppView: handle, displayName, description,
  avatar, createdAt, postsCount, followersCount. Profiles are public, so
  this needs no token.
  """
  def fetch_profile(did) do
    base = Application.get_env(:inkwell, :bluesky_appview, @appview)
    Net.get_json(base <> "/xrpc/app.bsky.actor.getProfile", params: [actor: did])
  end

  @doc "The history the vouch rule reads, from a profile."
  def history(profile) do
    %{created_at: profile["createdAt"], posts: profile["postsCount"], followers: profile["followersCount"]}
  end

  # ── Authorized calls ───────────────────────────────────────────────

  @doc """
  Call the member's PDS with a fresh session. Refreshes the tokens first
  when they are about to expire (under a row lock, because refresh tokens
  are single-use) and once more if the PDS says the token is no longer good.
  """
  def call(%Account{} = account, method, nsid, opts \\ []) do
    with {:ok, session, account} <- fresh_session(account.id, false) do
      case OAuth.pds_request(session, account.pds_url, method, nsid, opts) do
        {:error, :unauthorized} ->
          with {:ok, session, account} <- fresh_session(account.id, true) do
            OAuth.pds_request(session, account.pds_url, method, nsid, opts)
          end

        result ->
          result
      end
    end
  end

  defp fresh_session(id, force?) do
    result =
      Repo.transaction(fn ->
        account = Repo.one(from a in Account, where: a.id == ^id, lock: "FOR UPDATE")

        outcome =
          with %Account{} <- account || {:error, :not_linked},
               {:ok, session} <- Keys.decrypt(account.session) |> ok_or(:session_ended) do
            if force? or expiring?(account), do: refresh_locked(account, session), else: {:ok, session, account}
          end

        case outcome do
          {:ok, session, account} -> {session, account}
          {:error, reason} -> Repo.rollback(reason)
        end
      end)

    case result do
      {:ok, {session, account}} ->
        {:ok, session, account}

      {:error, :session_ended} ->
        # Bluesky ended the session (revoked, expired): stop trying to post
        # and ask the member to connect again.
        from(a in Account, where: a.id == ^id) |> Repo.update_all(set: [session: nil, updated_at: DateTime.utc_now()])
        {:error, :session_ended}

      error ->
        error
    end
  end

  defp refresh_locked(account, session) do
    case OAuth.refresh(session, account.auth_server) do
      {:ok, tokens} ->
        session = %{
          session
          | "access_token" => tokens["access_token"],
            "refresh_token" => tokens["refresh_token"] || session["refresh_token"]
        }

        {:ok, updated} =
          account
          |> Account.changeset(%{
            session: Keys.encrypt(session),
            access_expires_at: tokens["expires_at"],
            scope: tokens["scope"] || account.scope
          })
          |> Repo.update()

        {:ok, session, updated}

      {:error, :session_ended} ->
        {:error, :session_ended}

      {:error, reason} ->
        Logger.info("Bluesky token refresh failed for #{account.did}: #{inspect(reason)}")
        {:error, :refresh_failed}
    end
  end

  defp expiring?(%Account{access_expires_at: nil}), do: true
  defp expiring?(%Account{access_expires_at: at}), do: DateTime.diff(at, DateTime.utc_now()) < 60

  # ── Helpers ────────────────────────────────────────────────────────

  @doc "Placeholder email for a member who signed up with Bluesky (never emailed)."
  def placeholder_email(did), do: String.replace(did, ":", "-") <> "@bluesky.fediverse.inkwell.social"

  defp parse_time(s) when is_binary(s) do
    case DateTime.from_iso8601(s) do
      {:ok, dt, _} -> dt
      _ -> nil
    end
  end

  defp parse_time(_), do: nil

  defp blank_to_nil(s) when is_binary(s) do
    case String.trim(s) do
      "" -> nil
      t -> String.slice(t, 0, 255)
    end
  end

  defp blank_to_nil(_), do: nil

  defp ok_or({:ok, v}, _), do: {:ok, v}
  defp ok_or(_, reason), do: {:error, reason}
end
