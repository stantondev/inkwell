defmodule InkwellWeb.ApiKeyController do
  use InkwellWeb, :controller

  alias Inkwell.ApiKeys

  # GET /api/api-keys
  def index(conn, _params) do
    # API keys cannot manage API keys — require browser session
    if conn.assigns[:auth_method] == :api_key do
      conn
      |> put_status(:forbidden)
      |> json(%{error: "API key management requires browser session authentication"})
    else
      keys = ApiKeys.list_api_keys(conn.assigns.current_user.id)
      json(conn, %{data: keys})
    end
  end

  # POST /api/api-keys
  def create(conn, params) do
    # API keys cannot manage API keys — require browser session
    if conn.assigns[:auth_method] == :api_key do
      conn
      |> put_status(:forbidden)
      |> json(%{error: "API key management requires browser session authentication"})
    else
      user = conn.assigns.current_user
      scopes = params["scopes"] || ["read"]

      # Free users cannot create write-scoped keys
      if "write" in scopes and user.subscription_tier != "plus" do
        conn
        |> put_status(:forbidden)
        |> json(%{error: "Write API access requires a Plus subscription. Upgrade at /settings/billing"})
      else
        case ApiKeys.create_api_key(user.id, params) do
          {:ok, api_key} ->
            conn
            |> put_status(:created)
            |> json(%{
              data: %{
                id: api_key.id,
                name: api_key.name,
                prefix: api_key.prefix,
                raw_key: api_key.raw_key,
                scopes: api_key.scopes,
                expires_at: api_key.expires_at,
                created_at: api_key.inserted_at
              },
              warning: "This is the only time this key will be shown. Store it securely."
            })

          {:error, :key_limit_reached} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: "Maximum of 10 API keys reached. Revoke an existing key first."})

          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{errors: format_errors(changeset)})
        end
      end
    end
  end

  # DELETE /api/api-keys/:id
  def revoke(conn, %{"id" => id}) do
    # API keys cannot manage API keys — require browser session
    if conn.assigns[:auth_method] == :api_key do
      conn
      |> put_status(:forbidden)
      |> json(%{error: "API key management requires browser session authentication"})
    else
      case ApiKeys.revoke_api_key(conn.assigns.current_user.id, id) do
        {:ok, _key} ->
          conn
          |> put_status(:ok)
          |> json(%{ok: true})

        {:error, :not_found} ->
          conn
          |> put_status(:not_found)
          |> json(%{error: "API key not found"})
      end
    end
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
