"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { JourneyBars, SignupsChart, SourceBars, type Bucket, type Family, type SourceRow } from "../growth/growth-charts";
import {
  FAMILY_COLOR,
  FAMILY_HELP,
  KNOWN,
  pct,
  plural,
  rawFields,
  shortDate,
  story,
  type Recent,
} from "../growth/growth-words";
import { getSite, siteUrl } from "@/lib/site";

interface Row {
  key: string | null;
  label: string;
  signups: number;
  onboarded: number;
  wrote: number;
  trials: number;
  paying: number;
}

interface Report {
  days: number | null;
  bucket: "day" | "week";
  tracking_started: string;
  families: Family[];
  totals: Row;
  previous: Row | null;
  tracked: number;
  answered: number;
  invited: number;
  held_back: number;
  suspended: number;
  by_source: SourceRow[];
  timeline: Bucket[];
  by_heard_from: Row[];
  by_referrer: Row[];
  by_ref: Row[];
  by_landing: Row[];
  other_answers: string[];
  recent: Recent[];
}

// `before` finishes "than the … before".
const RANGES = [
  { id: "7", label: "7 days", words: "the last 7 days", before: "7 days" },
  { id: "30", label: "30 days", words: "the last 30 days", before: "30 days" },
  { id: "90", label: "90 days", words: "the last 90 days", before: "90 days" },
  { id: "365", label: "1 year", words: "the last year", before: "year" },
  { id: "all", label: "All time", words: "all time", before: "" },
];

const FILTERS = [
  { id: "all", label: "Everyone" },
  { id: "wrote", label: "Wrote something" },
  { id: "unfinished", label: "Didn't finish setup" },
  { id: "spam", label: "Possible spam" },
];

const serif = { fontFamily: "var(--font-lora, Georgia, serif)" };

