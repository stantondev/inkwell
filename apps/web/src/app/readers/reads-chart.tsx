"use client";

import { useState } from "react";

interface Day {
  day: string;
  reads: number;
}

const HEIGHT = 140;

function formatDay(iso: string): string {
  // Days are UTC dates from the API; format them in UTC so they don't shift.
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Reads per day as thin bars. Hover or focus a day for its count. */
export function ReadsChart({ daily }: { daily: Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.reads));
  const total = daily.reduce((n, d) => n + d.reads, 0);
  const gap = daily.length > 60 ? 0 : 2;
  const current = active !== null ? daily[active] : null;

  return (
    <div>
      <div className="flex justify-between text-xs mb-2" style={{ color: "var(--muted)" }}>
        <span aria-live="polite">
          {current
            ? `${formatDay(current.day)} · ${current.reads} read${current.reads === 1 ? "" : "s"}`
            : total === 0
              ? "No reads in this period yet"
              : `Busiest day: ${max} read${max === 1 ? "" : "s"}`}
        </span>
      </div>

      <div
        className="relative flex items-end"
        style={{ height: HEIGHT, gap, borderBottom: "1px solid var(--border)" }}
        onMouseLeave={() => setActive(null)}
        role="group"
        aria-label={`Reads per day, ${formatDay(daily[0]?.day ?? "")} to ${formatDay(daily[daily.length - 1]?.day ?? "")}, ${total} in total`}
      >
        {daily.map((d, i) => {
          const h = d.reads === 0 ? 0 : Math.max(2, Math.round((d.reads / max) * (HEIGHT - 4)));
          return (
            <div
              key={d.day}
              className="flex-1 h-full flex items-end cursor-default"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              tabIndex={0}
              aria-label={`${formatDay(d.day)}: ${d.reads} reads`}
            >
              <div
                style={{
                  width: "100%",
                  height: h,
                  background: "var(--accent)",
                  opacity: active === null || active === i ? 1 : 0.45,
                  borderRadius: "4px 4px 0 0",
                  transition: "opacity 120ms",
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-xs mt-1.5" style={{ color: "var(--muted)" }}>
        <span>{formatDay(daily[0]?.day ?? "")}</span>
        <span>{formatDay(daily[daily.length - 1]?.day ?? "")}</span>
      </div>

      <details className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
        <summary className="cursor-pointer">Show as a table</summary>
        <table className="mt-2 w-full">
          <tbody>
            {daily.filter((d) => d.reads > 0).map((d) => (
              <tr key={d.day}>
                <td className="py-0.5">{formatDay(d.day)}</td>
                <td className="py-0.5 text-right tabular-nums">{d.reads}</td>
              </tr>
            ))}
            {total === 0 && (
              <tr><td className="py-0.5">No reads in this period yet.</td></tr>
            )}
          </tbody>
        </table>
      </details>
    </div>
  );
}
