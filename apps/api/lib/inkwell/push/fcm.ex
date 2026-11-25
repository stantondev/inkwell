defmodule Inkwell.Push.Fcm do
  @moduledoc """
  Sends notifications to the Inkwell app through Firebase Cloud Messaging
  (HTTP v1 API).

  Configured with the Firebase service account (`FCM_SERVICE_ACCOUNT`, the
  JSON file from Firebase → Project settings → Service accounts). Its private
  key signs a short JWT, exchanged at Google for an access token that's
  reused until a few minutes before it expires.
  """

  require Logger

  @token_url "https://oauth2.googleapis.com/token"
  @scope "https://www.googleapis.com/auth/firebase.messaging"
  @cache_key {__MODULE__, :access_token}

  def configured?, do: config() != nil

  defp config do
    case Application.get_env(:inkwell, :fcm) do
      %{project_id: p, client_email: e, private_key: k} = c when is_binary(p) and is_binary(e) and is_binary(k) -> c
      _ -> nil
    end
  end

  @doc """
  Send one message. Returns :ok, {:error, :unregistered} (the app was
  uninstalled or the token replaced: forget the device), {:error, :retry}
  or {:error, reason}.
  """
  def send_message(token, %{} = message) do
    with %{} = cfg <- config() || {:error, :not_configured},
         {:ok, access} <- access_token(cfg) do
      url = "https://fcm.googleapis.com/v1/projects/#{cfg.project_id}/messages:send"
      body = %{message: Map.put(message, :token, token)}

      case request(:post, url, json: body, auth: {:bearer, access}) do
        {:ok, %{status: 200}} ->
          :ok

        {:ok, %{status: status, body: resp}} when status in [400, 404] ->
          if unregistered?(resp), do: {:error, :unregistered}, else: {:error, {:fcm, status, error_code(resp)}}

        {:ok, %{status: 401}} ->
          :persistent_term.erase(@cache_key)
          {:error, :retry}

        {:ok, %{status: status}} when status == 429 or status >= 500 ->
          {:error, :retry}

        {:ok, %{status: status, body: resp}} ->
          {:error, {:fcm, status, error_code(resp)}}

        {:error, reason} ->
          Logger.warning("[FCM] request failed: #{inspect(reason)}")
          {:error, :retry}
      end
    end
  end

  # FCM answers 404 UNREGISTERED when the app was uninstalled or its token
  # replaced; that device is gone for good.
  defp unregistered?(%{"error" => %{"details" => details}}) when is_list(details) do
    Enum.any?(details, &(&1["errorCode"] == "UNREGISTERED"))
  end

  defp unregistered?(%{"error" => %{"status" => "NOT_FOUND"}}), do: true
  defp unregistered?(_), do: false

  defp error_code(%{"error" => %{"status" => s}}), do: s
  defp error_code(_), do: nil

  # --- Access token ---------------------------------------------------------

  defp access_token(cfg) do
    now = System.system_time(:second)

    case :persistent_term.get(@cache_key, nil) do
      {token, expires_at} when expires_at > now + 300 ->
        {:ok, token}

      _ ->
        with {:ok, assertion} <- signed_jwt(cfg, now),
             {:ok, %{status: 200, body: %{"access_token" => token} = body}} <-
               request(:post, @token_url,
                 form: [grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: assertion]
               ) do
          :persistent_term.put(@cache_key, {token, now + (body["expires_in"] || 3600)})
          {:ok, token}
        else
          {:ok, %{status: status, body: body}} ->
            Logger.error("[FCM] access token refused (#{status}): #{inspect(body)}")
            {:error, :retry}

          {:error, reason} ->
            Logger.warning("[FCM] access token failed: #{inspect(reason)}")
            {:error, :retry}
        end
    end
  end

  @doc false
  def signed_jwt(cfg, now) do
    header = %{alg: "RS256", typ: "JWT"}

    claims = %{
      iss: cfg.client_email,
      scope: @scope,
      aud: @token_url,
      iat: now,
      exp: now + 3600
    }

    input = b64(Jason.encode!(header)) <> "." <> b64(Jason.encode!(claims))

    case :public_key.pem_decode(cfg.private_key) do
      [entry | _] ->
        key = :public_key.pem_entry_decode(entry)
        {:ok, input <> "." <> b64(:public_key.sign(input, :sha256, key))}

      _ ->
        {:error, :bad_private_key}
    end
  rescue
    e -> {:error, {:bad_private_key, Exception.message(e)}}
  end

  defp b64(data), do: Base.url_encode64(data, padding: false)

  defp request(method, url, opts) do
    req_opts = Application.get_env(:inkwell, :fcm_req_options, [])
    Req.request([method: method, url: url, receive_timeout: 10_000, retry: false] ++ req_opts ++ opts)
  end
end
