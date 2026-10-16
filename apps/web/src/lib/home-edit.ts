/**
 * Pure edits to a profile home (lib/profile-home.ts) for the Arrange my page
 * editor: moving blocks, column layouts, templates and Shuffle. Every
 * function returns a new home; the API cleans whatever is saved
 * (Inkwell.ProfileHome.normalize), so these only need to keep the editor sane.
 */

import {
  SINGLETON_BLOCKS,
  type ProfileSticker,
  type ProfileBlock,
  type ProfileBlockConfig,
  type ProfileBlockType,
  type ProfileColumn,
  type ProfileHome,
  type ProfileSection,
} from "./profile-home";

// ── Catalog ──────────────────────────────────────────────────────────────

export interface BlockInfo {
  label: string;
  blurb: string;
  /** Can't be taken off the page. */
  fixed?: boolean;
  /** Has settings to edit. */
  editable?: boolean;
  /** Made by the writer (repeatable), as opposed to a piece of their profile. */
  own?: boolean;
  plusOnly?: boolean;
}

export const BLOCK_INFO: Record<ProfileBlockType, BlockInfo> = {
  profile_card: { label: "Profile card", blurb: "Your picture, name, bio and the follow button.", fixed: true },
  entries: { label: "Journal entries", blurb: "Your entries, with search and the archive.", fixed: true, editable: true },
  pinned: { label: "Pinned entries", blurb: "Up to three entries you've pinned." },
  top_pals: { label: "Top pen pals", blurb: "The six pen pals you choose." },
  tags: { label: "Tags", blurb: "The tags you write about most." },
  series: { label: "Series", blurb: "Your series of entries." },
  music: { label: "Music", blurb: "Your profile song, or what you're listening to." },
  guestbook: { label: "Guestbook", blurb: "Notes visitors leave you." },
  support: { label: "Support link", blurb: "Your Ko-fi, Patreon or similar." },
  newsletter: { label: "Newsletter sign-up", blurb: "Readers can subscribe by email." },
  custom_html: { label: "Custom HTML", blurb: "The card you write in Customize.", plusOnly: true },
  rss: { label: "RSS feed", blurb: "A link to your journal's feed." },
  now: { label: "Currently", blurb: "What you're reading, listening to, feeling…", editable: true, own: true },
  note: { label: "Note", blurb: "A few words: a card, sticky note, index card or letter.", editable: true, own: true },
  photo: { label: "Photo", blurb: "A picture, plain, as a polaroid or taped in.", editable: true, own: true },
  quote: { label: "Quote", blurb: "Words you love, and who said them.", editable: true, own: true },
  countdown: { label: "Countdown", blurb: "Days until (or since) a date that matters.", editable: true, own: true },
  links: { label: "Links", blurb: "Your other places on the web.", editable: true, own: true },
  divider: { label: "Divider", blurb: "A line between parts of your page.", editable: true, own: true },
};

/** New blocks the writer can add, in tray order. */
export const OWN_BLOCKS: ProfileBlockType[] = ["note", "photo", "quote", "now", "countdown", "links", "divider"];

export function isSingleton(type: ProfileBlockType): boolean {
  return SINGLETON_BLOCKS.includes(type);
}

export function defaultConfig(type: ProfileBlockType): ProfileBlockConfig {
  switch (type) {
    case "note":
      return { style: "sticky", color: "yellow", title: "", body: "" };
    case "photo":
      return { style: "polaroid", image_id: null, caption: "", alt: "" };
    case "quote":
      return { text: "", cite: "" };
    case "now":
      return { items: [{ label: "Reading", value: "" }, { label: "Listening to", value: "" }, { label: "Feeling", value: "" }] };
    case "countdown":
      return { label: "", date: null };
    case "links":
      return { title: "", items: [] };
    case "divider":
      return { style: "wavy" };
    default:
      return {};
  }
}

// ── Ids ──────────────────────────────────────────────────────────────────

