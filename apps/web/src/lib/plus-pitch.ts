// How Inkwell describes what members pay for. One source, so the landing page,
// onboarding, billing, the sidebar and the Feed card all say the same thing.
//
// The order is deliberate: the things writers on comparable sites actually pay
// for (their own domain, knowing who reads them, a page that's theirs) come
// first, and the long tail goes in one "also" line. Profile themes are free —
// don't list them here.

export interface PlusPoint {
  title: string;
  detail: string;
}

export const PLUS_POINTS: PlusPoint[] = [
  { title: "Your own domain", detail: "yourname.com, with your journal behind it." },
  { title: "See who's reading", detail: "Reads by day, your most-read entries, and where readers came from." },
  { title: "A page that looks like you", detail: "Custom colors, fonts, backgrounds, music, HTML & CSS." },
  { title: "A bigger newsletter", detail: "Unlimited subscribers, 8 sends a month, scheduling." },
];

export const PLUS_EXTRAS =
  "1 GB of images (growing 1 GB a year), unlimited drafts and series, cross-posting to Mastodon, " +
  "Post by Email, write access to the API, Plus stickers and avatar frames, and a sheet of Keepsake stamps.";

/** One line for small spaces (the sidebar card, the Feed card). */
export const PLUS_SHORT = "Your own domain, reader stats, a page that looks like you";

/** Why paying matters, said once wherever we ask. */
export const MEMBERS_LINE = "Inkwell has no ads and no investors. Members pay for the servers.";

export interface FoundingStatus {
  cap: number;
  sold: number;
  remaining: number;
  price_cents: number;
  next_price_cents?: number | null;
  price_rises_at?: string | null;
  raised_cents?: number;
}

export function dollars(cents: number): string {
  const d = cents / 100;
  return `$${d % 1 === 0 ? d.toFixed(0) : d.toFixed(2)}`;
}

/**
 * The last day at the current price, e.g. "October 31". The rise happens at
 * midnight Eastern, so name the day before it in that zone. A fixed time zone
 * keeps the server and the browser agreeing (no hydration mismatch).
 */
export function lastDayAtPrice(f: FoundingStatus | null | undefined): string | null {
  if (!f?.price_rises_at || !f.next_price_cents) return null;
  const at = Date.parse(f.price_rises_at);
  if (Number.isNaN(at) || at <= Date.now()) return null;
  return new Date(at - 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

/** "Goes up to $149 after October 31" — or null when no rise is planned. */
export function foundingPriceNote(f: FoundingStatus | null | undefined): string | null {
  const day = lastDayAtPrice(f);
  if (!f || !day || !f.next_price_cents) return null;
  return `Goes up to ${dollars(f.next_price_cents)} after ${day}`;
}
