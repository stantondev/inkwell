// A reader's progress: each letter, and the week's bundle. Kept in the browser
// for the prototype; the real version would save it to the account.

import { RULES, isLevel, type Level } from "./difficulty";

export type Phase = "arrive" | "mend" | "read" | "deliver" | "delivered";

export interface Progress {
  phase: Phase;
  /** Blot id → solved. */
  solved: Record<string, boolean>;
  /** Blot id → letter positions earned by near misses and hints. */
  revealed: Record<string, number[]>;
  /** Easy: blot id → words already ruled out (picked wrongly, or crossed off by a hint). */
  ruledOut: Record<string, string[]>;
  inkUsed: number;
  /** The clerk filled the rest in when the ink ran out. */
  inkRanOut: boolean;
  mendedByClerk: boolean;
  /** Choices crossed off by hints at the sorting table. */
  eliminated: string[];
  deliveryTries: number;
  hints: number;
  deliveredAt: string | null;
  /** The level it was finished on. */
  level?: Level;
}

export interface WeekProgress {
  /** Every guess at the week's secret, in order. */
  guesses: string[];
  /** Weekday (0 = Monday) of the newest letter that had arrived when it was named. */
  namedOnDay: number | null;
  /** Gave up and opened the file. */
  revealed: boolean;
}

export function freshProgress(): Progress {
  return {
    phase: "arrive",
    solved: {},
    revealed: {},
    ruledOut: {},
    inkUsed: 0,
    inkRanOut: false,
    mendedByClerk: false,
    eliminated: [],
    deliveryTries: 0,
    hints: 0,
    deliveredAt: null,
  };
}

export function freshWeek(): WeekProgress {
  return { guesses: [], namedOnDay: null, revealed: false };
}

function read<T>(key: string, fresh: () => T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fresh(), ...(JSON.parse(raw) as Partial<T>) } : fresh();
  } catch {
    return fresh();
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: play on without saving */
  }
}

const letterKey = (id: string) => `inkwell-dlo:${id}`;
const weekKey = (id: string) => `inkwell-dlo-week:${id}`;
const OPEN_ALL = "inkwell-dlo:open-all";
const LEVEL = "inkwell-dlo:level";

/** New players start on Easy. */
export function loadLevel(): Level {
  try {
    const v = window.localStorage.getItem(LEVEL);
    return isLevel(v) ? v : "easy";
  } catch {
    return "easy";
  }
}

export function saveLevel(level: Level) {
  try {
    window.localStorage.setItem(LEVEL, level);
  } catch {
    /* ignore */
  }
}

export const loadProgress = (letterId: string) => read(letterKey(letterId), freshProgress);
export const saveProgress = (letterId: string, p: Progress) => write(letterKey(letterId), p);
export const loadWeek = (weekId: string) => read(weekKey(weekId), freshWeek);
export const saveWeek = (weekId: string, w: WeekProgress) => write(weekKey(weekId), w);

export function clearAll(letterIds: string[], weekId: string) {
  try {
    for (const id of letterIds) window.localStorage.removeItem(letterKey(id));
    window.localStorage.removeItem(weekKey(weekId));
  } catch {
    /* ignore */
  }
}

export function loadOpenAll(): boolean {
  try {
    return window.localStorage.getItem(OPEN_ALL) === "1";
  } catch {
    return false;
  }
}

export function saveOpenAll(on: boolean) {
  try {
    if (on) window.localStorage.setItem(OPEN_ALL, "1");
    else window.localStorage.removeItem(OPEN_ALL);
  } catch {
    /* ignore */
  }
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** A spoiler-free note to paste anywhere. */
export function shareText(
  week: { number: number },
  day: number,
  p: Pick<Progress, "inkUsed" | "inkRanOut" | "mendedByClerk" | "deliveryTries" | "hints" | "level">,
  ink: number,
  named: Pick<WeekProgress, "namedOnDay" | "guesses">,
  site = "inkwell.social",
  points?: number,
): string {
  const left = Math.max(0, ink - p.inkUsed);
  const drops = "●".repeat(left) + "○".repeat(Math.min(ink, p.inkUsed));
  const lines = [
    `Dead Letter Office · Bundle ${week.number} · ${DAY_NAMES[day] ?? ""}${p.level ? ` · ${RULES[p.level].label}` : ""}`,
    p.mendedByClerk ? "🧩 Mended with the clerk’s help" : "🧩 Mended",
    p.inkRanOut ? `🖋️ ${drops} ink ran dry` : `🖋️ ${drops} ink to spare`,
    p.deliveryTries <= 1 ? "📮 Delivered first time" : `📮 Delivered on try ${p.deliveryTries}`,
  ];
  if (p.hints > 0) lines.push(`💡 ${p.hints} ${p.hints === 1 ? "hint" : "hints"}`);
  if (points !== undefined) lines.push(`⭐ ${points} points`);
  lines.push(
    named.namedOnDay === null
      ? "🔎 Haven’t named the writer yet"
      : `🔎 Named the writer on ${DAY_NAMES[named.namedOnDay]}${named.guesses.length > 1 ? `, guess ${named.guesses.length}` : ""}`,
  );
  lines.push(`${site}/play`);
  return lines.join("\n");
}
