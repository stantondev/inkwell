defmodule Inkwell.Muse.ClaudeClient do
  @moduledoc """
  Claude API client using :httpc (same pattern as email.ex and slack.ex).
  Calls Claude Haiku for cost-efficient writing prompt generation.
  Falls back gracefully when ANTHROPIC_API_KEY is not set (dev mode).
  """

  require Logger

  @api_url "https://api.anthropic.com/v1/messages"
  @model "claude-haiku-4-5-20251001"
  @max_tokens 1500

  @doc """
  Generate a writing prompt via Claude API.
  Returns {:ok, %{title: string, body_html: string, tags: [string]}} or {:error, reason}.
  """
  def generate_prompt(system_prompt, user_prompt) do
    api_key = Application.get_env(:inkwell, :anthropic_api_key)

    if is_nil(api_key) or api_key == "" do
      Logger.info("[Muse] Claude API not configured (dev mode)")
      {:error, :not_configured}
    else
      call_api(api_key, system_prompt, user_prompt)
    end
  end

  defp call_api(api_key, system_prompt, user_prompt) do
    :ssl.start()
    :inets.start()

    body =
      Jason.encode!(%{
        model: @model,
        max_tokens: @max_tokens,
        system: system_prompt,
        messages: [
          %{role: "user", content: user_prompt}
        ]
      })

    headers = [
      {~c"content-type", ~c"application/json"},
      {~c"x-api-key", ~c"#{api_key}"},
      {~c"anthropic-version", ~c"2023-06-01"}
    ]

    case :httpc.request(
           :post,
           {~c"#{@api_url}", headers, ~c"application/json", body},
           [ssl: [verify: :verify_none], timeout: 30_000, connect_timeout: 10_000],
           []
         ) do
      {:ok, {{_, status, _}, _, resp_body}} when status in 200..299 ->
        parse_response(to_string(resp_body))

      {:ok, {{_, status, _}, _, resp_body}} ->
        Logger.warning("[Muse] Claude API error #{status}: #{to_string(resp_body)}")
        {:error, {:api_error, status}}

      {:error, reason} ->
        Logger.warning("[Muse] Claude API HTTP error: #{inspect(reason)}")
        {:error, :http_error}
    end
  end

  defp parse_response(body) do
    case Jason.decode(body) do
      {:ok, %{"content" => [%{"text" => text} | _]}} ->
        parse_generated_content(text)

      {:ok, %{"error" => %{"message" => msg}}} ->
        Logger.warning("[Muse] Claude API returned error: #{msg}")
        {:error, {:api_error, msg}}

      _ ->
        Logger.warning("[Muse] Unexpected Claude API response format")
        {:error, :unexpected_format}
    end
  end

  @doc """
  Parse the generated text from Claude into structured content.
  Expects JSON with keys: title, body_html, tags.
  Falls back to extracting title from first line if not JSON.
  """
  def parse_generated_content(text) do
    # Try JSON first
    case Jason.decode(text) do
      {:ok, %{"title" => title, "body_html" => body_html}} ->
        tags = Map.get(Jason.decode!(text), "tags", [])
        {:ok, %{title: title, body_html: body_html, tags: tags}}

      _ ->
        # Try to extract JSON from markdown code block
        case Regex.run(~r/```json\s*\n(.*?)\n```/s, text) do
          [_, json_str] ->
            case Jason.decode(json_str) do
              {:ok, %{"title" => title, "body_html" => body_html} = parsed} ->
                {:ok, %{title: title, body_html: body_html, tags: Map.get(parsed, "tags", [])}}

              _ ->
                fallback_parse(text)
            end

          nil ->
            fallback_parse(text)
        end
    end
  end

  defp fallback_parse(text) do
    # Last resort: treat first line as title, rest as body
    lines = String.split(text, "\n", parts: 2)

    case lines do
      [title, body] ->
        title = String.trim(title) |> String.trim_leading("#") |> String.trim()
        body_html = "<p>" <> String.replace(String.trim(body), "\n\n", "</p><p>") <> "</p>"
        {:ok, %{title: title, body_html: body_html, tags: ["writing-prompt"]}}

      [single_line] ->
        {:ok, %{title: "Writing Prompt", body_html: "<p>#{String.trim(single_line)}</p>", tags: ["writing-prompt"]}}
    end
  end
end
