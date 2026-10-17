/**
 * The arrangement of a writer's profile page ("home"). The API owns the
 * format and cleans every value (Inkwell.ProfileHome): sections stacked down
 * the page, each holding columns side by side, each column a stack of
 * blocks. On phones every section is one column, read in order.
 */

export type ProfileBlockType =
  | "profile_card"
  | "entries"
  | "pinned"
  | "top_pals"
  | "tags"
  | "series"
  | "music"
  | "guestbook"
  | "support"
  | "newsletter"
  | "custom_html"
  | "rss"
  | "divider"
  | "now"
  | "note"
  | "photo"
  | "quote"
  | "countdown"
  | "links";

export type NoteStyle = "card" | "sticky" | "index" | "letter";
export type StickyColor = "yellow" | "pink" | "blue" | "green" | "lilac" | "peach";
export type PhotoStyle = "plain" | "polaroid" | "taped";
export type DividerStyle = "line" | "wavy" | "stars" | "stitch";

/** Settings a block can carry; which ones apply depends on its type (Inkwell.ProfileHome cleans them). */
export interface ProfileBlockConfig {
  display?: "cards" | "full" | "preview" | "magazine";
  /** Entries: show only the latest few (3, 6, 9 or 12), with a link to the rest. */
  limit?: number;
  style?: string;
  title?: string;
  body?: string;
  color?: StickyColor;
  image_id?: string | null;
  caption?: string;
  alt?: string;
  text?: string;
  cite?: string;
  label?: string;
  date?: string | null;
  items?: { label: string; value?: string; url?: string }[];
  /** Guestbook: how signatures look (no look = list, as before). */
  look?: GuestbookLook;
}

export type GuestbookLook = "list" | "envelopes" | "postcards";

export interface ProfileBlock {
  id: string;
  type: ProfileBlockType;
  config: ProfileBlockConfig;
  /** Tile size, in "tiles" sections only. */
  size?: { w: number; h: number };
}

export interface ProfileColumn {
  id: string;
  /** Share of a 12-unit grid. */
  span: number;
  blocks: ProfileBlock[];
}

export interface ProfileSection {
  id: string;
  /** columns: side by side; flow: blocks pour into 2–3 newspaper columns; tiles: reserved for the page builder. */
  style: "columns" | "flow" | "tiles";
  columns: ProfileColumn[];
}

/**
 * A sticker pinned to a block. On the top or bottom edge, y is px from that
 * edge (the sticker's centre); "free" (photos only) puts it anywhere on the
 * picture, x and y both in %. x is always % across the block.
 */
export interface ProfileSticker {
  id: string;
  /** A pack sticker's key (lib/stickers.tsx), or "upload" for one of the writer's own. */
  key: string;
  anchor: string;
  edge: "top" | "bottom" | "free";
  x: number;
  y: number;
  rotate: number;
  scale: number;
  /** "upload" only: the picture (an entry image), its width ÷ height, and the white die-cut edge. */
  image_id?: string;
  ratio?: number;
  outline?: boolean;
  /** A pen pal gave it (Inkwell.StickerGifts); the server takes the sticker from the gift. */
  gift_id?: string;
}

/** Someone who gave a sticker on the page. */
export interface StickerGiver {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** A sticker a pen pal gave, waiting in the Gifts drawer (or on the page). */
export interface StickerGift {
  id: string;
  /** A pack key, or "upload" for one of the giver's own stickers. */
  key: string;
  image_id: string | null;
  url: string | null;
  ratio: number;
  outline: boolean;
  note: string | null;
  given_at: string;
  from: StickerGiver | null;
}

/** One of the writer's own stickers in their library (GET /api/me/stickers). */
export interface OwnSticker {
  id: string;
  image_id: string;
  url: string;
  name: string | null;
  outline: boolean;
  ratio: number;
}

export interface ProfileHome {
  version: number;
  width: "standard" | "narrow";
  sections: ProfileSection[];
  stickers: ProfileSticker[];
}

/** What the page looked like before homes existed: the classic layout. */
export const CLASSIC_HOME: ProfileHome = {
  version: 1,
  width: "standard",
  sections: [
    { id: "s-profile", style: "columns", columns: [{ id: "c-profile", span: 12, blocks: [{ id: "b-profile-card", type: "profile_card", config: {} }] }] },
    { id: "s-divider", style: "columns", columns: [{ id: "c-divider", span: 12, blocks: [{ id: "b-divider", type: "divider", config: {} }] }] },
    { id: "s-pinned", style: "columns", columns: [{ id: "c-pinned", span: 12, blocks: [{ id: "b-pinned", type: "pinned", config: {} }] }] },
    {
      id: "s-main",
      style: "columns",
      columns: [
        { id: "c-main", span: 9, blocks: [{ id: "b-entries", type: "entries", config: {} }] },
        {
          id: "c-side",
          span: 3,
          blocks: (["top_pals", "tags", "support", "newsletter", "series", "guestbook", "music", "custom_html", "rss"] as const).map(
            (type) => ({ id: `b-${type.replace(/_/g, "-")}`, type, config: {} }),
          ),
        },
      ],
    },
  ],
  stickers: [],
};

/** Blocks a page holds at most one of (the rest can repeat). */
export const SINGLETON_BLOCKS: ProfileBlockType[] = [
  "profile_card", "entries", "pinned", "top_pals", "tags", "series", "music",
  "guestbook", "support", "newsletter", "custom_html", "rss", "now",
];

/** The whole journal on its own (?journal=1): the profile card, then every entry. */
export function journalHome(home: ProfileHome): ProfileHome {
  const blocks = homeBlocks(home);
  const card = blocks.find((b) => b.type === "profile_card") ?? { id: "b-profile-card", type: "profile_card" as const, config: {} };
  const entries = blocks.find((b) => b.type === "entries") ?? { id: "b-entries", type: "entries" as const, config: {} };
  return {
    ...home,
    sections: [
      { id: "s-journal-card", style: "columns", columns: [{ id: "c-journal-card", span: 12, blocks: [card] }] },
      { id: "s-journal-entries", style: "columns", columns: [{ id: "c-journal-entries", span: 12, blocks: [{ ...entries, config: { ...entries.config, limit: undefined } }] }] },
    ],
  };
}

export function homeBlocks(home: ProfileHome): ProfileBlock[] {
  return home.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks));
}

/**
 * Column tracks for a section that sits side by side, at each of the three
 * container widths the classic layout used. A narrow column (a quarter or
 * less) is a sidebar with the classic sidebar's widths (260, 300 and 340px
 * for a quarter), so widgets never get squeezed; wider columns share the rest.
 */
export function columnTracks(columns: ProfileColumn[]): { md: string; lg: string; xl: string } {
  const at = (quarterWidth: number) =>
    columns
      .map((c) => (c.span <= 3 ? `${Math.round((quarterWidth * c.span) / 3)}px` : `minmax(0, ${c.span}fr)`))
      .join(" ");
  return { md: at(260), lg: at(300), xl: at(340) };
}
