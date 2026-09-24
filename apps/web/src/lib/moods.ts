// Moods, LiveJournal-style.
//
// Every mood belongs to one of eighteen families, and a mood theme draws one
// face per family — the same arrangement LiveJournal used, where "giddy" and
// "chipper" wore the "happy" icon unless a theme drew them separately.
//
// The vocabulary is LiveJournal's own (ids 1–134, the same list Dreamwidth
// ships in bin/upgrading/moods.dat), so an imported post that only stored a
// mood id gets its mood back. A handful of newer words have no LJ id.

export type MoodFamily =
  | "happy" | "excited" | "loved" | "calm" | "grateful" | "thoughtful"
  | "creative" | "busy" | "accomplished" | "sad" | "anxious" | "angry"
  | "tired" | "sick" | "confused" | "blank" | "hungry" | "silly";

export interface Mood {
  key: string;
  label: string;
  family: MoodFamily;
  /** LiveJournal / Dreamwidth mood id, when the word came from their list. */
  ljId?: number;
  /** Kept for imported posts; not offered in the picker. */
  hidden?: boolean;
}

export const MOOD_FAMILIES: { id: MoodFamily; label: string; hue: number }[] = [
  { id: "happy", label: "Happy", hue: 45 },
  { id: "excited", label: "Excited", hue: 32 },
  { id: "loved", label: "Loved", hue: 340 },
  { id: "calm", label: "Calm", hue: 150 },
  { id: "grateful", label: "Grateful", hue: 95 },
  { id: "thoughtful", label: "Thoughtful", hue: 270 },
  { id: "creative", label: "Creative", hue: 290 },
  { id: "busy", label: "Busy", hue: 200 },
  { id: "accomplished", label: "Accomplished", hue: 50 },
  { id: "sad", label: "Sad", hue: 215 },
  { id: "anxious", label: "Anxious", hue: 25 },
  { id: "angry", label: "Angry", hue: 0 },
  { id: "tired", label: "Tired", hue: 230 },
  { id: "sick", label: "Sick", hue: 110 },
  { id: "confused", label: "Confused", hue: 180 },
  { id: "blank", label: "Blank", hue: 220 },
  { id: "hungry", label: "Hungry", hue: 28 },
  { id: "silly", label: "Silly", hue: 310 },
];

// [label, family, ljId?, hidden?]
const RAW: [string, MoodFamily, number?, boolean?][] = [
  // happy
  ["happy", "happy", 15], ["cheerful", "happy", 125], ["chipper", "happy", 99],
  ["bouncy", "happy", 59], ["giddy", "happy", 120], ["pleased", "happy", 109],
  ["amused", "happy", 44], ["good", "happy", 126], ["refreshed", "happy", 69],
  ["rejuvenated", "happy", 62],
  // excited
  ["excited", "excited", 41], ["ecstatic", "excited", 98], ["jubilant", "excited", 21],
  ["energetic", "excited", 11], ["hyper", "excited", 52], ["enthralled", "excited", 13],
  ["impressed", "excited", 116], ["awake", "excited", 87],
  // loved
  ["loved", "loved", 86], ["in love", "loved"], ["flirty", "loved", 67],
  ["romantic", "loved"], ["horny", "loved", 17, true],
  // calm
  ["calm", "calm", 68], ["content", "calm", 64], ["peaceful", "calm", 58],
  ["relaxed", "calm", 53], ["mellow", "calm", 57], ["relieved", "calm", 42],
  ["cozy", "calm"], ["complacent", "calm", 63], ["recumbent", "calm", 77],
  // grateful
  ["grateful", "grateful", 132], ["thankful", "grateful", 131], ["hopeful", "grateful", 43],
  ["optimistic", "grateful", 70], ["touched", "grateful", 32], ["sympathetic", "grateful", 81],
  // thoughtful
  ["thoughtful", "thoughtful", 30], ["contemplative", "thoughtful", 101],
  ["pensive", "thoughtful", 73], ["nostalgic", "thoughtful", 60], ["curious", "thoughtful", 56],
  ["reflective", "thoughtful"], ["quixotic", "thoughtful", 105],
  // creative
  ["creative", "creative", 107], ["artistic", "creative", 108], ["inspired", "creative"],
  ["nerdy", "creative", 102], ["geeky", "creative", 103],
  // busy
  ["busy", "busy", 91], ["working", "busy", 88], ["productive", "busy", 89],
  ["rushed", "busy", 100],
  // accomplished
  ["accomplished", "accomplished", 90], ["satisfied", "accomplished", 26],
  ["determined", "accomplished", 45], ["proud", "accomplished"],
  // sad
  ["sad", "sad", 25], ["melancholy", "sad", 39], ["gloomy", "sad", 38], ["lonely", "sad", 22],
  ["depressed", "sad", 9], ["disappointed", "sad", 55], ["crushed", "sad", 129],
  ["rejected", "sad", 123], ["morose", "sad", 37], ["discontent", "sad", 10],
  ["crappy", "sad", 7], ["pessimistic", "sad", 71], ["guilty", "sad", 111],
  ["heartbroken", "sad"], ["homesick", "sad"],
  // anxious
  ["anxious", "anxious", 4], ["nervous", "anxious", 134], ["worried", "anxious", 85],
  ["stressed", "anxious", 28], ["scared", "anxious", 46], ["restless", "anxious", 54],
  ["distressed", "anxious", 127], ["intimidated", "anxious", 128],
  ["embarrassed", "anxious", 79], ["uncomfortable", "anxious", 74], ["overwhelmed", "anxious"],
  // angry
  ["angry", "angry", 2], ["annoyed", "angry", 3], ["frustrated", "angry", 47],
  ["irritated", "angry", 112], ["grumpy", "angry", 95], ["cranky", "angry", 8],
  ["aggravated", "angry", 1], ["enraged", "angry", 12], ["infuriated", "angry", 19],
  ["irate", "angry", 20], ["pissed off", "angry", 24], ["moody", "angry", 23],
  ["cynical", "angry", 104], ["envious", "angry", 80], ["jealous", "angry", 133],
  ["bitchy", "angry", 110, true], ["predatory", "angry", 118, true],
  // tired
  ["tired", "tired", 31], ["sleepy", "tired", 49], ["exhausted", "tired", 14],
  ["drained", "tired", 40], ["groggy", "tired", 51], ["lazy", "tired", 33],
  ["lethargic", "tired", 75],
  // sick
  ["sick", "sick", 82], ["sore", "sick", 27], ["nauseated", "sick", 97],
  ["cold", "sick", 84], ["hot", "sick", 83], ["dirty", "sick", 119],
  // confused
  ["confused", "confused", 6], ["weird", "confused", 96], ["surprised", "confused", 121],
  ["shocked", "confused", 122], ["indescribable", "confused", 48],
  // blank
  ["blank", "blank", 113], ["okay", "blank", 61], ["indifferent", "blank", 65],
  ["bored", "blank", 5], ["apathetic", "blank", 114], ["blah", "blank", 92],
  ["numb", "blank", 124], ["listless", "blank", 76], ["exanimate", "blank", 78],
  // hungry
  ["hungry", "hungry", 18], ["thirsty", "hungry", 29], ["full", "hungry", 93],
  // silly
  ["silly", "silly", 66], ["giggly", "silly", 72], ["ditzy", "silly", 35],
  ["dorky", "silly", 115], ["crazy", "silly", 106], ["mischievous", "silly", 36],
  ["devious", "silly", 130], ["naughty", "silly", 117], ["drunk", "silly", 34],
  ["high", "silly", 16, true],
];