function Card({ title, hint, children, id }: { title: string; hint?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h2 className="font-semibold text-base" style={serif}>{title}</h2>
      {hint && <p className="text-xs mt-0.5 mb-4" style={{ color: "var(--muted)" }}>{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

/** "↑ 12 more than the 30 days before" (or nothing when there's no comparison). */
function Delta({ now, before, unit = "", period }: { now: number; before: number | null; unit?: string; period: string }) {
  if (before === null) return null;
  const diff = now - before;
  if (diff === 0) return <span style={{ color: "var(--muted)" }}>Same as the {period} before</span>;
  const up = diff > 0;
  return (
    <span style={{ color: up ? "var(--success)" : "var(--muted)" }}>
      {up ? "↑" : "↓"} {Math.abs(diff)}{unit} {up ? "more" : "fewer"} than the {period} before
    </span>
  );
}

function Stat({ label, value, sub, delta }: { label: string; value: string | number; sub?: string; delta?: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="text-3xl font-semibold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{sub}</div>}
      {delta && <div className="text-xs mt-1">{delta}</div>}
    </div>
  );
}

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <span className="gr-step" data-done={done || undefined}>
      <span aria-hidden>{done ? "✓" : "–"}</span> {children}
    </span>
  );
}

function SourceTable({ title, hint, rows }: { title: string; hint: string; rows: Row[] }) {
  return (
    <div>
      <h3 className="font-semibold text-sm" style={serif}>{title}</h3>
      <p className="text-xs mt-0.5 mb-2" style={{ color: "var(--muted)" }}>{hint}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--muted)" }}>
              <th className="py-1.5 pr-3 font-medium">Value</th>
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
    </div>
  );
}

/** Builds a tagged link to share, so it shows up here as its own source. */
function LinkBuilder() {
  const [tag, setTag] = useState("");
  const [page, setPage] = useState("");
  const [copied, setCopied] = useState(false);
  const clean = tag.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 64);
  const path = page.trim().replace(/^https?:\/\/(www\.)?inkwell\.social/i, "").replace(/^\/?/, "/");
  const url = `${siteUrl(path === "/" ? "/" : path)}${clean ? `?ref=${clean}` : ""}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked: the link is on screen to copy by hand
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs flex flex-col gap-1" style={{ color: "var(--muted)" }}>
          Tag (where you&apos;re posting it)
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="reddit-writing"
            className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }} />
        </label>
        <label className="text-xs flex flex-col gap-1" style={{ color: "var(--muted)" }}>
          Page (optional)
          <input value={page} onChange={(e) => setPage(e.target.value)} placeholder="/switch/substack"
            className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-xs rounded-lg border px-3 py-2 break-all flex-1 min-w-0" style={{ borderColor: "var(--border)", background: "var(--background)" }}>{url}</code>
        <button type="button" onClick={copy} disabled={!clean}
          className="rounded-full border px-4 py-2 text-xs font-medium disabled:opacity-50"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

export default function GrowthPanel() {
  const [range, setRange] = useState("30");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [filter, setFilter] = useState("all");
  const [pickedSource, setPickedSource] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/growth?days=${range}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't load");
      setData(json);
      setLoadedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPickedSource(null); }, [range]);

  const rangeInfo = RANGES.find((r) => r.id === range)!;
  const period = rangeInfo.before;
  const t = data?.totals;
  const prev = data?.previous ?? null;

  // Sources we measured (a link or a site), then what people told us.
  const measured = useMemo(
    () => (data?.by_source ?? []).filter((s) => KNOWN(s.family) && !s.key.startsWith("said:")),
    [data],
  );
  const toldUs = useMemo(
    () => (data?.by_source ?? []).filter((s) => s.key.startsWith("said:")).reduce((n, s) => n + s.signups, 0),
    [data],
  );
  const lastDay = useMemo(() => {
    if (!data) return 0;
    const since = Date.now() - 86_400_000;
    return data.recent.filter((r) => new Date(/[zZ]$/.test(r.joined) ? r.joined : `${r.joined}Z`).getTime() >= since).length;
  }, [data]);

  const recent = useMemo(() => {
    if (!data) return [];
    return data.recent.filter((r) => {
      if (pickedSource && r.source.key !== pickedSource) return false;
      if (filter === "wrote") return r.wrote;
      if (filter === "unfinished") return !r.onboarded;
      if (filter === "spam") return r.limited;
      return true;
    });
  }, [data, filter, pickedSource]);

  const pickedLabel = data?.by_source.find((s) => s.key === pickedSource)?.label;

  function pickSource(key: string | null) {
    setPickedSource(key);
    // After the list re-renders, so the jump lands on the filtered list.
    if (key) setTimeout(() => document.getElementById("gr-recent")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  return (
    <div className="gr-root flex flex-col gap-6">
      {/* Range + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm max-w-xl" style={{ color: "var(--muted)" }}>
          Spam accounts that were suspended aren&apos;t counted. Hover anything for what it means, or read{" "}
          <a href="#gr-words" className="underline">what the words mean</a>.
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)}
              className="rounded-full border px-3 py-1 text-xs"
              aria-pressed={range === r.id}
              style={{
                borderColor: range === r.id ? "var(--accent)" : "var(--border)",
                background: range === r.id ? "var(--accent-light)" : "transparent",
                color: range === r.id ? "var(--accent)" : "var(--foreground)",
              }}>
              {r.label}
            </button>
          ))}
          <button onClick={load} disabled={loading} className="rounded-full border px-3 py-1 text-xs ml-1"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            title={loadedAt ? `Updated ${loadedAt.toLocaleTimeString()}` : undefined}>
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
      {loading && !data && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>}

      {data && t && (
        <>
          {/* The short version */}
          <section className="gr-summary rounded-xl border p-4 sm:p-5">
            <h2 className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--muted)" }}>The short version</h2>
            <ul className="flex flex-col gap-1.5 text-[15px] leading-relaxed" style={serif}>
              <li>
                <strong>{plural(t.signups, "person", "people")}</strong>{" "}
                {range === "all" ? "have signed up so far" : <>signed up in {rangeInfo.words}</>}
                {prev && (
                  <> ({prev.signups === t.signups ? "the same as" : t.signups > prev.signups ? `up from ${prev.signups}` : `down from ${prev.signups}`} the {period} before)</>
                )}
                {lastDay > 0 ? <>, <strong>{lastDay}</strong> of them in the last 24 hours.</> : "."}
              </li>
              {measured.length > 0 ? (
                <li>
                  The biggest sources we can see:{" "}
                  {measured.slice(0, 3).map((s, i, arr) => (
                    <span key={s.key}>
                      <strong>{s.label}</strong> ({s.signups})
                      {i < arr.length - 2 ? ", " : i === arr.length - 2 ? " and " : ""}
                    </span>
                  ))}
                  .{toldUs > 0 && <> {plural(toldUs, "other")} left no trail but told us how they found Inkwell.</>}
                </li>
              ) : toldUs > 0 ? (
                <li>No links we can trace, but {toldUs} told us how they found Inkwell.</li>
              ) : (
                <li>None of them left a trail we can follow.</li>
              )}
              <li>
                <strong>{pct(t.wrote, t.signups)}</strong> have written something so far
                {t.paying > 0 ? <>, and <strong>{t.paying}</strong> {t.paying === 1 ? "is" : "are"} paying.</> : ". Nobody from this period is paying yet."}
              </li>
              {(data.suspended > 0 || data.held_back > 0) && (
                <li style={{ color: "var(--muted)" }}>
                  {data.suspended > 0 && <>{plural(data.suspended, "spam account")} {data.suspended === 1 ? "was" : "were"} suspended and {data.suspended === 1 ? "isn't" : "aren't"} counted. </>}
                  {data.held_back > 0 && <>{data.held_back} more {data.held_back === 1 ? "looks" : "look"} suspicious and {data.held_back === 1 ? "is" : "are"} kept out of Explore (counted, marked “possible spam” below).</>}
                </li>
              )}
            </ul>
          </section>

          {/* Stat tiles */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Stat label="New signups" value={t.signups}
              sub={data.invited > 0 ? `${data.invited} from an invite` : undefined}
              delta={<Delta now={t.signups} before={prev?.signups ?? null} period={period} />} />
            <Stat label="Finished setup" value={pct(t.onboarded, t.signups)} sub={`${t.onboarded} people`}
              delta={prev && prev.signups > 0 ? <span style={{ color: "var(--muted)" }}>{pct(prev.onboarded, prev.signups)} the {period} before</span> : undefined} />
            <Stat label="Wrote something" value={pct(t.wrote, t.signups)} sub={`${t.wrote} people`}
              delta={prev && prev.signups > 0 ? <span style={{ color: "var(--muted)" }}>{pct(prev.wrote, prev.signups)} the {period} before</span> : undefined} />
            <Stat label="Paying" value={t.paying} sub={t.trials > 0 ? `${t.trials} tried the free trial` : "Plus or Founding"}
              delta={<Delta now={t.paying} before={prev?.paying ?? null} period={period} />} />
          </div>

          <Card title="New signups over time"
            hint={<>Each column is one {data.bucket} (UTC), coloured by where those people came from. Hover or tap a column for the breakdown.</>}>
            <SignupsChart timeline={data.timeline} families={data.families} bucket={data.bucket} trackingStarted={data.tracking_started} />
          </Card>

          <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
            <Card title="Where they came from"
              hint={<>Our best guess for each person, from the link they clicked, the site that sent them, or what they told us. Click a row to see those people below.</>}>
              {data.by_source.length === 0
                ? <p className="text-sm" style={{ color: "var(--muted)" }}>No signups in this period.</p>
                : <SourceBars rows={data.by_source} onPick={pickSource} picked={pickedSource} />}
            </Card>

            <Card title="What happened after they signed up"
              hint="Out of everyone who signed up in this period. Newer accounts have had less time to write.">
              <JourneyBars totals={t} />
            </Card>
          </div>

          <Card id="gr-recent" title="Recent signups"
            hint={data.recent.length < t.signups ? `The newest ${data.recent.length} of ${t.signups}.` : "Newest first."}>
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {FILTERS.map((f) => (
                <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
                  className="rounded-full border px-3 py-1 text-xs"
                  style={{
                    borderColor: filter === f.id ? "var(--accent)" : "var(--border)",
                    background: filter === f.id ? "var(--accent-light)" : "transparent",
                    color: filter === f.id ? "var(--accent)" : "var(--foreground)",
                  }}>
                  {f.label}
                </button>
              ))}
              {pickedSource && (
                <button onClick={() => setPickedSource(null)} className="rounded-full border px-3 py-1 text-xs"
                  style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                  From {pickedLabel} ✕
                </button>
              )}
            </div>

            {recent.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>Nobody matches.</p>
            ) : (
              <ul className="flex flex-col">
                {recent.map((r) => (
                  <li key={r.username} className="gr-person border-t py-3" style={{ borderColor: "var(--border)" }}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <a href={`/${r.username}`} className="font-medium hover:underline">@{r.username}</a>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>{shortDate(r.joined)}</span>
                      <span className="gr-chip" title={FAMILY_HELP[r.source.family]}>
                        <span className="gr-swatch" style={{ background: FAMILY_COLOR[r.source.family] }} aria-hidden />
                        {r.source.label}
                      </span>
                      {r.paying && <span className="gr-chip gr-chip-good">Paying</span>}
                      {r.limited && <span className="gr-chip gr-chip-warn" title="The spam filter limited this account: it's kept out of Explore until it behaves like a real writer.">Possible spam</span>}
                    </div>
                    <p className="text-sm mt-1" style={{ color: "var(--muted)" }} title={rawFields(r)}>{story(r)}</p>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs">
                      <Step done={r.onboarded}>Finished setup</Step>
                      <Step done={r.wrote}>Wrote something</Step>
                      <Step done={r.trial || r.paying}>{r.paying ? "Paying" : "Tried Plus"}</Step>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {data.other_answers.length > 0 && (
            <Card title="“Something else” answers" hint="What people typed when none of the choices fit.">
              <ul className="text-sm list-disc pl-5 flex flex-col gap-1">
                {data.other_answers.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </Card>
          )}

          <Card id="gr-words" title="What the words mean">
            <dl className="gr-words">
              <dt><span>Link tag (<code>ref=</code>)</span></dt>
              <dd>
                The label on the end of the link someone clicked, like <code>{getSite().host}/?ref=reddit</code>.
                You add these to links you share (use the box below). Some sites add their own:
                <strong> ChatGPT puts <code>utm_source=chatgpt.com</code> on every link it shows</strong>, so
                “ref=chatgpt.com” means that person clicked a link to Inkwell inside a ChatGPT answer.
              </dd>
              <dt>Referring site</dt>
              <dd>The website their browser says sent them. Many apps (email, Discord, iMessage, most phone apps) don&apos;t say, so those people show up as <em>Direct or hidden</em>.</dd>
              <dt>First page</dt>
              <dd>The first Inkwell page they saw. If it&apos;s a writer&apos;s post, that writer&apos;s work brought them in.</dd>
              <dt>They told us</dt>
              <dd>The optional “How did you find Inkwell?” question during signup. Useful for word of mouth, but people guess, so a link tag or referring site wins when both exist.</dd>
              <dt>Before tracking began</dt>
              <dd>Accounts made before 19 September 2026, when Inkwell started recording any of this.</dd>
              <dt>Possible spam</dt>
              <dd>The spam filter limited the account (kept out of Explore). They&apos;re still counted here because some turn out to be real writers.</dd>
              {data.families.map((f) => (
                <div key={f.key} className="contents">
                  <dt><span className="gr-swatch" style={{ background: FAMILY_COLOR[f.key] }} aria-hidden /> {f.label}</dt>
                  <dd>{FAMILY_HELP[f.key]}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="Make a tracked link" hint="Share this instead of a plain link and anyone who signs up from it gets its own row under “Where they came from”.">
            <LinkBuilder />
          </Card>

          <details className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <summary className="cursor-pointer font-semibold text-base" style={serif}>The raw numbers</summary>
            <p className="text-xs mt-1 mb-4" style={{ color: "var(--muted)" }}>
              Each signal on its own, before they&apos;re combined into one answer per person.
              {" "}{data.tracked} of {t.signups} signups here have link data and {data.answered} answered the question.
            </p>
            <div className="grid gap-6 2xl:grid-cols-2">
              <SourceTable title="What they told us" hint="The optional question during signup." rows={data.by_heard_from} />
              <SourceTable title="Referring site" hint="The site that linked them to their first Inkwell page." rows={data.by_referrer} />
              <SourceTable title="First page" hint="Writer rows show whose posts bring people in." rows={data.by_landing} />
              <SourceTable title="Link tag (?ref= or utm_source=)" hint="Tags on the link they clicked." rows={data.by_ref} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
