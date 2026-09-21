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

  # Sept 2026: supplier product copy on gmail scored 4 and sat on the homepage.
  test "supplier product copy on gmail is blocked" do
    r =
      SpamSignals.score(%{
        email_domain: "gmail.com",
        texts: [
          "Bottle Foil Seal – Secure and Tamper-Evident Packaging Solutions",
          "Widely used across industries such as pharmaceuticals. At Muffadal, we offer high-quality seals. Key Features of Bottle Foil Seals"
        ],
        links: ["https://maps.app.goo.gl/abc"],
        minutes_to_first_post: 2,
        interactions: 0
      })

    assert SpamSignals.decision(r) == :block
  end

  test "a personal essay mentioning work software is not flagged" do
    r =
      SpamSignals.score(%{
        email_domain: "gmail.com",
        texts: ["Today I spent hours fighting our project management software and then went for a walk."],
        links: [],
        minutes_to_first_post: 5,
        interactions: 0
      })

    assert SpamSignals.decision(r) == :none
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

  # @wiesakerboom, Sept 2026: a real music writer blocked for photos hosted on
  # Blogger, cited Dutch news articles, a link-in-bio page and a quiet style.
  test "a long-running writer with photos and cited sources is never blocked" do
    body = """
    <p>Streaming services are filling up with AI songs.</p>
    <a href="https://blogger.googleusercontent.com/img/b/x/w345/photo.jpg"><img src="https://blogger.googleusercontent.com/img/b/x/w345/photo.jpg"></a>
    <a href="https://blogger.googleusercontent.com/img/b/y/w380/guitar.jpg"><img src="https://blogger.googleusercontent.com/img/b/y/w380/guitar.jpg"></a>
    <p>Sources: <a href="https://www.telegraaf.nl/buitenland/ai-band">De Telegraaf</a>,
    <a href="https://www.nu.nl/muziek/ai-muziek">NU.nl</a>,
    <a href="https://www.hartvannederland.nl/muziek/tim-knol">Hart van Nederland</a></p>
    """

    facts = %{
      email_domain: "protonmail.com",
      texts: ["AI Music vs. Human Music - 2026 Edition", "Streaming services are filling up with AI songs."],
      links: SpamSignals.extract_links(body),
      profile_links: ["https://allmylinks.com/wies"],
      minutes_to_first_post: 12,
      interactions: 0,
      account_age_days: 179,
      published_entry_days: 19,
      writing_span_days: 148
    }

    refute Enum.any?(facts.links, &(&1 =~ "googleusercontent"))
    r = SpamSignals.score(facts)
    assert SpamSignals.decision(r) == :none
    assert SpamSignals.established?(facts)

    # Even brand new, the same posts can't get past a limit.
    new = SpamSignals.score(%{facts | account_age_days: 3, published_entry_days: 2, writing_span_days: 1})
    assert SpamSignals.decision(new) in [:none, :limit]
  end

  test "links, speed and quietness alone limit at most, never block" do
    r =
      SpamSignals.score(%{
        email_domain: "gmail.com",
        texts: ["Buy aged accounts"],
        links: ["https://shop.example/a", "https://shop.example/b", "https://shop.example/c", "https://other.example"],
        profile_links: ["https://shop.example"],
        minutes_to_first_post: 3,
        interactions: 0
      })

    assert r.score >= SpamSignals.block_threshold()
    refute r.strong
    assert SpamSignals.decision(r) == :limit
  end

  test "imported posts dated before signup don't count as posting fast" do
    r = SpamSignals.score(%{minutes_to_first_post: -9_656_344, texts: ["old post"], interactions: 5})
    refute Enum.any?(r.reasons, &(&1 =~ "after signing up"))
  end

  test "a burst of posts isn't long-running writing" do
    refute SpamSignals.established?(%{account_age_days: 90, published_entry_days: 8, writing_span_days: 12, interactions: 0})
    assert SpamSignals.established?(%{account_age_days: 90, published_entry_days: 6, writing_span_days: 60, interactions: 0})
  end

  test "link helpers" do
    assert SpamSignals.link_domain("https://www.Example.com/x") == "example.com"
    assert SpamSignals.benign?("en.wikipedia.org")
    refute SpamSignals.benign?("slopegamefree.com")
    assert SpamSignals.extract_links(~s(<a href="https://a.com/x">y</a> and http://b.org)) == ["https://a.com/x", "http://b.org"]
    # Link text that repeats the URL counts once; images don't count.
    assert SpamSignals.extract_links(~s(<a href="https://a.com/x">https://a.com/x</a><img src="https://c.com/p.png">)) == ["https://a.com/x"]
    assert SpamSignals.extract_links(~s(<a href="https://c.com/big.JPG?w=2"><img src="https://c.com/small.jpg"></a>)) == []
    assert SpamSignals.benign?("blogger.googleusercontent.com")
  end
end
