"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";

/**
 * Admin → Users, top half: who is on Inkwell. Spam, activity, who writes and
 * who responds. Numbers come from GET /api/admin/users-overview
 * (Inkwell.Accounts.PeopleReport); clicking a row lists the accounts in it
 * from /api/admin/users-overview/members, worked out with the same rules.
 */

type Group = "totals" | "spam" | "activity" | "engagement" | "responses" | "money" | "signin";

interface Report {
  generated_at: string;
  accounts: number;
  admins: number;
  counts: Record<string, number>;
  buckets: { key: string; group: Group; label: string }[];
  notes: { posted_only_held_back: number; neither_never_signed_in: number; writers: number };
  recent: { signups: number; suspended: number; limited: number; held_back: number; members: number; posted: number };
  weeks: { week: string; members: number; held_back: number; spam: number }[];
  new_writers: { days: number; not_posted: number; items: NewWriter[] };
}

interface NewWriter {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  joined_at: string;
  title: string | null;
  path: string;
  published_at: string;
  word_count: number;
  replies: number;
  first_reply: { name: string; at: string } | null;
  inks: number;
  stamps: number;
  guestbook: number;
}

interface Parts {
  [k: string]: number;
}

interface Member {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  last_active_at: string | null;
  blocked_at: string | null;
  published: number;
  drafts: number;
  given: number;
  given_parts: Parts;
  received: number;
  received_parts: Parts;
  signed_in: boolean;
  onboarded: boolean;
  sign_up: "email" | "fediverse" | "bluesky";
  states: string[];
}

interface MemberPage {
  total: number;
  page: number;
  per_page: number;
  data: Member[];
}

const serif = { fontFamily: "var(--font-lora, Georgia, serif)" };

const GROUPS: { id: Group; title: string; hint: string; of: (r: Report) => number }[] = [
  {
    id: "spam",
    title: "Spam",
    hint: "Suspended accounts can't sign in and their posts are hidden. Limited ones stay up but are kept out of Explore and search. Held back: new accounts that link to outside sites and haven't interacted with anyone, kept out of Explore for their first month.",
    of: (r) => r.accounts,
  },
  {
    id: "activity",
    title: "Coming back",
    hint: "Active means they used Inkwell while signed in. Setup is the welcome steps after signing up.",
    of: (r) => r.counts.members,
  },
  {
    id: "engagement",
    title: "Writing and responding",
    hint: "Posting means publishing anything (stickies count). Interacting means commenting on someone else's post, inking, stamping, reprinting, a follow someone accepted, a letter, or signing someone's guestbook.",
    of: (r) => r.counts.members,
  },
  {
    id: "responses",
    title: "Did anyone answer?",
    hint: "Among members who have posted: did anyone else comment on, ink, stamp or reprint something they published (fediverse accounts count). \u201cNever got a response\u201d only counts writers with a public post, and leaves out accounts held back as likely ads.",
    of: (r) => r.notes.writers,
  },
  {
    id: "money",
    title: "Plus and support",
    hint: "Admin → Billing has the details and Square's side of it.",
    of: (r) => r.counts.members,
  },
  {
    id: "signin",
    title: "How they signed up",
    hint: "Mastodon and Bluesky sign-ins have no email address on file, so they can't get emails from Inkwell.",
    of: (r) => r.counts.members,
  },
];

const STATE_LABEL: Record<string, string> = {
  suspended: "Suspended",
  limited: "Limited",
  held_back: "Held back",
  cleared: "Cleared",
  vouched: "Vouched",
  founding: "Founding",
  plus: "Plus",
  donor: "Donor",
};

function plural(n: number, one: string, many = one + "s") {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function isAre(n: number) {
  return n === 1 ? "is" : "are";
}

function hasHave(n: number) {
  return n === 1 ? "has" : "have";
}

function pct(n: number, of: number) {
  if (!of) return "0%";
  const p = (n / of) * 100;
  return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
}

function ago(iso: string | null) {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 24) return `${months} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function partsWords(p: Parts) {
  const names: Record<string, [string, string]> = {
    comments: ["comment", "comments"],
    inks: ["ink", "inks"],
    stamps: ["stamp", "stamps"],
    reprints: ["reprint", "reprints"],
    follows: ["accepted follow", "accepted follows"],
    letters: ["letter", "letters"],
    guestbook: ["guestbook signature", "guestbook signatures"],
  };
  const out = Object.entries(p)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${n === 1 ? names[k]?.[0] ?? k : names[k]?.[1] ?? k}`);
  return out.length ? out.join(", ") : "nothing yet";
}

