defmodule Inkwell.Gazette.AiScorer do
  @moduledoc """
  On-demand AI classification for Gazette entries via Claude Haiku.
  Called when a Plus user views the Gazette — scores only the current page of entries.
  Results are cached on the remote_entry rows so subsequent views are instant.

  Cost: ~$0.015 per page (30 entries). $0 when nobody's looking.
  """

  require Logger
  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Federation.RemoteEntry

  @api_url "https://api.anthropic.com/v1/messages"
  @model "claude-haiku-4-5-20251001"
  @max_tokens 4000

  @topic_ids Inkwell.Gazette.Topics.topic_ids() |> Enum.join(", ")

  @system_prompt """
  You are a news classification system for a fediverse content aggregator. For each post, determine:

  1. is_news: Is this factual news, reporting, or useful information (true)? Or is it opinion, personal anecdote, meme, joke, or shitpost (false)?
     - True: event reports, policy changes, scientific findings, product releases, security advisories, analysis with data
     - False: hot takes, memes, personal stories, jokes, vague complaints, self-promotion, life updates

  2. relevance: 0.0 to 1.0 — how informative and newsworthy is this?
     - 0.8-1.0: Breaking news, major events, significant findings
     - 0.5-0.7: Interesting developments, useful technical information
     - 0.2-0.4: Marginally newsworthy, mostly context/background
     - 0.0-0.1: Not really news at all

  3. topic: Classify into exactly one: #{@topic_ids}

  4. cluster: A short lowercase slug (max 40 chars) identifying the specific event or story. Posts about the same event should share the same slug (e.g., "eu-ai-act-vote-2026", "signal-post-quantum-update").

  5. summary: One factual sentence, under 120 characters. No opinions or editorializing.

  Respond with ONLY a JSON array. No markdown, no explanation. Each element:
  {"i": 0, "news": true, "rel": 0.85, "topic": "technology", "cluster": "signal-update", "sum": "Signal adds post-quantum encryption to group chats."}
  """

  @doc """
  Scores a list of remote entries via Claude Haiku. Returns the entries with AI fields populated.
  Entries that already have `gazette_scored_at` are returned as-is (cache hit).
  Entries that fail scoring are returned without AI fields (graceful degradation).
  """
  def score_and_cache(entries) when is_list(entries) do
    {scored, unscored} = Enum.split_with(entries, &(not is_nil(&1.gazette_scored_at)))

    if unscored == [] do
      entries
    else
      case score_batch(unscored) do
        {:ok, score_map} ->
          # Persist scores to DB and return updated entries
          now = DateTime.utc_now()

          updated =
            Enum.map(unscored, fn entry ->
              case Map.get(score_map, entry.id) do
                nil ->
                  entry

                scores ->
                  attrs = %{
                    gazette_is_news: scores.is_news,
                    gazette_relevance: scores.relevance,
                    gazette_topic: scores.topic,
                    gazette_summary: scores.summary,
                    gazette_cluster_id: scores.cluster,
                    gazette_scored_at: now
                  }

                  # Update DB (fire-and-forget, don't block response)
                  Task.start(fn ->
                    RemoteEntry
                    |> where([e], e.id == ^entry.id)
                    |> Repo.update_all(set: Map.to_list(attrs))
                  end)

                  struct(entry, attrs)
              end
            end)

          scored ++ updated

        {:error, _reason} ->
          # Fallback: return all entries without AI scores
          entries
      end
    end
  end

  @doc """
  Calls Claude Haiku to classify a batch of entries.
  Returns {:ok, %{entry_id => %{is_news, relevance, topic, cluster, summary}}} or {:error, reason}.
  """
  def score_batch(entries) when is_list(entries) do
    api_key = Application.get_env(:inkwell, :anthropic_api_key)

    if is_nil(api_key) or api_key == "" do
      Logger.debug("[Gazette AI] Claude API not configured")
      {:error, :not_configured}
    else
      # Build user prompt with numbered entries
      user_prompt =
        entries
        |> Enum.with_index()
        |> Enum.map(fn {entry, i} ->
          text = strip_html(entry.body_html || "")
          # Truncate to ~200 words to control token usage
          words = String.split(text, ~r/\s+/, trim: true) |> Enum.take(200) |> Enum.join(" ")
          title_prefix = if entry.title, do: "Title: #{entry.title}\n", else: ""
          "Post #{i}:\n#{title_prefix}#{words}"
        end)
        |> Enum.join("\n\n---\n\n")

      case call_api(api_key, user_prompt) do
        {:ok, results} ->
          # Map results back to entry IDs
          score_map =
            results
            |> Enum.reduce(%{}, fn result, acc ->
              index = result["i"]

              if index >= 0 && index < length(entries) do
                entry = Enum.at(entries, index)

                Map.put(acc, entry.id, %{
                  is_news: result["news"] == true,
                  relevance: parse_float(result["rel"], 0.0),
                  topic: validate_topic(result["topic"]),
                  cluster: sanitize_cluster(result["cluster"]),
                  summary: sanitize_summary(result["sum"])
                })
              else
                acc
              end
            end)

          {:ok, score_map}

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  def configured? do
    key = Application.get_env(:inkwell, :anthropic_api_key)
    is_binary(key) && key != ""
  end

  # ── Private ────────────────────────────────────────────────────────

  defp call_api(api_key, user_prompt) do
    :ssl.start()
    :inets.start()

    body =
      Jason.encode!(%{
        model: @model,
        max_tokens: @max_tokens,
        system: @system_prompt,
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
           [ssl: Inkwell.SSL.httpc_opts(), timeout: 30_000, connect_timeout: 10_000],
           []
         ) do
      {:ok, {{_, status, _}, _, resp_body}} when status in 200..299 ->
        parse_response(:erlang.list_to_binary(resp_body))

      {:ok, {{_, status, _}, _, resp_body}} ->
        Logger.warning("[Gazette AI] Claude API error #{status}: #{:erlang.list_to_binary(resp_body)}")
        {:error, {:api_error, status}}

      {:error, reason} ->
        Logger.warning("[Gazette AI] Claude API HTTP error: #{inspect(reason)}")
        {:error, :http_error}
    end
  end

  defp parse_response(body) do
    case Jason.decode(body) do
      {:ok, %{"content" => [%{"text" => text} | _]}} ->
        # Try to parse JSON array from the response
        text = String.trim(text)

        # Strip markdown code block wrapper if present
        text =
          case Regex.run(~r/```(?:json)?\s*\n?(.*?)\n?```/s, text) do
            [_, json_str] -> json_str
            nil -> text
          end

        case Jason.decode(text) do
          {:ok, results} when is_list(results) ->
            {:ok, results}

          _ ->
            Logger.warning("[Gazette AI] Could not parse response as JSON array: #{String.slice(text, 0, 200)}")
            {:error, :parse_error}
        end

      {:ok, %{"error" => %{"message" => msg}}} ->
        Logger.warning("[Gazette AI] Claude API returned error: #{msg}")
        {:error, {:api_error, msg}}

      _ ->
        Logger.warning("[Gazette AI] Unexpected response format")
        {:error, :unexpected_format}
    end
  end

  defp strip_html(html) do
    html
    |> String.replace(~r/<[^>]+>/, " ")
    |> String.replace(~r/&[a-zA-Z]+;/, " ")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end

  defp parse_float(val, default) when is_float(val), do: max(0.0, min(1.0, val))
  defp parse_float(val, default) when is_integer(val), do: max(0.0, min(1.0, val / 1.0))
  defp parse_float(_, default), do: default

  defp validate_topic(topic) when is_binary(topic) do
    if Inkwell.Gazette.Topics.valid_topic?(topic), do: topic, else: nil
  end

  defp validate_topic(_), do: nil

  defp sanitize_cluster(cluster) when is_binary(cluster) do
    cluster
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9\-]/, "-")
    |> String.slice(0, 40)
  end

  defp sanitize_cluster(_), do: nil

  defp sanitize_summary(summary) when is_binary(summary) do
    String.slice(summary, 0, 200)
  end

  defp sanitize_summary(_), do: nil
end
