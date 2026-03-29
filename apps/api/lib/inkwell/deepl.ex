defmodule Inkwell.DeepL do
  @moduledoc """
  DeepL API client for text translation.
  Uses :httpc (same pattern as Email, Slack, FlyCerts modules).
  """

  require Logger

  @api_url "https://api-free.deepl.com/v2/translate"

  @supported_languages ~w(
    BG CS DA DE EL EN-GB EN-US ES ET FI FR HU ID IT JA KO
    LT LV NB NL PL PT-BR PT-PT RO RU SK SL SV TR UK ZH ZH-HANS
  )

  def supported_languages, do: @supported_languages

  @doc """
  Translate one or more texts to the target language.
  Accepts a list of strings and returns a list of translation results.

  Options:
    - tag_handling: "html" to preserve HTML markup (default: nil for plain text)

  Returns {:ok, [%{text: "...", detected_source_language: "EN"}]} or {:error, reason}
  """
  def translate(texts, target_lang, opts \\ []) when is_list(texts) do
    api_key = Application.get_env(:inkwell, :deepl_api_key)

    if is_nil(api_key) or api_key == "" do
      Logger.warning("[DeepL] DEEPL_API_KEY not configured")
      {:error, :not_configured}
    else
      do_translate(texts, target_lang, api_key, opts)
    end
  end

  defp do_translate(texts, target_lang, api_key, opts) do
    :ssl.start()
    :inets.start()

    # Build form-encoded body (DeepL uses application/x-www-form-urlencoded)
    text_params = Enum.map(texts, fn t -> {"text", t} end)

    params =
      text_params ++
        [{"target_lang", String.upcase(target_lang)}] ++
        if(opts[:tag_handling], do: [{"tag_handling", opts[:tag_handling]}], else: [])

    body = URI.encode_query(params)

    headers = [
      {~c"authorization", ~c"DeepL-Auth-Key #{api_key}"},
      {~c"content-type", ~c"application/x-www-form-urlencoded"}
    ]

    case :httpc.request(
           :post,
           {~c"#{@api_url}", headers, ~c"application/x-www-form-urlencoded", String.to_charlist(body)},
           [ssl: Inkwell.SSL.httpc_opts() ++ [{:server_name_indication, ~c"api-free.deepl.com"}], timeout: 30_000, connect_timeout: 10_000],
           []
         ) do
      {:ok, {{_, status, _}, _headers, resp_body}} when status in 200..299 ->
        resp_body
        |> :erlang.list_to_binary()
        |> Jason.decode()
        |> case do
          {:ok, %{"translations" => translations}} ->
            results =
              Enum.map(translations, fn t ->
                %{
                  text: t["text"],
                  detected_source_language: t["detectedSourceLanguage"]
                }
              end)

            {:ok, results}

          {:ok, other} ->
            Logger.error("[DeepL] Unexpected response: #{inspect(other)}")
            {:error, :unexpected_response}

          {:error, reason} ->
            Logger.error("[DeepL] JSON parse error: #{inspect(reason)}")
            {:error, :parse_error}
        end

      {:ok, {{_, 429, _}, _headers, _resp_body}} ->
        Logger.warning("[DeepL] Rate limited (429)")
        {:error, :rate_limited}

      {:ok, {{_, 403, _}, _headers, _resp_body}} ->
        Logger.error("[DeepL] Authentication failed (403) — check DEEPL_API_KEY")
        {:error, :auth_failed}

      {:ok, {{_, 456, _}, _headers, _resp_body}} ->
        Logger.warning("[DeepL] Quota exceeded (456) — free tier limit reached")
        {:error, :quota_exceeded}

      {:ok, {{_, status, _}, _headers, resp_body}} ->
        Logger.error("[DeepL] API error #{status}: #{:erlang.list_to_binary(resp_body)}")
        {:error, {:api_error, status}}

      {:error, reason} ->
        Logger.error("[DeepL] HTTP error: #{inspect(reason)}")
        {:error, :request_failed}
    end
  end
end