/** The short version, in sentences. */
function Summary({ r }: { r: Report }) {
  const c = r.counts;
  const spam = c.suspended + c.limited;
  const writers = r.notes.writers;
  const rc = r.recent;
  const recentSpam = rc.suspended + rc.limited;

  return (
    <div className="pd-summary rounded-xl border p-4 sm:p-5">
      <h2 className="font-semibold text-base mb-2" style={serif}>The short version</h2>
      <div className="space-y-2 text-sm leading-relaxed" style={serif}>
        <p>
          Inkwell has <strong>{plural(r.accounts, "account")}</strong>
          {r.admins ? ` (not counting ${plural(r.admins, "admin")})` : ""}. <strong>{spam.toLocaleString()}</strong> of them ({pct(spam, r.accounts)}){" "}
          {isAre(spam)} spam the checker caught: {c.suspended} suspended and {c.limited} limited. That leaves{" "}
          <strong>{plural(c.members, "member")}</strong>
          {c.held_back > 0 && (
            <>
              , {c.held_back === 1 ? "one of them a new account" : `${c.held_back} of them new accounts`} with outside links, held back until{" "}
              {c.held_back === 1 ? "it joins" : "they join"} in
            </>
          )}
          .
        </p>
        <p>
          <strong>{c.active_7}</strong> {c.active_7 === 1 ? "member" : "members"} used Inkwell in the last week, <strong>{c.active_30}</strong> in the last
          month and {c.active_90} in the last three months. {c.gone_quiet} {hasHave(c.gone_quiet)}n&rsquo;t been back for over three months
          {c.never_signed_in > 0 && <>, and {c.never_signed_in} never signed in at all</>}.
        </p>
        <p>
          <strong>{plural(writers, "member")}</strong> {hasHave(writers)} published something. {c.both} of them also respond to other people;{" "}
          <strong>{c.posted_only}</strong> post but {hasHave(c.posted_only)} never interacted with anyone
          {r.notes.posted_only_held_back > 0 && <> ({r.notes.posted_only_held_back} of those {isAre(r.notes.posted_only_held_back)} held back)</>}.{" "}
          {c.interacted_only} respond without posting, and <strong>{c.neither}</strong> {hasHave(c.neither)} done neither yet.{" "}
          {c.unanswered > 0 ? (
            <><strong>{c.unanswered}</strong> of the writers {hasHave(c.unanswered)} never had a response from anyone.</>
          ) : (
            <>Every writer has had a response from someone.</>
          )}
        </p>
        {rc.signups > 0 && (
          <p>
            In the last 30 days, {plural(rc.signups, "account")} signed up: {recentSpam} {recentSpam === 1 ? "was" : "were"} spam, {rc.held_back} {isAre(rc.held_back)} held back,
            and {rc.members} look like real people, {rc.posted} of whom {rc.posted === 1 ? "has" : "have"} posted.
          </p>
        )}
      </div>
    </div>
  );
}

