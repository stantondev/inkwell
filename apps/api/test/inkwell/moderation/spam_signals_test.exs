defmodule Inkwell.Moderation.SpamSignalsTest do
  use ExUnit.Case, async: true

  alias Inkwell.Moderation.SpamSignals

  # Modeled on real Inkwell spam (Sept 2026 production scan).
  test "throwaway email + game-site link posted a minute after signup is blocked" do
    r =
      SpamSignals.score(%{
        email_domain: "hidingmail.net",
        texts: ["Master the Descent: Your Guide", "Play slope game now at our site"],
        links: ["https://slopegamefree.com/"],
        minutes_to_first_post: 1,
        interactions: 0
      })

    assert r.score >= SpamSignals.block_threshold()
    assert SpamSignals.decision(r) == :block
    assert Enum.any?(r.reasons, &(&1 =~ "throwaway email domain hidingmail.net"))
  end

  test "SEO agency post on gmail is blocked" do
    r =
      SpamSignals.score(%{
        email_domain: "gmail.com",
        texts: ["Why Every Local Business Needs a Strong Online Presence",
                "Our local seo and digital marketing agency builds backlinks"],
        links: ["https://localseoservices.co/a", "https://localseoservices.co/b", "https://localseoservices.co/c"],
        profile_links: [],
        minutes_to_first_post: 7,
        interactions: 0
      })

    assert SpamSignals.decision(r) == :block
  end

  test "a real new writer who posts quickly is left alone" do
    r =
      SpamSignals.score(%{
        email_domain: "gmail.com",
        texts: ["First entry", "Moved house this week, the dog hates the stairs. Reading https://en.wikipedia.org/wiki/Stairs"],
        links: ["https://en.wikipedia.org/wiki/Stairs", "https://www.youtube.com/watch?v=x"],
        minutes_to_first_post: 4,
        interactions: 0
      })

    assert SpamSignals.decision(r) == :none
    assert r.score <= 2
  end

  test "a blogger linking their own site only gets limited, never blocked" do
    r =
      SpamSignals.score(%{
        email_domain: "gmail.com",
        texts: ["Travel notes from Lisbon"],
        links: List.duplicate("https://wanderlust.example.github.io/post", 15),
        profile_links: ["https://wanderlust.example.github.io"],
        minutes_to_first_post: 90,
        interactions: 0
      })

    assert SpamSignals.decision(r) in [:none, :limit]
  end

  test "established accounts need real interaction, not just several posting days" do
    base = %{account_age_days: 120, published_entry_days: 5}
    assert SpamSignals.established?(Map.put(base, :interactions, 10))
    refute SpamSignals.established?(Map.put(base, :interactions, 0))
    refute SpamSignals.established?(base |> Map.put(:interactions, 10) |> Map.put(:spam_warnings, 1))
  end

  test "reports from established members weigh more" do
    trusted = SpamSignals.score(%{reports: [%{trusted: true}, %{trusted: true}]})
    newer = SpamSignals.score(%{reports: [%{trusted: false}, %{trusted: false}]})
    assert trusted.score == 8
    assert newer.score == 4
  end

  test "link helpers" do
    assert SpamSignals.link_domain("https://www.Example.com/x") == "example.com"
    assert SpamSignals.benign?("en.wikipedia.org")
    refute SpamSignals.benign?("slopegamefree.com")
    assert SpamSignals.extract_links(~s(<a href="https://a.com/x">y</a> and http://b.org)) == ["https://a.com/x", "http://b.org"]
  end
end
