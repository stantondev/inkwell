defmodule Inkwell.Gazette.Topics do
  @moduledoc """
  News-oriented topic taxonomy for the Gazette.
  Maps topic IDs to sets of fediverse hashtags for content matching.
  Separate from CategoryHashtags (which serves journal entry categories).
  """

  @topics %{
    "world" => %{
      label: "World",
      hashtags: ~w(worldnews geopolitics diplomacy unitednations war conflict refugees migration foreignpolicy sanctions)
    },
    "politics" => %{
      label: "Politics",
      hashtags: ~w(politics democracy election voting policy congress parliament legislation government regulation)
    },
    "technology" => %{
      label: "Technology",
      hashtags: ~w(technology tech ai machinelearning opensource llm deeplearning robotics semiconductor chips)
    },
    "science" => %{
      label: "Science",
      hashtags: ~w(science research biology chemistry physics neuroscience genetics crispr vaccine laboratory peer)
    },
    "climate" => %{
      label: "Climate & Environment",
      hashtags: ~w(climate climatechange environment sustainability globalwarming emissions carbon renewableenergy drought wildfire pollution)
    },
    "health" => %{
      label: "Health",
      hashtags: ~w(health publichealth pandemic vaccine mentalhealth healthcare hospital disease outbreak epidemic pharmaceutical)
    },
    "economy" => %{
      label: "Economy",
      hashtags: ~w(economy economics inflation jobs unemployment markets finance recession gdp interest rates)
    },
    "business" => %{
      label: "Business",
      hashtags: ~w(business startup entrepreneur venture funding ipo acquisition merger layoffs corporate antitrust)
    },
    "media" => %{
      label: "Media & Press",
      hashtags: ~w(media journalism press censorship misinformation disinformation freespeech propaganda pressfreedom)
    },
    "culture" => %{
      label: "Arts & Culture",
      hashtags: ~w(culture art music film books literature museum gallery exhibition theater performance)
    },
    "education" => %{
      label: "Education",
      hashtags: ~w(education university academia research school learning tuition student scholarship highered)
    },
    "labor" => %{
      label: "Labor & Workers",
      hashtags: ~w(labor workers strike union organizing wages minimumwage gig freelance workplace)
    },
    "housing" => %{
      label: "Housing",
      hashtags: ~w(housing rent homelessness urbanplanning zoning mortgage eviction affordablehousing gentrification)
    },
    "legal" => %{
      label: "Law & Justice",
      hashtags: ~w(law legal court supremecourt justice humanrights civil rights ruling verdict trial prosecution)
    },
    "security" => %{
      label: "Cybersecurity",
      hashtags: ~w(infosec cybersecurity hacking breach vulnerability exploit malware ransomware zerodaysecurity)
    },
    "space" => %{
      label: "Space",
      hashtags: ~w(space nasa spacex astronomy astrophysics cosmos mars moon satellite launch orbit telescope)
    },
    "fediverse" => %{
      label: "Fediverse",
      hashtags: ~w(fediverse mastodon activitypub decentralization federation foss pixelfed lemmy misskey pleroma akkoma)
    },
    "internet" => %{
      label: "Internet & Big Tech",
      hashtags: ~w(internet web socialmedia bigtech regulation antitrust google meta apple microsoft amazon tiktok)
    },
    "privacy" => %{
      label: "Privacy & Surveillance",
      hashtags: ~w(privacy surveillance gdpr dataprotection encryption tracking biometrics facial recognition)
    },
    "energy" => %{
      label: "Energy",
      hashtags: ~w(energy solar wind nuclear fossil oil gas pipeline electricity grid battery ev)
    },
    "disasters" => %{
      label: "Disasters & Emergencies",
      hashtags: ~w(earthquake flood hurricane wildfire disaster emergency tsunami volcano eruption)
    },
    "transport" => %{
      label: "Transport",
      hashtags: ~w(transport transit rail train aviation flight ev electricvehicle autonomous bus subway)
    },
    "food" => %{
      label: "Food & Agriculture",
      hashtags: ~w(food agriculture farming drought famine supply livestock crop harvest organic gmo)
    },
    "sports" => %{
      label: "Sports",
      hashtags: ~w(sports football soccer basketball baseball olympics athletics tennis formula1 rugby cricket)
    }
  }

  @topic_ids Map.keys(@topics) |> Enum.sort()

  @doc "Returns all topics as a list of %{id, label, hashtags} maps, sorted by label."
  def list_topics do
    @topics
    |> Enum.map(fn {id, %{label: label, hashtags: hashtags}} ->
      %{id: id, label: label, hashtag_count: length(hashtags)}
    end)
    |> Enum.sort_by(& &1.label)
  end

  @doc "Returns all valid topic IDs."
  def topic_ids, do: @topic_ids

  @doc "Returns true if the given string is a valid topic ID."
  def valid_topic?(id) when is_binary(id), do: id in @topic_ids
  def valid_topic?(_), do: false

  @doc """
  Given a list of topic IDs, returns a merged, deduplicated list of hashtags.
  Invalid topic IDs are silently ignored.
  """
  def hashtags_for_topics(topic_ids) when is_list(topic_ids) do
    topic_ids
    |> Enum.flat_map(fn id ->
      case Map.get(@topics, id) do
        %{hashtags: tags} -> tags
        nil -> []
      end
    end)
    |> Enum.uniq()
  end

  def hashtags_for_topics(_), do: []

  @doc "Returns the hashtag list for a single topic, or [] if unknown."
  def hashtags_for_topic(id) when is_binary(id) do
    case Map.get(@topics, id) do
      %{hashtags: tags} -> tags
      nil -> []
    end
  end

  def hashtags_for_topic(_), do: []

  @doc "Extracts gazette_topics from a user's settings JSONB, defaulting to []."
  def get_user_topics(%{settings: %{"gazette_topics" => topics}}) when is_list(topics) do
    Enum.filter(topics, &valid_topic?/1)
  end

  def get_user_topics(_), do: []
end
