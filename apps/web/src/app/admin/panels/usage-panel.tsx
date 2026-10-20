"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Admin → Usage: which features people use, so the unused ones can go.
 * Numbers come from GET /api/admin/usage (Inkwell.Usage.report/1): features
 * that leave rows (entries, stamps…) are counted from their tables, the rest
 * from `trackFeature()` / server-side recording. Admins and suspended
 * accounts are left out.
 */

type Status = "retire" | "quiet" | "used" | "new" | "counting" | "error";

interface Feature {
  key: string;
  label: string;
  group: string;
  how: "db" | "state" | "tracked";
  core: boolean;
  added: string | null;
  status: Status;
  people_7?: number;
  people_30?: number;
  people_90?: number;
  people_ever?: number;
  people_prev_90?: number;
  people_now?: number;
  visitor_days_7?: number;
  visitor_days_30?: number;
  visitor_days_90?: number;
  uses_90?: number;
  last_used?: string | null;
  trend?: number[];
  actions?: { action: string; detail: string; people: number; uses: number }[];
  members?: Member[];
  error?: string;
}

interface Member {
  username: string;
  display_name: string | null;
  first_used: string;
  last_used: string;
  days_used: number;
  progress: Record<string, number>;
}

interface Report {
  today: string;
  tracking_started: string;
  weeks: string[];
  groups: { key: string; label: string }[];
  members: { total: number; active_30: number };
  features: Feature[];
}

const serif = { fontFamily: "var(--font-lora, Georgia, serif)" };

const STATUS: Record<Status, { label: string; color: string; help: string }> = {
  retire: { label: "Retire?", color: "var(--warning)", help: "Two people or fewer in the last 90 days, and no more in the 90 before." },
  quiet: { label: "Quiet", color: "var(--muted)", help: "Five people or fewer in the last 90 days." },
  used: { label: "Used", color: "var(--success)", help: "More than five people in the last 90 days." },
  new: { label: "New", color: "var(--accent)", help: "Arrived in the last 90 days: too soon to judge." },
  counting: { label: "Counting", color: "var(--accent)", help: "Counted on the site, and counting started under 30 days ago." },
  error: { label: "Error", color: "var(--danger)", help: "This number couldn't be worked out." },
};

const HOW: Record<Feature["how"], string> = {
  db: "from what people saved",
  state: "a setting people have on",
  tracked: "counted on the site",
};

function plural(n: number, one: string, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}

