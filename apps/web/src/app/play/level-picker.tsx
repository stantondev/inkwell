"use client";

import { LEVELS, RULES, type Level } from "@/lib/dead-letter/difficulty";
import styles from "./play.module.css";

/** Easy · Medium · Hard. `cards` shows each level with what it means; the default is a compact switch. */
export function LevelPicker({
  level,
  onChange,
  cards = false,
}: {
  level: Level;
  onChange: (level: Level) => void;
  cards?: boolean;
}) {
  return (
    <div className={cards ? styles.levelCards : styles.levelSwitch} role="radiogroup" aria-label="How hard">
      {LEVELS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === level}
          className={`${cards ? styles.levelCard : styles.levelOption} ${l === level ? styles.levelOn : ""}`}
          onClick={() => onChange(l)}
        >
          <span className={styles.levelName}>{RULES[l].label}</span>
          {cards && <span className={styles.levelBlurb}>{RULES[l].blurb}</span>}
        </button>
      ))}
    </div>
  );
}
