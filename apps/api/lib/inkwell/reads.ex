defmodule Inkwell.Reads do
  @moduledoc """
  Reader stats: how many people read each entry, and where they came from.

  Built to count readers without tracking them:

    * The web page reports a read only after someone has had the entry on
      screen for a while (see `components/read-beacon.tsx`), so page loads,
      prefetches and most bots never count.
    * Each reader counts once per entry per day. To know "already counted"
      we keep a hash of (daily salt, IP, user agent, entry) in memory until
      the day ends. The salt is random, lives only in memory and is replaced
      every UTC day, so the hashes can't be linked across days or reversed.
    * The database keeps only daily totals per entry and referring site
      (host name only). No IP addresses, visitor IDs or cookies.
    * Writers reading their own entries don't count.
  """

  import Ecto.Query

  alias Inkwell.Journals.Entry
  alias Inkwell.Repo

  @seen_table :entry_read_seen

  @bot_pattern ~r/bot|crawl|spider|slurp|preview|fetch|monitor|headless|lighthouse|facebookexternalhit|embedly|mastodon|pleroma|akkoma|misskey|bluesky|cardyb/i

  @search_hosts ~w(google bing duckduckgo kagi ecosia yahoo yandex startpage brave qwant baidu)

  # ── Recording ───────────────────────────────────────────────────────────

  @doc """
  Count one read of `entry` unless it shouldn't count. Returns `:counted` or
  `:skipped`. Never raises: stats must not break reading.
  """
  def record(%Entry{} = entry, viewer, ip, user_agent, referrer) do
    cond do
      entry.status != :published -> :skipped
      viewer && viewer.id == entry.user_id -> :skipped
      bot?(user_agent) -> :skipped
      not first_read_today?(entry.id, ip, user_agent) -> :skipped
      true -> increment(entry.id, Date.utc_today(), classify_referrer(referrer, entry))
    end
  rescue
    _ -> :skipped
  end

  def bot?(nil), do: true
  def bot?(""), do: true
  def bot?(ua) when is_binary(ua), do: Regex.match?(@bot_pattern, ua)

  defp first_read_today?(entry_id, ip, user_agent) do
    today = Date.utc_today()
    salt = daily_salt(today)
    key = :crypto.hash(:sha256, [salt, to_string(ip), "|", to_string(user_agent), "|", entry_id])
    :ets.insert_new(@seen_table, {{:seen, today, key}, true})
  end

  # One random salt per UTC day. When the day changes, yesterday's marks and
  # salt are dropped together.
  defp daily_salt(today) do
    case :ets.lookup(@seen_table, {:salt, today}) do
      [{_, salt}] ->
        salt

      [] ->
        salt = :crypto.strong_rand_bytes(32)

        if :ets.insert_new(@seen_table, {{:salt, today}, salt}) do
          :ets.select_delete(@seen_table, [
            {{{:seen, :"$1", :_}, :_}, [{:"=/=", :"$1", {:const, today}}], [true]},
            {{{:salt, :"$1"}, :_}, [{:"=/=", :"$1", {:const, today}}], [true]}
          ])

          salt
        else
          daily_salt(today)
        end
    end
  end

  defp increment(entry_id, day, referrer) do
    Repo.insert_all(
      "entry_read_days",
      [%{entry_id: Ecto.UUID.dump!(entry_id), day: day, referrer: referrer, count: 1}],
      on_conflict: [inc: [count: 1]],
      conflict_target: [:entry_id, :day, :referrer]
    )

    :counted
  end

  @doc """
  Reduce a referring URL to something a writer can read: `""` for none,
  `"inkwell"` for Inkwell itself (or the writer's own domain), a search
  engine's name, or the site's host without `www.`.
  """
  def classify_referrer(referrer, entry \\ nil)
  def classify_referrer(nil, _), do: ""
  def classify_referrer("", _), do: ""

  def classify_referrer(referrer, entry) when is_binary(referrer) do
    case URI.parse(referrer) do
      %URI{host: host} when is_binary(host) and host != "" ->
        host = host |> String.downcase() |> String.replace_prefix("www.", "")

        cond do
          own_host?(host, entry) -> "inkwell"
          search = Enum.find(@search_hosts, &search_host?(host, &1)) -> "search:" <> search
          host in ["t.co", "x.com", "twitter.com"] -> "x.com"
          String.ends_with?(host, "facebook.com") -> "facebook.com"
          String.ends_with?(host, "reddit.com") -> "reddit.com"
          true -> String.slice(host, 0, 100)
        end

      _ ->
        ""
    end
  end

  def classify_referrer(_, _), do: ""

  defp search_host?(host, name) do
    String.starts_with?(host, name <> ".") or String.contains?(host, "." <> name <> ".")
  end

  defp own_host?(host, entry) do
    frontend = URI.parse(Application.get_env(:inkwell, :frontend_url, "https://inkwell.social")).host

    host in [frontend, "inkwell.social", "inkwell-web.fly.dev", "localhost", "127.0.0.1"] or
      (entry != nil and host == custom_domain_of(entry.user_id))
  end

  defp custom_domain_of(user_id) do
    case Inkwell.CustomDomains.get_domain_by_user(user_id) do
      %{domain: domain} -> domain
      _ -> nil
    end
  end

  # ── Reading the numbers ────────────────────────────────────────────────

  @doc "Total reads per entry (all time) for the given entry ids, as a map."
  def counts_for_entries([]), do: %{}

  def counts_for_entries(entry_ids) when is_list(entry_ids) do
    from(r in "entry_read_days",
      where: r.entry_id in type(^entry_ids, {:array, :binary_id}),
      group_by: r.entry_id,
      select: {type(r.entry_id, :binary_id), sum(r.count)}
    )
    |> Repo.all()
    |> Map.new(fn {id, n} -> {id, to_int(n)} end)
  end

  @doc """
  A writer's reader stats over the last `days` days (ending today, UTC).
  `detail: false` returns only the headline totals.
  """
  def writer_summary(user_id, days, opts \\ []) do
    today = Date.utc_today()
    from_day = Date.add(today, -(days - 1))
    prev_from = Date.add(from_day, -days)
    detail? = Keyword.get(opts, :detail, true)

    base =
      from(r in "entry_read_days",
        join: e in Entry,
        on: e.id == r.entry_id,
        where: e.user_id == type(^user_id, :binary_id)
      )

    total = sum_between(base, from_day, today)
    previous = sum_between(base, prev_from, Date.add(from_day, -1))
    all_time = base |> select([r], sum(r.count)) |> Repo.one() |> to_int()

    summary = %{
      days: days,
      total: total,
      previous_total: previous,
      all_time: all_time
    }

    if detail? do
      Map.merge(summary, %{
        daily: daily_series(base, from_day, today),
        top_entries: top_entries(base, from_day, today),
        referrers: referrers(base, from_day, today)
      })
    else
      summary
    end
  end

  defp sum_between(base, from_day, to_day) do
    base
    |> where([r], r.day >= ^from_day and r.day <= ^to_day)
    |> select([r], sum(r.count))
    |> Repo.one()
    |> to_int()
  end

  defp daily_series(base, from_day, to_day) do
    counts =
      base
      |> where([r], r.day >= ^from_day and r.day <= ^to_day)
      |> group_by([r], r.day)
      |> select([r], {r.day, sum(r.count)})
      |> Repo.all()
      |> Map.new(fn {d, n} -> {d, to_int(n)} end)

    Date.range(from_day, to_day)
    |> Enum.map(fn d -> %{day: Date.to_iso8601(d), reads: Map.get(counts, d, 0)} end)
  end

  defp top_entries(base, from_day, to_day) do
    base
    |> where([r], r.day >= ^from_day and r.day <= ^to_day)
    |> group_by([r, e], [e.id, e.title, e.slug, e.kind, e.excerpt, e.published_at])
    |> select([r, e], %{
      id: e.id,
      title: e.title,
      slug: e.slug,
      kind: e.kind,
      excerpt: e.excerpt,
      published_at: e.published_at,
      reads: sum(r.count)
    })
    |> order_by([r], desc: sum(r.count))
    |> limit(10)
    |> Repo.all()
    |> Enum.map(&Map.update!(&1, :reads, fn n -> to_int(n) end))
  end

  defp referrers(base, from_day, to_day) do
    base
    |> where([r], r.day >= ^from_day and r.day <= ^to_day)
    |> group_by([r], r.referrer)
    |> select([r], %{source: r.referrer, reads: sum(r.count)})
    |> order_by([r], desc: sum(r.count))
    |> limit(12)
    |> Repo.all()
    |> Enum.map(&Map.update!(&1, :reads, fn n -> to_int(n) end))
  end

  defp to_int(nil), do: 0
  defp to_int(%Decimal{} = d), do: Decimal.to_integer(d)
  defp to_int(n) when is_integer(n), do: n
end
