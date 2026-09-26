defmodule Inkwell.Growth do
  @moduledoc """
  Signup attribution: where new accounts come from, and which of those sources
  turn into writers and paying members.

  Two signals, both first-party and stored only on the user row:

    * **First visit** (set by the Next.js middleware in the `inkwell_attr`
      cookie on a logged-out visitor's first page view and handed to the API
      at signup): the external site that linked to us (host only, never the
      full URL), an optional `?ref=` / `utm_source` tag, and the landing path.
    * **Self-reported**: the optional "How did you find Inkwell?" question in
      onboarding (`heard_from`, plus free text for "other").

  No third-party analytics and nothing about the visitor beyond this.
  """

  import Ecto.Query

  alias Inkwell.Accounts.User
  alias Inkwell.Journals.Entry
  alias Inkwell.Repo

  @heard_from_options ~w(friend fediverse writer switching search social ai other)

  @heard_from_labels %{
    "friend" => "A friend or someone I follow",
    "fediverse" => "Mastodon / the fediverse",
    "writer" => "A writer's post on Inkwell",
    "switching" => "Looking to leave Substack, Medium, WordPress…",
    "search" => "Search engine",
    "social" => "Reddit, Bluesky or another site",
    "ai" => "An AI assistant",
    "other" => "Something else"
  }

  # Hosts that are us: a click from our own pages isn't a source.
  @own_hosts ~w(inkwell.social inkwell-web.fly.dev api.inkwell.social inkwell-api.fly.dev localhost 127.0.0.1)

  # First path segments that are Inkwell pages rather than usernames.
  @site_pages ~w(about switch transparency founding explore get-started login i tag category
                 roadmap polls circles guide help guidelines developers fediverse for-writers
                 terms privacy brand ai gazette welcome feed editor settings pen-pals)

  def heard_from_options, do: @heard_from_options
  def heard_from_labels, do: @heard_from_labels

  # ── Capture ───────────────────────────────────────────────────────────

  @doc """
  Store first-visit attribution on a newly created user. Write-once: a user
  who already has any attribution keeps it. Bad or missing input is ignored,
  and this always returns `{:ok, user}` so it can never block a signup.
  """
  def record_signup_attribution(%User{} = user, raw) when is_map(raw) do
    attrs = sanitize_attribution(raw)

    already =
      user.signup_referrer_host || user.signup_ref || user.signup_landing_path

    if already || map_size(attrs) == 0 do
      {:ok, user}
    else
      # Never let attribution get in the way of signing up.
      case user |> User.attribution_changeset(attrs) |> Repo.update() do
        {:ok, updated} -> {:ok, updated}
        {:error, _} -> {:ok, user}
      end
    end
  end

  def record_signup_attribution(%User{} = user, _), do: {:ok, user}

  @doc false
  def sanitize_attribution(raw) do
    %{}
    |> put_if(:signup_referrer_host, clean_host(raw["host"]))
    |> put_if(:signup_ref, clean_ref(raw["ref"]))
    |> put_if(:signup_landing_path, clean_path(raw["path"]))
  end

  defp put_if(map, _k, nil), do: map
  defp put_if(map, k, v), do: Map.put(map, k, v)

  defp clean_host(h) when is_binary(h) do
    h = h |> String.trim() |> String.downcase() |> String.replace_prefix("www.", "")

    cond do
      h == "" -> nil
      String.length(h) > 253 -> nil
      not Regex.match?(~r/^[a-z0-9.-]+$/, h) -> nil
      h in @own_hosts or String.ends_with?(h, ".inkwell.social") -> nil
      true -> h
    end
  end

  defp clean_host(_), do: nil

  defp clean_ref(r) when is_binary(r) do
    r =
      r
      |> String.trim()
      |> String.downcase()
      |> String.replace(~r/[^a-z0-9_.-]/, "")
      |> String.slice(0, 64)

    if r == "", do: nil, else: r
  end

  defp clean_ref(_), do: nil

  defp clean_path(p) when is_binary(p) do
    p = p |> String.split(["?", "#"], parts: 2) |> hd() |> String.trim()

    cond do
      not String.starts_with?(p, "/") -> nil
      String.starts_with?(p, "//") -> nil
      not String.printable?(p) -> nil
      true -> String.slice(p, 0, 200)
    end
  end

  defp clean_path(_), do: nil

  # ── Where someone came from ───────────────────────────────────────────
  #
  # Every signup gets one answer, picked from the strongest signal we have:
  # an invite, then the link's ?ref=/utm_source tag (a site we recognise, or
  # one of our own campaign tags), then the referring site, then a Mastodon
  # sign-in, then what they told us, then where they landed. Each answer belongs to a
  # family so the admin chart can stack a handful of colours instead of forty.

  # Stacking/colour order of the admin chart. Keep in step with the web panel.
  @families [
    {"ai", "AI assistants"},
    {"search", "Search engines"},
    {"social", "Social sites & fediverse"},
    {"people", "Invites & friends"},
    {"writers", "Writers' pages"},
    {"campaign", "Your link tags"},
    {"other", "Other"},
    {"direct", "Direct or hidden"},
    {"before", "Before tracking began"}
  ]

  # When source tracking was switched on (signups before this have no data).
  @tracking_started ~D[2026-09-19]

  # {family, key, label, domains (the host or a subdomain of it), tag words}
  @named_sites [
    {"ai", "chatgpt", "ChatGPT", ~w(chatgpt.com chat.openai.com openai.com), ~w(chatgpt openai)},
    {"ai", "perplexity", "Perplexity", ~w(perplexity.ai), ~w(perplexity)},
    {"ai", "claude", "Claude", ~w(claude.ai), ~w(claude)},
    {"ai", "gemini", "Gemini", ~w(gemini.google.com), ~w(gemini)},
    {"ai", "copilot", "Microsoft Copilot", ~w(copilot.microsoft.com), ~w(copilot)},
    {"other", "email", "Email", ~w(mail.google.com com.google.android.gm outlook.live.com outlook.office.com mail.yahoo.com),
     ~w(email newsletter)},
    {"search", "google", "Google", ~w(com.google.android.googlequicksearchbox), ~w(google)},
    {"search", "bing", "Bing", ~w(bing.com), ~w(bing)},
    {"search", "duckduckgo", "DuckDuckGo", ~w(duckduckgo.com), ~w(duckduckgo ddg)},
    {"search", "brave", "Brave Search", ~w(search.brave.com), ~w(brave)},
    {"search", "ecosia", "Ecosia", ~w(ecosia.org), ~w(ecosia)},
    {"search", "kagi", "Kagi", ~w(kagi.com), ~w(kagi)},
    {"search", "yahoo", "Yahoo", ~w(search.yahoo.com yahoo.com), ~w(yahoo)},
    {"search", "yandex", "Yandex", ~w(yandex.ru yandex.com), ~w(yandex)},
    {"social", "bluesky", "Bluesky", ~w(bsky.app), ~w(bluesky bsky)},
    {"social", "reddit", "Reddit", ~w(reddit.com), ~w(reddit)},
    {"social", "x", "X (Twitter)", ~w(t.co x.com twitter.com), ~w(twitter x)},
    {"social", "facebook", "Facebook", ~w(facebook.com fb.me), ~w(facebook fb)},
    {"social", "instagram", "Instagram", ~w(instagram.com), ~w(instagram ig)},
    {"social", "threads", "Threads", ~w(threads.net threads.com), ~w(threads)},
    {"social", "linkedin", "LinkedIn", ~w(linkedin.com lnkd.in), ~w(linkedin)},
    {"social", "hackernews", "Hacker News", ~w(news.ycombinator.com), ~w(hackernews hn)},
    {"social", "youtube", "YouTube", ~w(youtube.com youtu.be), ~w(youtube)},
    {"social", "tumblr", "Tumblr", ~w(tumblr.com), ~w(tumblr)},
    {"social", "mastodon", "Mastodon / fediverse",
     ~w(mastodon.social mastodon.online mas.to fosstodon.org hachyderm.io infosec.exchange mstdn.social
        techhub.social social.coop masto.ai), ~w(mastodon fediverse)}
  ]

  @said %{
    "friend" => {"people", "A friend (they told us)"},
    "fediverse" => {"social", "Mastodon / fediverse (they told us)"},
    "writer" => {"writers", "A writer's post (they told us)"},
    "switching" => {"other", "Leaving another platform (they told us)"},
    "search" => {"search", "A search engine (they told us)"},
    "social" => {"social", "Reddit, Bluesky or similar (they told us)"},
    "ai" => {"ai", "An AI assistant (they told us)"},
    "other" => {"other", "Something else (they told us)"}
  }

  def families, do: Enum.map(@families, fn {k, l} -> %{key: k, label: l} end)

  @doc """
  The one answer to "where did this person come from?": `%{family, key, label}`.
  """
  def source_of(%User{} = u) do
    tagged_site = named_site(u.signup_ref, :ref)
    host_site = named_site(u.signup_referrer_host, :host)
    said = u.heard_from && Map.get(@said, u.heard_from)

    cond do
      u.invited_by_id ->
        src("people", "invite", "Invited by a member")

      # A tag a site adds itself (ChatGPT's utm_source=chatgpt.com).
      tagged_site ->
        tagged_site

      # A tag of our own is more specific than the site it was posted on.
      u.signup_ref ->
        src("campaign", "ref:" <> u.signup_ref, "Tagged link: #{u.signup_ref}")

      host_site ->
        host_site

      u.signup_referrer_host ->
        src("other", "site:" <> u.signup_referrer_host, u.signup_referrer_host)

      fediverse_login?(u) ->
        src("social", "fediverse_login", "Signed in with Mastodon")

      said ->
        {family, label} = said
        src(family, "said:" <> u.heard_from, label)

      writer_page?(u.signup_landing_path) ->
        src("writers", "writer_page", "Landed on a writer's page")

      u.signup_landing_path ->
        src("direct", "direct", "Direct or hidden")

      joined_before_tracking?(u) ->
        src("before", "before", "Before tracking began")

      # Joined since tracking began but brought no first-visit record: cookies
      # blocked, or they signed up without browsing the site first.
      true ->
        src("direct", "untracked", "No tracking data")
    end
  end

  defp joined_before_tracking?(%User{inserted_at: nil}), do: true

  defp joined_before_tracking?(%User{inserted_at: at}),
    do: Date.compare(DateTime.to_date(at), @tracking_started) == :lt

  defp src(family, key, label), do: %{family: family, key: key, label: label}

  defp fediverse_login?(u), do: String.ends_with?(u.email || "", ".fediverse.inkwell.social")

  defp writer_page?(path), do: String.starts_with?(landing_key(path) || "", "@")

  defp named_site(nil, _), do: nil

  defp named_site(value, kind) do
    v = value |> String.downcase() |> String.replace_prefix("www.", "")

    found =
      Enum.find(@named_sites, fn {_f, key, _l, domains, words} ->
        Enum.any?(domains, &(v == &1 or String.ends_with?(v, "." <> &1))) or
          (kind == :ref and v in words) or
          (key == "google" and google_host?(v)) or
          (key == "mastodon" and kind == :host and Regex.match?(~r/(^|[.-])(mastodon|mstdn|masto)([.-]|$)/, v))
      end)

    case found do
      {family, key, label, _, _} -> src(family, key, label)
      nil -> nil
    end
  end

  # google.com, google.co.uk, google.de… (not gmail, docs or gemini, which
  # are matched earlier or aren't search).
  defp google_host?(v), do: Regex.match?(~r/(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/, v)

  # ── Report ────────────────────────────────────────────────────────────

  @doc """
  Signups in the last `days` days (nil = all time) grouped by source, each
  with how many finished onboarding, published something, tried Plus and pay.
  Also a day-by-day (or week-by-week) timeline and the same numbers for the
  period before, for comparison. Suspended accounts (spam) and the relay
  actor are left out; they're counted separately as `suspended`.
  """
  def report(days \\ 90) do
    users = load_users(days)
    previous = if is_integer(days) and days > 0, do: load_users_between(2 * days, days), else: nil
    wrote = published_user_ids(Enum.map(users ++ (previous || []), & &1.id))

    rows = Enum.map(users, &row(&1, wrote))
    today = Date.utc_today()
    bucket = if is_integer(days) and days <= 92, do: "day", else: "week"

    %{
      days: days,
      bucket: bucket,
      tracking_started: @tracking_started,
      families: families(),
      totals: summarize("all", "All signups", rows),
      previous: previous && summarize("previous", "Previous period", Enum.map(previous, &row(&1, wrote))),
      tracked: Enum.count(rows, &tracked?(&1.user)),
      answered: Enum.count(rows, &(&1.user.heard_from != nil)),
      invited: Enum.count(rows, &(&1.user.invited_by_id != nil)),
      held_back: Enum.count(rows, &(&1.user.moderation_state == "limited")),
      suspended: count_suspended(days),
      by_source: by_source(rows),
      timeline: timeline(rows, days, bucket, today),
      by_heard_from:
        group(rows, fn u -> u.heard_from end, fn
          nil -> "Didn't answer"
          k -> Map.get(@heard_from_labels, k, k)
        end),
      by_referrer: group(rows, & &1.signup_referrer_host, &(&1 || "No referring site")),
      by_ref: group(rows, & &1.signup_ref, &(&1 || "No tag")),
      by_landing: group(rows, &landing_key(&1.signup_landing_path), &(&1 || "Unknown")),
      other_answers:
        rows
        |> Enum.map(& &1.user.heard_from_detail)
        |> Enum.reject(&is_nil/1)
        |> Enum.take(50),
      recent: rows |> Enum.take(100) |> Enum.map(&render_recent/1)
    }
  end

  defp row(u, wrote) do
    %{
      user: u,
      source: source_of(u),
      onboarded: onboarded?(u),
      wrote: MapSet.member?(wrote, u.id),
      trial: not is_nil(u.plus_trial_started_at),
      paying: paying?(u)
    }
  end

  defp base_query do
    relay = Inkwell.Federation.InstanceActor.username()

    from(u in User,
      where: is_nil(u.blocked_at) and u.username != ^relay,
      order_by: [desc: u.inserted_at]
    )
  end

  defp load_users(days) do
    if is_integer(days) and days > 0 do
      where(base_query(), [u], u.inserted_at >= ^days_ago(days)) |> Repo.all()
    else
      Repo.all(base_query())
    end
  end

  # Signups between `from_days` and `to_days` ago.
  defp load_users_between(from_days, to_days) do
    base_query()
    |> where([u], u.inserted_at >= ^days_ago(from_days) and u.inserted_at < ^days_ago(to_days))
    |> Repo.all()
  end

  defp count_suspended(days) do
    query = from(u in User, where: not is_nil(u.blocked_at), select: count(u.id))

    query =
      if is_integer(days) and days > 0,
        do: where(query, [u], u.inserted_at >= ^days_ago(days)),
        else: query

    Repo.one(query)
  end

  defp days_ago(days), do: DateTime.add(DateTime.utc_now(), -days * 86_400, :second)

  defp published_user_ids([]), do: MapSet.new()

  defp published_user_ids(ids) do
    from(e in Entry,
      where: e.user_id in ^ids and e.status == :published,
      distinct: true,
      select: e.user_id
    )
    |> Repo.all()
    |> MapSet.new()
  end

  defp onboarded?(%User{settings: s}) when is_map(s), do: s["onboarded"] == true
  defp onboarded?(_), do: false

  defp paying?(%User{} = u) do
    not is_nil(u.founding_member_number) or
      (u.subscription_tier == "plus" and u.subscription_status in ["active", "past_due"])
  end

  defp tracked?(u), do: u.signup_referrer_host || u.signup_ref || u.signup_landing_path

  defp group(rows, key_fun, label_fun) do
    rows
    |> Enum.group_by(fn r -> key_fun.(r.user) end)
    |> Enum.map(fn {k, rs} -> summarize(k, label_fun.(k), rs) end)
    |> Enum.sort_by(&{-&1.paying, -&1.signups})
  end

  # One row per source, busiest first; "direct" and "before tracking" last,
  # since they're the absence of a source.
  defp by_source(rows) do
    rows
    |> Enum.group_by(& &1.source.key)
    |> Enum.map(fn {_key, [first | _] = rs} ->
      first.source.key
      |> summarize(first.source.label, rs)
      |> Map.put(:family, first.source.family)
    end)
    |> Enum.sort_by(&{&1.family in ["direct", "before"], &1.family == "before", -&1.signups, &1.label})
  end

  # Signups per day (or per Monday-started week), oldest first, with empty
  # buckets filled in so the chart's spacing means time.
  defp timeline(rows, days, bucket, today) do
    first_day =
      if is_integer(days) and days > 0 do
        Date.add(today, -(days - 1))
      else
        rows |> Enum.map(&DateTime.to_date(&1.user.inserted_at)) |> Enum.min(Date, fn -> today end)
      end

    start = bucket_start(first_day, bucket)
    grouped = Enum.group_by(rows, &bucket_start(DateTime.to_date(&1.user.inserted_at), bucket))
    step = if bucket == "day", do: 1, else: 7

    start
    |> Stream.iterate(&Date.add(&1, step))
    |> Enum.take_while(&(Date.compare(&1, today) != :gt))
    |> Enum.map(fn date ->
      rs = Map.get(grouped, date, [])

      %{
        date: date,
        signups: length(rs),
        onboarded: Enum.count(rs, & &1.onboarded),
        wrote: Enum.count(rs, & &1.wrote),
        by_family: rs |> Enum.frequencies_by(& &1.source.family)
      }
    end)
  end

  defp bucket_start(date, "day"), do: date
  defp bucket_start(date, "week"), do: Date.beginning_of_week(date)

  defp summarize(key, label, rows) do
    %{
      key: key,
      label: label,
      signups: length(rows),
      onboarded: Enum.count(rows, & &1.onboarded),
      wrote: Enum.count(rows, & &1.wrote),
      trials: Enum.count(rows, & &1.trial),
      paying: Enum.count(rows, & &1.paying)
    }
  end

  @doc false
  # "/" → "/", "/switch/substack" → "/switch/substack", "/about" → "/about",
  # "/alice" → "@alice (profile)", "/alice/some-post" → "@alice (entry)".
  # Grouping entries by writer shows which writers bring people in.
  def landing_key(nil), do: nil
  def landing_key("/"), do: "/"

  def landing_key(path) do
    case String.split(path, "/", trim: true) do
      ["switch", source | _] -> "/switch/#{source}"
      [first | _] when first in @site_pages -> "/#{first}"
      [user] -> "@#{user} (profile)"
      [user, "subscribe" | _] -> "@#{user} (subscribe page)"
      [user | _] -> "@#{user} (entry)"
      [] -> "/"
    end
  end

  defp render_recent(%{user: u, source: source} = r) do
    %{
      username: u.username,
      joined: u.inserted_at,
      source: source,
      heard_from: u.heard_from && Map.get(@heard_from_labels, u.heard_from, u.heard_from),
      heard_from_detail: u.heard_from_detail,
      referrer_host: u.signup_referrer_host,
      ref: u.signup_ref,
      landing_path: u.signup_landing_path,
      invited: not is_nil(u.invited_by_id),
      fediverse_login: fediverse_login?(u),
      limited: u.moderation_state == "limited",
      onboarded: r.onboarded,
      wrote: r.wrote,
      trial: r.trial,
      paying: r.paying
    }
  end
end
