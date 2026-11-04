// How a writer's entry pages look to readers: the first letter, its ink, the
// paper and the ending. Saved in settings.entry_page (Inkwell.EntryPage on the
// API, which keeps the same lists). Posts from the fediverse use the defaults.

import { LEGACY_THEME_MAP, PROFILE_THEMES } from "./profile-themes";
import { DEFAULT_ILLUMINATION, illuminateHtml, illumination, type Illumination } from "./illuminated-initial";

export type InitialStyle = "classic" | "illuminated" | "blackletter" | "inkblot" | "none";
export type InitialInk = "blue" | "accent" | "black" | "red" | "gold";
export type PagePaper = "cream" | "notebook" | "parchment" | "kraft";
export type PageEnding = "inkdrop" | "fleuron" | "quill" | "rule" | "none";
export type TextInk = "page" | "blueblack" | "irongall" | "sepia" | "green" | "oxblood" | "violet";

export interface EntryPageStyle {
  initial: InitialStyle;
  ink: InitialInk;
  paper: PagePaper;
  ending: PageEnding;
  signature: boolean;
  /** The motif on an Illuminated first letter (Plus). */
  illumination: Illumination;
  /** The colour of the writing itself (Plus). "page" keeps the page's own. */
  text_ink: TextInk;
}

export const DEFAULT_ENTRY_PAGE: EntryPageStyle = {
  initial: "classic",
  ink: "blue",
  paper: "cream",
  ending: "inkdrop",
  signature: true,
  illumination: DEFAULT_ILLUMINATION,
  text_ink: "page",
};

export const INITIALS: { id: InitialStyle; label: string; blurb: string; plus?: boolean }[] = [
  { id: "classic", label: "Classic", blurb: "A tall serif capital, set into the first lines." },
  {
    id: "illuminated",
    label: "Inkwell Illuminated",
    blurb: "A gilded manuscript capital that catches the light when the entry opens, in one of four illuminations.",
    plus: true,
  },
  { id: "blackletter", label: "Blackletter", blurb: "An old-style gothic capital, the way old books began." },
  { id: "inkblot", label: "Ink blot", blurb: "The first letter written over a spill of ink." },
  { id: "none", label: "None", blurb: "Start plainly, with no large first letter." },
];

export const INKS: { id: InitialInk; label: string }[] = [
  { id: "blue", label: "Inkwell blue" },
  { id: "accent", label: "Your page's accent" },
  { id: "black", label: "Black ink" },
  { id: "red", label: "Red ink" },
  { id: "gold", label: "Gold" },
];

/**
 * Inks for the writing itself. Each has a lighter dark-mode version
 * (--text-ink-* in globals.css); every pair was checked at 6.3:1 or better
 * against every paper in both modes. `swatch` is the light-mode colour.
 */
export const TEXT_INKS: { id: TextInk; label: string; swatch: string | null }[] = [
  { id: "page", label: "The page's own", swatch: null },
  { id: "blueblack", label: "Blue-black", swatch: "#1f2d4f" },
  { id: "irongall", label: "Iron gall", swatch: "#3a2a1e" },
  { id: "sepia", label: "Sepia", swatch: "#5a3b22" },
  { id: "green", label: "Forest green", swatch: "#1f4430" },
  { id: "oxblood", label: "Oxblood", swatch: "#5e1f1f" },
  { id: "violet", label: "Violet", swatch: "#3b2a5c" },
];

export const PAPERS: { id: PagePaper; label: string; blurb: string }[] = [
  { id: "cream", label: "Plain", blurb: "Inkwell's own page." },
  { id: "notebook", label: "Notebook", blurb: "A red margin line and punched holes." },
  { id: "parchment", label: "Parchment", blurb: "Warm, aged paper, darker at the edges." },
  { id: "kraft", label: "Kraft", blurb: "Brown paper, like a parcel or a sketchbook." },
];

export const ENDINGS: { id: PageEnding; label: string }[] = [
  { id: "inkdrop", label: "Ink drop" },
  { id: "fleuron", label: "Fleuron" },
  { id: "quill", label: "Quill" },
  { id: "rule", label: "Three stars" },
  { id: "none", label: "Nothing" },
];

function oneOf<T extends string>(value: unknown, list: { id: T }[], fallback: T): T {
  return list.some((o) => o.id === value) ? (value as T) : fallback;
}

