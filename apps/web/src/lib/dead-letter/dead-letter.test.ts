// Tests for the Dead Letter Office: tearing, blots, letters, weeks, sharing.
// Run: npm run test:play -w apps/web

import { test } from "node:test";
import assert from "node:assert/strict";

import { polygonArea, scatter, scatterToSlots, settles, tearSheet, seeded, raggedEdge, SNAP_DISTANCE } from "./tear";
import { checkGuess, guessReady, nextHiddenLetter, normalizeWord, parseSegments, plainText, visibleLetters } from "./blots";
import { HAMILTON_WEEK, WEEKS, arrivalDay, daysBetween, lettersArrived, hiddenNames, namesMystery, weekById, weekFor, weeksAhead } from "./weeks";
import { freshProgress, freshWeek, shareText } from "./progress";
import { LEVELS, RULES, blotAt, crossedOffAtStart, surviveFor, wordChoices } from "./difficulty";
import { bestPossible, easier, letterScore, rankFor, totalScore, weekScore } from "./score";

const W = 600;
const H = 900;

test("the pieces cover the whole sheet with nothing missing or doubled", () => {
  for (const seed of [1, 2, 3, 42, 1819]) {
    const pieces = tearSheet(W, H, { rows: 3, cols: 2, seed });
    assert.equal(pieces.length, 6);
    const total = pieces.reduce((s, p) => s + polygonArea(p.polygon), 0);
    assert.ok(Math.abs(total - W * H) < 1e-6 * W * H, `seed ${seed}: area ${total} vs ${W * H}`);
  }
});

test("neighbouring pieces share exactly the same torn edge", () => {
  const pieces = tearSheet(W, H, { rows: 3, cols: 2, seed: 7 });
  const key = (p: { x: number; y: number }) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
  const pa = new Set(pieces[0].polygon.map(key));
  const shared = pieces[1].polygon.map(key).filter((k) => pa.has(k));
  assert.ok(shared.length > 8, `only ${shared.length} shared points`);
});

test("tearing is the same every time for the same seed", () => {
  assert.deepEqual(tearSheet(W, H, { seed: 5 }), tearSheet(W, H, { seed: 5 }));
  assert.notDeepEqual(tearSheet(W, H, { seed: 5 }), tearSheet(W, H, { seed: 6 }));
});

test("a ragged edge starts and ends exactly where it should", () => {
  const e = raggedEdge({ x: 0, y: 100 }, { x: 300, y: 120 }, seeded(3), 7);
  assert.deepEqual(e[0], { x: 0, y: 100 });
  assert.deepEqual(e[e.length - 1], { x: 300, y: 120 });
  for (const p of e) assert.ok(p.y > 100 - 12 && p.y < 120 + 12);
});

test("no piece starts at home", () => {
  const pieces = tearSheet(W, H, { seed: 11 });
  const desk = { left: -500, top: -50, right: W + 500, bottom: H + 50 };
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    scatter(pieces, desk, seed).forEach((pose, i) => {
      assert.ok(Math.hypot(pose.x, pose.y) >= 40, `seed ${seed} piece ${i} starts too close to home`);
    });
  }
});

test("pieces put on slots each get their own slot", () => {
  const pieces = tearSheet(W, H, { seed: 3 });
  const slots = pieces.map((_, i) => ({ x: -400 + (i % 3) * 300, y: H + 200 + Math.floor(i / 3) * 200 }));
  const poses = scatterToSlots(pieces, slots, 9, { jitter: { x: 0, y: 0 } });
  const used = poses.map((p, i) => `${Math.round(pieces[i].centroid.x + p.x)},${Math.round(pieces[i].centroid.y + p.y)}`);
  assert.equal(new Set(used).size, pieces.length);
});

test("a piece settles only when upright and near home", () => {
  assert.equal(settles({ x: 10, y: -12, turns: 0, tilt: 9 }), true);
  assert.equal(settles({ x: 10, y: -12, turns: 4, tilt: 0 }), true);
  assert.equal(settles({ x: 10, y: -12, turns: 1, tilt: 0 }), false);
  assert.equal(settles({ x: SNAP_DISTANCE + 1, y: 0, turns: 0, tilt: 0 }), false);
});

test("letter text splits into words, blots and smudged names", () => {
  assert.deepEqual(parseSegments("so dear [[Ned]], my {{war}}."), [
    { kind: "text", text: "so dear " },
    { kind: "smear", text: "Ned" },
    { kind: "text", text: ", my " },
    { kind: "blot", id: "war" },
    { kind: "text", text: "." },
  ]);
  assert.equal(plainText("dear [[Ned]], a {{war}}", [{ id: "war", word: "War", survive: [0] }]), "dear Ned, a War");
});

