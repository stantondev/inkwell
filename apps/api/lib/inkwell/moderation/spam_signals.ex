defmodule Inkwell.Moderation.SpamSignals do
  @moduledoc """
  Pure, rule-based spam scoring. No AI, no network calls — it takes a map of
  facts about an account (gathered by `Inkwell.Moderation.AutoModeration`) and
  returns a score plus human-readable reasons.

  The rules were fitted to the spam accounts actually seen on Inkwell
  (2026-04 → 2026-09): SEO/marketing or "game guide" posts published within
  minutes of signing up, links out to commercial sites, throwaway email
  domains, and no interaction with anyone. Real writers post quickly too
  (onboarding ends with "write your first entry"), so no single signal is
  enough to act on — actions need several together.

  Blocking also needs at least one *strong* signal (throwaway email, several
  commercial phrases, reports, or an admin spam warning). Links, posting
  speed and not interacting are things real writers do too, so on their own
  they can only limit an account, never block it. Fitted after a real music
  writer (@wiesakerboom, Sept 2026) was blocked for images hosted on Blogger,
  cited news articles, and a quiet posting style.

  Keep `reasons` specific: they're shown to the admin and logged forever.
  """

  @block_threshold 8
  @limit_threshold 5

  def block_threshold, do: @block_threshold
  def limit_threshold, do: @limit_threshold

  # Throwaway / anonymous mailbox services seen on spam signups, plus common
  # disposable providers. Domains with repeated blocked accounts are added at
  # runtime (see AutoModeration.learned_spam_domains/0).
  @disposable_domains ~w(
    hidingmail.net hidepost.net hidesit.net web-library.net
    mailinator.com guerrillamail.com guerrillamail.net sharklasers.com 10minutemail.com
    temp-mail.org tempmail.com tempmail.net tempr.email throwawaymail.com yopmail.com
    trashmail.com getnada.com dispostable.com maildrop.cc mohmal.com emailondeck.com
    mailnesia.com fakeinbox.com spamgourmet.com mintemail.com tmpmail.org tmpmail.net
  )

  # Big consumer providers — never treated as "learned" spam domains even if
  # several spammers used them.
  @common_providers ~w(
    gmail.com googlemail.com outlook.com hotmail.com live.com msn.com yahoo.com
    icloud.com me.com mac.com proton.me protonmail.com aol.com gmx.com gmx.de
    mail.com zoho.com fastmail.com hey.com pm.me yandex.com yandex.ru qq.com 163.com
  )

  # Links to these are ordinary in personal writing and never count.
  @benign_link_domains ~w(
    inkwell.social wikipedia.org youtube.com youtu.be spotify.com open.spotify.com
    bandcamp.com soundcloud.com archive.org web.archive.org github.com gitlab.com
    codeberg.org imdb.com goodreads.com openlibrary.org gutenberg.org bsky.app
    mastodon.social twitter.com x.com instagram.com flickr.com vimeo.com
    apple.com music.apple.com letterboxd.com substack.com medium.com tumblr.com
    reddit.com nytimes.com theguardian.com bbc.co.uk bbc.com npr.org apnews.com
    reuters.com washingtonpost.com ko-fi.com patreon.com buymeacoffee.com
    creativecommons.org w3.org mozilla.org peertube.tv funkwhale.audio
    googleusercontent.com gstatic.com imgur.com pixabay.com unsplash.com pexels.com
    pinterest.com wp.com gravatar.com
  )

  # Links straight to a picture are images people embedded or link to at full
  # size (Blogger does this for every photo), not promotion.
  @image_link ~r/\.(jpe?g|png|gif|webp|avif|svg|bmp|heic)(\?.*)?$/i

  # Commercial / SEO / scam vocabulary from real spam on Inkwell and common
  # link-spam. Multi-word phrases on purpose — single words like "business"
  # or "crypto" appear in normal journals.
  @spam_phrases [
    "seo services", "seo agency", "local seo", "search engine optimization services",
    "digital marketing services", "digital marketing agency", "digital marketing company",
    "marketing services company", "web development company", "app development company",
    "software development company", "services company in", "best company in",
    "backlinks", "guest post", "link building", "customer support number", "helpline number",
    "toll free", "integration services", "quickbooks", "casino", "sports betting",
    "online betting", "slot games", "crypto signals", "buy followers", "essay writing service",
    "assignment help", "write my essay", "cheap flights", "payday loan", "loan app",
    "peptide", "body contouring", "weight loss pills", "cbd oil", "escort service",
    "call girls", "replica watches", "promo code", "discount code", "coupon code",
    "unblocked games", "slope game", "slither io", "geometry dash", "retro bowl",
    "near me", "book an appointment", "get a free quote", "contact us today",
    "whatsapp us", "limited time offer", "click here to buy", "order now",
    # Product/service marketing copy (Sept 2026: packaging supplier, field
    # software vendor, clothing shop). Checked against every active account
    # before adding: only business and SEO accounts matched.
    "high-quality products", "wide range of products", "trusted name in", "packaging solutions",
    "management software", "helps businesses", "businesses improve", "we offer high",
    "we provide high", "industries such as", "tamper-evident", "ideal for everyday",
    "key features of", "affordable prices", "manufacturer and supplier", "leading provider",
    "one-stop solution", "customer satisfaction", "our expert team", "our team of experts"
  ]

  @doc """
  Score an account.

  `facts` keys (all optional, missing = neutral):
    * `:email_domain`
    * `:learned_spam_domains` — MapSet of domains with repeat blocked accounts
    * `:minutes_to_first_post` — minutes between signup and first public post
    * `:texts` — list of strings (titles, entry bodies, bio, comments, guestbook)
    * `:links` — list of absolute URLs found in the account's public content
    * `:profile_links` — URLs in bio/social links
    * `:interactions` — count of comments, inks, stamps and follows *given*
    * `:reports` — list of `%{trusted: boolean}` for distinct reporters on pending reports
    * `:spam_warnings` — spam warnings an admin has issued
    * `:account_age_days`, `:published_entry_days`, `:writing_span_days` — for
      established-account trust

  Returns `%{score: integer, strong: boolean, reasons: [String.t()]}`.
  `strong` is true when at least one signal that real writers don't trigger
  fired; `decision/1` never blocks without it.
  """
  def score(facts) do
    {score, reasons} =
      {0, []}
      |> email_signal(facts)
      |> link_signals(facts)
      |> phrase_signal(facts)
      |> phone_signal(facts)
      |> speed_signal(facts)
      |> no_interaction_signal(facts)
      |> report_signal(facts)
      |> warning_signal(facts)
      |> established_signal(facts)

    %{score: max(score, 0), strong: strong_signal?(facts), reasons: Enum.reverse(reasons)}
  end

  def decision(%{score: s, strong: true}) when s >= @block_threshold, do: :block
  def decision(%{score: s}) when s >= @limit_threshold, do: :limit
  def decision(_), do: :none

  # Signals that point at spam specifically rather than at "new and quiet".
  defp strong_signal?(facts) do
    domain = facts[:email_domain]

    (is_binary(domain) and (disposable_domain?(domain) or MapSet.member?(facts[:learned_spam_domains] || MapSet.new(), domain))) or
      length(phrase_hits(facts)) >= 2 or
      (facts[:reports] || []) != [] or
      (facts[:spam_warnings] || 0) > 0
  end

  def disposable_domain?(domain), do: domain in @disposable_domains
  def common_provider?(domain), do: domain in @common_providers

  # ── Signals ──────────────────────────────────────────────────────────────

  defp add({score, reasons}, points, reason), do: {score + points, ["#{reason} (#{sign(points)})" | reasons]}
  defp sign(p) when p >= 0, do: "+#{p}"
  defp sign(p), do: "#{p}"

  defp email_signal(acc, facts) do
    domain = facts[:email_domain]
    learned = facts[:learned_spam_domains] || MapSet.new()

    cond do
      is_nil(domain) -> acc
      disposable_domain?(domain) -> add(acc, 4, "throwaway email domain #{domain}")
      MapSet.member?(learned, domain) -> add(acc, 4, "email domain #{domain} used by other blocked spam accounts")
      true -> acc
    end
  end

  defp link_signals(acc, facts) do
    domains =
      (facts[:links] || [])
      |> Enum.map(&link_domain/1)
      |> Enum.reject(&(is_nil(&1) or benign?(&1)))

    distinct = domains |> Enum.uniq()
    most_repeated = domains |> Enum.frequencies() |> Map.values() |> Enum.max(fn -> 0 end)

    acc =
      case length(distinct) do
        0 -> acc
        1 -> add(acc, 2, "links to an outside site (#{hd(distinct)})")
        n -> add(acc, 3, "links to #{n} outside sites (#{Enum.take(distinct, 3) |> Enum.join(", ")})")
      end

    acc =
      if most_repeated >= 3,
        do: add(acc, 2, "links to the same outside site #{most_repeated} times"),
        else: acc

    profile_domains =
      (facts[:profile_links] || [])
      |> Enum.map(&link_domain/1)
      |> Enum.reject(&(is_nil(&1) or benign?(&1)))
      |> Enum.uniq()

    if profile_domains != [] and distinct != [],
      do: add(acc, 1, "profile also links to #{hd(profile_domains)}"),
      else: acc
  end

  defp phrase_hits(facts) do
    text = facts |> Map.get(:texts, []) |> Enum.join(" \n ") |> String.downcase()
    Enum.filter(@spam_phrases, &String.contains?(text, &1))
  end

  defp phrase_signal(acc, facts) do
    case phrase_hits(facts) do
      [] -> acc
      [one] -> add(acc, 2, "commercial wording: \"#{one}\"")
      many -> add(acc, 4, "commercial wording: #{many |> Enum.take(4) |> Enum.map(&"\"#{&1}\"") |> Enum.join(", ")}")
    end
  end

  # Phone numbers in public posts are almost always "call our helpline" spam.
  defp phone_signal(acc, facts) do
    text = facts |> Map.get(:texts, []) |> Enum.join(" ")

    if Regex.match?(~r/(\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/, text),
      do: add(acc, 2, "phone number in public content"),
      else: acc
  end

  defp speed_signal(acc, facts) do
    case facts[:minutes_to_first_post] do
      # Negative means imported posts dated before the account existed.
      m when is_number(m) and m >= 0 and m <= 30 -> add(acc, 1, "posted publicly #{round(m)} min after signing up")
      _ -> acc
    end
  end

  defp no_interaction_signal(acc, facts) do
    has_content = (facts[:texts] || []) != []

    if has_content and facts[:interactions] == 0,
      do: add(acc, 1, "never commented, inked, stamped or followed anyone"),
      else: acc
  end

  defp report_signal(acc, facts) do
    reports = facts[:reports] || []
    trusted = Enum.count(reports, & &1.trusted)
    other = length(reports) - trusted

    acc = if trusted > 0, do: add(acc, min(trusted * 4, 8), "reported by #{trusted} established member(s)"), else: acc
    if other > 0, do: add(acc, min(other * 2, 4), "reported by #{other} newer account(s)"), else: acc
  end

  # An admin already judged this account to be spamming.
  defp warning_signal(acc, facts) do
    case facts[:spam_warnings] || 0 do
      0 -> acc
      n -> add(acc, 4, "warned for spam by an admin#{if n > 1, do: " (#{n} times)", else: ""}")
    end
  end

  # Long-standing accounts that write regularly get the benefit of the doubt:
  # either they interact with people, or they've kept writing for months.
  # Posting on several days in a burst isn't enough — link spammers do that.
  defp established_signal(acc, facts) do
    if established?(facts),
      do: add(acc, -4, "established account (#{facts[:account_age_days]} days old, wrote on #{facts[:published_entry_days]} days#{if long_running_writer?(facts), do: " over #{facts[:writing_span_days]} days", else: ", interacts with others"})"),
      else: acc
  end

  @doc """
  60+ days old, never warned for spam, and either wrote on 3+ days with 3+
  interactions, or wrote on 6+ days spread over 60+ days.
  """
  def established?(facts) do
    (facts[:account_age_days] || 0) >= 60 and (facts[:spam_warnings] || 0) == 0 and
      (((facts[:published_entry_days] || 0) >= 3 and (facts[:interactions] || 0) >= 3) or long_running_writer?(facts))
  end

  defp long_running_writer?(facts),
    do: (facts[:published_entry_days] || 0) >= 6 and (facts[:writing_span_days] || 0) >= 60

  # ── Link helpers ─────────────────────────────────────────────────────────

  def link_domain(url) when is_binary(url) do
    case URI.parse(url) do
      %URI{host: host} when is_binary(host) and host != "" ->
        host |> String.downcase() |> String.replace_prefix("www.", "")

      _ ->
        nil
    end
  end

  def link_domain(_), do: nil

  def benign?(domain) do
    Enum.any?(@benign_link_domains, fn d -> domain == d or String.ends_with?(domain, "." <> d) end)
  end

  @doc """
  Outbound links in an HTML or text blob: `<a href>` targets plus bare URLs in
  the visible text. Image sources and links straight to image files don't
  count — embedding a photo hosted elsewhere isn't linking out.
  """
  def extract_links(nil), do: []

  def extract_links(text) when is_binary(text) do
    hrefs = Regex.scan(~r{<a\b[^>]*\bhref\s*=\s*["'](https?://[^"']+)["']}i, text, capture: :all_but_first) |> List.flatten()

    visible =
      text
      |> String.replace(~r{<a\b[^>]*>.*?</a>}is, " ")
      |> String.replace(~r/<[^>]*>/, " ")

    bare = Regex.scan(~r{https?://[^\s"'<>)]+}i, visible) |> Enum.map(&hd/1)

    Enum.reject(hrefs ++ bare, &Regex.match?(@image_link, &1))
  end
end
