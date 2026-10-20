import type { CSSProperties, ReactNode } from "react";
import type { DeadLetter } from "@/lib/dead-letter/letters";
import { parseSegments, visibleLetters, type Blot } from "@/lib/dead-letter/blots";
import { blotAt, type Level } from "@/lib/dead-letter/difficulty";
import styles from "./play.module.css";

/** The size the sheet is drawn at while it's in pieces (scaled to fit). */
export const SHEET_W = 600;
export const SHEET_H = 900;

/** A word lost to water: only the surviving letters show; nothing else is in the page. */
export function WaterBlot({ blot, revealed = [] }: { blot: Blot; revealed?: number[] }) {
  const letters = visibleLetters(blot, revealed);
  // Nothing survived (Easy): every blot is the same size, so its width doesn't hint at the word.
  if (letters.every((ch) => ch === null)) {
    return <span className={`${styles.blot} ${styles.blotBlank}`} aria-label="a word lost to water" />;
  }
  return (
    <span className={styles.blot} aria-label={`a word lost to water, ${blot.word.length} letters`}>
      {letters.map((ch, i) =>
        ch ? (
          <span key={i} className={styles.blotLetter}>
            {ch}
          </span>
        ) : (
          <span key={i} className={styles.blotGap} aria-hidden="true">
            o
          </span>
        ),
      )}
    </span>
  );
}

/** A name the water took completely. Its letters aren't in the page until it's delivered. */
function Smear({ text, reveal }: { text: string; reveal: boolean }) {
  if (reveal) return <span className={styles.restoredName}>{text}</span>;
  return (
    <span
      className={styles.smear}
      style={{ width: `${Math.max(1.2, text.length * 0.5)}em` }}
      role="img"
      aria-label="a name, washed out"
    />
  );
}

function Words({
  text,
  byId,
  renderBlot,
  revealNames,
  revealWriter,
}: {
  text: string;
  byId: Map<string, Blot>;
  renderBlot: (blot: Blot) => ReactNode;
  revealNames: boolean;
  revealWriter: boolean;
}) {
  return (
    <>
      {parseSegments(text).map((seg, i) => {
        if (seg.kind === "text") return <span key={i}>{seg.text}</span>;
        if (seg.kind === "smear") return <Smear key={i} text={seg.text} reveal={seg.writer ? revealWriter : revealNames} />;
        const blot = byId.get(seg.id);
        return blot ? <span key={i}>{renderBlot(blot)}</span> : null;
      })}
    </>
  );
}

/** The letter's words, with each blot drawn by `renderBlot`. */
export function LetterWords({
  letter,
  renderBlot,
  revealNames = false,
  revealWriter = false,
}: {
  letter: DeadLetter;
  renderBlot: (blot: Blot) => ReactNode;
  /** Write back the names of everyone else (once it's delivered). */
  revealNames?: boolean;
  /** Write back the writer's own name (once the week's writer is known). */
  revealWriter?: boolean;
}) {
  const byId = new Map(letter.blots.map((b) => [b.id, b]));
  const props = { byId, renderBlot, revealNames, revealWriter };
  return (
    <>
      <p className={styles.tornTop} aria-hidden="true" />
      {letter.salutation && (
        <p className={styles.salutation}>
          <Words text={letter.salutation} {...props} />
        </p>
      )}
      {letter.body.map((para, pi) => (
        <p key={pi} className={styles.para}>
          <Words text={para} {...props} />
        </p>
      ))}
      <div className={styles.signoff}>
        {letter.signoff.map((line, i) => (
          <p key={i}>
            <Words text={line} {...props} />
          </p>
        ))}
      </div>
      {letter.postscript && (
        <p className={styles.postscript}>
          <Words text={letter.postscript} {...props} />
        </p>
      )}
    </>
  );
}

/** The whole sheet at its fixed size, as it was before it was torn. */
export function FixedSheet({
  letter,
  level,
  fontSize,
  measureRef,
}: {
  letter: DeadLetter;
  level: Level;
  fontSize: number;
  measureRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className={`${styles.paper} ${styles.fixedSheet}`} style={{ width: SHEET_W, height: SHEET_H }}>
      <div className={styles.paperStains} aria-hidden="true" />
      <div ref={measureRef} className={styles.sheetText} style={{ fontSize } as CSSProperties}>
        <LetterWords letter={letter} renderBlot={(b) => <WaterBlot blot={blotAt(b, level)} />} />
      </div>
    </div>
  );
}