/** Real people's first entries, so they aren't lost among the spam. */
function NewWriters({ data }: { data: Report["new_writers"] }) {
  const [all, setAll] = useState(false);
  const FIRST = 8;
  const waiting = data.items.filter((w) => w.replies === 0).length;
  const shown = all ? data.items : data.items.slice(0, FIRST);

  return (
    <section className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h2 className="font-semibold text-base" style={serif}>New writers</h2>
      <p className="text-xs mt-0.5 mb-3" style={{ color: "var(--muted)" }}>
        {data.items.length === 0 ? (
          <>Nobody has published a first entry in the last {data.days} days.</>
        ) : (
          <>
            {plural(data.items.length, "first entry", "first entries")} in the last {data.days} days, spam left out.{" "}
            {waiting === 0 ? "Every one has a reply." : <><strong>{waiting}</strong> {waiting === 1 ? "has" : "have"} no reply yet.</>}
          </>
        )}
        {data.not_posted > 0 && <> {plural(data.not_posted, "more person", "more people")} signed in but {data.not_posted === 1 ? "hasn’t" : "haven’t"} published yet.</>}
      </p>

      {shown.length > 0 && (
        <ul className="pd-new-list">
          {shown.map((w) => {
            const others = [
              w.inks > 0 && plural(w.inks, "ink"),
              w.stamps > 0 && plural(w.stamps, "stamp"),
              w.guestbook > 0 && plural(w.guestbook, "guestbook note"),
            ].filter(Boolean);
            return (
              <li key={w.path} className="pd-new">
                <Link href={`/${w.username}`} className="pd-new-who">
                  <Avatar url={w.avatar_url} name={w.display_name || w.username} size={32} />
                  <span className="min-w-0">
                    <span className="block font-medium text-sm truncate">{w.display_name || w.username}</span>
                    <span className="block text-xs truncate" style={{ color: "var(--muted)" }}>@{w.username}</span>
                  </span>
                </Link>
                <div className="pd-new-entry min-w-0">
                  <Link href={w.path} className="pd-new-title" style={serif}>{w.title?.trim() || "Untitled entry"}</Link>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    Posted {ago(w.published_at)} · joined {ago(w.joined_at)} · {plural(w.word_count, "word")}
                  </div>
                </div>
                <div className="pd-new-status text-xs">
                  {w.first_reply ? (
                    <span className="pd-chip pd-chip--answered">
                      {w.first_reply.name}{w.replies > 1 ? ` +${w.replies - 1}` : ""} replied
                    </span>
                  ) : (
                    <span className="pd-chip">No reply yet</span>
                  )}
                  {others.length > 0 && <span style={{ color: "var(--muted)" }}>{others.join(" · ")}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data.items.length > FIRST && (
        <button type="button" className="text-xs underline mt-2" style={{ color: "var(--muted)" }} onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${data.items.length}`}
        </button>
      )}
    </section>
  );
}

function Stat({ value, label, onClick, on }: { value: number; label: string; onClick: () => void; on: boolean }) {
  return (
    <button type="button" className={`adm-stat pd-stat${on ? " pd-stat--on" : ""}`} onClick={onClick} aria-pressed={on}>
      <div className="adm-stat-value">{value.toLocaleString()}</div>
      <div className="adm-stat-label">{label}</div>
    </button>
  );
}

const SERIES = [
  { key: "members", label: "Members", color: "var(--pd-member)" },
  { key: "held_back", label: "Held back", color: "var(--pd-held)" },
  { key: "spam", label: "Spam", color: "var(--pd-spam)" },
] as const;

function WeeksChart({ weeks }: { weeks: Report["weeks"] }) {
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...weeks.map((w) => w.members + w.held_back + w.spam));

  return (
    <section className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <h2 className="font-semibold text-base" style={serif}>Signups by week</h2>
        <button type="button" className="text-xs underline ml-auto" style={{ color: "var(--muted)" }} onClick={() => setTable((v) => !v)}>
          {table ? "Show chart" : "Show as a table"}
        </button>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
        The last 12 weeks, as each account stands today. Admin → Growth has where they came from.
      </p>
      <ul className="pd-legend" aria-label="Colour key">
        {SERIES.map((s) => (
          <li key={s.key}>
            <span className="pd-swatch" style={{ background: s.color }} aria-hidden /> {s.label}
          </li>
        ))}
      </ul>

      {table ? (
        <table className="pd-table text-xs mt-2">
          <thead>
            <tr><th>Week of</th><th>Members</th><th>Held back</th><th>Spam</th></tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week}>
                <td>{shortDate(w.week)}</td><td>{w.members}</td><td>{w.held_back}</td><td>{w.spam}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="pd-chart" role="img" aria-label="Signups per week, split into members, held back and spam">
          {weeks.map((w) => {
            const total = w.members + w.held_back + w.spam;
            return (
              <div
                key={w.week}
                className="pd-col"
                title={`Week of ${shortDate(w.week)}: ${total} signups (${w.members} members, ${w.held_back} held back, ${w.spam} spam)`}
              >
                <div className="pd-total">{total || ""}</div>
                <div className="pd-stack" style={{ height: `${(total / max) * 100}%` }}>
                  {SERIES.map((s) =>
                    w[s.key] > 0 ? <div key={s.key} style={{ flexGrow: w[s.key], background: s.color }} /> : null,
                  )}
                </div>
                <div className="pd-week">{new Date(w.week).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function GroupCard({
  group,
  report,
  selected,
  onPick,
}: {
  group: (typeof GROUPS)[number];
  report: Report;
  selected: string | null;
  onPick: (key: string) => void;
}) {
  const rows = report.buckets.filter((b) => b.group === group.id);
  const of = group.of(report);

  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h2 className="font-semibold text-base" style={serif}>{group.title}</h2>
      <p className="text-xs mt-0.5 mb-3" style={{ color: "var(--muted)" }}>{group.hint}</p>
      <ul className="space-y-0.5">
        {rows.map((b) => {
          const n = report.counts[b.key] ?? 0;
          const on = selected === b.key;
          return (
            <li key={b.key}>
              <button type="button" className={`pd-row${on ? " pd-row--on" : ""}`} onClick={() => onPick(b.key)} aria-pressed={on}>
                <span className="pd-row-label">{b.label}</span>
                <span className="pd-row-num">{n.toLocaleString()}</span>
                <span className="pd-row-pct">{pct(n, of)}</span>
                <span className="pd-bar" aria-hidden>
                  <span style={{ width: `${of ? Math.min(100, (n / of) * 100) : 0}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MemberRow({ m, onChanged }: { m: Member; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function act(path: string, method: string, confirmText: string | null) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    try {
      const res = await fetch(path, { method });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "That didn't work");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    const typed = prompt(`Type "${m.username}" to permanently delete this account:`);
    if (typed === null) return;
    if (typed !== m.username) {
      alert("Username did not match. Account was not deleted.");
      return;
    }
    act(`/api/admin/users/${m.id}`, "DELETE", null);
  }

  const signUp = m.sign_up === "fediverse" ? "Mastodon sign-in" : m.sign_up === "bluesky" ? "Bluesky sign-in" : m.email;

  return (
    <li className="pd-member">
      <Link href={`/${m.username}`} className="pd-member-who">
        <Avatar url={m.avatar_url} name={m.display_name || m.username} size={32} />
        <span className="min-w-0">
          <span className="block font-medium text-sm truncate">{m.display_name || m.username}</span>
          <span className="block text-xs truncate" style={{ color: "var(--muted)" }}>@{m.username}</span>
        </span>
      </Link>

      <div className="pd-member-facts text-xs" style={{ color: "var(--muted)" }}>
        <span>Joined {shortDate(m.created_at)}</span>
        <span>{m.signed_in ? `Last here ${ago(m.last_active_at)}` : "Never signed in"}</span>
        <span>
          {plural(m.published, "post")}
          {m.drafts > 0 ? ` · ${plural(m.drafts, "draft")}` : ""}
        </span>
        <span title={partsWords(m.given_parts)}>Gave {m.given}</span>
        <span title={partsWords(m.received_parts)}>Got {m.received}</span>
        {signUp && <span className="pd-member-email" title={signUp}>{signUp}</span>}
      </div>

      <div className="pd-member-end">
        {m.states.map((s) => (
          <span key={s} className={`pd-chip pd-chip--${s}`}>{STATE_LABEL[s] ?? s}</span>
        ))}
        <div className="admin-action-row">
          <Link href={`/admin?s=moderation&check=${encodeURIComponent(m.username)}`} className="admin-btn admin-btn--outline admin-btn--sm">
            Check
          </Link>
          {m.blocked_at ? (
            <button className="admin-btn admin-btn--outline admin-btn--sm" disabled={busy} onClick={() => act(`/api/admin/users/${m.id}/unblock`, "POST", null)}>
              Unblock
            </button>
          ) : (
            <button
              className="admin-btn admin-btn--danger admin-btn--sm"
              disabled={busy}
              onClick={() => act(`/api/admin/users/${m.id}/block`, "POST", `Block @${m.username}? They will be signed out and unable to access Inkwell.`)}
            >
              Block
            </button>
          )}
          <button className="admin-btn admin-btn--danger admin-btn--sm" disabled={busy} onClick={remove}>
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function MemberList({ bucket, label, onClose, onChanged }: { bucket: string; label: string; onClose: () => void; onChanged: () => void }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MemberPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLElement>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users-overview/members?bucket=${encodeURIComponent(bucket)}&page=${p}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't load");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    } finally {
      setLoading(false);
    }
  }, [bucket]);

  useEffect(() => {
    setPage(1);
    load(1);
  }, [load]);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [bucket]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

  return (
    <section ref={ref} className="pd-list rounded-xl border p-4 sm:p-5" aria-live="polite">
      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <h2 className="font-semibold text-base" style={serif}>
          {label}
          {data && <span style={{ color: "var(--muted)" }}> · {data.total.toLocaleString()}</span>}
        </h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>Newest first. “Gave” counts their comments, inks, stamps, follows, letters and guestbook notes for others; “Got” counts responses to their posts. Hover either for the breakdown.</span>
        <button type="button" className="text-xs underline ml-auto" style={{ color: "var(--muted)" }} onClick={onClose}>
          Close
        </button>
      </div>

      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error} <button type="button" className="underline" onClick={() => load(page)}>Try again</button>
        </p>
      ) : !data || (loading && !data.data.length) ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>
      ) : data.total === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Nobody here.</p>
      ) : (
        <>
          <ul style={{ opacity: loading ? 0.6 : 1 }}>
            {data.data.map((m) => (
              <MemberRow
                key={m.id}
                m={m}
                onChanged={() => {
                  load(page);
                  onChanged();
                }}
              />
            ))}
          </ul>
          {pages > 1 && (
            <div className="admin-pagination">
              {page > 1 ? (
                <button className="admin-btn admin-btn--outline" onClick={() => { setPage(page - 1); load(page - 1); }}>← Newer</button>
              ) : <div />}
              <span className="admin-pagination-info">Page {page} of {pages}</span>
              {page < pages ? (
                <button className="admin-btn admin-btn--outline" onClick={() => { setPage(page + 1); load(page + 1); }}>Older →</button>
              ) : <div />}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function PeopleDashboard() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/users-overview", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't load");
      setReport(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error && !report) {
    return (
      <p className="text-sm mb-6" style={{ color: "var(--danger)" }}>
        {error} <button type="button" className="underline" onClick={load}>Try again</button>
      </p>
    );
  }
  if (!report) return <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>Counting everyone…</p>;

  const pick = (key: string) => setSelected((cur) => (cur === key ? null : key));
  const label = report.buckets.find((b) => b.key === selected)?.label ?? "";
  const c = report.counts;

  return (
    <div className="pd-root space-y-5 mb-10">
      <Summary r={report} />

      <NewWriters data={report.new_writers} />

      <div className="adm-stats" style={{ marginBottom: 0 }}>
        <Stat value={c.members} label="members" onClick={() => pick("members")} on={selected === "members"} />
        <Stat value={c.active_30} label="active this month" onClick={() => pick("active_30")} on={selected === "active_30"} />
        <Stat value={c.writers} label="have posted" onClick={() => pick("writers")} on={selected === "writers"} />
        <Stat value={c.posted_only} label="post, never interact" onClick={() => pick("posted_only")} on={selected === "posted_only"} />
        <Stat value={c.spam} label="spam caught" onClick={() => pick("spam")} on={selected === "spam"} />
      </div>

      {selected && (
        <MemberList bucket={selected} label={label} onClose={() => setSelected(null)} onChanged={load} />
      )}

      <WeeksChart weeks={report.weeks} />

      <div className="pd-groups">
        {GROUPS.map((g) => (
          <GroupCard key={g.id} group={g} report={report} selected={selected} onPick={pick} />
        ))}
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Admins are left out of every number. Counted {new Date(report.generated_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.{" "}
        <button type="button" className="underline" onClick={load}>Count again</button> · Spam decisions and undo are in{" "}
        <Link href="/admin?s=moderation" className="underline">Moderation</Link>.
      </p>
    </div>
  );
}