export function moodKeyFor(label: string): string {
  return label.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
}

export const MOODS: Mood[] = RAW.map(([label, family, ljId, hidden]) => ({
  key: moodKeyFor(label),
  label,
  family,
  ...(ljId ? { ljId } : {}),
  ...(hidden ? { hidden } : {}),
}));

const BY_KEY = new Map(MOODS.map((m) => [m.key, m]));
const FAMILY = new Map(MOOD_FAMILIES.map((f) => [f.id, f]));

export function getMood(key: string | null | undefined): Mood | null {
  return (key && BY_KEY.get(key)) || null;
}

export function familyHue(family: MoodFamily): number {
  return FAMILY.get(family)?.hue ?? 220;
}

// Words people type that aren't in the list, and where they belong.
const LOOSE: [RegExp, MoodFamily][] = [
  [/joy|delight|glad|yay|wonderful|great/, "happy"],
  [/thrill|pumped|stoked|hyped/, "excited"],
  [/love|adore|smitten|crush|affection|tender/, "loved"],
  [/serene|chill|at ease|quiet/, "calm"],
  [/bless|thank/, "grateful"],
  [/wonder|ponder|musing|introspect|wistful|intrigu/, "thoughtful"],
  [/writ|draw|paint|mak|craft|compos/, "creative"],
  [/hectic|swamp|deadline/, "busy"],
  [/triumph|victor|done|finished/, "accomplished"],
  [/griev|mourn|down|blue|cry|tear|miss/, "sad"],
  [/anxi|nerv|worr|panic|uneas|tense|fear|afraid/, "anxious"],
  [/mad|rage|fum|livid|irk|salty/, "angry"],
  [/sleep|exhaust|weary|burn|fatig|spent/, "tired"],
  [/ill|flu|fever|ache|queasy/, "sick"],
  [/baffl|perplex|lost|huh|strange/, "confused"],
  [/meh|fine|neutral|empty/, "blank"],
  [/starv|snack|peckish|caffein|coffee/, "hungry"],
  [/goofy|playful|cheeky|wacky/, "silly"],
];

/**
 * The mood a post shows, from its stored key or, for posts written before
 * moods had keys, from its words ("happy 😊", "sleepy after lunch").
 * Returns null when the words don't match anything — those posts show the
 * words with no face, as LiveJournal did for custom moods.
 */
export function resolveMood(
  key: string | null | undefined,
  text: string | null | undefined,
): { family: MoodFamily; mood: Mood | null } | null {
  const byKey = getMood(key);
  if (byKey) return { family: byKey.family, mood: byKey };
  if (!text) return null;

  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\s'-]/gu, " ")
    .trim();
  if (!words) return null;

  const whole = getMood(moodKeyFor(words));
  if (whole) return { family: whole.family, mood: whole };

  for (const w of words.split(/\s+/)) {
    const m = getMood(moodKeyFor(w));
    if (m && !m.hidden) return { family: m.family, mood: m };
  }
  for (const [re, family] of LOOSE) {
    // Only at the start of a word: "ill" is sick, "willing" isn't.
    if (new RegExp(`(?:^|\\s)(?:${re.source})`).test(words)) return { family, mood: null };
  }
  return null;
}

// ── Themes ──────────────────────────────────────────────────────────────────

export type MoodTheme = "classic" | "ink";

export const MOOD_THEMES: { id: MoodTheme; label: string; description: string }[] = [
  { id: "classic", label: "Classic", description: "Pixel smileys, straight out of 2004" },
  { id: "ink", label: "Ink", description: "Hand-drawn faces in Inkwell ink" },
];

export function normalizeMoodTheme(v: unknown): MoodTheme {
  return v === "ink" ? "ink" : "classic";
}
