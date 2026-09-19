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

  # ── Report ────────────────────────────────────────────────────────────

  @doc """
  Signups in the last `days` days (nil = all time) grouped by source, each
  with how many finished onboarding, published something, tried Plus and pay.
  Suspended accounts (spam) and the relay actor are left out.
  """
  def report(days \\ 90) do
    users = load_users(days)
    wrote = published_user_ids(Enum.map(users, & &1.id))

    rows =
      Enum.map(users, fn u ->
        %{
          user: u,
          onboarded: onboarded?(u),
          wrote: MapSet.member?(wrote, u.id),
          trial: not is_nil(u.plus_trial_started_at),
          paying: paying?(u)
        }
      end)

    %{
      days: days,
      totals: summarize("all", "All signups", rows),
      tracked: Enum.count(rows, &tracked?(&1.user)),
      answered: Enum.count(rows, &(&1.user.heard_from != nil)),
      invited: Enum.count(rows, &(&1.user.invited_by_id != nil)),
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
      recent: rows |> Enum.take(60) |> Enum.map(&render_recent/1)
    }
  end

  defp load_users(days) do
    relay = Inkwell.Federation.InstanceActor.username()

    query =
      from(u in User,
        where: is_nil(u.blocked_at) and u.username != ^relay,
        order_by: [desc: u.inserted_at]
      )

    query =
      if is_integer(days) and days > 0 do
        cutoff = DateTime.add(DateTime.utc_now(), -days * 86_400, :second)
        where(query, [u], u.inserted_at >= ^cutoff)
      else
        query
      end

    Repo.all(query)
  end

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

  defp render_recent(%{user: u} = r) do
    %{
      username: u.username,
      joined: u.inserted_at,
      heard_from: u.heard_from && Map.get(@heard_from_labels, u.heard_from, u.heard_from),
      heard_from_detail: u.heard_from_detail,
      referrer_host: u.signup_referrer_host,
      ref: u.signup_ref,
      landing_path: u.signup_landing_path,
      invited: not is_nil(u.invited_by_id),
      fediverse_login: String.ends_with?(u.email || "", ".fediverse.inkwell.social"),
      onboarded: r.onboarded,
      wrote: r.wrote,
      trial: r.trial,
      paying: r.paying
    }
  end
end
