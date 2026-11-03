defmodule InkwellWeb.BlueskyAuthController do
  @moduledoc """
  "Sign in with Bluesky", linking a Bluesky account in Settings, and
  turning on sharing to Bluesky. See `Inkwell.Bluesky` and
  `Inkwell.Bluesky.OAuth`.
  """

  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Auth, Bluesky}
  alias Inkwell.Bluesky.{Account, OAuth}
  alias Inkwell.Moderation.Vouch

  require Logger

  # ── GET /api/auth/bluesky/status ──────────────────────────────────
  def status(conn, _params) do
    user = conn.assigns[:current_user]
    json(conn, %{sign_in: Bluesky.sign_in_enabled?(), link: user != nil and Bluesky.enabled_for?(user)})
  end

  # ── GET /api/auth/bluesky/client-metadata ─────────────────────────
  # Served on the web app at /oauth/bluesky/client-metadata.json, which is
  # our client_id. Bluesky fetches it to learn our redirect URI and key.
  def client_metadata(conn, _params) do
    if OAuth.confidential?() do
      conn
      |> put_resp_header("cache-control", "public, max-age=300")
      |> json(OAuth.client_metadata())
    else
      conn |> put_status(404) |> json(%{error: "not_configured"})
    end
  end

  # ── POST /api/auth/bluesky/initiate (signed out) ──────────────────
  def initiate(conn, params) do
    if Bluesky.sign_in_enabled?() do
      start(conn, params["handle"], purpose: "sign_in", redirect_after: safe_path(params["redirect_after"]))
    else
      conn |> put_status(404) |> json(%{error: "Signing in with Bluesky isn't available yet."})
    end
  end

  # ── POST /api/auth/bluesky/link (signed in) ───────────────────────
  # Link an account, or ask for posting permission (`posting: true`).
  def link(conn, params) do
    user = conn.assigns.current_user

    if Bluesky.enabled_for?(user) do
      linked = Bluesky.get_for_user(user.id)
      purpose = if params["posting"] in [true, "true"], do: "posting", else: "link"
      # Asking for posting on an account already linked: go straight to it.
      handle = params["handle"] || (linked && (linked.handle || linked.did)) || ""

      start(conn, handle,
        purpose: purpose,
        linking_user_id: user.id,
        redirect_after: safe_path(params["redirect_after"]) || "/settings/fediverse"
      )
    else
      conn |> put_status(404) |> json(%{error: "Bluesky isn't available yet."})
    end
  end

  defp start(conn, handle, opts) do
    case OAuth.start(handle || "", opts) do
      {:ok, url} ->
        json(conn, %{ok: true, authorize_url: url})

      {:error, reason} ->
        Logger.info("Bluesky sign-in start failed: #{inspect(reason)}")
        {status, message} = start_error(reason)
        conn |> put_status(status) |> json(%{error: message})
    end
  end

  defp start_error(:invalid_handle),
    do: {422, "That doesn't look like a Bluesky handle. Try something like you.bsky.social."}

  defp start_error(reason) when reason in [:handle_not_found, :did_not_found, :did_mismatch, :handle_mismatch],
    do: {422, "We couldn't find that Bluesky account. Check the handle and try again."}

  defp start_error(reason) when reason in [:no_pds, :no_authorization_server, :unsupported_did, :no_par],
    do: {422, "That account's server doesn't support signing in from other sites yet."}

  defp start_error(_),
    do: {503, "We couldn't reach Bluesky just now. Please try again in a moment."}

  # ── POST /api/auth/bluesky/callback ───────────────────────────────
  # Body: {code, state, iss, attribution}. Called by the web app's
  # /auth/bluesky/callback after Bluesky sends the member back.
  def callback(conn, %{"code" => code, "state" => state} = params) when is_binary(code) and is_binary(state) do
    case OAuth.finish(code, state, params["iss"]) do
      {:ok, session} ->
        profile =
          case Bluesky.fetch_profile(session.did) do
            {:ok, p} -> p
            _ -> %{"handle" => session.handle}
          end

        if session.linking_user_id,
          do: finish_link(conn, session, profile),
          else: finish_sign_in(conn, session, profile, params["attribution"])

      {:error, reason} ->
        Logger.info("Bluesky sign-in finish failed: #{inspect(reason)}")

        message =
          if reason == :invalid_state,
            do: "That sign-in took too long or was already used. Please start again.",
            else: "Bluesky didn't confirm the sign-in. Please try again."

        conn |> put_status(401) |> json(%{error: message})
    end
  end

  def callback(conn, _), do: conn |> put_status(422) |> json(%{error: "code and state are required"})

  defp finish_sign_in(conn, session, profile, attribution) do
    case Bluesky.get_by_did(session.did) do
      %Account{user_id: user_id} = account ->
        user = Accounts.get_user!(user_id)

        if user.blocked_at do
          conn |> put_status(403) |> json(%{error: "This account has been suspended."})
        else
          # Signing in asks only for "atproto"; keep a session that can
          # still post rather than replacing it with one that can't.
          if Account.can_post?(account) and "transition:generic" not in String.split(session.scope || ""),
            do: Bluesky.refresh_profile(account, profile),
            else: Bluesky.save_session(user.id, session, profile)

          user = Vouch.maybe_vouch(user, Bluesky.history(profile), "bluesky")
          signed_in(conn, user, false, session.redirect_after)
        end

      nil ->
        case create_user(session, profile) do
          {:ok, user} ->
            {:ok, _} = Bluesky.save_session(user.id, session, profile)
            {:ok, user} = Inkwell.Growth.record_signup_attribution(user, attribution)
            user = Vouch.maybe_vouch(user, Bluesky.history(profile), "bluesky")
            signed_in(conn, user, true, nil)

          {:error, reason} ->
            Logger.warning("Bluesky sign-up failed: #{inspect(reason)}")
            conn |> put_status(500) |> json(%{error: "We couldn't create your account. Please try again."})
        end
    end
  end

  defp finish_link(conn, session, profile) do
    user = Accounts.get_user!(session.linking_user_id)

    case Bluesky.get_by_did(session.did) do
      %Account{user_id: other} when other != user.id ->
        conn
        |> put_status(409)
        |> json(%{error: "That Bluesky account is already linked to another Inkwell account."})

      _ ->
        # One Bluesky account per member: linking a different one replaces it.
        case Bluesky.get_for_user(user.id) do
          %Account{did: did} = old when did != session.did -> Bluesky.unlink(old)
          _ -> :ok
        end

        case Bluesky.save_session(user.id, session, profile) do
          {:ok, _} ->
            Vouch.maybe_vouch(user, Bluesky.history(profile), "bluesky")
            json(conn, %{ok: true, linked: true, redirect_to: session.redirect_after || "/settings/fediverse"})

          {:error, reason} ->
            Logger.warning("Bluesky link failed: #{inspect(reason)}")
            conn |> put_status(500) |> json(%{error: "We couldn't link that account. Please try again."})
        end
    end
  end

  defp create_user(session, profile) do
    handle = profile["handle"] || session.handle || ""
    base = handle |> String.replace_suffix(".bsky.social", "") |> String.split(".") |> List.first()

    with {:ok, user} <-
           Accounts.create_user(%{
             username: Accounts.available_username(base || "writer"),
             email: Bluesky.placeholder_email(session.did),
             display_name: non_empty(profile["displayName"]) || base
           }) do
      attrs =
        %{}
        |> put_if(:bio, profile["description"] |> non_empty() |> then(&(&1 && String.slice(&1, 0, 2000))))
        |> put_if(:avatar_url, imported_avatar(profile["avatar"]))

      user =
        if map_size(attrs) > 0 do
          case Accounts.update_user_profile(user, attrs) do
            {:ok, updated} -> updated
            _ -> user
          end
        else
          user
        end

      Accounts.set_terms_accepted(user)
    end
  end

  defp signed_in(conn, user, is_new, redirect_after) do
    token = Auth.create_api_session_token(user.id)

    json(conn, %{
      ok: true,
      token: token,
      is_new: is_new,
      redirect_to: if(is_new, do: "/welcome", else: redirect_after || "/feed")
    })
  end

  # ── GET /api/auth/bluesky/account ─────────────────────────────────
  def show(conn, _params) do
    user = conn.assigns.current_user

    json(conn, %{
      enabled: Bluesky.enabled_for?(user),
      data: user.id |> Bluesky.get_for_user() |> render_account()
    })
  end

  # ── DELETE /api/auth/bluesky/account ──────────────────────────────
  def delete(conn, _params) do
    user = conn.assigns.current_user

    case Bluesky.get_for_user(user.id) do
      nil ->
        json(conn, %{ok: true})

      account ->
        if bluesky_only?(user) do
          conn
          |> put_status(422)
          |> json(%{
            error:
              "You sign in with this Bluesky account, so it can't be unlinked until you add an email address in Settings → Profile."
          })
        else
          {:ok, _} = Bluesky.unlink(account)
          json(conn, %{ok: true})
        end
    end
  end

  def render_account(nil), do: nil

  def render_account(%Account{} = a) do
    %{
      id: a.id,
      did: a.did,
      handle: a.handle,
      display_name: a.display_name,
      avatar_url: a.avatar_url,
      can_post: Account.can_post?(a),
      connected: a.session != nil,
      profile_url: "https://bsky.app/profile/#{a.handle || a.did}",
      linked_at: a.inserted_at
    }
  end

  defp bluesky_only?(user), do: String.ends_with?(user.email || "", "@bluesky.fediverse.inkwell.social")

  defp imported_avatar(url) when is_binary(url) do
    case Inkwell.Avatars.import_remote(url) do
      {:ok, data_uri} -> data_uri
      _ -> nil
    end
  end

  defp imported_avatar(_), do: nil

  defp safe_path(path) when is_binary(path) do
    if Regex.match?(~r/^\/(?![\/\\])/, path), do: path, else: nil
  end

  defp safe_path(_), do: nil

  defp put_if(map, _k, nil), do: map
  defp put_if(map, k, v), do: Map.put(map, k, v)

  defp non_empty(s) when is_binary(s) do
    case String.trim(s) do
      "" -> nil
      t -> t
    end
  end

  defp non_empty(_), do: nil
end