test("guesses ignore case, and hints and near misses earn letters", () => {
  const blot = { id: "b", word: "butterflies", survive: [0, 4, 8] };
  assert.deepEqual(visibleLetters(blot), ["b", null, null, null, "e", null, null, null, "i", null, null]);
  assert.equal(checkGuess(blot, "BUTTERFLIES").correct, true);
  const near = checkGuess(blot, "butterfries");
  assert.ok(!near.correct && near.matches.includes(1) && !near.matches.includes(7));
  assert.equal(guessReady(blot, "butter"), false);
  assert.equal(nextHiddenLetter(blot), 1);
  assert.equal(nextHiddenLetter(blot, [1, 2, 3]), 5);
  assert.equal(nextHiddenLetter({ id: "w", word: "War", survive: [0, 1, 2] }), null);
  assert.equal(normalizeWord("Grov’ling"), "grovling");
});

const ALL_WEEKS = [...WEEKS, HAMILTON_WEEK];
const ALL_LETTERS = ALL_WEEKS.flatMap((w) => w.letters);
/** The writer's surname, which must never show while a letter is being solved. */
const surnameOf = (letterId: string) => {
  const week = ALL_WEEKS.find((w) => w.letters.some((l) => l.id === letterId))!;
  return hiddenNames(week);
};

test("every week has five letters, Monday to Friday", () => {
  for (const week of ALL_WEEKS) {
    assert.equal(week.letters.length, 5, week.id);
    week.letters.forEach((l, i) => assert.equal(l.day, i, l.id));
    assert.equal(new Set(week.letters.map((l) => l.id)).size, 5);
  }
});

test("every letter is well formed, and never names its writer before it's delivered", () => {
  for (const letter of ALL_LETTERS) {
    const text = [letter.salutation, ...letter.body, ...letter.signoff, letter.postscript ?? ""].join("\n");
    for (const blot of letter.blots) {
      assert.equal(text.split(`{{${blot.id}}}`).length - 1, 1, `${letter.id}: ${blot.id}`);
      for (const i of blot.survive) assert.ok(i >= 0 && i < blot.word.length);
      assert.ok(blot.survive.length < blot.word.length, `${blot.id} gives the whole word away`);
    }
    const ids = parseSegments(text).filter((s) => s.kind === "blot").map((s) => (s as { id: string }).id);
    assert.deepEqual(ids.sort(), letter.blots.map((b) => b.id).sort());
    assert.ok(letter.to.cards.some((c) => c.id === letter.to.answer), `${letter.id}: to`);
    assert.ok(letter.when.options.some((c) => c.id === letter.when.answer), `${letter.id}: when`);
    // What a reader sees while solving: no smudged name, no blotted word.
    const visible = parseSegments(text)
      .filter((s) => s.kind === "text")
      .map((s) => (s as { text: string }).text)
      .join(" ");
    assert.ok(!surnameOf(letter.id).test(visible), `${letter.id} shows the writer's name`);
    // Other names come back once a letter is delivered; the writer's stays hidden until he's named.
    for (const s of parseSegments(text)) {
      if (s.kind === "smear" && (surnameOf(letter.id).test(s.text) || /^h$/i.test(s.text))) assert.ok(s.writer, `${letter.id}: "${s.text}" isn't marked as the writer's`);
    }
    for (const c of [...letter.to.cards, ...letter.when.options]) {
      assert.ok(!surnameOf(letter.id).test(`${c.name} ${c.note ?? ""}`), `${letter.id}: card ${c.id} names the writer`);
    }
  }
});

test("the history after each letter never names the writer, and every week's timeline points at real letters", () => {
  for (const letter of ALL_LETTERS) {
    const h = letter.history;
    if (!h) continue;
    const text = [...h.context, ...h.afterwards, ...h.people.flatMap((p) => [p.name, p.note]), ...letter.story, letter.clue].join(" ");
    assert.ok(!surnameOf(letter.id).test(text), `${letter.id}: history names the writer`);
    assert.ok(h.context.length > 0 && h.people.length > 0 && h.afterwards.length > 0, `${letter.id}: history is incomplete`);
  }
  for (const week of ALL_WEEKS) {
    const marked = (week.timeline ?? []).flatMap((t) => t.letters ?? []);
    for (const d of marked) assert.ok(d >= 0 && d < week.letters.length, week.id);
    if (week.timeline) assert.deepEqual([...new Set(marked)].sort(), week.letters.map((l) => l.day), `${week.id}: every letter is on the timeline`);
  }
});

