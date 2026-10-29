/**
 * Seasonal decorations: the site dresses up for a holiday, by itself, for a
 * few days around it. Halloween is the first; the rest go in SEASONS.
 *
 * How a season shows:
 *  - the root layout puts `data-season="<id>"` on <body> (colours, glows,
 *    cobwebs: CSS under `body[data-season="…"]` in globals.css)
 *  - `SeasonProvider` hands the id to client components (the logo's
 *    decorations, the drifting bats, the trick-or-treat pumpkin)
 *  - the favicon swaps to the season's own (public/favicon-<id>.svg)
 *
 * Off for a reader who turned decorations off (`settings.seasonal_decorations
 * === false`, or the `inkwell-seasonal=off` cookie for signed-out visitors),
 * and never on a writer's custom domain or a downloaded site (their page is
 * theirs). `INKWELL_SEASON=halloween|off` on the web server forces it, for
 * trying a season out of its dates.
 */

export type SeasonId = "halloween";

export interface Season {
  id: SeasonId;
  name: string;
  /** Inclusive start and exclusive end, as UTC month/day/hour. */
  from: { month: number; day: number; hour?: number };
  to: { month: number; day: number; hour?: number };
}

export const SEASONS: Season[] = [
  // A week of build-up, through the evening of the 31st everywhere (Hawaii's
  // Halloween night ends around 10:00 UTC on November 1).
  { id: "halloween", name: "Hallowe'en", from: { month: 10, day: 24 }, to: { month: 11, day: 1, hour: 12 } },
];

export const SEASON_COOKIE = "inkwell-seasonal";

function at(year: number, p: { month: number; day: number; hour?: number }): number {
  return Date.UTC(year, p.month - 1, p.day, p.hour ?? 0);
}

/** The season running at this moment, if any (by date alone). */
export function seasonAt(date: Date = new Date()): SeasonId | null {
  const t = date.getTime();
  const y = date.getUTCFullYear();
  for (const s of SEASONS) {
    // A season may cross New Year: try this year's and last year's window.
    for (const year of [y, y - 1]) {
      const from = at(year, s.from);
      let to = at(year, s.to);
      if (to <= from) to = at(year + 1, s.to);
      if (t >= from && t < to) return s.id;
    }
  }
  return null;
}

function forced(): SeasonId | null | undefined {
  const v = typeof process !== "undefined" ? process.env.INKWELL_SEASON : undefined;
  if (!v) return undefined;
  if (v === "off") return null;
  return SEASONS.some((s) => s.id === v) ? (v as SeasonId) : undefined;
}

/** The season the site shows right now, by date (and the server override). */
export function siteSeason(date: Date = new Date()): SeasonId | null {
  const f = forced();
  return f === undefined ? seasonAt(date) : f;
}

/** Whether this reader turned seasonal decorations off. */
export function decorationsOff(settings: Record<string, unknown> | null | undefined, cookie: string | undefined): boolean {
  if (settings && settings.seasonal_decorations === false) return true;
  return cookie === "off";
}

export function seasonName(id: SeasonId | null): string | null {
  return SEASONS.find((s) => s.id === id)?.name ?? null;
}
