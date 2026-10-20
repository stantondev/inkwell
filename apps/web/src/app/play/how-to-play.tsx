"use client";

import { useEffect, useRef } from "react";
import styles from "./play.module.css";

const STEPS = [
  { title: "Mend", text: "The letter arrives torn. Drag the pieces onto the blotter; tap a piece to turn it." },
  { title: "Read", text: "Water took a few words. Tap a blot and pick the word that makes sense (Easy) or type it. A wrong word costs a drop of ink, and nobody fails: if the ink runs dry, the clerk fills in the rest." },
  { title: "Deliver", text: "The address is gone. From what the letter says, pick who it was for and when it was written." },
  { title: "Name the writer", text: "All week’s letters come from one person. Every delivery adds a clue to the file. Name them on Monday if you can; by Friday you’ll know." },
];

export function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.howTo}
      aria-labelledby="dlo-howto-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.howToCard}>
        <h2 id="dlo-howto-title" className={styles.howToTitle}>
          How the office works
        </h2>
        <ol className={styles.howToSteps}>
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className={styles.howToNum}>{i + 1}</span>
              <div>
                <strong>{s.title}</strong>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className={styles.howToNote}>
          Pick Easy, Medium or Hard at the top. A perfect letter scores 32 on Easy, 60 on Medium and 88 on Hard; hints and spent ink cost a little, and a letter scores at the easiest level you used on it. Your total earns you a rank in the office. Stuck? Every step has a <span aria-hidden="true">💡</span> hint. One letter comes each weekday; a day you miss waits for you.
        </p>
        <button type="button" className={styles.primary} onClick={onClose} autoFocus>
          Got it
        </button>
      </div>
    </dialog>
  );
}
