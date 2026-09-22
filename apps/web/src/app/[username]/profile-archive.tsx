"use client";

import type { ProfileStyles } from "@/lib/profile-styles";

export interface ArchiveMonth {
  year: number;
  month: number;
  count: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The journal's archive: every year with its entry count, and once a year is
 * picked, the months that have entries. Picking one filters the list below;
 * picking it again (or "All") clears it. Replaces a year dropdown that people
 * didn't notice, which left them clicking Next to reach old posts.
 */
export function ProfileArchive({
  months,
  year,
  month,
  onChange,
  styles,
}: {
  months: ArchiveMonth[];
  year: number | null;
  month: number | null;
  onChange: (year: number | null, month: number | null) => void;
  styles: ProfileStyles;
}) {
  const years = Array.from(
    months.reduce((acc, m) => acc.set(m.year, (acc.get(m.year) ?? 0) + m.count), new Map<number, number>())
  ).sort((a, b) => b[0] - a[0]);

  if (years.length === 0) return null;

  const monthsOfYear = year
    ? months.filter((m) => m.year === year).sort((a, b) => a.month - b.month)
    : [];

  const pill = (active: boolean) =>
    active
      ? { background: styles.accent, borderColor: styles.accent, color: "#fff" }
      : { borderColor: styles.border, color: styles.muted };

  return (
    <nav aria-label="Archive" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-widest mr-1" style={{ color: styles.muted }}>
          Archive
        </span>
        <button
          type="button"
          onClick={() => onChange(null, null)}
          aria-pressed={year === null}
          className="text-xs px-2.5 py-1 rounded-full border transition-colors"
          style={pill(year === null)}
        >
          All
        </button>
        {years.map(([y, count]) => (
          <button
            key={y}
            type="button"
            onClick={() => onChange(year === y && !month ? null : y, null)}
            aria-pressed={year === y}
            className="text-xs px-2.5 py-1 rounded-full border transition-colors tabular-nums"
            style={pill(year === y)}
          >
            {y}
            <span className="ml-1 opacity-70">{count}</span>
          </button>
        ))}
      </div>

      {year && monthsOfYear.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pl-0 sm:pl-[3.75rem]">
          {monthsOfYear.map((m) => (
            <button
              key={m.month}
              type="button"
              onClick={() => onChange(year, month === m.month ? null : m.month)}
              aria-pressed={month === m.month}
              aria-label={`${MONTHS[m.month - 1]} ${year}, ${m.count} ${m.count === 1 ? "entry" : "entries"}`}
              className="text-[11px] px-2 py-0.5 rounded-full border transition-colors tabular-nums"
              style={pill(month === m.month)}
            >
              {MONTHS[m.month - 1]}
              <span className="ml-1 opacity-70">{m.count}</span>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
