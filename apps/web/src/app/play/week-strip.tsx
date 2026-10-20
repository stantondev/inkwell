"use client";

import type { Week } from "@/lib/dead-letter/weeks";
import { WEEKDAYS } from "@/lib/dead-letter/weeks";
import type { Phase } from "@/lib/dead-letter/progress";
import styles from "./play.module.css";

/** The five letters of the week as envelopes on a string. */
export function WeekStrip({
  week,
  arrived,
  phases,
  selected,
  onSelect,
}: {
  week: Week;
  arrived: number;
  phases: Phase[];
  selected: number;
  onSelect: (day: number) => void;
}) {
  return (
    <nav className={styles.strip} aria-label="This week’s letters">
      <span className={styles.stripString} aria-hidden="true" />
      {week.letters.map((l, i) => {
        const open = i < arrived;
        const done = phases[i] === "delivered";
        const started = !done && phases[i] !== "arrive";
        const state = !open ? "Arrives " + WEEKDAYS[i] : done ? "Delivered" : started ? "In progress" : "Waiting";
        return (
          <button
            key={l.id}
            type="button"
            className={[
              styles.tile,
              i === selected ? styles.tileOn : "",
              done ? styles.tileDone : "",
              !open ? styles.tileLocked : "",
            ].join(" ")}
            disabled={!open}
            aria-current={i === selected ? "true" : undefined}
            aria-label={`${WEEKDAYS[i]}: ${state}`}
            onClick={() => onSelect(i)}
          >
            <span className={styles.tileEnvelope} aria-hidden="true">
              <span className={styles.tileFlap} />
              {done && <span className={styles.tileStamp}>{l.keepsake}</span>}
              {open && !done && <span className={styles.tileSeal} />}
            </span>
            <span className={styles.tileDay}>{WEEKDAYS[i].slice(0, 3)}</span>
            <span className={styles.tileState}>{done ? "Delivered" : open ? (started ? "Started" : "New") : "Soon"}</span>
          </button>
        );
      })}
    </nav>
  );
}
