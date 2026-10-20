"use client";

import { useEffect, useRef, useState } from "react";
import type { DeadLetter } from "@/lib/dead-letter/letters";
import { checkGuess, nextHiddenLetter, normalizeWord, visibleLetters, type Blot } from "@/lib/dead-letter/blots";
import { RULES, blotAt, wordChoices, type Level } from "@/lib/dead-letter/difficulty";
import type { Progress } from "@/lib/dead-letter/progress";
import { buzz, inkDrip, wordFound } from "@/lib/dead-letter/sound";
import { LetterWords, WaterBlot } from "./letter-sheet";
import styles from "./play.module.css";

/** The row of letter cells you type the missing letters into. */
function BlotEntry({
  blot,
  revealed,
  shake,
  onSubmit,
  onClose,
}: {
  blot: Blot;
  revealed: number[];
  shake: number;
  onSubmit: (guess: string) => void;
  onClose: () => void;
}) {
  const known = visibleLetters(blot, revealed);
  const missing = known.filter((c) => c === null).length;
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    // A wrong guess clears what was typed; the letters it earned stay.
    if (!shake) return;
    setTyped("");
    setShaking(true);
    const t = window.setTimeout(() => setShaking(false), 420);
    return () => window.clearTimeout(t);
  }, [shake]);

  let k = 0;
  const cells = known.map((ch, i) => {
    if (ch !== null) return { ch, fixed: true, i };
    const t = typed[k++] ?? "";
    return { ch: t, fixed: false, i };
  });
  const nextEmpty = cells.findIndex((c) => !c.fixed && !c.ch);

  const submit = () => {
    if (typed.length < missing) return;
    let j = 0;
    onSubmit(known.map((ch) => (ch === null ? typed[j++] : ch)).join(""));
  };

  return (
    <span
      className={`${styles.entry} ${shaking ? styles.entryShake : ""}`}
      onClick={() => input.current?.focus({ preventScroll: true })}
    >
      {cells.map((c) => (
        <span
          key={c.i}
          className={`${styles.cell} ${c.fixed ? styles.cellFixed : ""} ${c.i === nextEmpty ? styles.cellNext : ""}`}
        >
          {c.ch || " "}
        </span>
      ))}
      <input
        ref={input}
        className={styles.entryInput}
        value={typed}
        inputMode="text"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-label={`The missing letters of a ${blot.word.length}-letter word, ${missing} to fill`}
        onChange={(e) => setTyped(normalizeWord(e.target.value).slice(0, missing))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
    </span>
  );
}

function InkPot({ left, total }: { left: number; total: number }) {
  return (
    <span className={styles.inkPot} role="img" aria-label={`${left} of ${total} drops of ink left`}>
      {Array.from({ length: total }, (_, i) => (
        <svg key={i} viewBox="0 0 12 16" className={`${styles.drop} ${i < left ? "" : styles.dropSpent}`} aria-hidden="true">
          <path d="M6 1 C 6 1, 1 7.5, 1 10.5 a5 5 0 0 0 10 0 C 11 7.5, 6 1, 6 1 Z" />
        </svg>
      ))}
    </span>
  );
}

/** Easy: the lost word and two that would also fit. Pick one. */
function WordChoice({
  blot,
  ruledOut,
  onPick,
  onClose,
}: {
  blot: Blot;
  ruledOut: string[];
  onPick: (word: string) => void;
  onClose: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);
  const words = wordChoices(blot);
  const firstOpen = words.find((w) => !ruledOut.includes(w));
  return (
    <span
      className={styles.choose}
      role="group"
      aria-label="Which word did the water take?"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {words.map((w) => {
        const out = ruledOut.includes(w);
        return (
          <button
            key={w}
            ref={w === firstOpen ? first : undefined}
            type="button"
            className={`${styles.chooseWord} ${out ? styles.chooseOut : ""}`}
            disabled={out}
            onClick={() => onPick(w)}
          >
            {w}
          </button>
        );
      })}
    </span>
  );
}

