defmodule Inkwell.Accounts.PeopleReport do
  @moduledoc """
  Admin → Users: who is on Inkwell. How many accounts are spam, how many are
  active, and who writes, who reads and responds, and who does neither.

  Everything is worked out from one pass over every account (one SQL query
  with per-account counts, plus the spam checker's own sets), then sorted
  into buckets in Elixir. `report/0` returns the counts; `members/2` lists the
  accounts in one bucket, using the same definitions, so a number and the
  list behind it can't disagree.

  Definitions (shown in the panel too):

    * **Admins** and the relay machine account are left out of everything.
    * **Spam**: suspended (`blocked_at`), limited by the spam checker
      (`moderation_state = "limited"`), or held back while new (new accounts
      that link out and haven't interacted with anyone:
      `Journals.showcase_excluded_user_ids/0` minus the limited ones).
    * **Members**: every account that isn't suspended or limited. Held-back
      accounts are members (nobody has called them spam), tagged as such.
    * **Interacted with someone**: commented on someone else's post
      (Inkwell or fediverse), inked, stamped, reprinted, had a follow
      accepted, sent a letter, or signed someone else's guestbook.
    * **Got a response**: someone else commented on, inked, stamped or
      reprinted one of their published posts (fediverse accounts included).
    * **Never got a response**: has a public post, isn't held back, and nobody
      has responded. Writers with only private posts couldn't have been
      answered, and held-back accounts are nearly all ads.
    * **Signed in**: has ever made a signed-in request (`last_active_at`) or
      holds a sign-in session.
  """

  import Ecto.Query

  alias Inkwell.{Accounts, Journals, Repo}
  alias Inkwell.Accounts.User
  alias Inkwell.Federation.InstanceActor
  alias Inkwell.Guestbook.GuestbookEntry
  alias Inkwell.Inks.Ink
  alias Inkwell.Journals.Comment
  alias Inkwell.Stamps.Stamp

  @per_page 50
  @new_writer_days 14

  # bucket key => {group, label}
  @buckets [
    {"members", :totals, "Members"},
    {"spam", :spam, "Spam caught (suspended or limited)"},
    {"suspended", :spam, "Suspended"},
    {"limited", :spam, "Limited by the spam checker"},
    {"held_back", :spam, "Held back while new"},
    {"cleared", :spam, "Cleared by an admin"},
    {"active_7", :activity, "Active in the last 7 days"},
    {"active_30", :activity, "Active in the last 30 days"},
    {"active_90", :activity, "Active in the last 90 days"},
    {"gone_quiet", :activity, "Signed in before, not in 90 days"},
    {"never_signed_in", :activity, "Never signed in"},
    {"not_onboarded", :activity, "Signed in, never finished setup"},
    {"never_wrote", :activity, "Signed in, never wrote anything"},
    {"drafts_only", :activity, "Only drafts, nothing published"},
    {"both", :engagement, "Write and respond to others"},
    {"posted_only", :engagement, "Post, but never interact with anyone"},
    {"interacted_only", :engagement, "Interact, but never post"},
    {"neither", :engagement, "Neither post nor interact"},
    {"writers", :responses, "Have published something"},
    {"answered", :responses, "Writers who got a response"},
    {"unanswered", :responses, "Writers who never got a response"},
    {"plus", :money, "Have Plus now"},
    {"founding", :money, "Founding Members"},
    {"subscribed", :money, "Paying by subscription"},
    {"trial", :money, "On a free trial"},
    {"given", :money, "Given Plus by an admin"},
    {"donor", :money, "Ink Donors"},
    {"real_email", :signin, "Signed up with an email address"},
    {"mastodon", :signin, "Signed up with Mastodon / the fediverse"},
    {"bluesky", :signin, "Signed up with Bluesky"}
  ]

  @bucket_keys Enum.map(@buckets, &elem(&1, 0))

  def bucket_keys, do: @bucket_keys

  @doc "The whole dashboard: counts per bucket, plus the short version's numbers."
  def report do
    now = DateTime.utc_now()
    rows = rows(now)
    counts = Map.new(@bucket_keys, fn key -> {key, Enum.count(rows, &in_bucket?(&1, key, now))} end)

    members = Enum.filter(rows, & &1.member)
    held_back_posted_only = Enum.count(rows, &(in_bucket?(&1, "posted_only", now) and &1.held_back))
    neither_never_signed_in = Enum.count(rows, &(in_bucket?(&1, "neither", now) and not &1.signed_in))

    %{
      generated_at: now,
      accounts: length(rows),
      admins: admin_count(),
      counts: counts,
      buckets: Enum.map(@buckets, fn {key, group, label} -> %{key: key, group: group, label: label} end),
      notes: %{
        posted_only_held_back: held_back_posted_only,
        neither_never_signed_in: neither_never_signed_in,
        writers: Enum.count(members, &(&1.published > 0))
      },
      recent: recent(rows, now),
      weeks: weeks(rows, now),
      new_writers: new_writers(rows, now)
    }
  end

  @doc "Accounts in one bucket, newest first, `page` of 50."
  def members(bucket, page \\ 1) when bucket in @bucket_keys do
    now = DateTime.utc_now()

    list =
      rows(now)
      |> Enum.filter(&in_bucket?(&1, bucket, now))
      |> Enum.sort_by(& &1.inserted_at, {:desc, DateTime})

    page = max(page, 1)

    %{
      total: length(list),
      page: page,
      per_page: @per_page,
      data: list |> Enum.drop((page - 1) * @per_page) |> Enum.take(@per_page) |> Enum.map(&render_row(&1, now))
    }
  end

  # ── Buckets ─────────────────────────────────────────────────────────────

  @doc false
  def in_bucket?(r, "spam", _now), do: not r.member
  def in_bucket?(r, "suspended", _now), do: r.suspended
  def in_bucket?(r, "limited", _now), do: r.limited and not r.suspended
  def in_bucket?(r, "held_back", _now), do: r.member and r.held_back
  def in_bucket?(r, "cleared", _now), do: r.cleared
  def in_bucket?(r, "members", _now), do: r.member

  def in_bucket?(r, "active_" <> days, now) when days in ["7", "30", "90"],
    do: r.member and active_within?(r, String.to_integer(days), now)

  def in_bucket?(r, "gone_quiet", now), do: r.member and r.signed_in and not active_within?(r, 90, now)
  def in_bucket?(r, "never_signed_in", _now), do: r.member and not r.signed_in
  def in_bucket?(r, "not_onboarded", _now), do: r.member and r.signed_in and not r.onboarded
  def in_bucket?(r, "never_wrote", _now), do: r.member and r.signed_in and r.entries == 0
  def in_bucket?(r, "drafts_only", _now), do: r.member and r.entries > 0 and r.published == 0

  def in_bucket?(r, "both", _now), do: r.member and r.published > 0 and r.given > 0
  def in_bucket?(r, "posted_only", _now), do: r.member and r.published > 0 and r.given == 0
  def in_bucket?(r, "interacted_only", _now), do: r.member and r.published == 0 and r.given > 0
  def in_bucket?(r, "neither", _now), do: r.member and r.published == 0 and r.given == 0

  def in_bucket?(r, "writers", _now), do: r.member and r.published > 0
  def in_bucket?(r, "answered", _now), do: r.member and r.published > 0 and r.received > 0

  # Only writers someone could actually have answered: not held back as a
  # likely ad, and with at least one post anyone can read.
  def in_bucket?(r, "unanswered", _now),
    do: r.member and not r.held_back and r.public_published > 0 and r.received == 0

  def in_bucket?(r, "plus", _now), do: r.member and r.plus
  def in_bucket?(r, "founding", _now), do: r.member and r.founding
  def in_bucket?(r, "subscribed", _now), do: r.member and r.plus and r.subscribed and not r.founding

  def in_bucket?(r, "trial", _now), do: r.member and r.plus and r.subscription_status == "trialing" and not r.founding

  def in_bucket?(r, "given", _now),
    do: r.member and r.plus and not r.founding and not r.subscribed and r.subscription_status != "trialing"

  def in_bucket?(r, "donor", _now), do: r.member and r.donor
  def in_bucket?(r, "real_email", _now), do: r.member and r.sign_up == :email
  def in_bucket?(r, "mastodon", _now), do: r.member and r.sign_up == :fediverse
  def in_bucket?(r, "bluesky", _now), do: r.member and r.sign_up == :bluesky
  def in_bucket?(_r, _key, _now), do: false

  defp active_within?(%{last_active_at: nil}, _days, _now), do: false

  defp active_within?(%{last_active_at: at}, days, now),
    do: DateTime.compare(at, DateTime.add(now, -days, :day)) != :lt

  # ── Facts per account ───────────────────────────────────────────────────

  @facts_sql """
  SELECT u.id, u.username, u.display_name, u.email, u.inserted_at, u.updated_at, u.last_active_at,
         u.blocked_at, u.moderation_state, u.moderation_cleared_at, u.vouched_at,
         CASE WHEN u.avatar_url LIKE 'data:%' THEN 'data:' ELSE u.avatar_url END,
         coalesce(u.settings->>'onboarded', '') = 'true',
         u.subscription_status, u.founding_member_number, u.square_subscription_id, u.ink_donor_status,
         coalesce(e.published, 0), coalesce(e.public_published, 0), coalesce(e.all_entries, 0),
         EXISTS (SELECT 1 FROM auth_tokens t WHERE t.user_id = u.id AND t.type = 'api_session'),
         coalesce(cg.n, 0), coalesce(ig.n, 0), coalesce(sg.n, 0), coalesce(rg.n, 0),
         coalesce(fg.n, 0), coalesce(lg.n, 0), coalesce(gg.n, 0),
         coalesce(cr.n, 0), coalesce(ir.n, 0), coalesce(sr.n, 0), coalesce(rr.n, 0)
  FROM users u
  LEFT JOIN (SELECT user_id, count(*) FILTER (WHERE status = 'published') AS published,
                    count(*) FILTER (WHERE status = 'published' AND privacy = 'public') AS public_published,
                    count(*) AS all_entries
             FROM entries GROUP BY user_id) e ON e.user_id = u.id
  LEFT JOIN (SELECT c.user_id, count(*) AS n FROM comments c LEFT JOIN entries en ON en.id = c.entry_id
             WHERE c.user_id IS NOT NULL AND (c.remote_entry_id IS NOT NULL OR en.user_id <> c.user_id)
             GROUP BY c.user_id) cg ON cg.user_id = u.id
  LEFT JOIN (SELECT user_id, count(*) AS n FROM inks WHERE user_id IS NOT NULL GROUP BY user_id) ig ON ig.user_id = u.id
  LEFT JOIN (SELECT user_id, count(*) AS n FROM stamps WHERE user_id IS NOT NULL GROUP BY user_id) sg ON sg.user_id = u.id
  LEFT JOIN (SELECT user_id, count(*) AS n FROM reprints WHERE user_id IS NOT NULL GROUP BY user_id) rg ON rg.user_id = u.id
  LEFT JOIN (SELECT follower_id, count(*) AS n FROM relationships WHERE status = 'accepted'
             GROUP BY follower_id) fg ON fg.follower_id = u.id
  LEFT JOIN (SELECT sender_id, count(*) AS n FROM direct_messages WHERE sender_id IS NOT NULL
             GROUP BY sender_id) lg ON lg.sender_id = u.id
  LEFT JOIN (SELECT author_id, count(*) AS n FROM guestbook_entries
             WHERE author_id IS NOT NULL AND author_id <> profile_user_id GROUP BY author_id) gg ON gg.author_id = u.id
  LEFT JOIN (SELECT en.user_id, count(*) AS n FROM comments c JOIN entries en ON en.id = c.entry_id
             WHERE en.status = 'published' AND (c.user_id IS NULL OR c.user_id <> en.user_id)
             GROUP BY en.user_id) cr ON cr.user_id = u.id
  LEFT JOIN (SELECT en.user_id, count(*) AS n FROM inks i JOIN entries en ON en.id = i.entry_id
             WHERE en.status = 'published' AND (i.user_id IS NULL OR i.user_id <> en.user_id)
             GROUP BY en.user_id) ir ON ir.user_id = u.id
  LEFT JOIN (SELECT en.user_id, count(*) AS n FROM stamps s JOIN entries en ON en.id = s.entry_id
             WHERE en.status = 'published' AND (s.user_id IS NULL OR s.user_id <> en.user_id)
             GROUP BY en.user_id) sr ON sr.user_id = u.id
  LEFT JOIN (SELECT en.user_id, count(*) AS n FROM reprints r JOIN entries en ON en.id = r.entry_id
             WHERE en.status = 'published' AND (r.user_id IS NULL OR r.user_id <> en.user_id)
             GROUP BY en.user_id) rr ON rr.user_id = u.id
  WHERE u.username <> $1 AND NOT (u.id = ANY($2))
  """

  defp rows(now) do
    admins = admin_ids()
    held = id_set(from(u in subquery(Journals.showcase_excluded_user_ids()), select: u.id))
    plus = id_set(Accounts.where_plus_now(User) |> select([u], u.id))

    %{rows: rows} = Repo.query!(@facts_sql, [InstanceActor.username(), Enum.map(admins, &Ecto.UUID.dump!/1)])

    Enum.map(rows, &to_row(&1, held, plus, now))
  end

  defp to_row(
         [id, username, display_name, email, inserted_at, updated_at, last_active_at, blocked_at, mod_state, cleared_at,
          vouched_at, avatar, onboarded, sub_status, founding_no, square_sub, donor_status, published, public_published,
          all_entries,
          has_session, cg, ig, sg, rg, fg, lg, gg, cr, ir, sr, rr],
         held,
         plus,
         _now
       ) do
    id = Ecto.UUID.cast!(id)
    suspended = blocked_at != nil
    limited = mod_state == "limited"

    %{
      id: id,
      username: username,
      display_name: display_name,
      email: email,
      avatar_url: avatar,
      inserted_at: utc(inserted_at),
      updated_at: utc(updated_at),
      last_active_at: utc(last_active_at),
      blocked_at: utc(blocked_at),
      suspended: suspended,
      limited: limited,
      member: not suspended and not limited,
      held_back: MapSet.member?(held, id) and not limited,
      cleared: cleared_at != nil,
      vouched: vouched_at != nil,
      signed_in: last_active_at != nil or has_session,
      onboarded: onboarded,
      subscription_status: sub_status,
      founding: founding_no != nil,
      founding_number: founding_no,
      subscribed: square_sub != nil and sub_status in ["active", "past_due"],
      plus: MapSet.member?(plus, id),
      donor: donor_status == "active",
      sign_up: sign_up(email),
      published: published,
      public_published: public_published,
      entries: all_entries,
      given_parts: %{comments: cg, inks: ig, stamps: sg, reprints: rg, follows: fg, letters: lg, guestbook: gg},
      given: cg + ig + sg + rg + fg + lg + gg,
      received_parts: %{comments: cr, inks: ir, stamps: sr, reprints: rr},
      received: cr + ir + sr + rr
    }
  end

  defp sign_up(email) when is_binary(email) do
    cond do
      String.ends_with?(email, "@bluesky.fediverse.inkwell.social") -> :bluesky
      String.ends_with?(email, ".fediverse.inkwell.social") -> :fediverse
      true -> :email
    end
  end

  defp sign_up(_), do: :email

  defp utc(nil), do: nil
  defp utc(%DateTime{} = dt), do: dt
  defp utc(%NaiveDateTime{} = n), do: DateTime.from_naive!(n, "Etc/UTC")

  defp id_set(query), do: query |> Repo.all() |> MapSet.new()

  defp admin_ids, do: Accounts.list_admins() |> Enum.map(& &1.id)
  defp admin_count, do: length(admin_ids())

  # ── Recent signups ──────────────────────────────────────────────────────

  # The last 30 days of signups: how many are still here as members, and how
  # many the spam checker caught or is holding.
  defp recent(rows, now) do
    since = DateTime.add(now, -30, :day)
    recent = Enum.filter(rows, &(DateTime.compare(&1.inserted_at, since) != :lt))

    %{
      signups: length(recent),
      suspended: Enum.count(recent, & &1.suspended),
      limited: Enum.count(recent, &(&1.limited and not &1.suspended)),
      held_back: Enum.count(recent, &(&1.member and &1.held_back)),
      members: Enum.count(recent, &(&1.member and not &1.held_back)),
      posted: Enum.count(recent, &(&1.member and not &1.held_back and &1.published > 0))
    }
  end

  # Signups per week for 12 weeks (weeks start Monday, UTC), split the same way.
  defp weeks(rows, now) do
    this_monday = now |> DateTime.to_date() |> Date.beginning_of_week()
    starts = for i <- 11..0//-1, do: Date.add(this_monday, -7 * i)

    by_week =
      Enum.group_by(rows, fn r -> r.inserted_at |> DateTime.to_date() |> Date.beginning_of_week() end)

    Enum.map(starts, fn start ->
      list = Map.get(by_week, start, [])

      %{
        week: start,
        members: Enum.count(list, &(&1.member and not &1.held_back)),
        held_back: Enum.count(list, &(&1.member and &1.held_back)),
        spam: Enum.count(list, &(not &1.member))
      }
    end)
  end

  # ── New writers ─────────────────────────────────────────────────────────

  # Everyone whose first entry went up in the last two weeks and who doesn't
  # look like spam, and whether anyone has answered yet. Same rule as the Slack
  # note and the Feed's "New to Inkwell".
  defp new_writers(rows, now) do
    entries = Journals.list_recent_real_first_entries(@new_writer_days, exclude_user_ids: admin_ids())
    entry_ids = Enum.map(entries, & &1.id)
    replies = replies_by_entry(entry_ids)
    inks = count_by_entry(Ink, entry_ids)
    stamps = count_by_entry(Stamp, entry_ids)
    guestbook = guestbook_by_writer(Enum.map(entries, & &1.user_id))
    since = DateTime.add(now, -@new_writer_days, :day)

    %{
      days: @new_writer_days,
      not_posted:
        Enum.count(rows, fn r ->
          r.member and not r.held_back and r.signed_in and r.published == 0 and
            DateTime.compare(r.inserted_at, since) != :lt
        end),
      items:
        Enum.map(entries, fn e ->
          entry_replies = Map.get(replies, e.id, [])

          %{
            username: e.user.username,
            display_name: e.user.display_name,
            avatar_url: Inkwell.Avatars.avatar_url(e.user),
            joined_at: e.user.inserted_at,
            title: e.title,
            path: "/#{e.user.username}/#{e.slug}",
            published_at: e.published_at,
            word_count: e.word_count || 0,
            replies: length(entry_replies),
            first_reply: first_reply(entry_replies),
            inks: Map.get(inks, e.id, 0),
            stamps: Map.get(stamps, e.id, 0),
            guestbook: Map.get(guestbook, e.user_id, 0)
          }
        end)
    }
  end

  # Replies from anyone but the writer, oldest first. Fediverse replies count;
  # suspended accounts don't.
  defp replies_by_entry(entry_ids) do
    from(c in Comment,
      join: e in assoc(c, :entry),
      left_join: u in assoc(c, :user),
      where: c.entry_id in ^entry_ids,
      where: is_nil(c.user_id) or (c.user_id != e.user_id and is_nil(u.blocked_at)),
      order_by: c.inserted_at,
      preload: [user: u]
    )
    |> Repo.all()
    |> Enum.group_by(& &1.entry_id)
  end

  defp first_reply([]), do: nil
  defp first_reply([c | _]), do: %{name: reply_name(c), at: c.inserted_at}

  defp reply_name(%{user: %{username: username}}), do: "@#{username}"
  defp reply_name(%{remote_author: %{"display_name" => name}}) when is_binary(name) and name != "", do: name
  defp reply_name(%{remote_author: %{"username" => name}}) when is_binary(name) and name != "", do: "@#{name}"
  defp reply_name(_), do: "someone on the fediverse"

  defp count_by_entry(schema, entry_ids) do
    from(x in schema, where: x.entry_id in ^entry_ids, group_by: x.entry_id, select: {x.entry_id, count(x.id)})
    |> Repo.all()
    |> Map.new()
  end

  defp guestbook_by_writer(user_ids) do
    from(g in GuestbookEntry,
      where: g.profile_user_id in ^user_ids,
      where: is_nil(g.author_id) or g.author_id != g.profile_user_id,
      group_by: g.profile_user_id,
      select: {g.profile_user_id, count(g.id)}
    )
    |> Repo.all()
    |> Map.new()
  end

  # ── One account, for the list ───────────────────────────────────────────

  defp render_row(r, now) do
    %{
      id: r.id,
      username: r.username,
      display_name: r.display_name,
      email: r.email,
      avatar_url: Inkwell.Avatars.avatar_url(r),
      created_at: r.inserted_at,
      last_active_at: r.last_active_at,
      blocked_at: r.blocked_at,
      published: r.published,
      drafts: r.entries - r.published,
      given: r.given,
      given_parts: r.given_parts,
      received: r.received,
      received_parts: r.received_parts,
      signed_in: r.signed_in,
      onboarded: r.onboarded,
      sign_up: r.sign_up,
      states: states(r, now)
    }
  end

  defp states(r, _now) do
    [
      r.suspended && "suspended",
      r.limited && not r.suspended && "limited",
      r.held_back && r.member && "held_back",
      r.cleared && "cleared",
      r.vouched && "vouched",
      r.founding && "founding",
      r.plus && not r.founding && "plus",
      r.donor && "donor"
    ]
    |> Enum.filter(& &1)
  end
end
