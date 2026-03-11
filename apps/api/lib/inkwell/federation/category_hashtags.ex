defmodule Inkwell.Federation.CategoryHashtags do
  @moduledoc """
  Maps Inkwell categories to sets of related fediverse hashtags.
  Used to filter remote entries on Explore when a category filter is active.
  All hashtags are stored lowercase for case-insensitive matching.
  """

  @category_hashtags %{
    "personal" => ~w(personal journal diary life dailylife thoughts reflection selfcare mentalhealth wellness mindfulness gratitude),
    "creative_writing" => ~w(creativewriting writing writer amwriting writingcommunity writersofmastodon writersofthefediverse prose shortstory flash nonfiction essay memoir storytelling),
    "poetry" => ~w(poetry poem poet poems poetsofmastodon writingpoetry haiku verse spokenword poetrycommunity micropoetry),
    "fiction" => ~w(fiction shortstory shortstories flashfiction scifi sciencefiction fantasy horror thriller mystery romance historicalfiction fanfiction worldbuilding),
    "travel" => ~w(travel traveling travelling wanderlust adventure explore backpacking roadtrip digitalnomad travelphotography travelwriting),
    "tech" => ~w(tech technology programming coding software dev webdev linux opensource foss fedi fediverse mastodon rust python javascript typescript golang ai machinelearning infosec cybersecurity),
    "music" => ~w(music musician nowplaying listento album vinyl jazz rock indie hiphop electronic classical guitar piano songwriting bandcamp),
    "film_tv" => ~w(film movie movies cinema tv television series streaming documentary horror scifi anime animation filmmaking review),
    "food" => ~w(food cooking recipe baking vegan vegetarian foodie kitchen homecooking fermentation bread sourdough),
    "health" => ~w(health fitness wellness mentalhealth selfcare exercise yoga meditation running cycling nutrition diet disability accessibility chronicillness),
    "career" => ~w(career work job hiring remote remotework freelance startup business entrepreneur leadership management productivity),
    "education" => ~w(education learning teaching school university college science research academia study scholarship student),
    "relationships" => ~w(relationships love dating marriage family friendship community connection),
    "parenting" => ~w(parenting kids children family baby toddler motherhood fatherhood dadlife momlife homeschool),
    "finance" => ~w(finance money personalfinance investing savings budget economy frugal),
    "news_politics" => ~w(news politics policy democracy election climate climatechange environment labor union humanrights justice),
    "philosophy" => ~w(philosophy ethics existentialism stoicism thinking criticalthinking logic reason metaphysics epistemology),
    "spirituality" => ~w(spirituality faith religion meditation mindfulness buddhism christianity islam hinduism paganism tarot astrology),
    "humor" => ~w(humor funny comedy meme jokes lol satire parody),
    "books" => ~w(books reading bookclub bookreview bookworm bookstodon amreading currentlyreading tbr literature literary library),
    "other" => ~w()
  }

  @doc "Returns the list of lowercase hashtags for a given category, or [] if unknown."
  def hashtags_for_category(category) when is_binary(category) do
    Map.get(@category_hashtags, category, [])
  end

  def hashtags_for_category(_), do: []
end
