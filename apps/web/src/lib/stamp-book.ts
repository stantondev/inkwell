/**
 * The stamp album book: pure edits on how a writer has mounted the stamps
 * readers sent them. Matches Inkwell.Stamps.Album on the API (which cleans
 * whatever is saved): stockbook pages of four strips of four spaces, each
 * stamp mounted at most once, anything not mounted waiting in the envelope.
 */

export const STRIPS = 4;
export const PER_STRIP = 4;
export const SLOTS = STRIPS * PER_STRIP;
export const MAX_PAGES = 100;

export const PAPERS = ["cream", "black", "kraft"] as const;
export const COVERS = ["oxblood", "forest", "navy", "ink"] as const;
export type Paper = (typeof PAPERS)[number];
export type Cover = (typeof COVERS)[number];

export const PAPER_LABELS: Record<Paper, string> = { cream: "Cream", black: "Stockbook black", kraft: "Kraft" };
export const COVER_LABELS: Record<Cover, string> = { oxblood: "Oxblood", forest: "Forest", navy: "Navy", ink: "Ink black" };

export interface BookPage {
  id: string;
  title: string;
  paper: Paper;
  slots: (string | null)[];
}

export interface Book {
  version: 1;
  cover: Cover;
  pages: BookPage[];
}

/** What the layout needs to know about a stamp. */
export interface BookStampFacts {
  id: string;
  type: string;
  stamped_at?: string | null;
  stamped_on?: string | null;
  sender?: { username?: string | null; display_name?: string | null } | null;
}

export type Spot = { page: string; slot: number };

const when = (s: BookStampFacts) => s.stamped_at || s.stamped_on || "";
const byOldest = (a: BookStampFacts, b: BookStampFacts) => (when(a) < when(b) ? -1 : when(a) > when(b) ? 1 : a.id < b.id ? -1 : 1);

export function blankPage(id: string): BookPage {
  return { id, title: "", paper: "cream", slots: Array(SLOTS).fill(null) };
}

function freshId(book: Pick<Book, "pages">): string {
  const taken = new Set(book.pages.map((p) => p.id));
  let n = book.pages.length + 1;
  while (taken.has(`p${n}`)) n++;
  return `p${n}`;
}

/** Every stamp mounted by date, oldest first: the album of a writer who hasn't arranged anything. */
export function defaultBook(stamps: BookStampFacts[]): Book {
  const book: Book = { version: 1, cover: "oxblood", pages: [] };
  return placeSequence(book, [...stamps].sort(byOldest).map((s) => s.id), []);
}

/** A saved album cleaned against the stamps the writer has now (or the default if none). */
export function cleanBook(saved: Book | null | undefined, stamps: BookStampFacts[]): Book {
  if (!saved || !Array.isArray(saved.pages)) return defaultBook(stamps);
  const owned = new Set(stamps.map((s) => s.id));
  const seen = new Set<string>();
  const ids = new Set<string>();
  const pages = saved.pages.slice(0, MAX_PAGES).map((p, i) => {
    let id = typeof p.id === "string" && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(p.id) && !ids.has(p.id) ? p.id : "";
    if (!id) {
      let n = i + 1;
      while (ids.has(`p${n}`)) n++;
      id = `p${n}`;
    }
    ids.add(id);
    const slots = Array.from({ length: SLOTS }, (_, k) => {
      const v = Array.isArray(p.slots) ? p.slots[k] : null;
      if (typeof v === "string" && owned.has(v) && !seen.has(v)) {
        seen.add(v);
        return v;
      }
      return null;
    });
    return {
      id,
      title: typeof p.title === "string" ? p.title.slice(0, 60) : "",
      paper: (PAPERS as readonly string[]).includes(p.paper) ? p.paper : "cream",
      slots,
    };
  });
  return {
    version: 1,
    cover: (COVERS as readonly string[]).includes(saved.cover) ? saved.cover : "oxblood",
    pages: pages.length ? pages : [blankPage("p1")],
  };
}

export function mountedIds(book: Book): Set<string> {
  const out = new Set<string>();
  for (const p of book.pages) for (const s of p.slots) if (s) out.add(s);
  return out;
}

/** Stamps that aren't mounted anywhere: new arrivals, oldest first. */
export function arrivals<T extends BookStampFacts>(book: Book, stamps: T[]): T[] {
  const mounted = mountedIds(book);
  return stamps.filter((s) => !mounted.has(s.id)).sort(byOldest);
}

export function findSpot(book: Book, id: string): Spot | null {
  for (const p of book.pages) {
    const i = p.slots.indexOf(id);
    if (i >= 0) return { page: p.id, slot: i };
  }
  return null;
}

function mapPages(book: Book, fn: (p: BookPage) => BookPage): Book {
  return { ...book, pages: book.pages.map(fn) };
}

/**
 * Puts a stamp in a space. A stamp already there trades places with it (or,
 * if the moving stamp came from the envelope, goes into the envelope).
 */
export function placeStamp(book: Book, id: string, to: Spot): Book {
  const page = book.pages.find((p) => p.id === to.page);
  if (!page || to.slot < 0 || to.slot >= SLOTS) return book;
  const from = findSpot(book, id);
  if (from && from.page === to.page && from.slot === to.slot) return book;
  const there = page.slots[to.slot];
  return mapPages(book, (p) => {
    if (p.id !== to.page && (!from || p.id !== from.page)) return p;
    const slots = [...p.slots];
    if (from && p.id === from.page) slots[from.slot] = there ?? null;
    if (p.id === to.page) slots[to.slot] = id;
    return { ...p, slots };
  });
}