export function newId(prefix: "s" | "c" | "b"): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8)}`;
}

export function newBlock(type: ProfileBlockType): ProfileBlock {
  return {
    id: isSingleton(type) ? `b-${type.replace(/_/g, "-")}-${newId("b").slice(2, 6)}` : newId("b"),
    type,
    config: defaultConfig(type),
  };
}

// ── Reading ──────────────────────────────────────────────────────────────

export function findBlock(home: ProfileHome, id: string): { block: ProfileBlock; section: ProfileSection; column: ProfileColumn; index: number } | null {
  for (const section of home.sections) {
    for (const column of section.columns) {
      const index = column.blocks.findIndex((b) => b.id === id);
      if (index >= 0) return { block: column.blocks[index], section, column, index };
    }
  }
  return null;
}

export function findColumn(home: ProfileHome, id: string): { section: ProfileSection; column: ProfileColumn } | null {
  for (const section of home.sections) {
    const column = section.columns.find((c) => c.id === id);
    if (column) return { section, column };
  }
  return null;
}

export function typesOnPage(home: ProfileHome): Set<ProfileBlockType> {
  return new Set(home.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks.map((b) => b.type))));
}

// ── Editing blocks ───────────────────────────────────────────────────────

function mapColumns(home: ProfileHome, fn: (c: ProfileColumn, s: ProfileSection) => ProfileColumn): ProfileHome {
  return { ...home, sections: home.sections.map((s) => ({ ...s, columns: s.columns.map((c) => fn(c, s)) })) };
}

/** Takes a block off the page, with any stickers on it. */
export function removeBlock(home: ProfileHome, id: string): ProfileHome {
  return pruneStickers(liftBlock(home, id));
}

/** Takes a block out to put it somewhere else: its stickers stay on it. */
function liftBlock(home: ProfileHome, id: string): ProfileHome {
  return mapColumns(home, (c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== id) }));
}

export function insertBlock(home: ProfileHome, block: ProfileBlock, columnId: string, index?: number): ProfileHome {
  return mapColumns(home, (c) => {
    if (c.id !== columnId) return c;
    const blocks = [...c.blocks];
    blocks.splice(index ?? blocks.length, 0, block);
    return { ...c, blocks };
  });
}

export function moveBlock(home: ProfileHome, id: string, toColumnId: string, toIndex: number): ProfileHome {
  const found = findBlock(home, id);
  if (!found) return home;
  let index = toIndex;
  if (found.column.id === toColumnId && found.index < toIndex) index -= 1;
  return insertBlock(liftBlock(home, id), found.block, toColumnId, Math.max(0, index));
}

/** One step up or down through the page, crossing into the neighbouring column or section. */
export function nudgeBlock(home: ProfileHome, id: string, dir: -1 | 1): ProfileHome {
  const found = findBlock(home, id);
  if (!found) return home;
  const target = found.index + dir;
  if (target >= 0 && target < found.column.blocks.length) {
    return moveBlock(home, id, found.column.id, dir === 1 ? target + 1 : target);
  }
  const columns = home.sections.flatMap((s) => s.columns);
  const ci = columns.findIndex((c) => c.id === found.column.id);
  const next = columns[ci + dir];
  if (!next) return home;
  return moveBlock(home, id, next.id, dir === 1 ? 0 : next.blocks.length);
}

/** The column beside a block's own in the same row (dir -1: left, 1: right), if there is one. */
export function neighbourColumn(home: ProfileHome, id: string, dir: -1 | 1): ProfileColumn | null {
  const found = findBlock(home, id);
  if (!found || found.section.style !== "columns") return null;
  const ci = found.section.columns.findIndex((c) => c.id === found.column.id);
  return found.section.columns[ci + dir] ?? null;
}

/** Move a block into the column to its left or right, at the same height where it can. */
export function moveAcross(home: ProfileHome, id: string, dir: -1 | 1): ProfileHome {
  const found = findBlock(home, id);
  const target = neighbourColumn(home, id, dir);
  if (!found || !target) return home;
  return moveBlock(home, id, target.id, Math.min(found.index, target.blocks.length));
}

/** Where a drag will land: before or after a block, or at the end of a column. */
export type DropTarget =
  | { columnId: string; blockId: string; edge: "before" | "after" }
  | { columnId: string; blockId: null; edge: "end" };

/** The index in its column that a drop target stands for. */
export function dropIndex(home: ProfileHome, target: DropTarget): number {
  const col = home.sections.flatMap((x) => x.columns).find((c) => c.id === target.columnId);
  if (!col) return 0;
  if (target.blockId === null) return col.blocks.length;
  const i = col.blocks.findIndex((b) => b.id === target.blockId);
  if (i < 0) return col.blocks.length;
  return target.edge === "before" ? i : i + 1;
}

/** Move an existing block to a drop target. Dropping a block onto itself changes nothing. */
export function dropBlock(home: ProfileHome, id: string, target: DropTarget): ProfileHome {
  if (target.blockId === id) return home;
  if (!home.sections.some((x) => x.columns.some((c) => c.id === target.columnId))) return home;
  return moveBlock(home, id, target.columnId, dropIndex(home, target));
}

export function updateConfig(home: ProfileHome, id: string, config: ProfileBlockConfig): ProfileHome {
  return mapColumns(home, (c) => ({
    ...c,
    blocks: c.blocks.map((b) => (b.id === id ? { ...b, config: { ...b.config, ...config } } : b)),
  }));
}

// ── Sections ─────────────────────────────────────────────────────────────

export interface LayoutPreset {
  id: string;
  label: string;
  spans: number[];
  style: ProfileSection["style"];
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: "1", label: "One column", spans: [12], style: "columns" },
  { id: "6-6", label: "Two halves", spans: [6, 6], style: "columns" },
  { id: "8-4", label: "Wide and narrow", spans: [8, 4], style: "columns" },
  { id: "4-8", label: "Narrow and wide", spans: [4, 8], style: "columns" },
  { id: "9-3", label: "Main and sidebar", spans: [9, 3], style: "columns" },
  { id: "3-9", label: "Sidebar and main", spans: [3, 9], style: "columns" },
  { id: "4-4-4", label: "Three columns", spans: [4, 4, 4], style: "columns" },
  { id: "3-3-3-3", label: "Four columns", spans: [3, 3, 3, 3], style: "columns" },
  { id: "flow", label: "A band of cards", spans: [12], style: "flow" },
];

export function presetOf(section: ProfileSection): string | null {
  const spans = section.columns.map((c) => c.span).join("-");
  const match = LAYOUT_PRESETS.find((p) => p.style === section.style && p.spans.join("-") === (section.style === "flow" ? "12" : spans));
  return match?.id ?? null;
}

/** Re-cut a section into a preset's columns. Blocks keep their order; extra columns' blocks join the last one. */
export function applyPreset(home: ProfileHome, sectionId: string, preset: LayoutPreset): ProfileHome {
  return {
    ...home,
    sections: home.sections.map((s) => {
      if (s.id !== sectionId) return s;
      const old = s.columns;
      const columns: ProfileColumn[] = preset.spans.map((span, i) => ({
        id: old[i]?.id ?? newId("c"),
        span,
        blocks: old[i]?.blocks ?? [],
      }));
      const spill = old.slice(preset.spans.length).flatMap((c) => c.blocks);
      columns[columns.length - 1] = { ...columns[columns.length - 1], blocks: [...columns[columns.length - 1].blocks, ...spill] };
      return { ...s, style: preset.style, columns };
    }),
  };
}

export function addSection(home: ProfileHome, atIndex: number, preset: LayoutPreset = LAYOUT_PRESETS[0]): { home: ProfileHome; section: ProfileSection } {
  const section: ProfileSection = {
    id: newId("s"),
    style: preset.style,
    columns: preset.spans.map((span) => ({ id: newId("c"), span, blocks: [] })),
  };
  const sections = [...home.sections];
  sections.splice(atIndex, 0, section);
  return { home: { ...home, sections }, section };
}

export function moveSection(home: ProfileHome, id: string, dir: -1 | 1): ProfileHome {
  const i = home.sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= home.sections.length) return home;
  const sections = [...home.sections];
  [sections[i], sections[j]] = [sections[j], sections[i]];
  return { ...home, sections };
}

/** Whether a section can go: it mustn't hold the profile card or entries. */
export function sectionRemovable(section: ProfileSection): boolean {
  return !section.columns.some((c) => c.blocks.some((b) => BLOCK_INFO[b.type].fixed));
}

export function removeSection(home: ProfileHome, id: string): ProfileHome {
  return pruneStickers({ ...home, sections: home.sections.filter((s) => s.id !== id) });
}

/** Move the border between columns `left` and `left + 1` by `delta` grid units. */
export function resizeColumns(home: ProfileHome, sectionId: string, left: number, delta: number): ProfileHome {
  return {
    ...home,
    sections: home.sections.map((s) => {
      if (s.id !== sectionId || !s.columns[left + 1]) return s;
      const a = s.columns[left];
      const b = s.columns[left + 1];
      const d = Math.max(2 - a.span, Math.min(b.span - 2, delta));
      if (d === 0) return s;
      const columns = [...s.columns];
      columns[left] = { ...a, span: a.span + d };
      columns[left + 1] = { ...b, span: b.span - d };
      return { ...s, columns };
    }),
  };
}

// ── Templates and Shuffle ────────────────────────────────────────────────

export interface Template {
  id: string;
  label: string;
  blurb: string;
  build: (pieces: Pieces) => ProfileHome;
}

/** What a page is made of, sorted so a template can lay it out again without losing anything. */
interface Pieces {
  card: ProfileBlock;
  entries: ProfileBlock;
  pinned: ProfileBlock | null;
  rss: ProfileBlock | null;
  now: ProfileBlock | null;
  /** Profile widgets (pen pals, guestbook…) in page order. */
  widgets: ProfileBlock[];
  /** The writer's own notes, photos, quotes… in page order. */
  keepsakes: ProfileBlock[];
  /** A divider for a layout's slot: one of the writer's own if any are left, else a new one in this style. */
  divider: (style?: string) => ProfileBlock;
  /** The writer's dividers no slot used, so nothing is lost. */
  spareDividers: () => ProfileBlock[];
}

function piecesOf(home: ProfileHome): Pieces {
  const all = home.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks));
  const pool = all.filter((b) => b.type === "divider");
  const take = (t: ProfileBlockType) => all.find((b) => b.type === t) ?? null;
  return {
    card: take("profile_card") ?? newBlock("profile_card"),
    entries: take("entries") ?? newBlock("entries"),
    pinned: take("pinned"),
    rss: take("rss"),
    now: take("now"),
    widgets: all.filter((b) => isSingleton(b.type) && !["profile_card", "entries", "pinned", "rss", "now"].includes(b.type)),
    keepsakes: all.filter((b) => !isSingleton(b.type) && b.type !== "divider"),
    divider: (style = "line") => pool.shift() ?? { id: newId("b"), type: "divider", config: { style } },
    spareDividers: () => pool.splice(0),
  };
}

/** A built page plus anything of the writer's no slot took, at the end of its last column. */
function keepSpares(home: ProfileHome, spares: ProfileBlock[]): ProfileHome {
  if (spares.length === 0 || home.sections.length === 0) return home;
  const sections = [...home.sections];
  const last = sections[sections.length - 1];
  const cols = [...last.columns];
  cols[cols.length - 1] = { ...cols[cols.length - 1], blocks: [...cols[cols.length - 1].blocks, ...spares] };
  sections[sections.length - 1] = { ...last, columns: cols };
  return { ...home, sections };
}

const sec = (style: ProfileSection["style"], ...cols: [number, (ProfileBlock | null)[]][]): ProfileSection => ({
  id: newId("s"),
  style,
  columns: cols.map(([span, blocks]) => ({ id: newId("c"), span, blocks: blocks.filter((b): b is ProfileBlock => !!b) })),
});

/** The entries block as a layout wants it: how they look and how many show. */
const withDisplay = (
  entries: ProfileBlock,
  magazine: boolean,
  shelf?: { display: ProfileBlockConfig["display"]; limit: number },
): ProfileBlock => ({
  ...entries,
  config: shelf
    ? { ...entries.config, display: shelf.display, limit: shelf.limit }
    : {
        ...entries.config,
        display: magazine ? "magazine" : entries.config.display === "magazine" ? undefined : entries.config.display,
        limit: undefined,
      },
});

function page(width: ProfileHome["width"], sections: ProfileSection[]): ProfileHome {
  return { version: 1, width, sections: sections.filter((s) => s.columns.some((c) => c.blocks.length > 0)), stickers: [] };
}

/** Splits blocks into n columns, round-robin, so each column gets a share. */
function deal(blocks: ProfileBlock[], n: number): ProfileBlock[][] {
  const out: ProfileBlock[][] = Array.from({ length: n }, () => []);
  blocks.forEach((b, i) => out[i % n].push(b));
  return out;
}

export const TEMPLATES: Template[] = [
  {
    id: "classic",
    label: "Classic journal",
    blurb: "Entries with a sidebar.",
    build: (p) =>
      page("standard", [
        sec("columns", [12, [p.card]]),
        sec("columns", [12, [p.divider()]]),
        sec("columns", [12, [p.pinned]]),
        sec("columns", [9, [withDisplay(p.entries, false)]], [3, [p.now, ...p.keepsakes, ...p.widgets, p.rss]]),
      ]),
  },
  {
    id: "scrapbook",
    label: "Scrapbook",
    blurb: "Photos and notes up top, your latest entries as a shelf, cards below.",
    build: (p) => {
      // Up to three slots: whatever's already made, then a photo, note and
      // quote it doesn't have yet (empty ones don't show to visitors).
      const have = new Set(p.keepsakes.map((b) => b.type));
      const extra = (["photo", "note", "quote"] as const).filter((t) => !have.has(t)).slice(0, Math.max(0, 3 - p.keepsakes.length));
      const keepsakes = [...p.keepsakes, ...extra.map(newBlock)];
      const [a, b, c] = deal(keepsakes, 3);
      // Entries are a shelf of the latest six across the page, so nothing
      // runs on beside them; the rest of the journal is a link away.
      return page("standard", [
        sec("columns", [12, [p.card]]),
        sec("columns", [4, a], [4, b], [4, c]),
        sec("columns", [12, [p.divider("stitch")]]),
        sec("columns", [12, [p.pinned]]),
        sec("columns", [12, [withDisplay(p.entries, false, { display: "cards", limit: 6 })]]),
        sec("columns", [12, [p.divider("wavy")]]),
        sec("flow", [12, [p.now, ...p.widgets, p.rss]]),
      ]);
    },
  },
  {
    id: "scrapbook-sidebar",
    label: "Scrapbook with sidebar",
    blurb: "Photos and notes up top, your latest entries beside a sidebar of your cards.",
    build: (p) => {
      const have = new Set(p.keepsakes.map((b) => b.type));
      const extra = (["photo", "note", "quote"] as const).filter((t) => !have.has(t)).slice(0, Math.max(0, 3 - p.keepsakes.length));
      const keepsakes = [...p.keepsakes, ...extra.map(newBlock)];
      const [a, b, c] = deal(keepsakes, 3);
      // The latest six entries as cards beside the sidebar, so the two end
      // at about the same place; the rest of the journal is a link away.
      return page("standard", [
        sec("columns", [12, [p.card]]),
        sec("columns", [4, a], [4, b], [4, c]),
        sec("columns", [12, [p.divider("stitch")]]),
        sec("columns", [12, [p.pinned]]),
        sec("columns", [8, [withDisplay(p.entries, false, { display: "cards", limit: 6 })]], [4, [p.now, ...p.widgets, p.rss]]),
      ]);
    },
  },
  {
    id: "desk",
    label: "Writer's desk",
    blurb: "Your card beside what you're up to.",
    build: (p) =>
      page("standard", [
        sec("columns", [8, [p.card]], [4, [p.now ?? newBlock("now"), ...p.keepsakes.slice(0, 1)]]),
        sec("columns", [12, [p.divider("stars")]]),
        sec("columns", [12, [p.pinned]]),
        sec("columns", [9, [withDisplay(p.entries, false)]], [3, [...p.keepsakes.slice(1), ...p.widgets, p.rss]]),
      ]),
  },
  {
    id: "wide",
    label: "Wide",
    blurb: "Entries across the page, cards below.",
    build: (p) =>
      page("standard", [
        sec("columns", [12, [p.card]]),
        sec("columns", [12, [p.divider()]]),
        sec("columns", [12, [p.pinned]]),
        sec("columns", [12, [withDisplay(p.entries, false)]]),
        sec("columns", [12, [p.divider()]]),
        sec("flow", [12, [p.now, ...p.keepsakes, ...p.widgets, p.rss]]),
      ]),
  },
  {
    id: "magazine",
    label: "Magazine",
    blurb: "A cover story and newspaper columns.",
    build: (p) =>
      page("standard", [
        sec("columns", [12, [p.card]]),
        sec("columns", [12, [p.divider()]]),
        sec("columns", [12, [p.pinned]]),
        sec("columns", [12, [withDisplay(p.entries, true)]]),
        sec("columns", [12, [p.divider()]]),
        sec("flow", [12, [p.now, ...p.keepsakes, ...p.widgets, p.rss]]),
      ]),
  },
  {
    id: "minimal",
    label: "Minimal",
    blurb: "One narrow column, like a book.",
    build: (p) =>
      page("narrow", [
        sec("columns", [12, [p.card]]),
        sec("columns", [12, [p.divider()]]),
        sec("columns", [12, [p.pinned]]),
        sec("columns", [12, [withDisplay(p.entries, false)]]),
        sec("columns", [12, [p.divider()]]),
        ...[p.now, ...p.keepsakes, ...p.widgets, p.rss].filter((b): b is ProfileBlock => !!b).map((b) => sec("columns", [12, [b]])),
      ]),
  },
];

export function applyTemplate(home: ProfileHome, template: Template): ProfileHome {
  const pieces = piecesOf(home);
  const built = template.build(pieces);
  return pruneStickers({ ...keepSpares(built, pieces.spareDividers()), stickers: home.stickers });
}

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/**
 * A surprise arrangement of what's already on the page: the card stays on
 * top and the entries keep a wide column, the rest lands somewhere new.
 */
export function shuffleHome(home: ProfileHome, shown: (b: ProfileBlock) => boolean = () => true): ProfileHome {
  const p = piecesOf(home);
  // Things with something in them first, so the rows near the top aren't
  // made of blocks visitors can't see yet.
  const mixed = shuffled([p.now, ...p.keepsakes, ...p.widgets].filter((b): b is ProfileBlock => !!b));
  const loose = [...mixed.filter(shown), ...mixed.filter((b) => !shown(b))];
  const ornament = () => p.divider(pick(["line", "wavy", "stars", "stitch"]));
  const entries = withDisplay(p.entries, false);

  const top = pick<() => ProfileSection[]>([
    () => [sec("columns", [12, [p.card]])],
    () => {
      const beside = loose.splice(0, Math.min(2, loose.length));
      return [beside.length ? sec("columns", [8, [p.card]], [4, beside]) : sec("columns", [12, [p.card]])];
    },
  ])();

  const band = loose.length >= 3 && Math.random() < 0.6 ? (() => {
    const n = pick([2, 3]);
    const take = loose.splice(0, Math.min(loose.length, n * pick([1, 1, 2])));
    const cols = deal(take, n);
    return [sec("columns", ...cols.map((c): [number, ProfileBlock[]] => [12 / n, c]))];
  })() : [];

  const sideFirst = Math.random() < 0.3;
  const [main, side] = pick([[9, 3], [8, 4]]);
  const body = sideFirst
    ? sec("columns", [side, [...loose, p.rss]], [main, [entries]])
    : sec("columns", [main, [entries]], [side, [...loose, p.rss]]);

  const built = page(home.width, [...top, sec("columns", [12, [ornament()]]), ...band, sec("columns", [12, [p.pinned]]), body]);
  return pruneStickers({ ...keepSpares(built, p.spareDividers()), stickers: home.stickers });
}

// ── Stickers ─────────────────────────────────────────────────────────────

/** The most stickers a page can carry (the API refuses more). */
export const MAX_STICKERS = 30;

/** Stickers whose block is gone go with it. */
export function pruneStickers(home: ProfileHome): ProfileHome {
  const ids = new Set(home.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks.map((b) => b.id))));
  const kept = home.stickers.filter((st) => ids.has(st.anchor));
  return kept.length === home.stickers.length ? home : { ...home, stickers: kept };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Keeps a sticker within what the API accepts: the same ranges as
 * `normalize_stickers` in apps/api/lib/inkwell/profile_home.ex.
 */
export function clampSticker(st: ProfileSticker): ProfileSticker {
  const y =
    st.edge === "free" ? clamp(st.y, 0, 100)
    : st.edge === "bottom" ? clamp(st.y, -32, 48)
    : clamp(st.y, -48, 32);
  return {
    ...st,
    x: round1(clamp(st.x, -10, 110)),
    y: round1(y),
    rotate: Math.round(((((st.rotate + 180) % 360) + 360) % 360) - 180),
    scale: Math.round(clamp(st.scale, 0.4, 2.5) * 100) / 100,
  };
}

/** Adds a sticker; a full page is returned unchanged. */
export function addSticker(home: ProfileHome, st: Omit<ProfileSticker, "id"> & { id?: string }): ProfileHome {
  if (home.stickers.length >= MAX_STICKERS || !findBlock(home, st.anchor)) return home;
  const sticker = clampSticker({ ...st, id: st.id ?? newSticker() });
  return { ...home, stickers: [...home.stickers, sticker] };
}

export function updateSticker(home: ProfileHome, id: string, patch: Partial<Omit<ProfileSticker, "id">>): ProfileHome {
  if (patch.anchor && !findBlock(home, patch.anchor)) return home;
  return {
    ...home,
    stickers: home.stickers.map((st) => (st.id === id ? clampSticker({ ...st, ...patch }) : st)),
  };
}

export function removeSticker(home: ProfileHome, id: string): ProfileHome {
  return { ...home, stickers: home.stickers.filter((st) => st.id !== id) };
}

/** Last in the list draws on top; this brings one there. */
export function raiseSticker(home: ProfileHome, id: string): ProfileHome {
  const st = home.stickers.find((x) => x.id === id);
  if (!st || home.stickers[home.stickers.length - 1].id === id) return home;
  return { ...home, stickers: [...home.stickers.filter((x) => x.id !== id), st] };
}

function newSticker(): string {
  return `k${newId("b").slice(1)}`;
}

/**
 * Where a sticker lands on a block from a point on screen: photos take it
 * anywhere on the picture; anything else on its nearer edge, so it frames
 * the card without covering what's written in it.
 */
export function placeOn(
  rect: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
  photo: boolean,
): Pick<ProfileSticker, "edge" | "x" | "y"> {
  const px = rect.width > 0 ? ((x - rect.left) / rect.width) * 100 : 50;
  if (photo) return { edge: "free", x: round1(clamp(px, -10, 110)), y: round1(clamp(rect.height > 0 ? ((y - rect.top) / rect.height) * 100 : 50, 0, 100)) };
  const top = y < rect.top + rect.height / 2;
  return top
    ? { edge: "top", x: round1(clamp(px, -10, 110)), y: round1(clamp(y - rect.top, -48, 32)) }
    : { edge: "bottom", x: round1(clamp(px, -10, 110)), y: round1(clamp(y - (rect.top + rect.height), -32, 48)) };
}
