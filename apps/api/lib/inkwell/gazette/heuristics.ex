defmodule Inkwell.Gazette.Heuristics do
  @moduledoc """
  Rule-based news quality scoring for the Gazette.
  Filters noise and ranks entries by likely newsworthiness without any AI calls ($0 cost).
  Used for all users; Plus users additionally get AI scoring layered on top.
  """

  @known_journalism_domains ~w(
    journa.host
    newsie.social
    press.coop
    newsmast.social
  )

  @doc """
  Computes a quality score (0.0–1.0) for a remote entry.
  Higher = more likely to be newsworthy content.
  """
  def quality_score(entry) do
    body_text = strip_html(entry.body_html || "")
    word_count = body_text |> String.split(~r/\s+/, trim: true) |> length()

    scores = [
      type_score(entry),
      length_score(word_count),
      engagement_score(entry),
      source_score(entry),
      content_signal_score(body_text)
    ]

    weights = [0.15, 0.20, 0.30, 0.15, 0.20]

    scores
    |> Enum.zip(weights)
    |> Enum.reduce(0.0, fn {score, weight}, acc -> acc + score * weight end)
    |> Float.round(3)
  end

  @doc """
  Returns true if the entry passes minimum quality thresholds for the Gazette.
  Filters out obvious non-news: too short, emoji-heavy, personal anecdotes.
  """
  def passes_gazette_filter?(entry) do
    body_text = strip_html(entry.body_html || "")
    word_count = body_text |> String.split(~r/\s+/, trim: true) |> length()

    word_count >= 30 &&
      not emoji_heavy?(body_text) &&
      not is_nil(entry.published_at)
  end

  # Articles and Pages are more likely to be news than Notes
  defp type_score(%{title: title}) when is_binary(title) and title != "", do: 0.9
  defp type_score(_), do: 0.4

  # Longer content tends to be more substantive
  defp length_score(words) when words >= 200, do: 1.0
  defp length_score(words) when words >= 100, do: 0.8
  defp length_score(words) when words >= 50, do: 0.5
  defp length_score(_), do: 0.2

  # High engagement = community validated as worth reading
  defp engagement_score(entry) do
    total = (entry.boosts_count || 0) + (entry.likes_count || 0)

    cond do
      total >= 50 -> 1.0
      total >= 20 -> 0.8
      total >= 5 -> 0.6
      total >= 1 -> 0.4
      true -> 0.2
    end
  end

  # Posts from known journalism instances get a boost
  defp source_score(%{remote_actor: %{ap_id: ap_id}}) when is_binary(ap_id) do
    domain = extract_domain(ap_id)

    if domain in @known_journalism_domains do
      1.0
    else
      0.5
    end
  end

  defp source_score(_), do: 0.5

  # Content-based signals: links to external sources, quotes, etc.
  defp content_signal_score(body_text) do
    signals = [
      # Contains URLs (linking to sources is a news signal)
      if(Regex.match?(~r/https?:\/\//, body_text), do: 0.2, else: 0.0),
      # Contains quoted text (reporting pattern)
      if(Regex.match?(~r/"[^"]{20,}"/, body_text), do: 0.2, else: 0.0),
      # Contains numbers/data (factual content signal)
      if(Regex.match?(~r/\d+%|\$\d|€\d|\d+\.\d/, body_text), do: 0.2, else: 0.0),
      # Doesn't start with "I " (personal anecdote signal)
      if(not String.starts_with?(String.trim(body_text), "I "), do: 0.2, else: 0.0),
      # Has title (structured content)
      0.2
    ]

    Enum.sum(signals) |> min(1.0)
  end

  defp emoji_heavy?(text) do
    # Count emoji-like characters (Unicode emoji range)
    emoji_count = Regex.scan(~r/[\x{1F600}-\x{1F64F}\x{1F300}-\x{1F5FF}\x{1F680}-\x{1F6FF}\x{1F1E0}-\x{1F1FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]/u, text) |> length()
    word_count = text |> String.split(~r/\s+/, trim: true) |> length()

    word_count > 0 && emoji_count / word_count > 0.15
  end

  defp strip_html(html) do
    html
    |> String.replace(~r/<[^>]+>/, " ")
    |> String.replace(~r/&[a-zA-Z]+;/, " ")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end

  defp extract_domain(url) do
    case URI.parse(url) do
      %URI{host: host} when is_binary(host) -> String.downcase(host)
      _ -> ""
    end
  end
end
