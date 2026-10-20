// Checks every week of Dead Letter Office letters before a person approves it.
//
//   npm run check:letters -w apps/web            every week
//   npm run check:letters -w apps/web -- <id>    one week
//
// For each letter it downloads the edition the letter cites (source.textUrl)
// and confirms that every quoted passage appears in it word for word. It also
// checks the puzzle itself (blots, decoys, answers) and reports the calendar:
// which approved weeks are scheduled and when the office runs out of post.
// Exits 1 if anything is wrong.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSegments, plainText } from "../../src/lib/dead-letter/blots";
import type { DeadLetter } from "../../src/lib/dead-letter/letters";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { HAMILTON_WEEK, WEEKS, daysBetween, hiddenNames, localDay, namesMystery, type Week } from "../../src/lib/dead-letter/weeks";

const CACHE = join(tmpdir(), "inkwell-dead-letter-sources");

/** Punctuation and spacing differences that don't change the words. */
export function normalize(s: string): string {
  return s
    .replace(/^﻿/, "")
    .replace(/[—–]/g, "--")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/_/g, "") // Project Gutenberg marks italics with underscores
    .replace(/\s+/g, " ")
    .trim();
}

async function sourceText(url: string): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, createHash("sha256").update(url).digest("hex").slice(0, 16) + ".txt");
  if (existsSync(file)) return readFileSync(file, "utf8");
  const res = await fetch(url, { headers: { "User-Agent": "Inkwell letter checker (hello@inkwell.social)" } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const text = await res.text();
  writeFileSync(file, text);
  return text;
}

/** Every stretch of quoted text in a letter, with blots filled and names restored. */
function passages(letter: DeadLetter): { where: string; text: string; anyCase: boolean }[] {
  const out: { where: string; text: string; anyCase: boolean }[] = [];
  // Editions often print salutations and sign-offs in capitals, so those match in any case.
  const add = (where: string, raw: string, anyCase = false) => {
    for (const piece of plainText(raw, letter.blots).split("…")) {
      const text = normalize(piece);
      if (text.length >= 4) out.push({ where, text, anyCase });
    }
  };
  add("salutation", letter.salutation, true);
  letter.body.forEach((p, i) => add(`paragraph ${i + 1}`, p));
  letter.signoff.forEach((p, i) => add(`sign-off ${i + 1}`, p, true));
  if (letter.postscript) add("postscript", letter.postscript);
  return out;
}

/** Problems with the puzzle: things the tests would also catch, said plainly. */
function puzzleProblems(letter: DeadLetter): string[] {
  const problems: string[] = [];
  const used = [...letter.body, ...letter.signoff, letter.postscript ?? ""]
    .flatMap((p) => parseSegments(p))
    .filter((s) => s.kind === "blot")
    .map((s) => (s as { id: string }).id);
  for (const b of letter.blots) {
    const n = used.filter((id) => id === b.id).length;
    if (n !== 1) problems.push(`blot "${b.id}" is used ${n} times in the text (should be once)`);
    if (!b.decoys || b.decoys.length !== 2) problems.push(`blot "${b.id}" needs exactly two decoys for Easy`);
    const lower = (b.decoys ?? []).map((d) => d.toLowerCase());
    if (lower.includes(b.word.toLowerCase())) problems.push(`blot "${b.id}" has its own word as a decoy`);
    if (b.survive.some((i) => i < 0 || i >= b.word.length)) problems.push(`blot "${b.id}" keeps a letter outside the word`);
    if (b.survive.length >= b.word.length) problems.push(`blot "${b.id}" shows every letter on Hard`);
  }
  for (const id of used) if (!letter.blots.some((b) => b.id === id)) problems.push(`{{${id}}} has no blot`);
  if (letter.blots.length < 3 || letter.blots.length > 5) problems.push(`${letter.blots.length} blots (aim for 3 to 5)`);
  if (!letter.to.cards.some((c) => c.id === letter.to.answer)) problems.push("the recipient answer isn't one of the cards");
  if (!letter.when.options.some((c) => c.id === letter.when.answer)) problems.push("the year answer isn't one of the options");
  if (letter.to.cards.length < 4) problems.push("fewer than four recipient cards");
  if (letter.when.options.length < 4) problems.push("fewer than four year options");
  if (!letter.history) problems.push("no history");
  return problems;
}

function mondayOf(day: string): boolean {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

async function checkWeek(week: Week): Promise<number> {
  let failures = 0;
  console.log(`\n${week.id}  (${week.status}${week.reviewed ? `, approved by ${week.reviewed.by} on ${week.reviewed.on}` : ""})`);
  if (week.letters.length !== 5) {
    console.log(`  ✗ ${week.letters.length} letters (a week has five, Monday to Friday)`);
    failures++;
  }
  week.letters.forEach((l, i) => {
    if (l.day !== i) {
      console.log(`  ✗ ${l.id} is on day ${l.day}, expected ${i}`);
      failures++;
    }
  });
  if (!mondayOf(week.starts)) {
    console.log(`  ✗ starts ${week.starts}, which isn't a Monday`);
    failures++;
  }

  // The writer's name (and any other giveaway names) must stay hidden until they're named.
  const hidden = hiddenNames(week);
  if (!namesMystery(week, week.mystery.answer)) {
    console.log(`  ✗ naming "${week.mystery.answer}" isn't accepted by mystery.accept`);
    failures++;
  }
  for (const letter of week.letters) {
    const problems = puzzleProblems(letter);
    const segments = [letter.salutation, ...letter.body, ...letter.signoff, letter.postscript ?? ""].flatMap((t) => parseSegments(t));
    const visible = segments.map((s) => (s.kind === "text" ? s.text : "")).join(" ");
    if (hidden.test(visible)) problems.push("the writer's name shows in the letter (smudge it as [[!Name]])");
    for (const s of segments) if (s.kind === "smear" && hidden.test(s.text) && !s.writer) problems.push(`[[${s.text}]] is the writer's name: mark it [[!${s.text}]]`);
    for (const c of [...letter.to.cards, ...letter.when.options]) if (hidden.test(`${c.name} ${c.note ?? ""}`)) problems.push(`card "${c.id}" names the writer`);
    const h = letter.history;
    const after = [...(h?.context ?? []), ...(h?.afterwards ?? []), ...(h?.people ?? []).flatMap((p) => [p.name, p.note]), ...letter.story, letter.clue, letter.writtenAt, letter.deliverTo];
    if (hidden.test(after.join(" "))) problems.push("the history, story, clue or address names the writer (they may not have guessed yet)");
    let quoted = "";
    if (!letter.source.textUrl) {
      quoted = "source not downloadable: check the text by hand against " + letter.source.url;
    } else {
      try {
        const book = normalize(await sourceText(letter.source.textUrl));
        const lowerBook = book.toLowerCase();
        const missing = passages(letter).filter((p) =>
          p.anyCase ? !lowerBook.includes(p.text.toLowerCase()) : !book.includes(p.text),
        );
        for (const m of missing) problems.push(`${m.where} isn't in the source word for word: "${m.text.slice(0, 90)}…"`);
        quoted = `${passages(letter).length} passages match the source`;
      } catch (e) {
        problems.push(`couldn't download the source: ${(e as Error).message}`);
      }
    }
    if (problems.length) {
      failures += problems.length;
      console.log(`  ✗ ${letter.id}`);
      for (const p of problems) console.log(`      ${p}`);
    } else {
      console.log(`  ✓ ${letter.id}: ${quoted}`);
    }
  }
  return failures;
}

function calendar(today: string): number {
  let failures = 0;
  const approved = WEEKS.filter((w) => w.status === "approved").sort((a, b) => a.starts.localeCompare(b.starts));
  console.log(`\nCalendar (today ${today})`);
  for (const w of [...WEEKS].sort((a, b) => a.starts.localeCompare(b.starts))) {
    const when = daysBetween(w.starts, today) >= 0 ? (daysBetween(w.starts, today) < 7 ? "on the desk now" : "past") : "coming";
    console.log(`  ${w.starts}  ${w.id.padEnd(28)} ${w.status.padEnd(9)} ${when}`);
  }
  for (let i = 1; i < approved.length; i++) {
    const gap = daysBetween(approved[i - 1].starts, approved[i].starts);
    if (gap !== 7) {
      console.log(`  ✗ ${gap} days between ${approved[i - 1].id} and ${approved[i].id} (weeks should follow on)`);
      failures++;
    }
  }
  const dup = new Set<string>();
  for (const w of approved) {
    if (dup.has(w.starts)) {
      console.log(`  ✗ two approved weeks start on ${w.starts}`);
      failures++;
    }
    dup.add(w.starts);
  }
  const last = approved[approved.length - 1];
  if (last) {
    const runsOut = addDays(last.starts, 7);
    const ahead = approved.filter((w) => daysBetween(today, w.starts) > 0).length;
    console.log(`  ${ahead} approved ${ahead === 1 ? "week" : "weeks"} still to come; the post runs out on ${runsOut}.`);
    if (ahead < 2) console.log("  ! Draft and approve another week soon: the office repeats its last week when it runs out.");
  }
  return failures;
}

/** `--file path/to/week.ts`: check a week file that isn't on the calendar yet. */
async function weekFromFile(path: string): Promise<Week> {
  const mod = (await import(pathToFileURL(resolve(path)).href)) as Record<string, unknown>;
  const week = Object.values(mod).find((v): v is Week => !!v && typeof v === "object" && "mystery" in v && "letters" in v);
  if (!week) throw new Error(`${path} exports no Week`);
  return week;
}

async function main() {
  if (process.argv[2] === "--file") {
    const failures = await checkWeek(await weekFromFile(process.argv[3]));
    console.log(failures ? `\n${failures} ${failures === 1 ? "problem" : "problems"} found.` : "\nAll clear.");
    process.exit(failures ? 1 : 0);
  }
  const only = process.argv[2];
  // The retired Hamilton week is checked only when asked for by name.
  const all = [...WEEKS, HAMILTON_WEEK];
  const weeks = only ? all.filter((w) => w.id === only) : WEEKS;
  if (only && weeks.length === 0) {
    console.error(`No week called ${only}. Weeks: ${all.map((w) => w.id).join(", ")}`);
    process.exit(1);
  }
  let failures = 0;
  for (const w of weeks) failures += await checkWeek(w);
  if (!only) failures += calendar(localDay());
  console.log(failures ? `\n${failures} ${failures === 1 ? "problem" : "problems"} found.` : "\nAll clear.");
  process.exit(failures ? 1 : 0);
}

main();
