# Drafting a week for the Dead Letter Office

The Dead Letter Office (`/play`) gets one bundle of five letters a week, Monday
to Friday, all by one writer whom players try to name. Weeks are made **a month
at a time**: Claude researches and drafts the whole next month; a person reads
it once and approves each week. Nothing reaches readers until then:
`weekFor()` only ever serves weeks with `status: "approved"`.

Inkwell itself never calls an AI model. Drafting happens in a Claude Code
session on Stanton's machine (the monthly job below), which opens a pull
request. The AI Policy page (`/ai`) says so. The plan lives in
[`lineup.md`](lineup.md).

## The rules

**The letters**

- Real letters by one writer, **published before 1931** (public domain in the
  US), quoted **word for word** from a public-domain edition that has a plain
  text file online (Project Gutenberg is best). No paraphrase, no tidying of
  spelling. Use "…" for cuts and "—" for dashes; the checker treats those, curly
  quotes and Gutenberg's `_italics_` as equivalent to the source.
- **Plain modern English.** Someone who speaks English today should follow
  every sentence without a dictionary. That ruled out Hamilton. A few old words
  are fine if a note explains them.
- **Five different recipients**, each told apart by something in the letter
  itself (a "your sister", a "your father", a newspaper's name).
- Spread across the writer's life, so the timeline tells a story.
- Avoid letters whose authorship is disputed (for example Lincoln's Bixby
  letter), and avoid anything cruel, graphic or likely to upset someone as a
  daily puzzle.
- **The writer's name must not appear** in anything a player sees before
  delivery: letter text, cards, year options. Mark the writer's own signature
  `[[!Name]]` so it stays smudged until they're named. Other names the water
  took are `[[Name]]` and come back after delivery. The test suite enforces
  this using the surname from `mystery.answer`.

**The puzzle**

- 3 to 5 blots per letter: `{{id}}` in the text, ids lowercase. Pick words the
  sentence decides, never words that appear again nearby (that gives them
  away), and never the word that tells you who the letter was for.
- Each blot has **two decoys** that clearly break the sense of the sentence
  (Easy shows the word and the decoys with no letters at all, so the choice
  must come from reading). `survive` lists the letters left on Hard: a few,
  never all.
- Four recipient cards, four year options. Notes on cards never name the
  writer.
- `ink`: 4 or 5 for most letters.

**The history** (shown after delivery)

- `context`, `people`, `afterwards`, `story`, `clue`, `notes`. Never the
  writer's name (they're still guessing).
- **Only facts you are sure of.** If you can't confirm a detail, leave it out
  or soften it; never invent a quote. List anything you weren't sure of in the
  PR description so the reviewer can check it.
- Where the edition disagrees with a better source (a date, a word), quote the
  edition and add a note saying so.
- No comparisons to other social sites, no nudges, no streak talk.

**The week**

- One file per writer in `apps/web/src/lib/dead-letter/` (see `lincoln.ts`),
  exporting the letters and a `Week`, added to the end of `WEEKS` in `weeks.ts`.
- `id`: `YYYY-wNN-name` (ISO week of the Monday it starts). `starts`: that
  Monday, seven days after the previous week. `number`: one more than the last.
- `status: "draft"`, `drafted: { by: "claude", on: "<today>" }`. Never set
  `approved` or `reviewed` yourself.
- `mystery.accept`: surname and common nicknames; `reject`: other people's
  names that would otherwise match (family members with the same surname).
- `timeline`: the life in 10–13 lines; `letters: [day, …]` marks where each
  letter falls. Every letter must be on it.
- Update the previous week's `next` teaser to hint at this one, without
  naming them.

## Checking it

```bash
npm run test:play -w apps/web
```

```bash
npm run check:letters -w apps/web
```

The checker downloads each source and confirms every quoted passage, checks
blots, decoys and answers, and prints the calendar: which approved weeks are
scheduled and when the office runs out of post. Both must pass.

Then play it: start the web dev server and open
`http://localhost:3000/play?week=<id>`. Drafts are playable there (local only;
never in production) with all five letters open. Play every letter on Easy and
Hard.

## The monthly job

A scheduled task in the Claude app ("Dead Letter Office: plan next month") runs
on the **8th of every month at 9am**, about three weeks before the month it
plans. It:

1. Reads `lineup.md` and this playbook.
2. Researches writers for every Monday of next month: public-domain letters in
   plain English, a Gutenberg (or similar) plain-text edition, not used in the
   past year, a good mix (country, era, men and women), and anything seasonal.
3. Drafts every week by these rules, runs both checks until they pass, and
   plays each week's first letter at `/play?week=<id>` if a dev server is up.
4. Updates `lineup.md` and writes `recommendations/YYYY-MM.md`: the lineup and
   why, one or two alternates per week, and every fact it wasn't sure of.
5. Commits to a branch `dead-letter/YYYY-MM` and opens one pull request for
   the month. It never merges, approves or deploys.

The weeks are drafted in parallel (one per writer), each checked on its own
with `npm run check:letters -w apps/web -- --file <path>`.

## Reviewing a month (the reviewer)

1. Read `recommendations/YYYY-MM.md`. To swap a writer, say so in the PR or a
   Claude session; it redrafts that week.
2. Play each week at `/play?week=<id>` (local) and read the history.
3. Check the uncertain facts listed.
4. In each week's file set `status: "approved"` and
   `reviewed: { by: "<your username>", on: "<date>" }`.
5. Run both checks, merge, deploy before the month starts.

The office should always have **two approved weeks ahead**; the checker warns
when it doesn't. If it runs out, it keeps showing the last approved week, so a
late month is never a broken page.
