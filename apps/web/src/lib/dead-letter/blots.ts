// Ink blots and smudges: the words a letter lost to water, and reading them back.
//
// In a letter's text, {{id}} is a blot the reader works out, and [[Name]] is a
// name the water took completely: drawn as a smear while the letter is being
// solved, written back in once it's delivered. [[!Name]] is the writer's own
// name, which stays washed out until the week's writer has been named.

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "blot"; id: string }
  | { kind: "smear"; text: string; writer?: boolean };

export interface Blot {
  id: string;
  /** The word as written. */
  word: string;
  /** Positions (0-based) of letters that survived the water (on Hard). */
  survive: number[];
  /** Wrong words that would fit the sentence, offered beside the real one on Easy. */
  decoys?: string[];
}

/** Split "a glimpse of the {{sea}}, dear [[Ned]]" into text, blots and smears. */
export function parseSegments(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /\{\{([a-z0-9_]+)\}\}|\[\[([^\]]+)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1]) out.push({ kind: "blot", id: m[1] });
    else if (m[2].startsWith("!")) out.push({ kind: "smear", text: m[2].slice(1), writer: true });
    else out.push({ kind: "smear", text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** The text with every blot and smear written back in. */
export function plainText(text: string, blots: Blot[]): string {
  const byId = new Map(blots.map((b) => [b.id, b.word]));
  return parseSegments(text)
    .map((s) => (s.kind === "text" ? s.text : s.kind === "smear" ? s.text : byId.get(s.id) ?? ""))
    .join("");
}

export function normalizeWord(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** The letters a reader can see: survivors plus anything they've earned. */
export function visibleLetters(blot: Blot, revealed: number[] = []): (string | null)[] {
  const shown = new Set([...blot.survive, ...revealed]);
  return [...blot.word].map((ch, i) => (shown.has(i) ? ch : null));
}

/** The first letter still hidden, for a hint; null when the whole word shows. */
export function nextHiddenLetter(blot: Blot, revealed: number[] = []): number | null {
  const shown = new Set([...blot.survive, ...revealed]);
  for (let i = 0; i < blot.word.length; i++) if (!shown.has(i)) return i;
  return null;
}

export interface GuessResult {
  correct: boolean;
  /** Positions where the guess has the right letter. */
  matches: number[];
}

export function checkGuess(blot: Blot, guess: string): GuessResult {
  const want = normalizeWord(blot.word);
  const got = normalizeWord(guess);
  if (got === want) return { correct: true, matches: [...want].map((_, i) => i) };
  const matches: number[] = [];
  for (let i = 0; i < want.length; i++) if (got[i] === want[i]) matches.push(i);
  return { correct: false, matches };
}

/** A guess counts only when it's a whole word of the right length. */
export function guessReady(blot: Blot, guess: string): boolean {
  return normalizeWord(guess).length === normalizeWord(blot.word).length;
}
