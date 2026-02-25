defmodule Inkwell.OAuth do
  @moduledoc """
  Fediverse OAuth context — manages dynamic client registration,
  authorization flows, and fediverse account linking.

  Supports any Mastodon-compatible instance (Mastodon, Pleroma, Akkoma,
  GoToSocial, Pixelfed, Hometown, etc.) via dynamic OAuth app registration.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.OAuth.{OAuthAppRegistration, FediverseAccount, OAuthState}

  require Logger

  @state_ttl_seconds 900
  @app_name "Inkwell"
  @app_website "https://inkwell.social"

  # ── Instance Discovery ────────────────────────────────────────────

  @doc """
  Parse a fediverse handle and verify the instance supports Mastodon-compatible OAuth.
  Accepts handles like "@alice@mastodon.social" or "alice@mastodon.social".
  Returns `{:ok, domain}` or `{:error, reason}`.
  """
  def discover_instance(handle) do
    handle = String.trim(handle) |> String.trim_leading("@")

    case String.split(handle, "@") do
      [_username, domain] when byte_size(domain) > 0 ->
        domain = String.downcase(domain)

        case check_instance_api(domain) do
          :ok -> {:ok, domain}
          {:error, reason} -> {:error, reason}
        end

      _ ->
        {:error, :invalid_handle}
    end
  end

  defp check_instance_api(domain) do
    url = "https://#{domain}/api/v1/instance"
    headers = [{~c"user-agent", ~c"Inkwell/0.1"}, {~c"accept", ~c"application/json"}]

    case http_get(url, headers) do
      {:ok, {status, _body}} when status in 200..299 ->
        :ok

      {:ok, {404, _}} ->
        # Try v2 instance endpoint (Mastodon 4.x+)
        url_v2 = "https://#{domain}/api/v2/instance"

        case http_get(url_v2, headers) do
          {:ok, {status, _}} when status in 200..299 -> :ok
          _ -> {:error, :not_mastodon_compatible}
        end

      {:ok, {_status, _}} ->
        {:error, :not_mastodon_compatible}

      {:error, _reason} ->
        {:error, :instance_unreachable}
    end
  end

  # ── App Registration ──────────────────────────────────────────────

  @doc """
  Get or create an OAuth app registration for a given instance domain.
  If we've already registered with this instance, return cached credentials.
  Otherwise, call POST /api/v1/apps to register dynamically.
  """
  def get_or_register_app(domain, redirect_uri) do
    case Repo.get_by(OAuthAppRegistration, domain: domain) do
      nil -> register_app(domain, redirect_uri)
      registration -> {:ok, registration}
    end
  end

  defp register_app(domain, redirect_uri) do
    url = "https://#{domain}/api/v1/apps"

    body =
      Jason.encode!(%{
        client_name: @app_name,
        redirect_uris: redirect_uri,
        scopes: "read",
        website: @app_website
      })

    case http_post_json(url, body) do
      {:ok, %{"client_id" => client_id, "client_secret" => client_secret}} ->
        %OAuthAppRegistration{}
        |> OAuthAppRegistration.changeset(%{
          domain: domain,
          client_id: client_id,
          client_secret: client_secret,
          redirect_uri: redirect_uri,
          scopes: "read"
        })
        |> Repo.insert()

      {:ok, _data} ->
        {:error, :registration_failed}

      {:error, reason} ->
        Logger.warning("Failed to register OAuth app on #{domain}: #{inspect(reason)}")
        {:error, :registration_failed}
    end
  end

  @doc """
  Delete a cached app registration (e.g., when the remote instance revokes it).
  """
  def delete_app_registration(domain) do
    case Repo.get_by(OAuthAppRegistration, domain: domain) do
      nil -> :ok
      reg -> Repo.delete(reg)
    end
  end

  # ── State Management ──────────────────────────────────────────────

  @doc """
  Create a state token for a new OAuth flow.
  Options:
    - `:linking_user_id` — non-nil when an existing user is linking their fediverse account
    - `:redirect_after` — where to send user after auth (e.g., "/feed")
  """
  def create_oauth_state(domain, opts \\ []) do
    state = :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
    expires_at = DateTime.add(DateTime.utc_now(), @state_ttl_seconds, :second)

    %OAuthState{}
    |> OAuthState.changeset(%{
      state: state,
      domain: domain,
      redirect_after: Keyword.get(opts, :redirect_after),
      linking_user_id: Keyword.get(opts, :linking_user_id),
      expires_at: expires_at
    })
    |> Repo.insert!()

    state
  end

  @doc """
  Verify and consume a state token. Returns `{:ok, oauth_state}` or `:error`.
  One-time use — deleted after verification.
  """
  def verify_and_consume_state(state_token) do
    now = DateTime.utc_now()

    case Repo.one(from s in OAuthState, where: s.state == ^state_token and s.expires_at > ^now) do
      nil ->
        :error

      oauth_state ->
        Repo.delete!(oauth_state)
        {:ok, oauth_state}
    end
  end

  # ── Token Exchange ────────────────────────────────────────────────

  @doc """
  Exchange an authorization code for an access token on the remote instance.
  """
  def exchange_code(domain, code, client_id, client_secret, redirect_uri) do
    url = "https://#{domain}/oauth/token"

    body =
      Jason.encode!(%{
        grant_type: "authorization_code",
        code: code,
        client_id: client_id,
        client_secret: client_secret,
        redirect_uri: redirect_uri,
        scope: "read"
      })

    case http_post_json(url, body) do
      {:ok, %{"access_token" => access_token} = data} ->
        {:ok,
         %{
           access_token: access_token,
           token_type: data["token_type"] || "Bearer",
           scope: data["scope"] || "read"
         }}

      {:ok, %{"error" => error}} ->
        {:error, {:oauth_error, error}}

      {:error, {:http_error, 401}} ->
        {:error, :client_revoked}

      {:error, reason} ->
        {:error, reason}
    end
  end

  # ── Verify Credentials ───────────────────────────────────────────

  @doc """
  Call GET /api/v1/accounts/verify_credentials on the remote instance
  to get the authenticated user's profile.
  """
  def verify_credentials(domain, access_token) do
    url = "https://#{domain}/api/v1/accounts/verify_credentials"

    headers = [
      {~c"authorization", String.to_charlist("Bearer #{access_token}")},
      {~c"user-agent", ~c"Inkwell/0.1"},
      {~c"accept", ~c"application/json"}
    ]

    case http_get(url, headers) do
      {:ok, {200, body}} ->
        case Jason.decode(body) do
          {:ok, %{"username" => username} = data} ->
            acct = data["acct"] || username
            full_acct = if String.contains?(acct, "@"), do: acct, else: "#{acct}@#{domain}"

            {:ok,
             %{
               username: username,
               acct: full_acct,
               display_name: data["display_name"],
               avatar_url: data["avatar"],
               bio: strip_html(data["note"]),
               url: data["url"],
               remote_id: data["id"]
             }}

          _ ->
            {:error, :invalid_response}
        end

      {:ok, {401, _}} ->
        {:error, :unauthorized}

      {:ok, {status, _}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  # ── Fediverse Account CRUD ───────────────────────────────────────

  @doc "Find a linked fediverse account by domain + remote_username."
  def get_fediverse_account(domain, remote_username) do
    Repo.get_by(FediverseAccount, domain: domain, remote_username: remote_username)
  end

  @doc "Get a fediverse account by ID."
  def get_fediverse_account!(id) do
    Repo.get!(FediverseAccount, id)
  end

  @doc "Get all fediverse accounts linked to a user."
  def list_fediverse_accounts(user_id) do
    FediverseAccount
    |> where(user_id: ^user_id)
    |> order_by(:inserted_at)
    |> Repo.all()
  end

  @doc "Create a new fediverse account link."
  def create_fediverse_account(attrs) do
    %FediverseAccount{}
    |> FediverseAccount.changeset(attrs)
    |> Repo.insert()
  end

  @doc "Update an existing fediverse account (e.g., refresh access token)."
  def update_fediverse_account(%FediverseAccount{} = account, attrs) do
    account
    |> FediverseAccount.changeset(attrs)
    |> Repo.update()
  end

  @doc "Unlink a fediverse account."
  def delete_fediverse_account(%FediverseAccount{} = account) do
    Repo.delete(account)
  end

  # ── Cleanup ──────────────────────────────────────────────────────

  @doc "Delete expired OAuth states."
  def cleanup_expired_states do
    now = DateTime.utc_now()

    {count, _} =
      from(s in OAuthState, where: s.expires_at < ^now)
      |> Repo.delete_all()

    {:ok, count}
  end

  # ── Private HTTP helpers ─────────────────────────────────────────

  defp ssl_opts do
    [
      {:verify, :verify_peer},
      {:cacerts, :public_key.cacerts_get()},
      {:depth, 3},
      {:customize_hostname_check,
       [{:match_fun, :public_key.pkix_verify_hostname_match_fun(:https)}]}
    ]
  end

  defp http_opts do
    [
      {:ssl, ssl_opts()},
      {:timeout, 15_000},
      {:connect_timeout, 10_000}
    ]
  end

  defp http_get(url, headers) do
    :ssl.start()
    :inets.start()
    url_cl = String.to_charlist(url)

    case :httpc.request(:get, {url_cl, headers}, http_opts(), []) do
      {:ok, {{_, status, _}, _resp_headers, body}} ->
        {:ok, {status, to_string(body)}}

      {:error, reason} ->
        Logger.warning("OAuth HTTP GET failed for #{url}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp http_post_json(url, body) do
    :ssl.start()
    :inets.start()
    url_cl = String.to_charlist(url)

    headers = [
      {~c"user-agent", ~c"Inkwell/0.1"},
      {~c"accept", ~c"application/json"}
    ]

    case :httpc.request(
           :post,
           {url_cl, headers, ~c"application/json", String.to_charlist(body)},
           http_opts(),
           []
         ) do
      {:ok, {{_, status, _}, _resp_headers, resp_body}} when status in 200..299 ->
        Jason.decode(to_string(resp_body))

      {:ok, {{_, status, _}, _resp_headers, resp_body}} ->
        # Try to parse error response for structured OAuth errors
        case Jason.decode(to_string(resp_body)) do
          {:ok, %{"error" => _} = error_data} ->
            {:ok, error_data}

          _ ->
            Logger.warning(
              "OAuth HTTP POST to #{url} failed: #{status} — #{String.slice(to_string(resp_body), 0..200)}"
            )

            {:error, {:http_error, status}}
        end

      {:error, reason} ->
        Logger.warning("OAuth HTTP POST to #{url} network error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp strip_html(nil), do: nil

  defp strip_html(html) do
    html
    |> String.replace(~r/<[^>]+>/, "")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
    |> String.slice(0, 2000)
  end
end
