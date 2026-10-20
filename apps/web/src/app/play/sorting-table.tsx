"use client";

import { useState } from "react";
import type { Choice, DeadLetter } from "@/lib/dead-letter/letters";
import { crossedOffAtStart, type Level } from "@/lib/dead-letter/difficulty";
import { buzz, inkDrip, paperLift } from "@/lib/dead-letter/sound";
import { LetterWords } from "./letter-sheet";
import styles from "./play.module.css";

type Row = "to" | "when";

function Choices({
  label,
  kind,
  choices,
  picked,
  returned,
  eliminated,
  onPick,
}: {
  label: string;
  kind: "card" | "year";
  choices: Choice[];
  picked: string | null;
  returned: boolean;
  eliminated: string[];
  onPick: (id: string) => void;
}) {
  return (
    <fieldset className={styles.cardRow}>
      <legend className={styles.cardRowLabel}>{label}</legend>
      <div className={kind === "card" ? styles.cards : styles.years} role="radiogroup" aria-label={label}>
        {choices.map((c, i) => {
          const on = picked === c.id;
          const out = eliminated.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={out}
              className={[
                kind === "card" ? styles.indexCard : styles.yearStamp,
                on ? styles.choiceOn : "",
                on && returned ? styles.choiceReturned : "",
                out ? styles.choiceOut : "",
              ].join(" ")}
              style={{ ["--tilt" as string]: `${[-1.2, 0.8, -0.5, 1.1][i % 4]}deg` }}
              onClick={() => {
                paperLift();
                onPick(c.id);
              }}
            >
              <span className={styles.choiceName}>{c.name}</span>
              {c.note && <span className={styles.choiceNote}>{c.note}</span>}
              {on && returned && (
                <span className={styles.returnedMark} aria-hidden="true">
                  Returned
                </span>
              )}
              {out && <span className={styles.srOnly}> (crossed off)</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SortingTable({
  letter,
  level,
  tries,
  eliminated: crossedByHints,
  onTry,
  onEliminate,
  onDelivered,
}: {
  letter: DeadLetter;
  level: Level;
  tries: number;
  eliminated: string[];
  onTry: () => void;
  onEliminate: (id: string) => void;
  onDelivered: () => void;
}) {
  // On Easy, one wrong answer per question starts crossed off.
  const eliminated = [...crossedOffAtStart(letter, level), ...crossedByHints];
  const [to, setTo] = useState<string | null>(null);
  const [when, setWhen] = useState<string | null>(null);
  const [returned, setReturned] = useState<Record<Row, boolean>>({ to: false, when: false });
  const [message, setMessage] = useState("");
  // Open beside the choices on a wide screen; folded above them on a phone.
  const [letterOpen, setLetterOpen] = useState(() => !window.matchMedia("(max-width: 980px)").matches);

  const rows: { row: Row; choices: Choice[]; answer: string; picked: string | null }[] = [
    { row: "to", choices: letter.to.cards, answer: letter.to.answer, picked: to },
    { row: "when", choices: letter.when.options, answer: letter.when.answer, picked: when },
  ];

  /** A hint crosses off one wrong answer, never leaving fewer than two to choose from. */
  let hintTarget: { row: Row; id: string } | null = null;
  for (const r of rows) {
    const left = r.choices.filter((c) => !eliminated.includes(c.id));
    if (left.length > 2) {
      const wrong = left.filter((c) => c.id !== r.answer);
      // Cross off their pick if it's wrong; otherwise the last wrong one.
      hintTarget = { row: r.row, id: wrong.find((c) => c.id === r.picked)?.id ?? wrong[wrong.length - 1].id };
      break;
    }
  }

  const hint = () => {
    if (!hintTarget) return;
    paperLift();
    if (hintTarget.row === "to" && to === hintTarget.id) setTo(null);
    if (hintTarget.row === "when" && when === hintTarget.id) setWhen(null);
    onEliminate(hintTarget.id);
    setMessage(`The clerk crosses off one of the ${hintTarget.row === "to" ? "names" : "years"}.`);
  };

  const send = () => {
    if (!to || !when) return;
    onTry();
    const toOk = to === letter.to.answer;
    const whenOk = when === letter.when.answer;
    if (toOk && whenOk) {
      onDelivered();
      return;
    }
    inkDrip();
    buzz(30);
    setReturned({ to: !toOk, when: !whenOk });
    setMessage(
      !toOk && !whenOk
        ? "Returned. Neither the name nor the year fits. Read it again: who is it meant for, and where is he in life?"
        : !toOk
          ? "Returned: that isn’t who it was for. Who would he write to like this?"
          : "Right person, wrong year. What does the letter say about where he is in life?",
    );
  };

  return (
    <section className={styles.sort} aria-label="The sorting table">
      <div className={styles.sortLetter}>
        <details
          className={styles.sortLetterDetails}
          open={letterOpen}
          onToggle={(e) => setLetterOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className={styles.sortLetterSummary}>{letterOpen ? "The letter" : "Read the letter again"}</summary>
          <article className={`${styles.paper} ${styles.readSheet} ${styles.sortSheet}`}>
            <div className={styles.paperStains} aria-hidden="true" />
            <div className={styles.readText}>
              <LetterWords letter={letter} renderBlot={(b) => <span className={styles.inked}>{b.word}</span>} />
            </div>
          </article>
        </details>
      </div>

      <div className={styles.sortDesk}>
        <p className={styles.sortIntro}>
          The address is gone and the top of the page is torn away. Work out who this was for and when it was written, and the office will send it on.
        </p>
        <Choices
          label={letter.to.question}
          kind="card"
          choices={letter.to.cards}
          picked={to}
          returned={returned.to}
          eliminated={eliminated}
          onPick={(id) => {
            setTo(id);
            setReturned((r) => ({ ...r, to: false }));
          }}
        />
        <Choices
          label={letter.when.question}
          kind="year"
          choices={letter.when.options}
          picked={when}
          returned={returned.when}
          eliminated={eliminated}
          onPick={(id) => {
            setWhen(id);
            setReturned((r) => ({ ...r, when: false }));
          }}
        />

        <p className={styles.message} role="status" aria-live="polite">
          {message}
        </p>
        <div className={styles.nextRow}>
          <button type="button" className={styles.sendButton} disabled={!to || !when} onClick={send}>
            Address it and send
          </button>
          {hintTarget && (
            <button type="button" className={styles.hintButton} onClick={hint}>
              <span aria-hidden="true">💡</span> Cross one off
            </button>
          )}
          {tries > 0 && <span className={styles.tries}>Sent back {tries === 1 ? "once" : `${tries} times`}</span>}
        </div>
      </div>
    </section>
  );
}
