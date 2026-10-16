// Tests for the Arrange editor's page edits and Undo history.
// Run: npx tsx --test apps/web/src/lib/home-edit.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ProfileBlock, ProfileHome } from "./profile-home";
import {
  LAYOUT_PRESETS,
  TEMPLATES,
  applyPreset,
  applyTemplate,
  dropBlock,
  findBlock,
  moveAcross,
  moveBlock,
  neighbourColumn,
  newId,
  nudgeBlock,
  MAX_STICKERS,
  addSticker,
  clampSticker,
  placeOn,
  raiseSticker,
  removeBlock,
  removeSection,
  removeSticker,
  resizeColumns,
  shuffleHome,
  updateSticker,
  type DropTarget,
} from "./home-edit";
import { historyReducer, initHistory } from "./home-history";

const b = (id: string, type: ProfileBlock["type"] = "note"): ProfileBlock => ({ id, type, config: {} });

/** card | [entries 9 | a b c 3] | band [x y z] */
function sample(): ProfileHome {
  return {
    version: 1,
    width: "standard",
    stickers: [],
    sections: [
      { id: "s1", style: "columns", columns: [{ id: "c-card", span: 12, blocks: [b("card", "profile_card")] }] },
      {
        id: "s2",
        style: "columns",
        columns: [
          { id: "c-main", span: 9, blocks: [b("entries", "entries")] },
          { id: "c-side", span: 3, blocks: [b("a", "guestbook"), b("b", "top_pals"), b("c", "tags")] },
        ],
      },
      { id: "s3", style: "flow", columns: [{ id: "c-band", span: 12, blocks: [b("x"), b("y", "quote"), b("z", "photo")] }] },
    ],
  };
}

const order = (h: ProfileHome, col: string) => h.sections.flatMap((s) => s.columns).find((c) => c.id === col)!.blocks.map((x) => x.id);
const allIds = (h: ProfileHome) => h.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks.map((x) => x.id)));

test("moveBlock reorders within a column, both ways", () => {
  assert.deepEqual(order(moveBlock(sample(), "a", "c-side", 3), "c-side"), ["b", "c", "a"]);
  assert.deepEqual(order(moveBlock(sample(), "c", "c-side", 0), "c-side"), ["c", "a", "b"]);
  assert.deepEqual(order(moveBlock(sample(), "b", "c-side", 1), "c-side"), ["a", "b", "c"]);
});

test("moveBlock moves between columns and rows", () => {
  const h = moveBlock(sample(), "x", "c-side", 1);
  assert.deepEqual(order(h, "c-side"), ["a", "x", "b", "c"]);
  assert.deepEqual(order(h, "c-band"), ["y", "z"]);
});

test("dropBlock lands before, after or at the end, and ignores dropping on itself", () => {
  const h = sample();
  assert.deepEqual(order(dropBlock(h, "z", { columnId: "c-side", blockId: "a", edge: "before" }), "c-side"), ["z", "a", "b", "c"]);
  assert.deepEqual(order(dropBlock(h, "z", { columnId: "c-side", blockId: "a", edge: "after" }), "c-side"), ["a", "z", "b", "c"]);
  assert.deepEqual(order(dropBlock(h, "z", { columnId: "c-side", blockId: null, edge: "end" }), "c-side"), ["a", "b", "c", "z"]);
  assert.deepEqual(order(dropBlock(h, "a", { columnId: "c-side", blockId: "c", edge: "after" }), "c-side"), ["b", "c", "a"]);
  // Just below itself, or onto itself: no change.
  assert.deepEqual(dropBlock(h, "a", { columnId: "c-side", blockId: "b", edge: "before" }), h);
  assert.equal(dropBlock(h, "a", { columnId: "c-side", blockId: "a", edge: "after" }), h);
  assert.equal(dropBlock(h, "a", { columnId: "nope", blockId: null, edge: "end" }), h);
  // The entries block can go into the sidebar and back.
  const moved = dropBlock(h, "entries", { columnId: "c-side", blockId: null, edge: "end" });
  assert.deepEqual(order(moved, "c-main"), []);
  assert.deepEqual(order(moved, "c-side"), ["a", "b", "c", "entries"]);
  assert.deepEqual(order(dropBlock(moved, "entries", { columnId: "c-main", blockId: null, edge: "end" }), "c-main"), ["entries"]);
});

