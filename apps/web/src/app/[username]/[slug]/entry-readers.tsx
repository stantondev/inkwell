"use client";

import { useState } from "react";
import Link from "next/link";
import { sourceLabel } from "@/lib/read-sources";
import type { EntryReadDetail } from "./entry-types";
import styles from "./entry-page.module.css";

function formatDay(iso: string): string {
  // Days are UTC dates from the API; format them in UTC so they don't shift.
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const reads = (n: number) => (n === 1 ? "1 read" : `${n.toLocaleString("en-US")} reads`);

/**
 * What opens from "N reads" on the writer's own entry. Everyone gets the
 * total; Plus writers also get the last month day by day and where readers
 * came from, the same split as the Readers page.
 */
export function EntryReaders({
  total,
  detail,
  selfHosted,
}: {
  total: number;
  detail: EntryReadDetail | null;
  selfHosted: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const daily = detail?.daily ?? [];
  const max = Math.max(1, ...daily.map((d) => d.reads));
  const current = active !== null ? daily[active] : null;
  const topSource = Math.max(1, ...(detail?.sources ?? []).map((s) => s.reads));

  return (
    <div className={styles.readers} role="dialog" aria-label="Readers of this entry">
      <p className={styles.readersTitle}>Readers of this entry</p>
      <p className={styles.readersTotal}>
        <strong>{reads(total)}</strong>
        {detail && total > 0 ? ` · ${detail.recent.toLocaleString("en-US")} in the last ${detail.days} days` : ""}
      </p>

      {total === 0 ? (
        <p className={styles.readersNote}>
          Nobody yet. A read counts once someone has had the entry on screen for ten seconds; your
          own visits don&rsquo;t count.
        </p>
      ) : detail ? (
        <>
          <div
            className={styles.readersChart}
            onMouseLeave={() => setActive(null)}
            role="group"
            aria-label={`Reads per day for the last ${detail.days} days, ${detail.recent} in total`}
          >
            {daily.map((d, i) => (
              <div
                key={d.day}
                className={styles.readersDay}
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive((a) => (a === i ? null : i))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                tabIndex={0}
                aria-label={`${formatDay(d.day)}: ${reads(d.reads)}`}
              >
                <span
                  className={active === i ? styles.readersBarActive : styles.readersBar}
                  style={{ height: d.reads === 0 ? 0 : `${Math.max(8, Math.round((d.reads / max) * 100))}%` }}
                />
              </div>
            ))}
          </div>
          <p className={styles.readersCaption} aria-live="polite">
            {current
              ? `${formatDay(current.day)} · ${reads(current.reads)}`
              : daily.length > 0
                ? `${formatDay(daily[0].day)} to ${formatDay(daily[daily.length - 1].day)}`
                : ""}
          </p>

          {detail.sources.length > 0 && (
            <>
              <p className={styles.readersHeading}>Where they came from</p>
              <ul className={styles.readersSources}>
                {detail.sources.map((s) => (
                  <li key={s.source}>
                    <span className={styles.readersSourceRow}>
                      <span className={styles.readersSourceName}>{sourceLabel(s.source)}</span>
                      <span>{s.reads.toLocaleString("en-US")}</span>
                    </span>
                    <span className={styles.readersTrack} aria-hidden="true">
                      <span style={{ width: `${Math.round((s.reads / topSource) * 100)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        !selfHosted && (
          <p className={styles.readersNote}>
            With Plus, this also shows where these readers came from and the last 30 days, day by
            day. <Link href="/settings/billing">About Plus</Link>
          </p>
        )
      )}

      <Link href="/readers" className={styles.readersAll}>
        All your readers →
      </Link>
    </div>
  );
}
