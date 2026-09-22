"use client";

import { useCallback, useEffect, useState } from "react";

interface Row {
  key: string | null;
  label: string;
  signups: number;
  onboarded: number;
  wrote: number;
  trials: number;
  paying: number;
}

interface Recent {
  username: string;
  joined: string;
  heard_from: string | null;
  heard_from_detail: string | null;
  referrer_host: string | null;
  ref: string | null;
  landing_path: string | null;
  invited: boolean;
  fediverse_login: boolean;
  onboarded: boolean;
  wrote: boolean;
  trial: boolean;
  paying: boolean;
}

interface Report {
  days: number | null;
  totals: Row;
  tracked: number;
  answered: number;
  invited: number;
  by_heard_from: Row[];
  by_referrer: Row[];
  by_ref: Row[];
  by_landing: Row[];
  other_answers: string[];
  recent: Recent[];
}

const RANGES = [
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" },
  { id: "365", label: "1 year" },
  { id: "all", label: "All time" },
];

function utc(iso: string) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
}

function pct(n: number, of: number) {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "–";
}

const card = { borderColor: "var(--border)", background: "var(--surface)" };

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border p-4" style={card}>
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

function SourceTable({ title, hint, rows }: { title: string; hint: string; rows: Row[] }) {
  return (
    <section className="rounded-xl border p-4" style={card}>
      <h2 className="font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>{title}</h2>
      <p className="text-xs mt-0.5 mb-3" style={{ color: "var(--muted)" }}>{hint}</p>
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>No signups in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--muted)" }}>
                <th className="py-1.5 pr-3 font-medium">Source</th>
                <th className="py-1.5 px-2 font-medium text-right">Signups</th>
                <th className="py-1.5 px-2 font-medium text-right">Finished setup</th>
                <th className="py-1.5 px-2 font-medium text-right">Wrote</th>
                <th className="py-1.5 px-2 font-medium text-right">Tried Plus</th>
                <th className="py-1.5 pl-2 font-medium text-right">Paying</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 pr-3 min-w-[9rem] break-words" style={{ color: r.key ? "var(--foreground)" : "var(--muted)" }}>{r.label}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.signups}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.onboarded} <span style={{ color: "var(--muted)" }}>({pct(r.onboarded, r.signups)})</span></td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.wrote} <span style={{ color: "var(--muted)" }}>({pct(r.wrote, r.signups)})</span></td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.trials}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums font-semibold" style={{ color: r.paying ? "var(--success)" : undefined }}>{r.paying}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "good" }) {
  return (
    <span className="rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap"
      style={{ borderColor: tone ? "var(--success)" : "var(--border)", color: tone ? "var(--success)" : "var(--muted)" }}>
      {children}
    </span>
  );
}

export default function GrowthPanel() {
  const [range, setRange] = useState("90");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/growth?days=${range}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't load");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const t = data?.totals;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm max-w-2xl" style={{ color: "var(--muted)" }}>
          Which sources turn into writers and paying members. Spam accounts that were suspended are left out.
          Add <code>?ref=something</code> to any link you share
          (e.g. <code>inkwell.social/switch/substack?ref=reddit-substack</code>) to see it here as its own row.
        </p>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)}
              className="rounded-full border px-3 py-1 text-xs"
              style={{
                borderColor: range === r.id ? "var(--accent)" : "var(--border)",
                background: range === r.id ? "var(--accent-light)" : "transparent",
                color: range === r.id ? "var(--accent)" : "var(--foreground)",
              }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
      {loading && !data && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>}

      {data && t && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
            <Stat label="Signups" value={t.signups} sub={`${data.invited} from an invite`} />
            <Stat label="Finished setup" value={pct(t.onboarded, t.signups)} sub={`${t.onboarded} people`} />
            <Stat label="Wrote something" value={pct(t.wrote, t.signups)} sub={`${t.wrote} people`} />
            <Stat label="Tried Plus" value={t.trials} sub="free trial started" />
            <Stat label="Paying" value={t.paying} sub="Plus or Founding" />
          </div>

          {(data.tracked < t.signups || data.answered < t.signups) && (
            <p className="text-xs rounded-lg border px-3 py-2" style={{ ...card, color: "var(--muted)" }}>
              Source tracking started on 19 September 2026. {data.tracked} of {t.signups} signups in this period
              have first-visit data and {data.answered} answered &ldquo;How did you find Inkwell?&rdquo;.
              Older accounts show up as &ldquo;No referring site&rdquo; / &ldquo;Didn&apos;t answer&rdquo;.
            </p>
          )}

          <div className="grid gap-4 2xl:grid-cols-2">
            <SourceTable title="What they told us" hint="The optional question during signup." rows={data.by_heard_from} />
            <SourceTable title="Referring site" hint="The site that linked them to their first Inkwell page." rows={data.by_referrer} />
            <SourceTable title="Landing page" hint="Their first Inkwell page. Writer rows show whose posts bring people in." rows={data.by_landing} />
            <SourceTable title="Link tag (?ref=)" hint="Tags you added to links you shared." rows={data.by_ref} />
          </div>

          {data.other_answers.length > 0 && (
            <section className="rounded-xl border p-4" style={card}>
              <h2 className="font-semibold mb-2" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>&ldquo;Something else&rdquo; answers</h2>
              <ul className="text-sm list-disc pl-5 flex flex-col gap-1">
                {data.other_answers.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </section>
          )}

          <section className="rounded-xl border p-4" style={card}>
            <h2 className="font-semibold mb-3" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>Recent signups</h2>
            <div className="flex flex-col">
              {data.recent.map((r) => (
                <div key={r.username} className="border-t py-2 flex flex-col gap-1 text-sm" style={{ borderColor: "var(--border)" }}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <a href={`/${r.username}`} className="font-medium hover:underline">@{r.username}</a>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>{utc(r.joined).toLocaleDateString()}</span>
                    {r.paying && <Tag tone="good">paying</Tag>}
                    {!r.paying && r.trial && <Tag>trial</Tag>}
                    {r.wrote && <Tag>wrote</Tag>}
                    {!r.onboarded && <Tag>setup unfinished</Tag>}
                    {r.invited && <Tag>invited</Tag>}
                    {r.fediverse_login && <Tag>fediverse login</Tag>}
                  </div>
                  <div className="text-xs break-all" style={{ color: "var(--muted)" }}>
                    {[
                      r.heard_from && `said: ${r.heard_from}${r.heard_from_detail ? ` (${r.heard_from_detail})` : ""}`,
                      r.referrer_host && `from ${r.referrer_host}`,
                      r.ref && `ref=${r.ref}`,
                      r.landing_path && `landed on ${r.landing_path}`,
                    ].filter(Boolean).join(" · ") || "No source data"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