function shortDate(iso: string | null | undefined) {
  if (!iso) return "never";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The number that decides the sort: people in 90 days (or with it on now), plus signed-out visitor-days. */
function reach(f: Feature) {
  return (f.people_90 ?? f.people_now ?? 0) + (f.visitor_days_90 ?? 0);
}

function Card({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h2 className="font-semibold text-base" style={serif}>{title}</h2>
      {hint ? <p className="text-xs mt-0.5 mb-4" style={{ color: "var(--muted)" }}>{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function Spark({ values, weeks }: { values: number[]; weeks: string[] }) {
  const max = Math.max(1, ...values);
  const w = 84;
  const h = 22;
  const step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  const label = `People per week, last ${values.length} weeks: ${values.join(", ")}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <title>{values.map((v, i) => `${shortDate(weeks[i])}: ${v}`).join("\n")}</title>
      <line x1="0" y1={h - 2} x2={w} y2={h - 2} stroke="var(--border)" strokeWidth="1" />
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function StatusChip({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span
      title={s.help}
      className="inline-block text-[11px] font-semibold rounded-full px-2 py-0.5 border whitespace-nowrap"
      style={{ borderColor: s.color, color: s.color }}
    >
      {s.label}
    </span>
  );
}

/** "3 people in 90 days · last used Apr 18, 2026" */
function oneLine(f: Feature): string {
  if (f.error) return "Couldn't count this one.";
  if (f.how === "state") return `${plural(f.people_now ?? 0, "person has", "people have")} it on now`;
  const parts = [`${plural(f.people_90 ?? 0, "member")} in 90 days`];
  if (f.visitor_days_90) parts.push(`${plural(f.visitor_days_90, "signed-out visit")}`);
  if (f.people_ever != null && f.how === "db") parts.push(`${f.people_ever} ever`);
  parts.push(`last used ${shortDate(f.last_used)}`);
  return parts.join(" · ");
}

function Num({ n, visitors }: { n?: number; visitors?: number }) {
  return (
    <span className="tabular-nums">
      {n ?? 0}
      {visitors ? (
        <span className="block text-[11px]" style={{ color: "var(--muted)" }} title="Signed-out visitor-days">
          +{visitors} out
        </span>
      ) : null}
    </span>
  );
}

/** "letter delivered ×5 (hard 2, easy 3)" from a member's steps. */
function progressWords(p: Record<string, number>) {
  return Object.entries(p)
    .filter(([k]) => !k.includes(":"))
    .map(([step, n]) => {
      const byLevel = Object.entries(p)
        .filter(([k]) => k.startsWith(step + ":"))
        .map(([k, v]) => `${k.slice(step.length + 1)} ${v}`);
      return `${step.replace(/_/g, " ")} ×${n}${byLevel.length ? ` (${byLevel.join(", ")})` : ""}`;
    })
    .join(" · ");
}

function MemberList({ members }: { members: Member[] }) {
  if (members.length === 0) return <p className="text-xs" style={{ color: "var(--muted)" }}>No members yet.</p>;
  return (
    <ul className="text-xs divide-y" style={{ borderColor: "var(--border)" }}>
      {members.map((m) => (
        <li key={m.username} className="py-1.5 flex flex-wrap gap-x-2 gap-y-0.5 items-baseline" style={{ borderColor: "var(--border)" }}>
          <a href={`/${m.username}`} className="font-medium underline-offset-2 hover:underline" style={{ color: "var(--foreground)" }}>
            {m.display_name || m.username}
          </a>
          <span style={{ color: "var(--muted)" }}>@{m.username}</span>
          <span style={{ color: "var(--muted)" }}>
            · {plural(m.days_used, "day")} · {m.first_used === m.last_used ? shortDate(m.last_used) : `${shortDate(m.first_used)} – ${shortDate(m.last_used)}`}
          </span>
          {Object.keys(m.progress ?? {}).length > 0 && (
            <span className="w-full sm:w-auto" style={{ color: "var(--foreground)" }}>{progressWords(m.progress)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function FeatureRow({ f, weeks, groupLabel }: { f: Feature; weeks: string[]; groupLabel: string }) {
  const [open, setOpen] = useState(false);
  const hasActions = (f.actions?.length ?? 0) > 0;
  const [whoOpen, setWhoOpen] = useState(false);
  const members = f.members ?? [];

  return (
    <li className="usage-row border-t py-3" style={{ borderColor: "var(--border)" }}>
      <div className="usage-row-grid">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{f.label}</span>
            <StatusChip status={f.status} />
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
            {groupLabel} · {HOW[f.how]}
            {f.added ? ` · added ${shortDate(f.added)}` : ""}
          </div>
        </div>

        {f.how === "state" ? (
          <div className="usage-state text-sm" style={{ color: "var(--muted)" }}>
            <strong className="tabular-nums" style={{ color: "var(--foreground)" }}>{f.people_now ?? 0}</strong> have it on now
          </div>
        ) : f.error ? (
          <div className="usage-state text-sm" style={{ color: "var(--danger)" }}>{f.error}</div>
        ) : (
          <>
            <div className="usage-num text-sm"><span className="usage-num-label">7 days</span><Num n={f.people_7} visitors={f.visitor_days_7} /></div>
            <div className="usage-num text-sm"><span className="usage-num-label">30 days</span><Num n={f.people_30} visitors={f.visitor_days_30} /></div>
            <div className="usage-num text-sm"><span className="usage-num-label">90 days</span><Num n={f.people_90} visitors={f.visitor_days_90} /></div>
            <div className="usage-num text-sm" title={f.how === "db" ? `${f.people_prev_90 ?? 0} in the 90 days before` : undefined}>
              <span className="usage-num-label">Ever</span>
              <span className="tabular-nums">{f.people_ever ?? 0}</span>
            </div>
            <div className="usage-spark">{f.trend && <Spark values={f.trend} weeks={weeks} />}</div>
            <div className="usage-last text-xs" style={{ color: "var(--muted)" }}>{shortDate(f.last_used)}</div>
          </>
        )}
      </div>

      {f.how === "tracked" && members.length > 0 && (
        <div className="mt-2">
          <button type="button" className="text-xs underline" style={{ color: "var(--accent)" }} onClick={() => setWhoOpen((v) => !v)} aria-expanded={whoOpen}>
            {whoOpen ? "Hide who" : `Who (${members.length}${members.length >= 50 ? "+" : ""})`}
          </button>
          {whoOpen && <div className="mt-2"><MemberList members={members} /></div>}
        </div>
      )}

      {hasActions && (
        <div className="mt-2">
          <button type="button" className="text-xs underline" style={{ color: "var(--accent)" }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Hide steps" : "Steps in the last 30 days"}
          </button>
          {open && (
            <ul className="mt-2 text-xs space-y-1" style={{ color: "var(--muted)" }}>
              {f.actions!.map((a) => (
                <li key={a.action + a.detail}>
                  <span style={{ color: "var(--foreground)" }}>{a.action.replace(/_/g, " ")}</span>
                  {a.detail ? ` (${a.detail})` : ""}: {plural(a.people, "person-day")}, {plural(a.uses, "time")}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export default function UsagePanel() {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"least" | "area">("least");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/usage", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't load");
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groupLabel = useMemo(() => new Map((data?.groups ?? []).map((g) => [g.key, g.label])), [data]);

  const sorted = useMemo(() => {
    const list = [...(data?.features ?? [])];
    if (sort === "least") {
      // Ties: candidates before features that are too new to judge.
      const rank: Record<Status, number> = { error: 0, retire: 1, quiet: 2, used: 3, counting: 4, new: 5 };
      return list.sort(
        (a, b) =>
          reach(a) - reach(b) ||
          rank[a.status] - rank[b.status] ||
          (a.people_ever ?? 0) - (b.people_ever ?? 0) ||
          a.label.localeCompare(b.label),
      );
    }
    const order = (data?.groups ?? []).map((g) => g.key);
    return list.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || reach(b) - reach(a));
  }, [data, sort]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { retire: 0, quiet: 0, used: 0, new: 0, counting: 0, error: 0 };
    for (const f of data?.features ?? []) c[f.status]++;
    return c;
  }, [data]);

  const candidates = sorted.filter((f) => f.status === "retire");
  const game = data?.features.find((f) => f.key === "play");

  if (loading && !data) return <p className="text-sm" style={{ color: "var(--muted)" }}>Counting…</p>;
  if (error && !data) {
    return (
      <div className="text-sm">
        <p style={{ color: "var(--danger)" }}>{error}</p>
        <button type="button" className="underline mt-2" onClick={load}>Try again</button>
      </div>
    );
  }
  if (!data) return null;

  const total = data.features.length;
  const trackingDays = Math.round((Date.parse(data.today) - Date.parse(data.tracking_started)) / 86_400_000);

  return (
    <div className="space-y-5">
      <Card
        title="The short version"
        hint={`Not counting admins or suspended accounts. ${data.members.total} members, ${data.members.active_30} active in the last 30 days.`}
      >
        <p className="text-sm leading-relaxed" style={serif}>
          Of {total} features, <strong>{counts.used}</strong> {counts.used === 1 ? "is" : "are"} used by more than five people over 90 days
          and <strong>{counts.quiet}</strong> by a handful.{" "}
          {counts.retire > 0 ? (
            <>
              <strong>{plural(counts.retire, "feature")}</strong> {counts.retire === 1 ? "has" : "have"} been used by two people or fewer in 90 days:
              those are the retirement candidates below.
            </>
          ) : (
            <>Nothing is unused enough to call a retirement candidate.</>
          )}{" "}
          {counts.new > 0 && <>{plural(counts.new, "feature")} arrived too recently to judge. </>}
          {counts.counting > 0 && (
            <>
              {plural(counts.counting, "feature")} only show up when someone opens a page or presses a button, and counting those started{" "}
              {trackingDays <= 0 ? "today" : `${plural(trackingDays, "day")} ago`} ({shortDate(data.tracking_started)}), so give them a month.
            </>
          )}
        </p>
      </Card>

      {game && (
        <Card
          title="Who's playing the Dead Letter Office"
          hint={`Members who've played, most days first, with what they did on each level. Signed-out players can't be listed, since we don't know who they are (${plural(game.visitor_days_30 ?? 0, "signed-out visit")} in the last 30 days).`}
        >
          <MemberList members={game.members ?? []} />
        </Card>
      )}

      {candidates.length > 0 && (
        <Card title="Retirement candidates" hint="Two people or fewer in the last 90 days, and no busier in the 90 before. Retiring is your call: this only says nobody's using them.">
          <ul className="space-y-2">
            {candidates.map((f) => (
              <li key={f.key} className="text-sm">
                <span className="font-medium">{f.label}</span>
                <span style={{ color: "var(--muted)" }}> · {groupLabel.get(f.group)} · {oneLine(f)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Every feature"
        hint="People in each period. Members are counted once however often they use something; signed-out visitors (“out”) are counted once a day, so theirs are visits, not people. The line is people per week over 12 weeks."
      >
        <div className="flex items-center gap-2 mb-2 text-xs">
          <span style={{ color: "var(--muted)" }}>Sort:</span>
          {(["least", "area"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              aria-pressed={sort === s}
              className="rounded-full border px-2.5 py-1"
              style={{
                borderColor: sort === s ? "var(--accent)" : "var(--border)",
                color: sort === s ? "var(--accent)" : "var(--foreground)",
              }}
            >
              {s === "least" ? "Least used first" : "By area"}
            </button>
          ))}
          <button type="button" onClick={load} className="ml-auto underline" style={{ color: "var(--muted)" }} disabled={loading}>
            {loading ? "Counting…" : "Refresh"}
          </button>
        </div>

        <div className="usage-row-grid usage-head text-[11px] uppercase tracking-wide pb-1" style={{ color: "var(--muted)" }}>
          <span>Feature</span><span>7 days</span><span>30 days</span><span>90 days</span><span>Ever</span><span>12 weeks</span><span>Last used</span>
        </div>
        <ul>
          {sorted.map((f) => (
            <FeatureRow key={f.key} f={f} weeks={data.weeks} groupLabel={groupLabel.get(f.group) ?? f.group} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