/** Takes a stamp out of the album and back into the envelope. */
export function unmountStamp(book: Book, id: string): Book {
  return mapPages(book, (p) => (p.slots.includes(id) ? { ...p, slots: p.slots.map((s) => (s === id ? null : s)) } : p));
}

/** Lays `ids` into the spaces after `start` (page index, slot), adding pages as needed. */
function placeSequence(book: Book, ids: string[], startAt: [number, number] | [], groupStarts: Set<number> = new Set()): Book {
  const pages = book.pages.map((p) => ({ ...p, slots: [...p.slots] }));
  let cursor = startAt.length ? startAt[0] * SLOTS + startAt[1] : 0;
  const draft: Book = { ...book, pages };
  ids.forEach((id, i) => {
    if (groupStarts.has(i) && cursor % PER_STRIP !== 0) cursor += PER_STRIP - (cursor % PER_STRIP);
    for (;;) {
      const pi = Math.floor(cursor / SLOTS);
      if (pi >= MAX_PAGES) return;
      while (pages.length <= pi) pages.push(blankPage(freshId(draft)));
      const page = pages[pi];
      if (page.slots[cursor % SLOTS] == null) {
        page.slots[cursor % SLOTS] = id;
        cursor++;
        return;
      }
      cursor++;
    }
  });
  if (!pages.length) pages.push(blankPage("p1"));
  return draft;
}

/** Mounts every waiting stamp after the last mounted one, oldest first. */
export function mountAll(book: Book, waiting: BookStampFacts[]): Book {
  if (!waiting.length) return book;
  let last = -1;
  book.pages.forEach((p, pi) => p.slots.forEach((s, si) => s && (last = pi * SLOTS + si)));
  const next = last + 1;
  return placeSequence(book, [...waiting].sort(byOldest).map((s) => s.id), [Math.floor(next / SLOTS), next % SLOTS]);
}

export type SortKey = "date" | "design" | "sender";

function senderKey(s: BookStampFacts): string {
  return (s.sender?.username || s.sender?.display_name || "").toLowerCase();
}

/**
 * Remounts every stamp (mounted and waiting): by date, or grouped by design or
 * by sender with each group starting a fresh strip. Page titles and papers
 * stay where they are; spare empty untitled pages at the end go.
 */
export function sortBook(book: Book, stamps: BookStampFacts[], key: SortKey, designOrder: string[] = []): Book {
  const sorted = [...stamps].sort(byOldest);
  let groups: BookStampFacts[][];
  if (key === "date") {
    groups = [sorted];
  } else {
    const map = new Map<string, BookStampFacts[]>();
    for (const s of sorted) {
      const k = key === "design" ? s.type : senderKey(s);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    const order = (k: string) => {
      const i = designOrder.indexOf(k);
      return i < 0 ? designOrder.length : i;
    };
    groups = [...map.entries()]
      .sort(([ka, a], [kb, b]) =>
        key === "design" ? order(ka) - order(kb) || ka.localeCompare(kb) : b.length - a.length || ka.localeCompare(kb),
      )
      .map(([, v]) => v);
  }
  const ids: string[] = [];
  const starts = new Set<number>();
  for (const g of groups) {
    starts.add(ids.length);
    ids.push(...g.map((s) => s.id));
  }
  const empty: Book = { ...book, pages: book.pages.map((p) => ({ ...p, slots: Array(SLOTS).fill(null) })) };
  const laid = placeSequence(empty, ids, [], starts);
  // Drop trailing pages that are empty and unnamed (keep at least one).
  const pages = [...laid.pages];
  while (pages.length > 1 && !pages[pages.length - 1].title && pages[pages.length - 1].slots.every((s) => !s)) pages.pop();
  return { ...laid, pages };
}

export function addPage(book: Book, afterId?: string): Book {
  if (book.pages.length >= MAX_PAGES) return book;
  const page = blankPage(freshId(book));
  const i = afterId ? book.pages.findIndex((p) => p.id === afterId) : -1;
  const pages = [...book.pages];
  pages.splice(i < 0 ? pages.length : i + 1, 0, page);
  return { ...book, pages };
}

/** Removes a page; its stamps go back into the envelope. Always keeps one page. */
export function removePage(book: Book, id: string): Book {
  if (book.pages.length <= 1) return mapPages(book, (p) => (p.id === id ? { ...blankPage(p.id) } : p));
  return { ...book, pages: book.pages.filter((p) => p.id !== id) };
}

export function updatePage(book: Book, id: string, patch: Partial<Pick<BookPage, "title" | "paper">>): Book {
  return mapPages(book, (p) => (p.id === id ? { ...p, ...patch } : p));
}

export function setCover(book: Book, cover: Cover): Book {
  return { ...book, cover };
}

/** Moves a page one place earlier or later. */
export function shiftPage(book: Book, id: string, by: -1 | 1): Book {
  const i = book.pages.findIndex((p) => p.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= book.pages.length) return book;
  const pages = [...book.pages];
  [pages[i], pages[j]] = [pages[j], pages[i]];
  return { ...book, pages };
}

/** Two books lay out the same stamps the same way (for "unsaved changes"). */
export function sameBook(a: Book, b: Book): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
