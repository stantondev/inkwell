"use client";

import { useRef, useState } from "react";
import { FAMILY_COLOR, FAMILY_HELP, KNOWN, pct, plural, shortDate } from "./growth-words";

export interface Family {
  key: string;
  label: string;
}

export interface Bucket {
  date: string;
  signups: number;
  onboarded: number;
  wrote: number;
  by_family: Record<string, number>;
}

export interface SourceRow {
  key: string;
  label: string;
  family: string;
  signups: number;
  onboarded: number;
  wrote: number;
  trials: number;
  paying: number;
}

const HEIGHT = 180;

function niceMax(n: number): number {
  if (n <= 4) return Math.max(1, n);
  const step = n <= 10 ? 2 : n <= 25 ? 5 : n <= 50 ? 10 : 20;
  return Math.ceil(n / step) * step;
}

/** Swatch + name. Hover (or focus) for what the family means. */
export function Legend({ families, present }: { families: Family[]; present: Set<string> }) {
  const shown = families.filter((f) => present.has(f.key));
  return (
    <ul className="gr-legend" aria-label="Colour key">
      {shown.map((f) => (
        <li key={f.key} title={FAMILY_HELP[f.key]}>
          <span className="gr-swatch" style={{ background: FAMILY_COLOR[f.key] }} aria-hidden />
          {f.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * New signups per day (or week), each column split by where those people
 * came from. Hover, tap or focus a column for the breakdown.
 */
export function SignupsChart({
  timeline,
  families,
  bucket,
  trackingStarted,
}: {
  timeline: Bucket[];
  families: Family[];
  bucket: "day" | "week";
  trackingStarted: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...timeline.map((b) => b.signups)));
  const total = timeline.reduce((n, b) => n + b.signups, 0);
  const present = new Set(timeline.flatMap((b) => Object.keys(b.by_family)));
  const gap = timeline.length > 60 ? 1 : 2;

  // Where the "tracking began" line goes (the first bucket on or after it).
  const trackIdx = timeline.findIndex((b) => b.date >= trackingStarted);
  const showTrack = trackIdx > 0;

  const current = active !== null ? timeline[active] : null;
  const label = (b: Bucket) =>
    bucket === "week" ? `Week of ${shortDate(b.date)}` : shortDate(b.date);

  // The tooltip sits beside the column where there's room (so it doesn't
  // hide the column), otherwise above the bars, kept inside the chart.
  const areaRef = useRef<HTMLDivElement>(null);
  const TIP_W = 220;
  let tipStyle: React.CSSProperties = {};
  if (active !== null) {
    const width = areaRef.current?.clientWidth ?? 600;
    const x = ((active + 0.5) / timeline.length) * width;
    if (x + 14 + TIP_W <= width) tipStyle = { left: x + 14 };
    else if (x - 14 - TIP_W >= 0) tipStyle = { left: x - 14 - TIP_W };
    else tipStyle = { left: Math.min(Math.max(0, x - TIP_W / 2), Math.max(0, width - TIP_W)) };
  }

  return (
    <div className="gr-chart">
      <div className="gr-plot" style={{ height: HEIGHT }}>
       <div className="gr-area" ref={areaRef}>
        {/* Gridlines: 0, half, max */}
        {[0, 0.5, 1].map((f) => (
          <div key={f} className="gr-grid" style={{ bottom: `${f * 100}%` }}>
            <span>{Math.round(max * f)}</span>
          </div>
        ))}

        {showTrack && (
          <div
            className="gr-track-line"
            data-flip={trackIdx / timeline.length > 0.75 || undefined}
            style={{ left: `${(trackIdx / timeline.length) * 100}%` }}
            title="Inkwell started recording where people come from on 19 September 2026"
          >
            <span>Tracking began</span>
          </div>
        )}

        <div
          className="gr-columns"
          style={{ gap }}
          onMouseLeave={() => setActive(null)}
          role="group"
          aria-label={`New signups per ${bucket}, ${total} in total`}
        >
          {timeline.map((b, i) => (
            <button
              type="button"
              key={b.date}
              className="gr-col"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => setActive((a) => (a === i ? null : i))}
              aria-label={`${label(b)}: ${plural(b.signups, "signup")}`}
            >
              <span
                className="gr-stack"
                style={{
                  height: `${(b.signups / max) * 100}%`,
                  opacity: active === null || active === i ? 1 : 0.4,
                }}
              >
                {families
                  .filter((f) => b.by_family[f.key])
                  .map((f) => (
                    <span
                      key={f.key}
                      className="gr-seg"
                      style={{ flexGrow: b.by_family[f.key], background: FAMILY_COLOR[f.key] }}
                    />
                  ))}
              </span>
            </button>
          ))}
        </div>

        {current && (
          <div className="gr-tip" style={{ ...tipStyle, width: TIP_W }} role="status">
            <div className="gr-tip-title">
              {label(current)} · {plural(current.signups, "signup")}
            </div>
            {current.signups === 0 ? (
              <div className="gr-tip-row">Nobody new.</div>
            ) : (
              <>
                {families
                  .filter((f) => current.by_family[f.key])
                  .map((f) => (
                    <div key={f.key} className="gr-tip-row">
                      <span className="gr-swatch" style={{ background: FAMILY_COLOR[f.key] }} aria-hidden />
                      <span className="gr-tip-name">{f.label}</span>
                      <span className="gr-tip-num">{current.by_family[f.key]}</span>
                    </div>
                  ))}
                <div className="gr-tip-foot">
                  {current.onboarded} finished setup · {current.wrote} wrote something
                </div>
              </>
            )}
          </div>
        )}
       </div>
      </div>

      <div className="gr-axis">
        <span>{timeline[0] && shortDate(timeline[0].date)}</span>
        {timeline.length > 6 && <span>{shortDate(timeline[Math.floor(timeline.length / 2)].date)}</span>}
        <span>{timeline.length > 0 && (bucket === "day" ? "Today" : shortDate(timeline[timeline.length - 1].date))}</span>
      </div>

      <Legend families={families} present={present} />

      <details className="gr-table-toggle">
        <summary>Show as a table</summary>
        <table>
          <thead>
            <tr>
              <th>{bucket === "week" ? "Week of" : "Day"}</th>
              <th>Signups</th>
              <th>Finished setup</th>
              <th>Wrote</th>
              <th>Where from</th>
            </tr>
          </thead>
          <tbody>
            {timeline
              .filter((b) => b.signups > 0)
              .reverse()
              .map((b) => (
                <tr key={b.date}>
                  <td>{shortDate(b.date)}</td>
                  <td>{b.signups}</td>
                  <td>{b.onboarded}</td>
                  <td>{b.wrote}</td>
                  <td>
                    {families
                      .filter((f) => b.by_family[f.key])
                      .map((f) => `${f.label} ${b.by_family[f.key]}`)
                      .join(", ")}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/**
 * One bar per source. The pale bar is everyone who signed up from it; the
 * solid part is the ones who went on to write something.
 */
export function SourceBars({ rows, onPick, picked }: {
  rows: SourceRow[];
  onPick?: (key: string | null) => void;
  picked?: string | null;
}) {
  const max = Math.max(1, ...rows.map((r) => r.signups));
  return (
    <div className="gr-sources">
      <div className="gr-sources-key" aria-hidden>
        <span><span className="gr-key-pale" /> signed up</span>
        <span><span className="gr-key-solid" /> went on to write</span>
      </div>
      <ul>
        {rows.map((r) => {
          const color = FAMILY_COLOR[r.family];
          const isPicked = picked === r.key;
          return (
            <li key={r.key}>
              <button
                type="button"
                className="gr-source"
                data-picked={isPicked || undefined}
                data-muted={!KNOWN(r.family) || undefined}
                onClick={() => onPick?.(isPicked ? null : r.key)}
                aria-pressed={isPicked}
                aria-label={`${r.label}: ${r.signups} signed up, ${r.wrote} wrote${r.paying ? `, ${r.paying} paying` : ""}. Show these people.`}
                title={`${FAMILY_HELP[r.family]}\n\nClick to see these people in Recent signups.`}
              >
                <span className="gr-source-name">
                  <span className="gr-swatch" style={{ background: color }} aria-hidden />
                  {r.label}
                </span>
                <span className="gr-source-bar" aria-hidden>
                  <span className="gr-bar-pale" style={{ width: `${(r.signups / max) * 100}%`, background: color }} />
                  <span className="gr-bar-solid" style={{ width: `${(r.wrote / max) * 100}%`, background: color }} />
                </span>
                <span className="gr-source-nums">
                  <strong>{r.signups}</strong> signed up · {r.wrote} wrote
                  {r.paying > 0 && <span className="gr-paying"> · {r.paying} paying</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Signed up → finished setup → wrote → tried Plus → paying, as shares of everyone. */
export function JourneyBars({ totals }: {
  totals: { signups: number; onboarded: number; wrote: number; trials: number; paying: number };
}) {
  const steps = [
    { label: "Signed up", n: totals.signups, help: "Created an account (spam that was suspended isn't counted)." },
    { label: "Finished setup", n: totals.onboarded, help: "Went all the way through the welcome steps." },
    { label: "Wrote something", n: totals.wrote, help: "Published at least one entry or sticky." },
    { label: "Tried Plus", n: totals.trials, help: "Started the free 14-day Plus trial." },
    { label: "Paying", n: totals.paying, help: "Pays for Plus now, or is a Founding Member." },
  ];
  const max = Math.max(1, totals.signups);
  return (
    <ul className="gr-journey">
      {steps.map((s, i) => (
        <li key={s.label} title={s.help}>
          <span className="gr-journey-label">{s.label}</span>
          <span className="gr-journey-bar" aria-hidden>
            <span style={{ width: `${(s.n / max) * 100}%` }} />
          </span>
          <span className="gr-journey-num">
            <strong>{s.n}</strong>
            {i > 0 && <span> · {pct(s.n, totals.signups)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