test("letters arrive one a weekday, and missed days stay open", () => {
  const week = WEEKS[0];
  assert.equal(lettersArrived(week, "2026-10-18"), 0);
  assert.equal(lettersArrived(week, "2026-10-19"), 1);
  assert.equal(lettersArrived(week, "2026-10-21"), 3);
  assert.equal(lettersArrived(week, "2026-10-24"), 5);
  assert.equal(lettersArrived(week, "2026-10-19", true), 5);
  assert.equal(arrivalDay(week, 4), "2026-10-23");
  assert.equal(daysBetween("2026-10-19", "2026-11-02"), 14);
  assert.equal(weekFor("2026-10-20").id, week.id);
});

test("naming the writer accepts any sensible way of writing it", () => {
  const week = WEEKS[0];
  for (const g of ["Roosevelt", "theodore roosevelt", "Teddy Roosevelt!", "T. Roosevelt", "  TEDDY  "]) assert.ok(namesMystery(week, g), g);
  for (const g of ["Franklin Roosevelt", "FDR", "Franklin Delano Roosevelt", "Eleanor Roosevelt", "Rose", "Lincoln", ""]) assert.ok(!namesMystery(week, g), g);
  for (const g of ["Hamilton", "alexander hamilton", "Alex. Hamilton!"]) assert.ok(namesMystery(HAMILTON_WEEK, g), g);
});

test("the share note gives nothing away", () => {
  const p = { ...freshProgress(), inkUsed: 2, deliveryTries: 1, hints: 1, level: "medium" as const };
  const text = shareText(WEEKS[0], 1, p, 5, { ...freshWeek(), namedOnDay: 1, guesses: ["burr", "hamilton"] });
  assert.match(text, /Bundle 1 · Tuesday · Medium/);
  assert.match(text, /●●●○○ ink to spare/);
  assert.match(text, /1 hint/);
  assert.match(text, /Named the writer on Tuesday, guess 2/);
  for (const secret of ["Roosevelt", "Kermit", "kitten", "1903"]) assert.ok(!text.includes(secret), secret);
});

test("every level tears the sheet cleanly into its own number of pieces", () => {
  for (const level of LEVELS) {
    const { rows, cols } = RULES[level].pieces;
    const pieces = tearSheet(W, H, { rows, cols, seed: 4 });
    assert.equal(pieces.length, rows * cols);
    const total = pieces.reduce((s, p) => s + polygonArea(p.polygon), 0);
    assert.ok(Math.abs(total - W * H) < 1e-6 * W * H, level);
  }
});

test("Easy keeps every piece upright; Hard turns every one", () => {
  const pieces = tearSheet(W, H, { rows: 3, cols: 3, seed: 2 });
  const desk = { left: -500, top: 0, right: W + 500, bottom: H };
  for (const seed of [1, 2, 3]) {
    assert.ok(scatter(pieces, desk, seed, { turns: "none" }).every((p) => p.turns === 0));
    assert.ok(scatter(pieces, desk, seed, { turns: "all" }).every((p) => p.turns % 4 !== 0));
  }
});

test("Medium shows about half of each lost word, and never the whole word", () => {
  for (const letter of ALL_LETTERS) {
    for (const blot of letter.blots) {
      const medium = surviveFor(blot, "medium");
      assert.ok(medium.length < blot.word.length, `${blot.id} gives the word away`);
      assert.ok(medium.length >= Math.floor(blot.word.length / 2), `${blot.id} shows too little`);
      for (const i of blot.survive) assert.ok(medium.includes(i), `${blot.id} hides a letter Hard shows`);
      assert.deepEqual(surviveFor(blot, "hard"), blot.survive);
      assert.equal(blotAt(blot, "medium").word, blot.word);
    }
  }
});

test("Easy shows no letters at all, so the choice comes from the sentence", () => {
  for (const letter of ALL_LETTERS) {
    for (const blot of letter.blots) assert.deepEqual(surviveFor(blot, "easy"), [], blot.id);
  }
});

test("Easy offers the word and two decoys, always in the same order", () => {
  for (const letter of ALL_LETTERS) {
    for (const blot of letter.blots) {
      const words = wordChoices(blot);
      assert.equal(words.length, 3, blot.id);
      assert.ok(words.includes(blot.word));
      assert.equal(new Set(words.map((w) => w.toLowerCase())).size, 3, `${blot.id} has a repeated choice`);
      assert.deepEqual(wordChoices(blot), words);
    }
  }
});

