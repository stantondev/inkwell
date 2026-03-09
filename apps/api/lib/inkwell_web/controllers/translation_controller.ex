defmodule InkwellWeb.TranslationController do
  use InkwellWeb, :controller

  alias Inkwell.Translations
  alias Inkwell.DeepL

  @doc """
  POST /api/translate
  Translates content by type and ID to a target language.
  Uses DeepL API with PostgreSQL caching — each piece of content is only translated once per language.
  """
  def translate(conn, %{"type" => type, "id" => id, "target_lang" => target_lang}) do
    # Validate type
    unless type in Translations.allowed_types() do
      conn
      |> put_status(:unprocessable_entity)
      |> json(%{error: "Invalid content type"})
      |> halt()
    end

    # Validate target language
    normalized_lang = String.upcase(target_lang)

    unless normalized_lang in DeepL.supported_languages() do
      conn
      |> put_status(:unprocessable_entity)
      |> json(%{error: "Unsupported target language"})
      |> halt()
    end

    if conn.halted do
      conn
    else
      case Translations.translate(type, id, target_lang) do
        {:ok, result} ->
          json(conn, %{data: result})

        {:error, :not_found} ->
          conn |> put_status(:not_found) |> json(%{error: "Content not found"})

        {:error, :not_configured} ->
          conn |> put_status(:service_unavailable) |> json(%{error: "Translation service not configured"})

        {:error, :rate_limited} ->
          conn |> put_status(:too_many_requests) |> json(%{error: "Translation service is busy, please try again"})

        {:error, :quota_exceeded} ->
          conn |> put_status(:service_unavailable) |> json(%{error: "Translation quota exceeded"})

        {:error, _reason} ->
          conn |> put_status(:service_unavailable) |> json(%{error: "Translation failed, please try again"})
      end
    end
  end

  def translate(conn, _params) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "type, id, and target_lang are required"})
  end
end
