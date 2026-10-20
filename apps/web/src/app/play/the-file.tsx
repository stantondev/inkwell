"use client";

import { forwardRef, useRef, useState } from "react";
import type { Week } from "@/lib/dead-letter/weeks";
import { WEEKDAYS } from "@/lib/dead-letter/weeks";
import type { WeekProgress } from "@/lib/dead-letter/progress";
import { weekScore } from "@/lib/dead-letter/score";
import { buzz, inkDrip, postmarkThunk } from "@/lib/dead-letter/sound";
import styles from "./play.module.css";

/**
 * The week's file: a clue for every delivered letter, and a place to name
 * whose letters these are. Naming them opens the reveal.
 */
export const TheFile = forwardRef<HTMLElement, {
  week: Week;
  delivered: boolean[];
  weekProgress: WeekProgress;
  open: boolean;
  onToggle: (open: boolean) => void;
  onGuess: (guess: string) => boolean;
  onGiveUp: () => void;
}>(function TheFile({ week, delivered, weekProgress, open, onToggle, onGuess, onGiveUp }, ref) {
  const [guess, setGuess] = useState("");
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const named = weekProgress.namedOnDay !== null;
  const solved = named || weekProgress.revealed;
  const clues = week.letters.filter((_, i) => delivered[i]);
  const allDelivered = delivered.every(Boolean);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const g = guess.trim();
    if (!g) return;
    if (onGuess(g)) {
      postmarkThunk();
      buzz(20);
      setGuess("");
    } else {
      inkDrip();
      buzz(30);
      setShaking(true);
      window.setTimeout(() => setShaking(false), 420);
      setGuess("");
      inputRef.current?.focus();
    }
  };

  return (
    <section ref={ref} className={`${styles.file} ${open ? styles.fileOpen : ""}`} aria-label="The file on this bundle">
      <button type="button" className={styles.fileTab} aria-expanded={open} onClick={() => onToggle(!open)}>
        <span className={styles.fileTabTitle}>{solved ? `The bundle of ${week.mystery.answer}` : week.mystery.question}</span>
        <span className={styles.fileTabMeta}>
          {solved
            ? named
              ? `Named on ${WEEKDAYS[weekProgress.namedOnDay ?? 0]}`
              : "Opened"
            : `${clues.length} ${clues.length === 1 ? "clue" : "clues"} in the file`}
          <span className={styles.chevron} aria-hidden="true">
            {open ? "▴" : "▾"}
          </span>
        </span>
      </button>

      {open && (
        <div className={styles.fileBody}>
          {solved ? (
            <div className={styles.reveal}>
              <p className={styles.revealKicker}>{named ? "You named them" : "The file, opened"}</p>
              <h2 className={styles.revealName}>{week.mystery.answer}</h2>
              <p className={styles.revealYears}>{week.mystery.years}</p>
              {named && (
                <p className={styles.revealPoints}>
                  +{weekScore(weekProgress)?.total} points for naming him on {WEEKDAYS[weekProgress.namedOnDay ?? 0]}
                  {weekProgress.guesses.length > 1 ? ` (after ${weekProgress.guesses.length - 1} wrong ${weekProgress.guesses.length === 2 ? "guess" : "guesses"})` : ""}.
                </p>
              )}
              {week.mystery.reveal.map((p, i) => (
                <p key={i} className={styles.story}>
                  {p}
                </p>
              ))}
              {week.timeline && (
                <>
                  <h3 className={styles.sourcesTitle}>His life, and where the letters fall</h3>
                  <ol className={styles.timeline}>
                    {week.timeline.map((t) => (
                      <li key={t.year + t.text} className={t.letters?.length ? styles.timelineLetter : undefined}>
                        <span className={styles.timelineYear}>{t.year}</span>
                        <span>
                          {t.text}
                          {(t.letters ?? []).map((d) => (
                            <span key={d} className={styles.timelineTag}>
                              {WEEKDAYS[d]}’s letter{delivered[d] ? "" : " (still to come)"}
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {allDelivered ? (
                <p className={styles.story}>{week.mystery.coda}</p>
              ) : (
                <p className={styles.fileLead}>The rest of the bundle still comes one letter a day.</p>
              )}
              <h3 className={styles.sourcesTitle}>The letters</h3>
              <ul className={styles.sources}>
                {week.letters.map((l, i) => (
                  <li key={l.id}>
                    <span className={styles.clueDay}>{WEEKDAYS[i]}</span>
                    {delivered[i] ? (
                      <>
                        To {l.to.cards.find((c) => c.id === l.to.answer)?.name.replace(/^(The|Her|His) /, (m) => m.toLowerCase())}, {l.writtenAt}.{" "}
                        <a href={l.source.url} target="_blank" rel="noopener noreferrer">
                          Read it in full
                        </a>
                      </>
                    ) : (
                      "Not delivered yet."
                    )}
                  </li>
                ))}
              </ul>
              <p className={styles.nextWeek}>{week.next}</p>
            </div>
          ) : (
            <>
              <p className={styles.fileLead}>
                Every letter in this week’s bundle is in the same hand, and the signature has washed out of each one. Each letter you deliver adds what the office learns to this file. Name the writer whenever you think you know: 50 points on Monday, 10 by Friday, less 5 for each wrong guess.
              </p>
              {clues.length > 0 ? (
                <ol className={styles.clues}>
                  {week.letters.map((l, i) =>
                    delivered[i] ? (
                      <li key={l.id}>
                        <span className={styles.clueDay}>{WEEKDAYS[i]}</span>
                        {l.clue}
                      </li>
                    ) : null,
                  )}
                </ol>
              ) : (
                <p className={styles.fileEmpty}>Nothing in the file yet. Deliver today’s letter for your first clue.</p>
              )}
              <form className={styles.guessForm} onSubmit={submit}>
                <label htmlFor="dlo-guess" className={styles.guessLabel}>
                  Whose letters are these?
                </label>
                <div className={`${styles.guessRow} ${shaking ? styles.guessWrong : ""}`}>
                  <input
                    ref={inputRef}
                    id="dlo-guess"
                    className={styles.guessInput}
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    placeholder="A name"
                    autoComplete="off"
                    autoCapitalize="words"
                    spellCheck={false}
                  />
                  <button type="submit" className={styles.primary} disabled={!guess.trim()}>
                    Name them
                  </button>
                </div>
                {weekProgress.guesses.length > 0 && (
                  <p className={styles.guessesSoFar} aria-live="polite">
                    Not {weekProgress.guesses.map((g, i) => <s key={i}>{g}</s>).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), [])}.
                  </p>
                )}
              </form>
              {allDelivered && (
                <button type="button" className={styles.linkButton} onClick={onGiveUp}>
                  I give up: open the file
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
});