test("nothing is ever lost or duplicated by a drop", () => {
  const h = sample();
  const ids = allIds(h).sort();
  for (const id of ids) {
    for (const col of ["c-card", "c-main", "c-side", "c-band"]) {
      for (const target of [null, ...order(h, col)]) {
        const targets: DropTarget[] = target
          ? [{ columnId: col, blockId: target, edge: "before" }, { columnId: col, blockId: target, edge: "after" }]
          : [{ columnId: col, blockId: null, edge: "end" }];
        for (const t of targets) {
          const next = dropBlock(h, id, t);
          const edge = t.edge;
          assert.deepEqual(allIds(next).sort(), ids, `${id} → ${col}/${target}/${edge}`);
        }
      }
    }
  }
});

test("moveAcross goes to the column beside, at the same height, and only within a row", () => {
  const h = sample();
  assert.equal(neighbourColumn(h, "entries", 1)!.id, "c-side");
  assert.equal(neighbourColumn(h, "entries", -1), null);
  assert.equal(neighbourColumn(h, "x", 1), null, "a band of cards has one column");
  assert.equal(neighbourColumn(h, "card", 1), null);

  const right = moveAcross(h, "entries", 1);
  assert.deepEqual(order(right, "c-side"), ["entries", "a", "b", "c"]);
  const left = moveAcross(h, "c", -1);
  assert.deepEqual(order(left, "c-main"), ["entries", "c"]);
  assert.equal(moveAcross(h, "x", 1), h);
});

test("nudgeBlock steps up and down, crossing into the next column or row", () => {
  const h = sample();
  assert.deepEqual(order(nudgeBlock(h, "b", -1), "c-side"), ["b", "a", "c"]);
  const down = nudgeBlock(h, "c", 1);
  assert.deepEqual(order(down, "c-band"), ["c", "x", "y", "z"]);
  assert.equal(nudgeBlock(h, "card", -1), h);
});

test("changing a row's layout keeps every block", () => {
  const h = sample();
  const one = applyPreset(h, "s2", LAYOUT_PRESETS.find((p) => p.id === "1")!);
  assert.deepEqual(order(one, "c-main"), ["entries", "a", "b", "c"]);
  const three = applyPreset(h, "s2", LAYOUT_PRESETS.find((p) => p.id === "4-4-4")!);
  assert.equal(three.sections[1].columns.length, 3);
  assert.deepEqual(allIds(three).sort(), allIds(h).sort());
});

test("column widths stay at least 2 of 12", () => {
  const h = sample();
  const wider = resizeColumns(h, "s2", 0, 5);
  assert.deepEqual(wider.sections[1].columns.map((c) => c.span), [10, 2]);
  const narrower = resizeColumns(h, "s2", 0, -20);
  assert.deepEqual(narrower.sections[1].columns.map((c) => c.span), [2, 10]);
});

test("every layout keeps every block and puts the profile card first", () => {
  for (const t of TEMPLATES) {
    const out = applyTemplate(sample(), t);
    const ids = allIds(out);
    for (const id of allIds(sample())) {
      if (["x", "y", "z", "a", "b", "c", "card", "entries"].includes(id)) assert.ok(ids.includes(id), `${t.id} kept ${id}`);
    }
    assert.equal(new Set(ids).size, ids.length, `${t.id}: no duplicates`);
    assert.equal(out.sections[0].columns[0].blocks[0].type, "profile_card", `${t.id}: card first`);
    assert.equal(ids.filter((i) => i === "entries").length, 1);
  }
});

test("Scrapbook layouts show entries as a shelf; others show them all", () => {
  for (const t of TEMPLATES) {
    const entries = findBlock(applyTemplate(sample(), t), "entries")!.block;
    if (t.id.startsWith("scrapbook")) assert.equal(entries.config.limit, 6, t.id);
    else assert.equal(entries.config.limit, undefined, t.id);
  }
  // Scrapbook with sidebar: the shelf sits beside a sidebar.
  const side = applyTemplate(sample(), TEMPLATES.find((t) => t.id === "scrapbook-sidebar")!);
  const row = findBlock(side, "entries")!.section;
  assert.equal(row.columns.length, 2);
  assert.ok(row.columns[1].blocks.some((x) => x.id === "a"));
});