export function ReadLetter({
  letter,
  level,
  progress,
  onChange,
  onDone,
}: {
  letter: DeadLetter;
  level: Level;
  progress: Progress;
  onChange: (p: Progress) => void;
  onDone: () => void;
}) {
  const rules = RULES[level];
  const ink = rules.ink;
  const choosing = rules.reading === "choose";
  const [active, setActive] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [justSolved, setJustSolved] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  // The same words at every level; how much of each survives depends on the level.
  const blots = letter.blots.map((b) => blotAt(b, level));
  const unsolved = blots.filter((b) => !progress.solved[b.id]);
  const allBack = unsolved.length === 0;
  const inkLeft = Math.max(0, ink - progress.inkUsed);
  const ruledOut = progress.ruledOut ?? {};

  const solve = (blot: Blot, base: Progress) => {
    const next: Progress = { ...base, solved: { ...base.solved, [blot.id]: true } };
    onChange(next);
    wordFound();
    setJustSolved(blot.id);
    const remaining = blots.filter((b) => !next.solved[b.id]);
    setMessage(remaining.length ? `“${blot.word}.” The word comes back.` : "Every word is back.");
    setActive(null);
    if (remaining.length) window.setTimeout(() => setActive(remaining[0].id), 650);
  };

  /** A wrong word: spend a drop. When the ink runs dry, the clerk fills in the rest. Nobody fails a letter. */
  const spend = (base: Progress): boolean => {
    const inkUsed = base.inkUsed + 1;
    inkDrip();
    buzz(30);
    if (inkUsed >= ink) {
      const solved = { ...base.solved };
      for (const b of blots) solved[b.id] = true;
      onChange({ ...base, inkUsed, inkRanOut: true, solved });
      setActive(null);
      setMessage("The ink ran dry, so the clerk filled in the rest from the office copy.");
      return false;
    }
    onChange({ ...base, inkUsed });
    return true;
  };

  const guess = (blot: Blot, word: string) => {
    const r = checkGuess(blot, word);
    if (r.correct) return solve(blot, progress);
    const earned = Array.from(new Set([...(progress.revealed[blot.id] ?? []), ...r.matches])).sort((a, b) => a - b);
    const gained = r.matches.filter((i) => !(progress.revealed[blot.id] ?? []).includes(i) && !blot.survive.includes(i)).length;
    if (!spend({ ...progress, revealed: { ...progress.revealed, [blot.id]: earned } })) return;
    setShake((s) => s + 1);
    setMessage(
      gained
        ? `Not quite. ${gained === 1 ? "One letter" : `${gained} letters`} you had right dried back in.`
        : "Not quite. A drop of ink is spent.",
    );
  };

  const pick = (blot: Blot, word: string) => {
    if (word === blot.word) return solve(blot, progress);
    const base = { ...progress, ruledOut: { ...ruledOut, [blot.id]: [...(ruledOut[blot.id] ?? []), word] } };
    if (spend(base)) setMessage(`Not “${word}”. A drop of ink is spent.`);
  };

  /** A hint, free of ink: one more letter (typing), or one wrong word crossed off (choosing). */
  const hint = () => {
    const blot = blots.find((b) => b.id === active && !progress.solved[b.id]) ?? unsolved[0];
    if (!blot) return;
    if (choosing) {
      const out = ruledOut[blot.id] ?? [];
      const decoy = (letter.blots.find((b) => b.id === blot.id)?.decoys ?? []).find((d) => !out.includes(d));
      const base = { ...progress, hints: progress.hints + 1 };
      if (!decoy) return solve(blot, base);
      const left = wordChoices(blot).filter((w) => w !== decoy && !out.includes(w));
      const next = { ...base, ruledOut: { ...ruledOut, [blot.id]: [...out, decoy] } };
      if (left.length <= 1) return solve(blot, next);
      onChange(next);
      setActive(blot.id);
      setMessage(`The clerk crosses off “${decoy}”.`);
      return;
    }
    const have = progress.revealed[blot.id] ?? [];
    const nextIdx = nextHiddenLetter(blot, have);
    if (nextIdx === null) return;
    const revealed = [...have, nextIdx].sort((a, b) => a - b);
    const p: Progress = { ...progress, hints: progress.hints + 1, revealed: { ...progress.revealed, [blot.id]: revealed } };
    if (nextHiddenLetter(blot, revealed) === null) return solve(blot, p);
    onChange(p);
    setActive(blot.id);
    setShake(0);
    setMessage("One more letter dries back in.");
  };

  return (
    <section className={styles.read} aria-label="Read what the water left">
      <div className={styles.readTools}>
        <p className={styles.hint}>
          {allBack ? (
            progress.inkRanOut ? "The clerk filled in the last words." : "Every word is back. Read it through."
          ) : choosing ? (
            <>
              Water took {unsolved.length === 1 ? "a word" : `${unsolved.length} words`}. <strong>Tap a blot</strong> and pick the word that fits. A wrong pick costs a drop of ink.
            </>
          ) : (
            <>
              Water took {unsolved.length === 1 ? "a word" : `${unsolved.length} words`}. <strong>Tap a blot</strong> and type the missing letters. A wrong word costs a drop of ink.
            </>
          )}
        </p>
        <div className={styles.readToolsRight}>
          {!allBack && (
            <button type="button" className={styles.hintButton} onClick={hint}>
              <span aria-hidden="true">💡</span> {choosing ? "Cross one off" : "Show a letter"}
            </button>
          )}
          <InkPot left={inkLeft} total={ink} />
        </div>
      </div>

      <article className={`${styles.paper} ${styles.readSheet}`}>
        <div className={styles.paperStains} aria-hidden="true" />
        <div className={styles.readText}>
          <LetterWords
            letter={letter}
            renderBlot={(raw) => {
              const blot = blotAt(raw, level);
              if (progress.solved[blot.id]) {
                return (
                  <span className={`${styles.inked} ${justSolved === blot.id ? styles.inkedNew : ""}`}>
                    {blot.word}
                  </span>
                );
              }
              if (active === blot.id) {
                return choosing ? (
                  <WordChoice
                    key={blot.id}
                    blot={raw}
                    ruledOut={ruledOut[blot.id] ?? []}
                    onPick={(w) => pick(blot, w)}
                    onClose={() => setActive(null)}
                  />
                ) : (
                  <BlotEntry
                    key={`${blot.id}:${(progress.revealed[blot.id] ?? []).length}`}
                    blot={blot}
                    revealed={progress.revealed[blot.id] ?? []}
                    shake={shake}
                    onSubmit={(w) => guess(blot, w)}
                    onClose={() => setActive(null)}
                  />
                );
              }
              return (
                <button
                  type="button"
                  className={styles.blotButton}
                  onClick={() => {
                    setActive(blot.id);
                    setMessage("");
                  }}
                >
                  <WaterBlot blot={blot} revealed={progress.revealed[blot.id] ?? []} />
                </button>
              );
            }}
          />
        </div>
      </article>

      <p className={styles.message} role="status" aria-live="polite">
        {message}
      </p>

      {allBack && (
        <div className={styles.nextRow}>
          <button type="button" className={styles.primary} onClick={onDone}>
            Take it to the sorting table
          </button>
        </div>
      )}
    </section>
  );
}
