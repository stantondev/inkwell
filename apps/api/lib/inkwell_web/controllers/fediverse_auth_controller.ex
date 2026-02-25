defmodule InkwellWeb.FediverseAuthController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, Auth, OAuth}

  require Logger

  @redirect_uri_path "/auth/fediverse/callback"

  # ── POST /api/auth/fediverse/initiate ─────────────────────────────
  # Discovers instance, registers OAuth app, returns authorization URL.
  # Body: { "handle": "@alice@mastodon.social" }
  def initiate(conn, %{"handle" => handle} = params) do
    redirect_uri = "#{frontend_url()}#{@redirect_uri_path}"

    with {:ok, domain} <- OAuth.discover_instance(handle),
         {:ok, registration} <- OAuth.get_or_register_app(domain, redirect_uri) do
      state =
        OAuth.create_oauth_state(domain,
          redirect_after: params["redirect_after"]
        )

      authorize_url = build_authorize_url(domain, registration.client_id, redirect_uri, state)

      json(conn, %{ok: true, authorize_url: authorize_url, domain: domain})
    else
      {:error, :invalid_handle} ->
        conn
        |> put_status(422)
        |> json(%{error: "Invalid fediverse handle. Use format: @user@instance.social"})

      {:error, :not_mastodon_compatible} ->
        conn
        |> put_status(422)
        |> json(%{error: "This instance doesn't support Mastodon-compatible authentication"})

      {:error, :instance_unreachable} ->
        conn
        |> put_status(503)
        |> json(%{error: "Could not reach that instance — it may be down or unreachable"})

      {:error, :registration_failed} ->
        conn
        |> put_status(502)
        |> json(%{error: "Failed to register with that instance. Please try again."})

      {:error, reason} ->
        Logger.warning("Fediverse auth initiate failed: #{inspect(reason)}")
        conn |> put_status(500) |> json(%{error: "Something went wrong. Please try again."})
    end
  end

  def initiate(conn, _), do: conn |> put_status(422) |> json(%{error: "handle is required"})

  # ── POST /api/auth/fediverse/link ─────────────────────────────────
  # Same as initiate but for authenticated users linking their account.
  def initiate_link(conn, %{"handle" => handle} = params) do
    user = conn.assigns.current_user
    redirect_uri = "#{frontend_url()}#{@redirect_uri_path}"

    with {:ok, domain} <- OAuth.discover_instance(handle),
         {:ok, registration} <- OAuth.get_or_register_app(domain, redirect_uri) do
      state =
        OAuth.create_oauth_state(domain,
          linking_user_id: user.id,
          redirect_after: params["redirect_after"] || "/settings/fediverse"
        )

      authorize_url = build_authorize_url(domain, registration.client_id, redirect_uri, state)

      json(conn, %{ok: true, authorize_url: authorize_url, domain: domain})
    else
      {:error, :invalid_handle} ->
        conn |> put_status(422) |> json(%{error: "Invalid fediverse handle"})

      {:error, :not_mastodon_compatible} ->
        conn |> put_status(422) |> json(%{error: "This instance doesn't support Mastodon-compatible authentication"})

      {:error, :instance_unreachable} ->
        conn |> put_status(503) |> json(%{error: "Could not reach that instance"})

      {:error, _reason} ->
        conn |> put_status(500) |> json(%{error: "Something went wrong. Please try again."})
    end
  end

  def initiate_link(conn, _), do: conn |> put_status(422) |> json(%{error: "handle is required"})

  # ── POST /api/auth/fediverse/callback ─────────────────────────────
  # Exchanges authorization code for token, finds or creates user.
  # Body: { "code": "...", "state": "..." }
  def callback(conn, %{"code" => code, "state" => state_token}) do
    with {:state, {:ok, oauth_state}} <- {:state, OAuth.verify_and_consume_state(state_token)},
         {:reg, {:ok, registration}} <- {:reg, get_registration(oauth_state.domain)},
         {:exchange, {:ok, token_data}} <-
           {:exchange,
            OAuth.exchange_code(
              oauth_state.domain,
              code,
              registration.client_id,
              registration.client_secret,
              registration.redirect_uri
            )},
         {:verify, {:ok, credentials}} <-
           {:verify, OAuth.verify_credentials(oauth_state.domain, token_data.access_token)} do
      result =
        if oauth_state.linking_user_id do
          link_to_existing_user(oauth_state, credentials, token_data)
        else
          find_or_create_user(oauth_state, credentials, token_data)
        end

      case result do
        {:ok, user, _fediverse_account, is_new} ->
          api_token = Auth.create_api_session_token(user.id)
          destination = if is_new, do: "/welcome", else: oauth_state.redirect_after || "/feed"

          json(conn, %{
            ok: true,
            token: api_token,
            user: render_user(user),
            is_new: is_new,
            redirect_to: destination
          })

        {:error, :already_linked} ->
          conn
          |> put_status(409)
          |> json(%{error: "This fediverse account is already linked to another Inkwell user"})

        {:error, reason} ->
          Logger.warning("Fediverse callback user handling failed: #{inspect(reason)}")
          conn |> put_status(500) |> json(%{error: "Failed to complete sign in. Please try again."})
      end
    else
      {:state, :error} ->
        conn |> put_status(401) |> json(%{error: "Invalid or expired authorization. Please try again."})

      {:exchange, {:error, :client_revoked}} ->
        # Client registration was revoked — delete it so next attempt re-registers
        with {:state, {:ok, state}} <- {:state, :error} do
          OAuth.delete_app_registration(state.domain)
        end

        conn |> put_status(401) |> json(%{error: "Authorization failed. Please try again."})

      {:exchange, {:error, {:oauth_error, error}}} ->
        conn |> put_status(401) |> json(%{error: "Authorization failed: #{error}"})

      {:verify, {:error, :unauthorized}} ->
        conn |> put_status(401) |> json(%{error: "Authorization was denied by the remote instance."})

      {_step, {:error, reason}} ->
        Logger.warning("Fediverse callback failed: #{inspect(reason)}")
        conn |> put_status(500) |> json(%{error: "Something went wrong. Please try again."})
    end
  end

  def callback(conn, _), do: conn |> put_status(422) |> json(%{error: "code and state are required"})

  # ── GET /api/auth/fediverse/accounts ──────────────────────────────
  # Lists the current user's linked fediverse accounts.
  def list_accounts(conn, _params) do
    user = conn.assigns.current_user
    accounts = OAuth.list_fediverse_accounts(user.id)

    json(conn, %{
      data:
        Enum.map(accounts, fn a ->
          %{
            id: a.id,
            domain: a.domain,
            remote_username: a.remote_username,
            remote_acct: a.remote_acct,
            remote_display_name: a.remote_display_name,
            remote_avatar_url: a.remote_avatar_url,
            linked_at: a.inserted_at
          }
        end)
    })
  end

  # ── DELETE /api/auth/fediverse/accounts/:id ───────────────────────
  # Unlinks a fediverse account.
  def unlink(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    try do
      account = OAuth.get_fediverse_account!(id)

      if account.user_id != user.id do
        conn |> put_status(403) |> json(%{error: "Not your account"})
      else
        {:ok, _} = OAuth.delete_fediverse_account(account)
        json(conn, %{ok: true})
      end
    rescue
      Ecto.NoResultsError ->
        conn |> put_status(404) |> json(%{error: "Account not found"})
    end
  end

  # ── Private helpers ──────────────────────────────────────────────

  defp find_or_create_user(oauth_state, credentials, token_data) do
    domain = oauth_state.domain
    remote_username = credentials.username

    case OAuth.get_fediverse_account(domain, remote_username) do
      nil ->
        # New user — create account + link fediverse identity
        username = derive_unique_username(remote_username)
        email_placeholder = "#{remote_username}@#{domain}.fediverse.inkwell.social"

        case Accounts.create_user(%{
               username: username,
               email: email_placeholder,
               display_name: credentials.display_name || remote_username
             }) do
          {:ok, user} ->
            # Set bio and avatar if available (profile_changeset handles these)
            update_attrs =
              %{}
              |> maybe_put(:bio, credentials.bio)
              |> maybe_put(:avatar_url, credentials.avatar_url)

            user =
              if map_size(update_attrs) > 0 do
                {:ok, updated} = Accounts.update_user_profile(user, update_attrs)
                updated
              else
                user
              end

            {:ok, user} = Accounts.set_terms_accepted(user)

            {:ok, fedi_account} =
              OAuth.create_fediverse_account(%{
                user_id: user.id,
                domain: domain,
                remote_username: remote_username,
                remote_acct: credentials.acct,
                remote_actor_uri: credentials.url,
                remote_display_name: credentials.display_name,
                remote_avatar_url: credentials.avatar_url,
                access_token: token_data.access_token,
                token_scope: token_data.scope,
                last_verified_at: DateTime.utc_now()
              })

            {:ok, user, fedi_account, true}

          {:error, changeset} ->
            Logger.warning("Failed to create user for fediverse account: #{inspect(changeset)}")
            {:error, :user_creation_failed}
        end

      %{user_id: user_id} = existing_account ->
        # Returning user — update token and return
        user = Accounts.get_user!(user_id)

        {:ok, _} =
          OAuth.update_fediverse_account(existing_account, %{
            access_token: token_data.access_token,
            token_scope: token_data.scope,
            last_verified_at: DateTime.utc_now(),
            remote_display_name: credentials.display_name,
            remote_avatar_url: credentials.avatar_url
          })

        {:ok, user, existing_account, false}
    end
  end

  defp link_to_existing_user(oauth_state, credentials, token_data) do
    domain = oauth_state.domain
    remote_username = credentials.username

    case OAuth.get_fediverse_account(domain, remote_username) do
      nil ->
        user = Accounts.get_user!(oauth_state.linking_user_id)

        {:ok, fedi_account} =
          OAuth.create_fediverse_account(%{
            user_id: user.id,
            domain: domain,
            remote_username: remote_username,
            remote_acct: credentials.acct,
            remote_actor_uri: credentials.url,
            remote_display_name: credentials.display_name,
            remote_avatar_url: credentials.avatar_url,
            access_token: token_data.access_token,
            token_scope: token_data.scope,
            last_verified_at: DateTime.utc_now()
          })

        {:ok, user, fedi_account, false}

      %{user_id: existing_user_id} when existing_user_id == oauth_state.linking_user_id ->
        # Already linked to this user — just update token
        user = Accounts.get_user!(existing_user_id)
        existing_account = OAuth.get_fediverse_account(domain, remote_username)

        {:ok, _} =
          OAuth.update_fediverse_account(existing_account, %{
            access_token: token_data.access_token,
            last_verified_at: DateTime.utc_now()
          })

        {:ok, user, existing_account, false}

      _ ->
        {:error, :already_linked}
    end
  end

  defp build_authorize_url(domain, client_id, redirect_uri, state) do
    params =
      URI.encode_query(%{
        "client_id" => client_id,
        "redirect_uri" => redirect_uri,
        "response_type" => "code",
        "scope" => "read",
        "state" => state
      })

    "https://#{domain}/oauth/authorize?#{params}"
  end

  defp get_registration(domain) do
    case Inkwell.Repo.get_by(OAuth.OAuthAppRegistration, domain: domain) do
      nil -> {:error, :no_registration}
      reg -> {:ok, reg}
    end
  end

  defp derive_unique_username(remote_username) do
    base =
      remote_username
      |> String.replace(~r/[^a-zA-Z0-9_]/, "_")
      |> String.slice(0, 25)

    # Ensure minimum length
    base = if String.length(base) < 3, do: base <> "_user", else: base

    if Accounts.get_user_by_username(base) do
      "#{base}_#{:rand.uniform(9999)}"
    else
      base
    end
  end

  defp render_user(user) do
    %{
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      pronouns: user.pronouns,
      ap_id: user.ap_id,
      created_at: user.inserted_at,
      is_admin: Accounts.is_admin?(user),
      settings: user.settings || %{},
      subscription_tier: user.subscription_tier || "free",
      terms_accepted_at: user.terms_accepted_at
    }
  end

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, _key, ""), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  defp frontend_url do
    Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")
  end
end
