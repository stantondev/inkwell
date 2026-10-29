/**
 * The stamp catalog. Keys must match `Inkwell.Stamps.Stamp` in
 * apps/api/lib/inkwell/stamps/stamp.ex (@everyday, @issues, @keepsakes,
 * @retired). The drawings live in lib/stamp-art.ts.
 *
 * Sheets:
 *  - everyday: free for everyone, always in the picker
 *  - issue: dated commemorative issues; free, and never withdrawn
 *  - keepsake: Plus members' sheet
 *  - retired: no longer offered, but stamps already given still show
 *  - abroad: a reaction from a fediverse account (its own emoji in our frame)
 */

export type StampSheet = "everyday" | "issue" | "keepsake" | "retired" | "abroad";

export interface StampInfo {
  label: string;
  /** What the stamp says, in the sender's voice. */
  description: string;
  sheet: StampSheet;
  /** Commemorative issues: when it was issued, shown on the stamp's card. */
  issued?: string;
  plusOnly?: boolean;
}

export const STAMP_CONFIG: Record<string, StampInfo> = {
  felt: { label: "Felt", description: "I felt this", sheet: "everyday" },
  rooting: { label: "Rooting For You", description: "Rooting for you", sheet: "everyday" },
  beautifully_said: { label: "Beautifully Said", description: "Beautifully said", sheet: "everyday" },
  holding_space: { label: "Holding Space", description: "Holding space for you", sheet: "everyday" },
  thank_you: { label: "Thank You", description: "Thank you for writing this", sheet: "everyday" },
  made_me_laugh: { label: "Made Me Laugh", description: "This made me laugh", sheet: "everyday" },
  first_class: { label: "First Class", description: "First-class writing", sheet: "everyday" },

  halloween_2026: {
    label: "Hallowe'en",
    description: "A treat from the dark",
    sheet: "issue",
    issued: "Hallowe'en 2026",
  },
  autumn_2026: {
    label: "Autumn Leaves",
    description: "A leaf from this autumn",
    sheet: "issue",
    issued: "Autumn 2026",
  },

  wax_seal: { label: "Sealed With Care", description: "Sealed with care", sheet: "keepsake", plusOnly: true },
  gilded: { label: "Gilded", description: "Pure gold", sheet: "keepsake", plusOnly: true },
  pressed_flower: { label: "Pressed Flower", description: "A flower for you", sheet: "keepsake", plusOnly: true },

  throwback: { label: "Throwback", description: "What a throwback", sheet: "retired" },
  i_cannot: { label: "I Cannot", description: "I cannot", sheet: "retired" },

  abroad: { label: "From Abroad", description: "Postage from the fediverse", sheet: "abroad" },
};

/** Stamps offered in the picker, in sheet order. */
export const STAMP_TYPES = Object.keys(STAMP_CONFIG).filter((k) => {
  const s = STAMP_CONFIG[k].sheet;
  return s === "everyday" || s === "issue" || s === "keepsake";
});

export const STAMP_SHEETS: { sheet: StampSheet; title: string; blurb: string }[] = [
  { sheet: "everyday", title: "Everyday stamps", blurb: "For any page that moved you" },
  { sheet: "issue", title: "Seasonal issues", blurb: "Issued once, kept forever" },
  { sheet: "keepsake", title: "Keepsakes", blurb: "A sheet for Plus members" },
];

export function stampsInSheet(sheet: StampSheet): string[] {
  return STAMP_TYPES.filter((k) => STAMP_CONFIG[k].sheet === sheet);
}

/** Backward-compat mapping for renamed stamp types */
const STAMP_ALIASES: Record<string, string> = {
  supporter: "first_class",
};

/** Resolve a stamp type, handling old/renamed types */
export function resolveStampType(type: string): string {
  return STAMP_ALIASES[type] ?? type;
}

export function stampInfo(type: string): StampInfo | null {
  return STAMP_CONFIG[resolveStampType(type)] ?? null;
}

/** Longest note a reader can tuck in with a stamp (matches the API). */
export const STAMP_NOTE_MAX = 140;

/**
 * One stamp as it sits on a post. Readers see these (no sender); the
 * writer also gets the sender and note through `StampLetter`.
 */
export interface StampMark {
  id: string;
  type: string;
  /** ISO date (day) the stamp was pressed. */
  stamped_on: string;
  /** Fediverse reactions only: the emoji, its image, and the sender's server. */
  emoji?: string | null;
  emoji_url?: string | null;
  domain?: string | null;
}

export interface StampSender {
  id?: string | null;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  /** Fediverse senders. */
  remote?: boolean;
  handle?: string | null;
  profile_url?: string | null;
}

/** A stamp with its sender and note — only ever shown to the writer it was sent to. */
export interface StampLetter extends StampMark {
  note: string | null;
  stamped_at: string;
  sender: StampSender;
}

/** A tiny, stable number from an id, for per-stamp tilt and offset. */
export function stampSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A stamp's day ("2026-10-17") as words, without going through Date: the day
 * is already the day it was stamped, so no time zone can move it, and the
 * server and browser always print the same thing.
 */
export function stampDay(stampedOn: string | null | undefined): { day: number; month: string; year: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(stampedOn ?? "");
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return { day: Number(m[3]), month, year: Number(m[1]) };
}

/** "Oct 17, 2026" (or "Oct 17" with `short`). */
export function formatStampDay(stampedOn: string | null | undefined, short = false): string {
  const d = stampDay(stampedOn);
  if (!d) return "";
  return short ? `${d.month} ${d.day}` : `${d.month} ${d.day}, ${d.year}`;
}

/** Text around a postmark's ring: INKWELL, or the sender's server for stamps from abroad. */
export function postmarkTown(mark: Pick<StampMark, "type" | "domain">): string {
  if (mark.domain) return mark.domain.toUpperCase();
  return "INKWELL";
}

/** The marks to show when an older response has only `stamps` (types present). */
export function marksFromTypes(stamps: string[] | null | undefined): StampMark[] {
  return (stamps ?? []).map((type) => ({ id: `type:${type}`, type, stamped_on: "" }));
}
