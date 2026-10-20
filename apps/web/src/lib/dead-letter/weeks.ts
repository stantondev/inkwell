// Weeks: each week the office gets one bundle of letters, Monday to Friday.
// The bundle has a secret (this week: whose letters they are) that you can name
// any day; every delivered letter adds a clue to the file.

import { HAMILTON_WEEK_LETTERS, type DeadLetter } from "./letters";
import { ROOSEVELT_WEEK } from "./roosevelt";
import { LINCOLN_WEEK } from "./lincoln";
import { DARWIN_WEEK } from "./darwin";
import { KELLER_WEEK } from "./keller";
import { TWAIN_WEEK } from "./twain";
import { ALCOTT_WEEK } from "./alcott";
import { DICKENS_WEEK } from "./dickens";

export interface Week {
  id: string;
  number: number;
  /**
   * Only approved weeks go on the calendar. A drafted week waits, playable in
   * local preview (/play?week=<id>), until a person has read every line and
   * approved it. See docs/dead-letter-office/drafting-a-week.md.
   */
  status: "draft" | "approved";
  /** Who drafted it and when, and who approved it. */
  drafted: { by: "claude" | "person"; on: string };
  reviewed?: { by: string; on: string };
  /** The Monday the bundle arrives, YYYY-MM-DD. */
  starts: string;
  letters: DeadLetter[];
  mystery: {
    question: string;
    /** Words that count as naming it (whole words, any case). */
    accept: string[];
    /** Words that rule a guess out even if it has an accepted word (Franklin Roosevelt isn't Theodore). */
    /** One word: any guess containing it is wrong. Several words: that exact name is wrong. */
    reject?: string[];
    /** Other names that give the writer away (a real name behind a pen name, a maiden name). Kept out of everything a player sees before naming them, like the surname. */
    hide?: string[];
    answer: string;
    years: string;
    reveal: string[];
    /** Shown once the whole bundle is delivered (it would spoil letters still to come). */
    coda: string;
  };
  /** A line about next week's bundle. */
  next: string;
  /** The writer's life, shown once they're named; `letters` marks which of the week's letters fall there (weekdays). */
  timeline?: { year: string; text: string; letters?: number[] }[];
}

/** A week's bundle that isn't on the calendar (kept for later, or a special week). */
export const HAMILTON_WEEK: Week = {
  id: "spare-hamilton",
  number: 0,
  status: "draft",
  drafted: { by: "claude", on: "2026-10-19" },
  starts: "2099-01-05",
  letters: HAMILTON_WEEK_LETTERS,
  mystery: {
    question: "Whose letters are these?",
    accept: ["hamilton"],
    answer: "Alexander Hamilton",
    years: "c. 1755–1804",
    reveal: [
      "Born on Nevis and raised on St. Croix, he was clerking for a trading house when he told his friend Ned that he wished there was a war. He got one: by 1777 he was on George Washington’s staff.",
      "He married Elizabeth Schuyler in 1780, wrote much of The Federalist, and became the first Secretary of the Treasury. On 11 July 1804 Aaron Burr shot him in a duel at Weehawken. He died the next day.",
    ],
    coda: "Five letters, thirty-five years: a clerk who wanted out, an officer teasing his friend, a man in love, a father keeping a promise, and a husband saying goodbye.",
  },
  next: "Next week’s bundle is older. Much older.",
};

// One file per week, in the order they run. A new week goes at the end, as a
// draft, until a person approves it (docs/dead-letter-office/drafting-a-week.md).
export const WEEKS: Week[] = [ROOSEVELT_WEEK, LINCOLN_WEEK, DARWIN_WEEK, KELLER_WEEK, TWAIN_WEEK, ALCOTT_WEEK, DICKENS_WEEK];

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Days from a to b (both YYYY-MM-DD), by the calendar. */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** The reader's own date, YYYY-MM-DD. */
export function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The week on the desk today: the latest one that has started, else the first. */
/** The week on the desk today: the latest approved one that has started, else the first approved. */
export function weekFor(today: string, weeks: Week[] = WEEKS): Week {
  const approved = weeks.filter((w) => w.status === "approved");
  const started = approved.filter((w) => daysBetween(w.starts, today) >= 0);
  return started.sort((a, b) => b.starts.localeCompare(a.starts))[0] ?? approved[0] ?? weeks[0];
}

/** The names that must never show before the writer is named: the surname plus `mystery.hide`. */
export function hiddenNames(week: Week): RegExp {
  const parts = week.mystery.answer.split(" ");
  const names = [parts[parts.length - 1], ...(week.mystery.hide ?? [])];
  return new RegExp(`\\b(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
}

/** Any week by id, drafts included (for local preview). */
export function weekById(id: string, weeks: Week[] = [...WEEKS, HAMILTON_WEEK]): Week | null {
  return weeks.find((w) => w.id === id) ?? null;
}

/** Approved weeks still to come after today: the buffer before the office runs out of post. */
export function weeksAhead(today: string, weeks: Week[] = WEEKS): Week[] {
  return weeks.filter((w) => w.status === "approved" && daysBetween(today, w.starts) > 0);
}

/** How many of the week's letters have arrived (0–5). Missed days stay open. */
export function lettersArrived(week: Week, today: string, openAll = false): number {
  if (openAll) return week.letters.length;
  const d = daysBetween(week.starts, today);
  return Math.max(0, Math.min(week.letters.length, d + 1));
}

/** The date a letter arrives. */
export function arrivalDay(week: Week, day: number): string {
  const [y, m, d] = week.starts.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + day));
  return t.toISOString().slice(0, 10);
}

export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/** Does this guess name the week's secret? */
export function namesMystery(week: Week, guess: string): boolean {
  const said = normalizeName(guess);
  const words = new Set(said.split(" ").filter(Boolean));
  // A one-word reject refuses any guess containing it; a longer one refuses that exact name
  // ("may alcott" is the sister, though "Louisa May Alcott" is right).
  const refused = (r: string) => {
    const n = normalizeName(r);
    return n.includes(" ") ? said === n : words.has(n);
  };
  if ((week.mystery.reject ?? []).some(refused)) return false;
  return week.mystery.accept.some((a) => normalizeName(a).split(" ").every((w) => words.has(w)));
}
