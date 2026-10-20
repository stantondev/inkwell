// How hard a letter is. The reader picks; the letter stays the same.

import type { Blot } from "./blots";
import { seeded } from "./tear";
import type { Choice, DeadLetter } from "./letters";

export type Level = "easy" | "medium" | "hard";

export const LEVELS: Level[] = ["easy", "medium", "hard"];

export interface LevelRules {
  label: string;
  /** One line for the picker. */
  blurb: string;
  pieces: { rows: number; cols: number };
  /** Which torn pieces start turned the wrong way. */
  turns: "none" | "some" | "all";
  /** How forgiving a drop is (× the normal snap distance). */
  snap: number;
  /** Wrong words allowed per letter. */
  ink: number;
  /** Easy picks each missing word from a few; the others type it. */
  reading: "choose" | "type";
  /** What survives of each lost word: nothing (Easy: you choose by sense), about half (Medium), a few (Hard). */
  letters: "none" | "half" | "few";
  /** Easy starts the sorting table with one wrong answer per question crossed off. */
  crossOffOne: boolean;
}

export const RULES: Record<Level, LevelRules> = {
  easy: {
    label: "Easy",
    blurb: "Four pieces, all upright. Each lost word is one of three: pick the one that makes sense.",
    pieces: { rows: 2, cols: 2 },
    turns: "none",
    snap: 1.7,
    ink: 6,
    reading: "choose",
    letters: "none",
    crossOffOne: true,
  },
  medium: {
    label: "Medium",
    blurb: "Six pieces, a few upside down. Type the lost words, with half their letters showing.",
    pieces: { rows: 3, cols: 2 },
    turns: "some",
    snap: 1.2,
    ink: 5,
    reading: "type",
    letters: "half",
    crossOffOne: false,
  },
  hard: {
    label: "Hard",
    blurb: "Nine pieces, all turned. Only a few letters survive the water.",
    pieces: { rows: 3, cols: 3 },
    turns: "all",
    snap: 0.85,
    ink: 3,
    reading: "type",
    letters: "few",
    crossOffOne: false,
  },
};

export function isLevel(v: unknown): v is Level {
  return v === "easy" || v === "medium" || v === "hard";
}

/** The letters of a lost word that survive at this level. Always leaves at least one hidden. */
export function surviveFor(blot: Blot, level: Level): number[] {
  // Easy offers three whole words; any surviving letter would give the answer away.
  if (RULES[level].letters === "none") return [];
  if (RULES[level].letters === "few") return blot.survive;
  const shown = new Set(blot.survive);
  for (let i = 0; i < blot.word.length; i += 2) shown.add(i);
  const list = [...shown].sort((a, b) => a - b);
  if (list.length >= blot.word.length) {
    // Keep the last letter hidden rather than giving the word away.
    return list.filter((i) => i !== blot.word.length - 1 || blot.word.length === 1).slice(0, blot.word.length - 1);
  }
  return list;
}

/** The blot as it looks at this level (same word, more or fewer letters left). */
export function blotAt(blot: Blot, level: Level): Blot {
  return { ...blot, survive: surviveFor(blot, level) };
}

/** Easy: the word and its decoys in a fixed shuffled order (same for everyone). */
export function wordChoices(blot: Blot & { decoys?: string[] }): string[] {
  const words = [blot.word, ...(blot.decoys ?? [])];
  let h = 0;
  for (const ch of blot.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = seeded(h);
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  return words;
}

/** Easy crosses off one wrong answer per question before you start. */
export function crossedOffAtStart(letter: DeadLetter, level: Level): string[] {
  if (!RULES[level].crossOffOne) return [];
  const pick = (choices: Choice[], answer: string) => {
    const wrong = choices.filter((c) => c.id !== answer);
    return wrong[wrong.length - 1]?.id;
  };
  return [pick(letter.to.cards, letter.to.answer), pick(letter.when.options, letter.when.answer)].filter(
    (x): x is string => Boolean(x),
  );
}
