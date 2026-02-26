defmodule Inkwell.Tipping do
  @moduledoc """
  Stripe Connect integration for writer tips.
  Uses Express accounts so Stripe handles KYC, tax forms, and payouts.
  Same raw :httpc pattern as Billing module.
  """

  alias Inkwell.Accounts.User
  alias Inkwell.Repo

  require Logger

  @stripe_api "https://api.stripe.com/v1"

  # ── Stripe Connect: Account Management ─────────────────────────────

  @doc "Create a Stripe Connect Express account for the writer."
  def create_connect_account(%User{} = user) do
    if user.stripe_connect_account_id do
      {:ok, user.stripe_connect_account_id}
    else
      params =
        URI.encode_query(%{
          "type" => "express",
          "email" => user.email,
          "metadata[user_id]" => user.id,
          "metadata[username]" => user.username,
          "capabilities[transfers][requested]" => "true",
          "capabilities[card_payments][requested]" => "true",
          "business_type" => "individual",
          "business_profile[url]" => "https://inkwell.social/#{user.username}",
          "business_profile[product_description]" => "Writer on Inkwell receiving reader tips"
        })

      case stripe_post("/accounts", params) do
        {:ok, %{"id" => account_id}} ->
          user
          |> User.stripe_connect_changeset(%{stripe_connect_account_id: account_id})
          |> Repo.update()

          {:ok, account_id}

        {:error, reason} ->
          Logger.error("Failed to create Connect account for #{user.username}: #{inspect(reason)}")
          {:error, reason}
      end
    end
  end

  @doc "Create an Account Link for Stripe Connect onboarding (redirects writer to Stripe)."
  def create_onboarding_link(%User{} = user) do
    case user.stripe_connect_account_id do
      nil ->
        {:error, :no_connect_account}

      account_id ->
        frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")

        params =
          URI.encode_query(%{
            "account" => account_id,
            "refresh_url" => "#{frontend_url}/settings/support?refresh=true",
            "return_url" => "#{frontend_url}/settings/support?onboarding=complete",
            "type" => "account_onboarding"
          })

        case stripe_post("/account_links", params) do
          {:ok, %{"url" => url}} ->
            {:ok, url}

          {:error, reason} ->
            Logger.error("Failed to create onboarding link for #{user.username}: #{inspect(reason)}")
            {:error, reason}
        end
    end
  end

  @doc "Create a Stripe Express Dashboard login link for the connected account."
  def create_login_link(%User{} = user) do
    case user.stripe_connect_account_id do
      nil ->
        {:error, :no_connect_account}

      account_id ->
        case stripe_post("/accounts/#{account_id}/login_links", "") do
          {:ok, %{"url" => url}} ->
            {:ok, url}

          {:error, reason} ->
            Logger.error("Failed to create login link for #{user.username}: #{inspect(reason)}")
            {:error, reason}
        end
    end
  end

  @doc "Check the status of a connected Stripe account."
  def check_account_status(%User{} = user) do
    case user.stripe_connect_account_id do
      nil ->
        {:ok, %{connected: false, charges_enabled: false, payouts_enabled: false, onboarded: false}}

      account_id ->
        case stripe_get("/accounts/#{account_id}") do
          {:ok, account} ->
            charges_enabled = account["charges_enabled"] == true
            payouts_enabled = account["payouts_enabled"] == true
            details_submitted = account["details_submitted"] == true

            {:ok, %{
              connected: true,
              charges_enabled: charges_enabled,
              payouts_enabled: payouts_enabled,
              onboarded: details_submitted,
              account_id: account_id
            }}

          {:error, reason} ->
            Logger.error("Failed to check account status for #{user.username}: #{inspect(reason)}")
            {:error, reason}
        end
    end
  end

  @doc "Refresh the stripe_connect_enabled and stripe_connect_onboarded fields from Stripe."
  def refresh_connect_status(%User{} = user) do
    case check_account_status(user) do
      {:ok, %{connected: true, charges_enabled: charges, onboarded: onboarded}} ->
        user
        |> User.stripe_connect_changeset(%{
          stripe_connect_enabled: charges,
          stripe_connect_onboarded: onboarded
        })
        |> Repo.update()

      {:ok, %{connected: false}} ->
        {:ok, user}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc "Disconnect a Stripe Connect account (deauthorize + clear DB fields)."
  def disconnect_account(%User{} = user) do
    case user.stripe_connect_account_id do
      nil ->
        {:ok, user}

      account_id ->
        # Deauthorize the account via Stripe OAuth
        secret_key = stripe_config()[:secret_key]

        if secret_key do
          params = URI.encode_query(%{
            "client_id" => stripe_config()[:connect_client_id] || "",
            "stripe_user_id" => account_id
          })

          # Best-effort deauthorization — don't fail if it errors
          case stripe_post("/oauth/deauthorize", params) do
            {:ok, _} ->
              Logger.info("Deauthorized Connect account #{account_id} for #{user.username}")

            {:error, reason} ->
              Logger.warning("Failed to deauthorize Connect account #{account_id}: #{inspect(reason)}")
          end
        end

        # Clear DB fields regardless
        user
        |> User.stripe_connect_changeset(%{
          stripe_connect_account_id: nil,
          stripe_connect_enabled: false,
          stripe_connect_onboarded: false
        })
        |> Repo.update()
    end
  end

  # ── Webhook: account.updated ────────────────────────────────────────

  @doc "Handle account.updated webhook event from Stripe Connect."
  def handle_account_updated(%{"id" => account_id} = account) do
    import Ecto.Query

    case User |> where([u], u.stripe_connect_account_id == ^account_id) |> Repo.one() do
      nil ->
        Logger.info("account.updated for unknown Connect account #{account_id}")
        :ok

      user ->
        charges_enabled = account["charges_enabled"] == true
        details_submitted = account["details_submitted"] == true

        user
        |> User.stripe_connect_changeset(%{
          stripe_connect_enabled: charges_enabled,
          stripe_connect_onboarded: details_submitted
        })
        |> Repo.update()

        Logger.info("Updated Connect status for #{user.username}: charges=#{charges_enabled}, onboarded=#{details_submitted}")
        :ok
    end
  end

  def handle_account_updated(_), do: :ok

  # ── Private: Stripe API helpers ─────────────────────────────────────

  defp stripe_post(path, body) do
    secret_key = stripe_config()[:secret_key]

    if is_nil(secret_key) or secret_key == "" do
      Logger.warning("STRIPE_SECRET_KEY not set — cannot make Stripe API call to #{path}")
      {:error, :stripe_not_configured}
    else
      url = ~c"#{@stripe_api}#{path}"

      headers = [
        {~c"authorization", ~c"Bearer #{secret_key}"},
        {~c"content-type", ~c"application/x-www-form-urlencoded"}
      ]

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :post,
             {url, headers, ~c"application/x-www-form-urlencoded", body},
             [ssl: [verify: :verify_none]],
             []
           ) do
        {:ok, {{_, status, _}, _headers, resp_body}} when status in 200..299 ->
          case Jason.decode(to_string(resp_body)) do
            {:ok, data} -> {:ok, data}
            error -> {:error, {:parse_error, error}}
          end

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          Logger.error("Stripe API error #{status} on #{path}: #{to_string(resp_body)}")
          {:error, {:stripe_error, status, to_string(resp_body)}}

        {:error, reason} ->
          Logger.error("Stripe HTTP error on #{path}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end

  defp stripe_get(path) do
    secret_key = stripe_config()[:secret_key]

    if is_nil(secret_key) or secret_key == "" do
      Logger.warning("STRIPE_SECRET_KEY not set — cannot make Stripe API call to #{path}")
      {:error, :stripe_not_configured}
    else
      url = ~c"#{@stripe_api}#{path}"

      headers = [
        {~c"authorization", ~c"Bearer #{secret_key}"}
      ]

      :ssl.start()
      :inets.start()

      case :httpc.request(
             :get,
             {url, headers},
             [ssl: [verify: :verify_none]],
             []
           ) do
        {:ok, {{_, status, _}, _headers, resp_body}} when status in 200..299 ->
          case Jason.decode(to_string(resp_body)) do
            {:ok, data} -> {:ok, data}
            error -> {:error, {:parse_error, error}}
          end

        {:ok, {{_, status, _}, _headers, resp_body}} ->
          Logger.error("Stripe API error #{status} on GET #{path}: #{to_string(resp_body)}")
          {:error, {:stripe_error, status, to_string(resp_body)}}

        {:error, reason} ->
          Logger.error("Stripe HTTP error on GET #{path}: #{inspect(reason)}")
          {:error, :http_error}
      end
    end
  end

  defp stripe_config do
    Application.get_env(:inkwell, :stripe, [])
  end
end