/** A style from the API (or anything else), with defaults filled in. */
export function entryPageStyle(raw: unknown): EntryPageStyle {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    initial: oneOf(s.initial, INITIALS, DEFAULT_ENTRY_PAGE.initial),
    ink: oneOf(s.ink, INKS, DEFAULT_ENTRY_PAGE.ink),
    paper: oneOf(s.paper, PAPERS, DEFAULT_ENTRY_PAGE.paper),
    ending: oneOf(s.ending, ENDINGS, DEFAULT_ENTRY_PAGE.ending),
    signature: typeof s.signature === "boolean" ? s.signature : DEFAULT_ENTRY_PAGE.signature,
    illumination: illumination(s.illumination),
    text_ink: oneOf(s.text_ink, TEXT_INKS, DEFAULT_ENTRY_PAGE.text_ink),
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The colour of the first letter. "accent" uses the writer's own accent when they have one. */
export function inkColour(ink: InitialInk, accent?: string | null): string {
  switch (ink) {
    case "accent":
      return accent && HEX.test(accent) ? accent : "var(--accent)";
    case "black":
      return "var(--initial-black)";
    case "red":
      return "var(--initial-red)";
    case "gold":
      return "var(--initial-gold)";
    default:
      return "var(--initial-blue)";
  }
}

/** The opening character of a post's text, entities decoded well enough to test it. */
function firstCharacter(html: string): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, "x")
    .trimStart();
  return text.charAt(0);
}

/**
 * The initial design to draw for this text. The gothic designs only have
 * Latin letters, so a post opening with another script gets the Classic
 * capital; one opening with a digit, a quote mark or an @mention gets none.
 */
export function initialFor(style: InitialStyle, html: string): InitialStyle {
  if (style === "none") return "none";
  const first = firstCharacter(html);
  if (!/\p{L}/u.test(first)) return "none";
  // A post that opens with a bare link would get a giant "h".
  if (/^\s*https?:\/\//i.test(html.replace(/<[^>]+>/g, ""))) return "none";
  if ((style === "illuminated" || style === "blackletter") && !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(first)) return "classic";
  return style;
}

/** Classes for the page and the body text. */
export function entryPageClasses(style: EntryPageStyle, initial: InitialStyle) {
  return {
    page: `entry-letter page-paper-${style.paper} page-initial-${initial}${
      style.text_ink === "page" ? "" : ` page-text-${style.text_ink}`
    }`,
    body: initial === "none" ? "" : initial === "illuminated" ? "illum-cap" : "drop-cap",
  };
}

/** How to set an entry's first letter on an Illuminated tile. */
export interface IlluminationOpts {
  motif: Illumination;
  onGold: boolean;
}

/**
 * The first letter an entry actually opens with. For Illuminated it also
 * gives the tile to put around that letter (`illumination`) and the HTML with
 * the tile in place (`illuminatedHtml`). Pages that show the writer's HTML
 * through EntryContent pass `illumination` to it, because its cleaning step
 * removes SVG; the tile is added after that. Entries without a title (or
 * whose text can't take a tile) fall back.
 */
export function entryOpening(style: EntryPageStyle, hasTitle: boolean, html: string) {
  const initial = hasTitle ? initialFor(style.initial, html) : "none";
  if (initial !== "illuminated") return { initial, illumination: null, illuminatedHtml: null };
  const opts: IlluminationOpts = { motif: style.illumination, onGold: style.ink === "gold" };
  const lit = illuminateHtml(html, opts.motif, opts);
  return lit
    ? { initial, illumination: opts, illuminatedHtml: lit }
    : { initial: "classic" as InitialStyle, illumination: null, illuminatedHtml: null };
}

const TILES: Record<InitialInk, string> = {
  blue: "#2d4a8a",
  accent: "#2d4a8a",
  black: "#1f1b17",
  red: "#8f2a22",
  gold: "#b38a2e",
};

/**
 * CSS variables for the first letter: --initial-ink (the letter itself, with
 * light and dark versions), --initial-tile (the inked square behind an
 * Illuminated or Ink blot letter, the same in both modes, like a printed
 * object) and --initial-on (the letter drawn on that tile).
 */
export function inkVars(ink: InitialInk, accent?: string | null): Record<string, string> {
  const tile = ink === "accent" && accent && HEX.test(accent) ? accent : TILES[ink];
  return {
    "--initial-ink": inkColour(ink, accent),
    "--initial-tile": tile,
    "--initial-on": ink === "gold" ? "#24180a" : "#f6e9c4",
  };
}

/** The writer's own page accent: their custom colour (Plus) or their theme's. */
export function writerAccent(author: {
  subscription_tier?: string | null;
  profile_accent_color?: string | null;
  profile_theme?: string | null;
}): string | null {
  if (author.subscription_tier === "plus" && author.profile_accent_color) return author.profile_accent_color;
  const id = author.profile_theme ? LEGACY_THEME_MAP[author.profile_theme] ?? author.profile_theme : null;
  return PROFILE_THEMES.find((t) => t.id === id)?.vars["--profile-accent"] ?? null;
}
