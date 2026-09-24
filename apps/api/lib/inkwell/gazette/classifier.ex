defmodule Inkwell.Gazette.Classifier do
  @moduledoc """
  Puts a news story into Gazette sections with plain rules, no AI.

  Two signals:

    * The section in the article's own address. Most publishers file stories
      under a path like `/technology/`, `/world/` or `/commentisfree/`, which
      is the publisher's own judgement and the strongest signal we have.
    * Keywords in the headline and description, counted per section.

  A story gets at most two sections. Stories that match nothing land in the
  front page only. `opinion?/1` flags comment and opinion pieces so the page
  can label them honestly instead of presenting them as reporting.
  """

  alias Inkwell.Gazette.Topics

  # Path segment → section. Checked against every segment of the URL path.
  @url_sections %{
    "world" => "world",
    "worldnews" => "world",
    "international" => "world",
    "global-development" => "world",
    "europe" => "world",
    "asia" => "world",
    "africa" => "world",
    "middleeast" => "world",
    "middle-east" => "world",
    "americas" => "world",
    "australia-news" => "world",
    "uk-news" => "world",
    "politics" => "politics",
    "us-politics" => "politics",
    "elections" => "politics",
    "technology" => "technology",
    "tech" => "technology",
    "gadgets" => "technology",
    "ai" => "technology",
    "artificial-intelligence" => "technology",
    "science" => "science",
    "health" => "health",
    "well" => "health",
    "environment" => "climate",
    "climate" => "climate",
    "climate-crisis" => "climate",
    "climate-change" => "climate",
    "business" => "business",
    "companies" => "business",
    "money" => "economy",
    "economy" => "economy",
    "economics" => "economy",
    "markets" => "economy",
    "media" => "media",
    "culture" => "culture",
    "arts" => "culture",
    "artanddesign" => "culture",
    "books" => "culture",
    "music" => "culture",
    "film" => "culture",
    "movies" => "culture",
    "tv-and-radio" => "culture",
    "stage" => "culture",
    "games" => "culture",
    "education" => "education",
    "law" => "legal",
    "security" => "security",
    "cybersecurity" => "security",
    "privacy" => "privacy",
    "space" => "space",
    "sport" => "sports",
    "sports" => "sports",
    "football" => "sports",
    "soccer" => "sports",
    "food" => "food",
    "housing" => "housing",
    "energy" => "energy",
    "transport" => "transport"
  }

  @opinion_segments ~w(commentisfree opinion opinions comment editorial editorials columnists column op-ed oped perspective analysis)

  # Headline/description keywords. Matched as whole words (a trailing `*`
  # matches any ending: "vaccin*" → vaccine, vaccines, vaccination).
  @keywords %{
    "world" => ~w(ukraine russia gaza israel palestin* iran china taiwan syria sudan un nato refugee* migrant* war ceasefire diplomat* embassy sanctions foreign kremlin beijing europe african india pakistan),
    "politics" => ~w(trump biden harris congress senate senator parliament election* vote* voter* campaign republican* democrat* labour tory tories conservative* minister president governor legislat* white_house supreme_court maga),
    "technology" => ~w(ai openai chatgpt llm* microsoft apple google android iphone software chip* semiconductor* nvidia robot* algorithm* startup* app apps silicon tech),
    "science" => ~w(scientist* study research* physics chemist* biolog* fossil* species genome dna astronom* quantum experiment* discover*),
    "climate" => ~w(climate emission* carbon warming heatwave* wildfire* drought* flood* glacier* biodiversity pollution fossil_fuel* renewabl* environment*),
    "health" => ~w(health hospital* doctor* nurse* patient* disease* virus* vaccin* covid cancer medic* nhs mental_health drug* outbreak* pandemic),
    "economy" => ~w(economy inflation recession tariff* interest_rate* gdp unemployment jobs wage* stock* market* bank* budget tax* debt),
    "business" => ~w(company companies ceo layoff* merger acquisition shareholders profit* revenue corporate billionaire* amazon tesla walmart),
    "media" => ~w(journalis* newspaper* press broadcaster* bbc cnn fox_news reporter* editor* misinformation disinformation censorship),
    "culture" => ~w(film* movie* novel* author* book* album* music* musician* artist* museum* theatre theater festival* tv series television poet* poetry),
    "education" => ~w(school* teacher* student* universit* college* education curriculum),
    "labor" => ~w(union* strike* worker* workers labor labour minimum_wage),
    "housing" => ~w(housing rent* renter* landlord* homeless* eviction* mortgage*),
    "legal" => ~w(court* judge* lawsuit* ruling trial prosecutor* indict* sentenced verdict attorney* lawyer* police arrest*),
    "security" => ~w(hack* hacker* breach ransomware malware vulnerabilit* cyberattack* phishing exploit* infosec),
    "space" => ~w(nasa spacex rocket* orbit* moon mars asteroid* satellite* telescope* astronaut*),
    "fediverse" => ~w(fediverse mastodon activitypub bluesky threads decentrali*),
    "internet" => ~w(internet website* social_media meta facebook instagram tiktok twitter x.com youtube reddit online),
    "privacy" => ~w(privacy surveillance tracking spyware encryption facial_recognition data_protection),
    "energy" => ~w(energy solar wind_power nuclear oil gas electricity grid battery batteries coal),
    "disasters" => ~w(earthquake* hurricane* typhoon* tsunami* volcano* evacuat* disaster*),
    "transport" => ~w(rail train* airline* aviation flight* transit bus_service electric_vehicle* ev_sales),
    "food" => ~w(food farm* farmer* agricultur* crop* famine hunger),
    "sports" => ~w(football soccer nba nfl tennis olympic* cricket rugby championship world_cup athlete* match)
  }

  @max_sections 2

  @doc "Sections for a story, strongest first (at most #{@max_sections})."
  def topics(%{} = story) do
    url_topics = url_topics(story[:url])
    text = normalize("#{story[:title]} #{story[:description]}")

    keyword_scores =
      for {topic, words} <- compiled_keywords(),
          count = Enum.count(words, &Regex.match?(&1, text)),
          count > 0,
          into: %{},
          do: {topic, count}

    # A section named in the URL counts as three keyword hits.
    scores =
      Enum.reduce(url_topics, keyword_scores, fn t, acc -> Map.update(acc, t, 3, &(&1 + 3)) end)

    scores
    |> Enum.filter(fn {topic, _} -> Topics.valid_topic?(topic) end)
    |> Enum.sort_by(fn {topic, score} -> {-score, topic} end)
    |> Enum.take(@max_sections)
    |> Enum.map(&elem(&1, 0))
  end

  @doc "True when the publisher filed the piece as opinion or comment."
  def opinion?(url) when is_binary(url) do
    url |> path_segments() |> Enum.any?(&(&1 in @opinion_segments))
  end

  def opinion?(_), do: false

  defp url_topics(url) when is_binary(url) do
    url
    |> path_segments()
    |> Enum.flat_map(fn seg -> List.wrap(Map.get(@url_sections, seg)) end)
    |> Enum.uniq()
  end

  defp url_topics(_), do: []

  defp path_segments(url) do
    case URI.parse(url) do
      %URI{path: path} when is_binary(path) ->
        path |> String.downcase() |> String.split("/", trim: true)

      _ ->
        []
    end
  end

  defp normalize(text) do
    text
    |> String.downcase()
    |> String.replace(~r/[‘’“”]/u, "'")
  end

  # Compiled once and kept in :persistent_term.
  defp compiled_keywords do
    case :persistent_term.get({__MODULE__, :keywords}, nil) do
      nil ->
        compiled =
          Map.new(@keywords, fn {topic, words} ->
            {topic, Enum.map(words, &word_regex/1)}
          end)

        :persistent_term.put({__MODULE__, :keywords}, compiled)
        compiled

      compiled ->
        compiled
    end
  end

  defp word_regex(word) do
    {stem, open_end} =
      if String.ends_with?(word, "*"), do: {String.trim_trailing(word, "*"), true}, else: {word, false}

    # Multi-word phrases are written with underscores ("white_house").
    stem = String.replace(stem, "_", " ")
    body = Regex.escape(stem)
    tail = if open_end, do: "\\w*", else: ""
    Regex.compile!("(?<![\\w])" <> body <> tail <> "(?![\\w])", "u")
  end
end