test("layouts and Shuffle keep the writer's own dividers", () => {
  const h = sample();
  h.sections[2].columns[0].blocks.push({ id: "d1", type: "divider", config: { style: "stars" } }, { id: "d2", type: "divider", config: { style: "stitch" } }, { id: "d3", type: "divider", config: { style: "wavy" } }, { id: "d4", type: "divider", config: { style: "wavy" } });
  for (const out of [...TEMPLATES.map((t) => applyTemplate(h, t)), shuffleHome(h), shuffleHome(h)]) {
    const ids = allIds(out);
    for (const d of ["d1", "d2", "d3", "d4"]) assert.ok(ids.includes(d), `kept ${d}`);
    assert.equal(new Set(ids).size, ids.length);
  }
  const d = findBlock(applyTemplate(h, TEMPLATES[0]), "d1")!.block;
  assert.equal(d.config.style, "stars", "a reused divider keeps its style");
});

test("Shuffle never loses or duplicates anything", () => {
  const ids = allIds(sample()).sort();
  for (let i = 0; i < 300; i++) {
    const out = shuffleHome(sample());
    const got = allIds(out).filter((id) => ids.includes(id)).sort();
    assert.deepEqual(got, ids);
    assert.equal(out.sections[0].columns.some((c) => c.blocks.some((x) => x.type === "profile_card")), true);
  }
});

test("ids are unique and in the API's format", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const id = newId("b");
    assert.match(id, /^[a-z0-9][a-z0-9_-]{0,39}$/);
    assert.ok(!seen.has(id));
    seen.add(id);
  }
});

test("Undo history: commit, undo, redo, previews and no-op changes", () => {
  const a = sample();
  const b2 = moveBlock(a, "a", "c-side", 3);
  const c2 = moveBlock(b2, "x", "c-side", 0);
  let st = initHistory(a);
  st = historyReducer(st, { type: "commit", next: b2 });
  st = historyReducer(st, { type: "commit", next: c2 });
  assert.equal(st.past.length, 2);
  st = historyReducer(st, { type: "undo" });
  assert.deepEqual(st.home, b2);
  st = historyReducer(st, { type: "redo" });
  assert.deepEqual(st.home, c2);
  // A no-op change adds no step.
  st = historyReducer(st, { type: "commit", next: structuredClone(c2) });
  assert.equal(st.past.length, 2);
  // Live previews then one commit = one step, undoing to before the previews.
  const p1 = resizeColumns(c2, "s2", 0, 1);
  const p2 = resizeColumns(c2, "s2", 0, 2);
  st = historyReducer(st, { type: "preview", home: p1 });
  st = historyReducer(st, { type: "preview", home: p2 });
  st = historyReducer(st, { type: "commit", next: p2, before: c2 });
  assert.equal(st.past.length, 3);
  st = historyReducer(st, { type: "undo" });
  assert.deepEqual(st.home, c2);
  // Undo past the beginning does nothing.
  for (let i = 0; i < 10; i++) st = historyReducer(st, { type: "undo" });
  assert.deepEqual(st.home, a);
  // History is capped.
  let big = initHistory(a);
  for (let i = 0; i < 80; i++) big = historyReducer(big, { type: "commit", next: { ...a, width: i % 2 ? "narrow" : "standard" } });
  assert.ok(big.past.length <= 50);
});

// ── Stickers ───────────────────────────────────────────────────────────────

const stuck = (anchor: string, extra: Partial<Parameters<typeof addSticker>[1]> = {}) =>
  ({ key: "stamp", anchor, edge: "top" as const, x: 50, y: 0, rotate: 0, scale: 1, ...extra });

test("stickers go on blocks that exist, up to the page limit", () => {
  let h = addSticker(sample(), stuck("a", { id: "k-1" }));
  assert.equal(h.stickers.length, 1);
  assert.equal(h.stickers[0].id, "k-1");
  assert.equal(addSticker(h, stuck("nope")), h, "no block, no sticker");
  for (let i = 0; i < 40; i++) h = addSticker(h, stuck("a"));
  assert.equal(h.stickers.length, MAX_STICKERS);
  assert.equal(new Set(h.stickers.map((x) => x.id)).size, MAX_STICKERS, "ids are unique");
  for (const st of h.stickers) assert.match(st.id, /^[a-z0-9][a-z0-9_-]{0,39}$/);
});

