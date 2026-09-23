/**
 * The archive mark on imported posts: a postmark naming where a post first
 * lived, and a cover letter clipped to it on the entry page. See
 * `Inkwell.Journals.Archive` on the API side.
 */

const ORIGIN_NAMES: Record<string, string> = {
  livejournal: "LiveJournal",
  dreamwidth: "Dreamwidth",
  wordpress: "WordPress",
  medium: "Medium",
  substack: "Substack",
};

export function archiveOriginName(origin: string | null | undefined): string {
  if (!origin) return "an earlier journal";
  return ORIGIN_NAMES[origin] ?? origin.charAt(0).toUpperCase() + origin.slice(1);
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Postmark date parts, in UTC so server and browser agree. */
export function postmarkDate(iso: string | null | undefined) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return {
    year: d.getUTCFullYear(),
    monthDay: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`,
    long: d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
  };
}

export const ARCHIVE_ASIDE_KEY = "inkwell-archive-letters-aside";
