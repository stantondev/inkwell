// A reader's own score. Harder levels are worth more; hints cost a little;
// nothing is ever lost by missing a day. Private: no leaderboard.

import { LEVELS, RULES, type Level } from "./difficulty";
import type { Progress, WeekProgress } from "./progress";

/** Points for delivering a letter, and the multiplier for everything else, by level. */
export const LEVEL_POINTS: Record<Level, { base: number; x: number }> = {
  easy: { base: 10, x: 1 },
  medium: { base: 20, x: 2 },
  hard: { base: 40, x: 3 },
};

/** The fewest points a delivered letter is worth, however many hints it took. */
export const LETTER_FLOOR = 5;

/** Points for naming the week's writer, by the weekday of the newest letter you had. */
export const NAMED_ON = [50, 40, 30, 20, 10];
export const WRONG_GUESS = 5;
export const NAMED_FLOOR = 5;

export interface ScoreLine {
  label: string;
  points: number;
}

export interface Scored {
  total: number;
  lines: ScoreLine[];
}

/** The easier of two levels: a letter is scored at the easiest level it was played on. */
export function easier(a: Level, b: Level): Level {
  return LEVELS.indexOf(a) <= LEVELS.indexOf(b) ? a : b;
}

/** A delivered letter's score, line by line; null until it's delivered. */
export function letterScore(p: Progress): Scored | null {
  if (p.phase !== "delivered") return null;
  const level = p.level ?? "easy";
  const { base, x } = LEVEL_POINTS[level];
  const inkLeft = p.inkRanOut ? 0 : Math.max(0, RULES[level].ink - p.inkUsed);
  const lines: ScoreLine[] = [{ label: `Delivered on ${RULES[level].label}`, points: base }];
  if (!p.mendedByClerk) lines.push({ label: "Mended it yourself", points: 5 * x });
  if (inkLeft > 0) lines.push({ label: `${inkLeft} ${inkLeft === 1 ? "drop" : "drops"} of ink left`, points: 2 * inkLeft * x });
  if (p.deliveryTries <= 1) lines.push({ label: "Delivered first time", points: 5 * x });
  if (p.hints > 0) lines.push({ label: `${p.hints} ${p.hints === 1 ? "hint" : "hints"}`, points: -2 * p.hints * x });
  const sum = lines.reduce((s, l) => s + l.points, 0);
  return { total: Math.max(LETTER_FLOOR, sum), lines };
}

/** The most a letter can score on a level: a feel for what each level is worth. */
export function bestPossible(level: Level): number {
  const { base, x } = LEVEL_POINTS[level];
  return base + 5 * x + 2 * RULES[level].ink * x + 5 * x;
}

/** Points for naming the week's writer; 0 until named (or if you gave up). */
export function weekScore(w: WeekProgress): Scored | null {
  if (w.namedOnDay === null) return null;
  const wrong = Math.max(0, w.guesses.length - 1);
  const onDay = NAMED_ON[w.namedOnDay] ?? NAMED_ON[NAMED_ON.length - 1];
  const lines: ScoreLine[] = [{ label: "Named the writer", points: onDay }];
  if (wrong > 0) lines.push({ label: `${wrong} wrong ${wrong === 1 ? "guess" : "guesses"}`, points: -WRONG_GUESS * wrong });
  return { total: Math.max(NAMED_FLOOR, onDay - WRONG_GUESS * wrong), lines };
}

/** Everything scored so far: every delivered letter plus naming the writer. */
export function totalScore(letters: Progress[], weeks: WeekProgress[]): number {
  return (
    letters.reduce((s, p) => s + (letterScore(p)?.total ?? 0), 0) +
    weeks.reduce((s, w) => s + (weekScore(w)?.total ?? 0), 0)
  );
}

export const RANKS: { title: string; at: number }[] = [
  { title: "Junior Clerk", at: 0 },
  { title: "Sorting Clerk", at: 75 },
  { title: "Letter Carrier", at: 200 },
  { title: "Senior Clerk", at: 400 },
  { title: "Postmaster", at: 700 },
  { title: "Superintendent of Dead Letters", at: 1100 },
];

export function rankFor(total: number): { title: string; next: { title: string; at: number } | null; progress: number } {
  let i = 0;
  while (i + 1 < RANKS.length && total >= RANKS[i + 1].at) i++;
  const next = RANKS[i + 1] ?? null;
  const progress = next ? (total - RANKS[i].at) / (next.at - RANKS[i].at) : 1;
  return { title: RANKS[i].title, next, progress };
}