test("sticker values stay within what the API keeps", () => {
  const c = clampSticker({ id: "k", key: "stamp", anchor: "a", edge: "top", x: 400, y: -500, rotate: 190, scale: 9 });
  assert.deepEqual([c.x, c.y, c.rotate, c.scale], [110, -48, -170, 2.5]);
  const b = clampSticker({ ...c, edge: "bottom", y: 500, rotate: -725, scale: 0 });
  assert.deepEqual([b.y, b.rotate, b.scale], [48, -5, 0.4]);
  const f = clampSticker({ ...c, edge: "free", y: -3 });
  assert.equal(f.y, 0);
  assert.equal(clampSticker({ ...c, x: NaN }).x, -10, "nonsense never reaches the page");
});

test("moving, turning, raising and removing a sticker", () => {
  let h = addSticker(addSticker(sample(), stuck("a", { id: "k-1" })), stuck("b", { id: "k-2" }));
  h = updateSticker(h, "k-1", { anchor: "x", edge: "bottom", y: 10, rotate: 30 });
  assert.deepEqual(
    (({ anchor, edge, y, rotate }) => ({ anchor, edge, y, rotate }))(h.stickers[0]),
    { anchor: "x", edge: "bottom", y: 10, rotate: 30 },
  );
  assert.equal(updateSticker(h, "k-1", { anchor: "gone" }), h, "can't move onto a block that isn't there");
  assert.deepEqual(raiseSticker(h, "k-1").stickers.map((x) => x.id), ["k-2", "k-1"]);
  assert.equal(raiseSticker(h, "k-2"), h, "already on top");
  assert.deepEqual(removeSticker(h, "k-1").stickers.map((x) => x.id), ["k-2"]);
});

test("a block's stickers go with it, and layouts keep everyone else's", () => {
  let h = sample();
  for (const anchor of ["a", "b", "x", "entries", "card"]) h = addSticker(h, stuck(anchor, { id: `k-${anchor}` }));
  assert.deepEqual(removeBlock(h, "a").stickers.map((x) => x.anchor), ["b", "x", "entries", "card"]);
  assert.deepEqual(removeSection(h, "s3").stickers.map((x) => x.anchor), ["a", "b", "entries", "card"]);
  for (const out of [...TEMPLATES.map((t) => applyTemplate(h, t)), shuffleHome(h), applyPreset(h, "s2", LAYOUT_PRESETS[0])]) {
    assert.equal(out.stickers.length, 5, "every sticker survives a new layout");
  }
  // Moving a block takes its stickers along, since they hang on its id.
  const moved = dropBlock(h, "a", { columnId: "c-band", blockId: null, edge: "end" });
  assert.equal(moved.stickers.find((x) => x.id === "k-a")!.anchor, "a");
});

test("placing: edges near the top and bottom, anywhere in between", () => {
  const rect = { left: 100, top: 200, width: 400, height: 300 };
  assert.deepEqual(placeOn(rect, 300, 210), { edge: "top", x: 50, y: 10 });
  assert.deepEqual(placeOn(rect, 300, 150), { edge: "top", x: 50, y: -48 }, "hanging off the top, held to the band");
  assert.deepEqual(placeOn(rect, 100, 495), { edge: "bottom", x: 0, y: -5 });
  assert.deepEqual(placeOn(rect, 100, 530), { edge: "bottom", x: 0, y: 30 });
  assert.deepEqual(placeOn(rect, 300, 350), { edge: "free", x: 50, y: 50 }, "the middle of a card");
  assert.deepEqual(placeOn(rect, 200, 260), { edge: "free", x: 25, y: 20 });
  assert.deepEqual(placeOn(rect, 900, 350), { edge: "free", x: 110, y: 50 });
  // A short card is all edge.
  assert.equal(placeOn({ left: 0, top: 0, width: 100, height: 40 }, 50, 12).edge, "top");
  assert.equal(placeOn({ left: 0, top: 0, width: 100, height: 40 }, 50, 28).edge, "bottom");
});
