"use client";

import { useEffect, useState } from "react";
import type { DeadLetter } from "@/lib/dead-letter/letters";
import type { Week } from "@/lib/dead-letter/weeks";
import { WEEKDAYS } from "@/lib/dead-letter/weeks";
import { shareText, type Progress, type WeekProgress } from "@/lib/dead-letter/progress";
import { buzz, postmarkThunk } from "@/lib/dead-letter/sound";
import { RULES } from "@/lib/dead-letter/difficulty";
import { letterScore } from "@/lib/dead-letter/score";
import { LetterWords } from "./letter-sheet";
import { OldPostmark } from "./old-postmark";
import styles from "./play.module.css";

export function Delivered({
  week,
  letter,
  progress,
  weekProgress,
  animate,
  nextDay,
  onNext,
  onOpenFile,
}: {
  week: Week;
  letter: DeadLetter;
  progress: Progress;
  weekProgress: WeekProgress;
  /** Play the envelope and postmark (only the moment it's delivered). */
  animate: boolean;
  /** The next letter waiting, if there is one; or when the next arrives. */
  nextDay: { day: number; open: boolean } | null;
  onNext: () => void;
  onOpenFile: () => void;
}) {
  const [copied, setCopied] = useState<"" | "copied" | "failed">("");

  useEffect(() => {
    if (!animate) return;
    const t = window.setTimeout(() => {
      postmarkThunk();
      buzz(18);
    }, 1350);
    return () => window.clearTimeout(t);
  }, [animate]);

  const recipient = letter.to.cards.find((c) => c.id === letter.to.answer);
  const named = weekProgress.namedOnDay !== null;
  // The writer's name, and the archive that would give it away, wait until the week's writer is known.
  const known = named || weekProgress.revealed;
  const ink = RULES[progress.level ?? "easy"].ink;
  const score = letterScore(progress);
  const text = (host: string) => shareText(week, letter.day, progress, ink, weekProgress, host, score?.total);

  const share = async () => {
    const t = text(window.location.host || "inkwell.social");
    try {
      if (window.matchMedia("(pointer: coarse)").matches && navigator.share) {
        await navigator.share({ text: t });
        return;
      }
      await navigator.clipboard.writeText(t);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <section className={`${styles.delivered} ${animate ? styles.deliveredAnimate : ""}`} aria-label="Delivered">
      <div className={styles.envelopeStage}>
        <div className={styles.envelope}>
          <span className={styles.envelopeFlap} aria-hidden="true" />
          <p className={styles.address}>
            <span className={styles.addressLine1}>{recipient?.name}</span>
            <span className={styles.addressLine2}>{letter.deliverTo}</span>
          </p>
          <OldPostmark town="DEAD LETTER OFFICE" date={letter.keepsake} year="INKWELL" className={styles.envelopePostmark} />
        </div>
      </div>

      <div className={styles.afterword}>
        <p className={styles.deliveredKicker}>Delivered</p>
        <h2 className={styles.deliveredTitle}>
          To {recipient?.name.replace(/^(The|Her|His) /, (m) => m.toLowerCase())}, {letter.when.answer}
        </h2>
        <p className={styles.writtenAt}>Written at {letter.writtenAt}.</p>

        {letter.story.map((p, i) => (
          <p key={i} className={styles.story}>
            {p}
          </p>
        ))}

        {letter.history && (
          <div className={styles.history}>
            <section className={styles.historySection}>
              <h3 className={styles.historyTitle}>What was going on</h3>
              {letter.history.context.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </section>
            <section className={styles.historySection}>
              <h3 className={styles.historyTitle}>Who’s who</h3>
              <dl className={styles.whoswho}>
                {letter.history.people.map((p) => (
                  <div key={p.name}>
                    <dt>{p.name}</dt>
                    <dd>{p.note}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className={styles.historySection}>
              <h3 className={styles.historyTitle}>What happened next</h3>
              {letter.history.afterwards.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </section>
          </div>
        )}

        {score && (
          <div className={styles.scoreCard}>
            <div className={styles.scoreCardHead}>
              <span className={styles.fileNoteLabel}>This letter</span>
              <span className={styles.scoreCardTotal}>
                {score.total} <span>points</span>
              </span>
            </div>
            <ul className={styles.scoreLines}>
              {score.lines.map((l) => (
                <li key={l.label}>
                  <span>{l.label}</span>
                  <span className={l.points < 0 ? styles.scoreMinus : styles.scorePlus}>
                    {l.points > 0 ? "+" : "−"}
                    {Math.abs(l.points)}
                  </span>
                </li>
              ))}
            </ul>
            {progress.level !== "hard" && (
              <p className={styles.scoreNudge}>
                The same letter on {progress.level === "easy" ? "Medium is worth up to 60, on Hard up to 88" : "Hard is worth up to 88"}.
              </p>
            )}
          </div>
        )}

        <div className={styles.fileNote}>
          <span className={styles.fileNoteLabel}>Added to the file</span>
          <p>{letter.clue}</p>
          {!named && (
            <button type="button" className={styles.linkButton} onClick={onOpenFile}>
              Think you know whose letters these are?
            </button>
          )}
        </div>

        <details className={styles.reread}>
          <summary>{known ? "Read the whole letter, names and all" : "Read the whole letter, with the names back in"}</summary>
          <article className={`${styles.paper} ${styles.readSheet} ${styles.sortSheet}`}>
            <div className={styles.paperStains} aria-hidden="true" />
            <div className={styles.readText}>
              <LetterWords letter={letter} revealNames revealWriter={known} renderBlot={(b) => <span className={styles.inked}>{b.word}</span>} />
            </div>
          </article>
        </details>

        {letter.notes.length > 0 && (
          <dl className={styles.notes}>
            {letter.notes.map((n) => (
              <div key={n.term} className={styles.noteRow}>
                <dt>{n.term}</dt>
                <dd>{n.note}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className={styles.source}>
          {letter.restored ? "Words lost from the damaged original are given as its editors restored them. " : ""}
          {known ? (
            <>
              Text: <a href={letter.source.url} target="_blank" rel="noopener noreferrer">{letter.source.title}</a>.
            </>
          ) : (
            "Where the letter comes from goes in the file once you know whose it is (the archive’s name would give it away)."
          )}
        </p>

        <div className={styles.shareRow}>
          <button type="button" className={styles.secondary} onClick={share}>
            Share how it went
          </button>
          <span className={styles.copied} role="status" aria-live="polite">
            {copied === "copied" ? "Copied. Nothing in it gives the letter away." : copied === "failed" ? "Couldn’t copy that." : ""}
          </span>
        </div>
        <pre className={styles.sharePreview}>{text("inkwell.social")}</pre>

        <div className={styles.nextBlock}>
          {nextDay?.open ? (
            <button type="button" className={styles.primary} onClick={onNext}>
              Open {WEEKDAYS[nextDay.day]}’s letter
            </button>
          ) : nextDay ? (
            <p className={styles.tomorrow}>
              {WEEKDAYS[nextDay.day]}’s letter comes off the bundle tomorrow. If you miss a day, it waits for you.
            </p>
          ) : (
            <p className={styles.tomorrow}>That’s the whole bundle. {named ? "" : "One question left: whose were they?"}</p>
          )}
        </div>
      </div>
    </section>
  );
}
