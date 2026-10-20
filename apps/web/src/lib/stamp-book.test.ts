import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SLOTS,
  PER_STRIP,
  addPage,
  arrivals,
  cleanBook,
  defaultBook,
  findSpot,
  mountAll,
  mountedIds,
  placeStamp,
  removePage,
  shiftPage,
  sortBook,
  unmountStamp,
  type Book,
  type BookStampFacts,
} from "./stamp-book";

const TYPES = ["felt", "rooting", "thank_you", "autumn_2026"];
const PEOPLE = ["ana", "ben", "cat"];

function stamps(n: number): BookStampFacts[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${String(i).padStart(3, "0")}`,
    type: TYPES[i % TYPES.length],
    stamped_at: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString(),
    sender: { username: PEOPLE[i % PEOPLE.length] },
  }));
}

/** Every stamp appears exactly once across the book and the envelope. */
function assertWhole(book: Book, all: BookStampFacts[]) {
  const seen: string[] = [];
  for (const p of book.pages) {
    assert.equal(p.slots.length, SLOTS);
    for (const s of p.slots) if (s) seen.push(s);
  }
  assert.equal(new Set(seen).size, seen.length, "a stamp is mounted twice");
  const waiting = arrivals(book, all).map((s) => s.id);
  assert.deepEqual([...seen, ...waiting].sort(), all.map((s) => s.id).sort());
}

test("the default album mounts everything by date, oldest first", () => {
  const all = stamps(20);
  const book = defaultBook([...all].reverse());
  assert.equal(book.pages.length, 2);
  assert.equal(book.pages[0].slots[0], "s000");
  assert.equal(book.pages[1].slots[3], "s019");
  assert.equal(arrivals(book, all).length, 0);
  assertWhole(book, all);
  assert.equal(defaultBook([]).pages.length, 1);
});

test("cleaning a saved album drops strangers and repeats; new stamps wait in the envelope", () => {
  const all = stamps(5);
  const saved = {
    version: 1,
    cover: "velvet",
    pages: [{ id: "a", title: "x", paper: "silk", slots: ["s000", "s000", "nope", "s001"] }],
  } as unknown as Book;
  const book = cleanBook(saved, all);
  assert.equal(book.cover, "oxblood");
  assert.equal(book.pages[0].paper, "cream");
  assert.deepEqual(book.pages[0].slots.slice(0, 4), ["s000", null, null, "s001"]);
  assert.deepEqual(arrivals(book, all).map((s) => s.id), ["s002", "s003", "s004"]);
  assertWhole(book, all);
});

test("placing swaps with whatever is there; from the envelope the other goes back in", () => {
  const all = stamps(3);
  let book = cleanBook({ version: 1, cover: "navy", pages: [{ id: "a", title: "", paper: "cream", slots: ["s000", "s001"] }] }, all);
  book = placeStamp(book, "s000", { page: "a", slot: 1 });
  assert.deepEqual(book.pages[0].slots.slice(0, 2), ["s001", "s000"]);
  book = placeStamp(book, "s002", { page: "a", slot: 0 });
  assert.equal(book.pages[0].slots[0], "s002");
  assert.deepEqual(arrivals(book, all).map((s) => s.id), ["s001"]);
  book = placeStamp(book, "s001", { page: "a", slot: 9 });
  assert.equal(findSpot(book, "s001")?.slot, 9);
  assertWhole(book, all);
});

test("moves across pages keep every stamp exactly once (300 random moves)", () => {
  const all = stamps(40);
  let book = addPage(addPage(defaultBook(all)));
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 300; i++) {
    const s = all[Math.floor(rnd() * all.length)].id;
    const r = rnd();
    if (r < 0.15) book = unmountStamp(book, s);
    else {
      const page = book.pages[Math.floor(rnd() * book.pages.length)];
      book = placeStamp(book, s, { page: page.id, slot: Math.floor(rnd() * SLOTS) });
    }
    assertWhole(book, all);
  }
});

test("mount all puts waiting stamps after the last mounted one, adding pages", () => {
  const all = stamps(20);
  let book = cleanBook({ version: 1, cover: "ink", pages: [{ id: "a", title: "", paper: "cream", slots: [null, "s005", null, "s000"] }] }, all);
  book = mountAll(book, arrivals(book, all));
  assert.equal(book.pages[0].slots[0], null, "a gap the writer left stays");
  assert.equal(book.pages[0].slots[4], "s001");
  assert.equal(book.pages.length, 2);
  assertWhole(book, all);
  assert.equal(arrivals(book, all).length, 0);
});

test("sorting by design and sender starts each group on a fresh strip and keeps titles", () => {
  const all = stamps(13);
  const base = { ...defaultBook(all), pages: defaultBook(all).pages.map((p, i) => ({ ...p, title: i === 0 ? "Mine" : "" })) };
  const byDesign = sortBook(addPage(addPage(base)), all, "design", TYPES);
  assertWhole(byDesign, all);
  assert.equal(byDesign.pages[0].title, "Mine");
  // felt: 4 stamps fill strip 0; rooting (3) starts strip 1; thank_you starts strip 2, not beside them.
  const typeAt = (i: number) => all.find((s) => s.id === byDesign.pages[0].slots[i])?.type;
  assert.deepEqual([0, 1, 2, 3].map(typeAt), ["felt", "felt", "felt", "felt"]);
  assert.equal(typeAt(PER_STRIP), "rooting");
  assert.equal(typeAt(PER_STRIP + 3), undefined);
  assert.equal(typeAt(2 * PER_STRIP), "thank_you");
  const bySender = sortBook(base, all, "sender");
  assertWhole(bySender, all);
  for (const p of bySender.pages)
    for (let strip = 0; strip < SLOTS; strip += PER_STRIP) {
      const people = new Set(p.slots.slice(strip, strip + PER_STRIP).filter(Boolean).map((id) => all.find((s) => s.id === id)?.sender?.username));
      assert.ok(people.size <= 1, "two senders share a strip");
    }
  const byDate = sortBook(byDesign, all, "date");
  assert.equal(byDate.pages.length, 1, "spare empty pages dropped");
  assert.equal(byDate.pages[0].slots[0], "s000");
});

test("removing a page sends its stamps to the envelope; one page always stays", () => {
  const all = stamps(18);
  let book = defaultBook(all);
  book = removePage(book, book.pages[1].id);
  assert.equal(book.pages.length, 1);
  assert.equal(arrivals(book, all).length, 2);
  book = removePage(book, book.pages[0].id);
  assert.equal(book.pages.length, 1);
  assert.equal(mountedIds(book).size, 0);
  assertWhole(book, all);
});

test("pages shift and new pages get unique ids", () => {
  let book = addPage(addPage(defaultBook([])));
  assert.equal(new Set(book.pages.map((p) => p.id)).size, 3);
  const first = book.pages[0].id;
  book = shiftPage(book, first, 1);
  assert.equal(book.pages[1].id, first);
  assert.equal(shiftPage(book, book.pages[0].id, -1), book);
});
