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
  "Post by Email, write access to the API, illuminated first letters, Plus stickers and avatar frames, and a sheet of Keepsake stamps.";

/** One line for small spaces (the sidebar card, the Feed card). */
export const PLUS_SHORT = "Members keep Inkwell running, and get Plus";

/** Why paying matters, said once wherever we ask. */
export const MEMBERS_LINE = "Inkwell has no ads and no investors. Members pay the monthly bills.";

// ── Membership (Plus) levels ────────────────────────────────────────────────
// Since 2026-11-20 Plus is offered as membership: yearly first, and two
// levels. Member is today's price; Supporter is the same membership at twice
// the price, for people who want to cover someone else's share. Nobody gets
// more features for paying more, and nothing is pre-selected but Member.

export type PlusLevel = "member" | "supporter";
export type PlusInterval = "month" | "year";

export interface PlusPrices {
  memberMonth: number; // cents
  memberYear: number;
  supporterMonth: number;
  supporterYear: number;
  annualAvailable: boolean;
  supporterAvailable: boolean;
}

export const LEVEL_INFO: Record<PlusLevel, { name: string; note: string }> = {
  member: { name: "Member", note: "Your share of the bills" },
  supporter: { name: "Supporter", note: "Your share and someone else's" },
};

/** Prices from `GET /api/billing/status`, with today's prices as fallbacks. */
export function plusPricesFrom(status: {
  plus_annual_available?: boolean;
  plus_annual_cents?: number;
  plus_supporter_available?: boolean;
  plus_supporter_cents?: number;
  plus_supporter_annual_cents?: number;
} | null | undefined): PlusPrices {
  return {
    memberMonth: 500,
    memberYear: status?.plus_annual_cents ?? 5000,
    supporterMonth: status?.plus_supporter_cents ?? 1000,
    supporterYear: status?.plus_supporter_annual_cents ?? 10000,
    annualAvailable: !!status?.plus_annual_available,
    supporterAvailable: !!status?.plus_supporter_available,
  };
}

/** What will actually be sent: never a level or interval that isn't on sale. */
export function plusChoice(p: PlusPrices, level: PlusLevel, interval: PlusInterval) {
  return {
    level: p.supporterAvailable ? level : "member",
    interval: p.annualAvailable ? interval : "month",
  } as { level: PlusLevel; interval: PlusInterval };
}

export function plusPriceCents(p: PlusPrices, level: PlusLevel, interval: PlusInterval): number {
  const c = plusChoice(p, level, interval);
  if (c.level === "supporter") return c.interval === "year" ? p.supporterYear : p.supporterMonth;
  return c.interval === "year" ? p.memberYear : p.memberMonth;
}

/** "$50 a year" / "$5 a month". */
export function plusPriceLabel(p: PlusPrices, level: PlusLevel, interval: PlusInterval): string {
  const c = plusChoice(p, level, interval);
  return `${dollars(plusPriceCents(p, level, interval))} a ${c.interval === "year" ? "year" : "month"}`;
}

/**
 * "Inkwell's bills are $80 a month. Members cover $10 of that. That's 16
 * members at $5." A public fact, said where we ask, never to one person.
 * Null when the numbers aren't known.
 */
export function billsLine(costCents?: number | null, coveredCents?: number | null): string | null {
  if (!costCents || costCents <= 0 || coveredCents == null || coveredCents < 0) return null;
  const needed = Math.ceil(costCents / 500);
  const cover =
    coveredCents >= costCents
      ? "Members cover all of it."
      : `Members cover ${dollars(Math.round(coveredCents / 100) * 100)} of that.`;
  return `Inkwell's bills are ${dollars(Math.round(costCents / 100) * 100)} a month. ${cover} That's ${needed} members at $5.`;
}

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