test("Easy crosses off one wrong answer per question, never the right one", () => {
  for (const letter of ALL_LETTERS) {
    const out = crossedOffAtStart(letter, "easy");
    assert.equal(out.length, 2);
    assert.ok(!out.includes(letter.to.answer) && !out.includes(letter.when.answer));
    assert.deepEqual(crossedOffAtStart(letter, "medium"), []);
  }
});

const delivered = (extra: Partial<ReturnType<typeof freshProgress>>) => ({ ...freshProgress(), phase: "delivered" as const, deliveryTries: 1, ...extra });

test("a perfect letter is worth far more on Hard than on Easy", () => {
  const perfect = (level: "easy" | "medium" | "hard") => letterScore(delivered({ level }))!.total;
  assert.equal(perfect("easy"), bestPossible("easy"));
  assert.equal(perfect("medium"), bestPossible("medium"));
  assert.equal(perfect("hard"), bestPossible("hard"));
  assert.deepEqual([bestPossible("easy"), bestPossible("medium"), bestPossible("hard")], [32, 60, 88]);
});

test("ink spent, hints, help and returns all cost points, never below the floor", () => {
  const full = letterScore(delivered({ level: "medium" }))!.total;
  assert.ok(letterScore(delivered({ level: "medium", inkUsed: 2 }))!.total < full);
  assert.ok(letterScore(delivered({ level: "medium", hints: 1 }))!.total < full);
  assert.ok(letterScore(delivered({ level: "medium", mendedByClerk: true }))!.total < full);
  assert.ok(letterScore(delivered({ level: "medium", deliveryTries: 2 }))!.total < full);
  const awful = letterScore(delivered({ level: "easy", inkRanOut: true, inkUsed: 6, mendedByClerk: true, deliveryTries: 4, hints: 20 }))!;
  assert.equal(awful.total, 5);
  assert.equal(letterScore({ ...freshProgress(), phase: "read" }), null);
});

test("a letter's lines add up to its score", () => {
  const s = letterScore(delivered({ level: "hard", inkUsed: 1, hints: 1 }))!;
  assert.equal(s.lines.reduce((a, l) => a + l.points, 0), s.total);
});

test("naming the writer early is worth more, and wrong guesses cost a little", () => {
  assert.equal(weekScore({ ...freshWeek() }), null);
  assert.equal(weekScore({ guesses: ["Hamilton"], namedOnDay: 0, revealed: false })!.total, 50);
  assert.equal(weekScore({ guesses: ["Burr", "Hamilton"], namedOnDay: 1, revealed: false })!.total, 35);
  assert.equal(weekScore({ guesses: Array(20).fill("x"), namedOnDay: 4, revealed: false })!.total, 5);
  assert.equal(weekScore({ guesses: [], namedOnDay: null, revealed: true }), null);
});

test("the total adds every letter and the week; ranks climb with it", () => {
  const total = totalScore([delivered({ level: "easy" }), freshProgress()], [{ guesses: ["hamilton"], namedOnDay: 0, revealed: false }]);
  assert.equal(total, 32 + 50);
  assert.equal(rankFor(0).title, "Junior Clerk");
  assert.equal(rankFor(82).title, "Sorting Clerk");
  assert.equal(rankFor(82).next?.title, "Letter Carrier");
  assert.equal(rankFor(5000).next, null);
  assert.equal(easier("hard", "easy"), "easy");
  assert.equal(easier("medium", "hard"), "medium");
});

test("only approved weeks reach the calendar; drafts wait for a person", () => {
  const draft = { ...WEEKS[0], id: "test-draft", status: "draft" as const, starts: "2026-10-26" };
  const approved = { ...WEEKS[0], id: "test-approved", status: "approved" as const, starts: "2026-10-19" };
  const weeks = [approved, draft];
  // A draft's Monday comes and goes, and the office keeps the last approved week.
  assert.equal(weekFor("2026-10-28", weeks).id, "test-approved");
  assert.equal(weekFor("2026-10-28", [approved, { ...draft, status: "approved" }]).id, "test-draft");
  assert.deepEqual(weeksAhead("2026-10-20", weeks).map((w) => w.id), []);
  assert.deepEqual(weeksAhead("2026-10-20", [approved, { ...draft, status: "approved" }]).map((w) => w.id), ["test-draft"]);
  assert.equal(weekById("2026-w44-lincoln")?.id, "2026-w44-lincoln");
  for (const w of WEEKS) assert.ok(w.status === "approved" || !w.reviewed, `${w.id}: a draft can't have a reviewer`);
});
