// Mood icons: one little face per mood family, in two themes.
//
// Classic is pixel art on a 20×20 grid — drawn from ASCII sprites below and
// merged into one <path> per colour, so each icon is a handful of nodes.
// Ink is hand-drawn strokes in the brand ink colour. Both animate with CSS
// (see .mood-icon in globals.css), and stand still under reduced motion.
//
// No hooks, so it renders on the server as well as in client components.

import type { CSSProperties, ReactElement } from "react";
import { resolveMood, normalizeMoodTheme, getMood, type MoodFamily } from "@/lib/moods";

type Eyes = "dot" | "happy" | "closed" | "wide" | "star" | "heart" | "sad" | "angry" | "half" | "odd" | "wink" | "glasses";
type Mouth = "smile" | "grin" | "small" | "flat" | "frown" | "open" | "wavy" | "grit" | "tongue" | "drool";
type Acc = "none" | "sparkles" | "heart" | "tear" | "sweat" | "steam" | "zzz" | "thermo" | "question" | "bulb" | "star" | "clock" | "fork" | "dots" | "twinkle"
  | "mug" | "glass" | "rain" | "broken" | "snow" | "exclaim" | "bubble";
type Anim = "bounce" | "hop" | "pulse" | "breathe" | "sway" | "shake" | "tremble" | "droop" | "wobble" | "still";
type Tint = "yellow" | "red" | "green" | "pale" | "blue";

interface FaceSpec { eyes: Eyes; mouth: Mouth; acc: Acc; anim: Anim; tint?: Tint; blush?: boolean }

const SPECS: Record<MoodFamily, FaceSpec> = {
  happy:        { eyes: "happy",  mouth: "grin",   acc: "none",     anim: "bounce", blush: true },
  excited:      { eyes: "star",   mouth: "grin",   acc: "sparkles", anim: "hop" },
  loved:        { eyes: "heart",  mouth: "smile",  acc: "heart",    anim: "pulse", blush: true },
  calm:         { eyes: "closed", mouth: "small",  acc: "none",     anim: "breathe" },
  grateful:     { eyes: "closed", mouth: "smile",  acc: "twinkle",  anim: "breathe", blush: true },
  thoughtful:   { eyes: "dot",    mouth: "flat",   acc: "dots",     anim: "sway" },
  creative:     { eyes: "dot",    mouth: "smile",  acc: "bulb",     anim: "sway" },
  busy:         { eyes: "wide",   mouth: "flat",   acc: "clock",    anim: "tremble" },
  accomplished: { eyes: "happy",  mouth: "smile",  acc: "star",     anim: "bounce" },
  sad:          { eyes: "sad",    mouth: "frown",  acc: "tear",     anim: "droop" },
  anxious:      { eyes: "wide",   mouth: "wavy",   acc: "sweat",    anim: "tremble" },
  angry:        { eyes: "angry",  mouth: "grit",   acc: "steam",    anim: "shake", tint: "red" },
  tired:        { eyes: "half",   mouth: "small",  acc: "zzz",      anim: "droop" },
  sick:         { eyes: "half",   mouth: "wavy",   acc: "thermo",   anim: "wobble", tint: "green" },
  confused:     { eyes: "odd",    mouth: "wavy",   acc: "question", anim: "wobble" },
  blank:        { eyes: "half",   mouth: "flat",   acc: "none",     anim: "still", tint: "pale" },
  hungry:       { eyes: "dot",    mouth: "drool",  acc: "fork",     anim: "bounce" },
  silly:        { eyes: "wink",   mouth: "tongue", acc: "none",     anim: "wobble" },
};

// Moods that don't read right in their family's face get their own, the way
// LiveJournal themes drew some moods separately. Merged over the family spec.
const SAD_RAIN: Partial<FaceSpec> = { eyes: "half", mouth: "frown", acc: "rain", anim: "droop" };
const HEARTBREAK: Partial<FaceSpec> = { acc: "broken" };
const LETDOWN: Partial<FaceSpec> = { eyes: "half", mouth: "frown", acc: "none", anim: "still" };
const SCARED: Partial<FaceSpec> = { eyes: "wide", mouth: "open", acc: "sweat", tint: "pale", anim: "tremble" };
const SIDE_EYE: Partial<FaceSpec> = { eyes: "half", mouth: "flat", acc: "none", tint: "green", anim: "still" };
const GRUMPY: Partial<FaceSpec> = { eyes: "angry", mouth: "frown", acc: "none", tint: "yellow", anim: "droop" };
const IRKED: Partial<FaceSpec> = { eyes: "half", mouth: "flat", acc: "steam", tint: "yellow", anim: "still" };
const SLY: Partial<FaceSpec> = { eyes: "angry", mouth: "smile", acc: "none", anim: "sway" };
const HOPEFUL: Partial<FaceSpec> = { eyes: "dot", mouth: "smile", acc: "twinkle", anim: "sway" };

const MOOD_FACES: Record<string, Partial<FaceSpec>> = {
  // happy
  cheerful: { mouth: "smile" },
  chipper: { eyes: "dot", blush: false, anim: "hop" },
  bouncy: { blush: false, anim: "hop" },
  giddy: { acc: "sparkles", anim: "hop" },
  pleased: { mouth: "smile" },
  amused: { eyes: "wink", blush: false, anim: "wobble" },
  good: { eyes: "dot", mouth: "smile", blush: false, anim: "breathe" },
  refreshed: { eyes: "dot", acc: "twinkle", blush: false },
  rejuvenated: { eyes: "star", mouth: "smile", acc: "twinkle", blush: false },
  // excited
  ecstatic: { blush: true },
  jubilant: { eyes: "happy", acc: "star" },
  energetic: { eyes: "dot", mouth: "open", acc: "none", anim: "hop" },
  hyper: { eyes: "wide", acc: "sparkles", anim: "tremble" },
  awake: { eyes: "wide", mouth: "small", acc: "mug", anim: "still" },
  impressed: { eyes: "wide", mouth: "open" },
  enthralled: { mouth: "open", acc: "none" },
  // loved
  flirty: { eyes: "wink", acc: "heart" },
  romantic: { eyes: "closed", mouth: "small" },
  // calm
  content: { mouth: "smile", blush: true },
  relaxed: { eyes: "half", mouth: "smile" },
  mellow: { eyes: "half" },
  peaceful: { mouth: "smile", acc: "twinkle" },
  relieved: { mouth: "smile", acc: "sweat" },
  cozy: { acc: "mug", blush: true },
  complacent: { eyes: "half", mouth: "flat" },
  recumbent: { mouth: "smile", acc: "zzz", anim: "droop" },
  // grateful
  hopeful: HOPEFUL,
  optimistic: HOPEFUL,
  touched: { acc: "tear" },
  sympathetic: { eyes: "sad", mouth: "small", acc: "heart", blush: false },
  // thoughtful
  contemplative: { eyes: "closed" },
  pensive: { eyes: "half", mouth: "flat" },
  reflective: { eyes: "half", mouth: "small" },
  curious: { eyes: "wide", mouth: "small", acc: "question" },
  nostalgic: { eyes: "closed", mouth: "small" },
  quixotic: { eyes: "closed", mouth: "small", acc: "sparkles" },
  // creative
  artistic: { eyes: "closed", mouth: "smile" },
  inspired: { eyes: "star", mouth: "grin" },
  nerdy: { eyes: "glasses", mouth: "grin", acc: "none" },
  geeky: { eyes: "glasses", acc: "bulb" },
  // busy
  working: { eyes: "dot" },
  productive: { eyes: "dot", mouth: "smile" },
  rushed: { mouth: "wavy" },
  // accomplished
  satisfied: { eyes: "happy", acc: "none", anim: "breathe" },
  determined: { eyes: "angry", mouth: "flat", acc: "none", anim: "still" },
  proud: { eyes: "closed", mouth: "grin", blush: true },
  // sad
  depressed: SAD_RAIN,
  gloomy: SAD_RAIN,
  morose: SAD_RAIN,
  heartbroken: HEARTBREAK,
  crushed: HEARTBREAK,
  rejected: HEARTBREAK,
  disappointed: LETDOWN,
  pessimistic: LETDOWN,
  discontent: LETDOWN,
  crappy: { ...LETDOWN, eyes: "sad", mouth: "wavy" },
  melancholy: { eyes: "closed", acc: "none" },
  lonely: { eyes: "half" },
  homesick: { mouth: "small" },
  guilty: { eyes: "half", mouth: "wavy", acc: "sweat" },
  // anxious
  nervous: { eyes: "dot" },
  worried: { eyes: "sad" },
  stressed: { mouth: "grit" },
  restless: { eyes: "dot", mouth: "flat", acc: "none", anim: "shake" },
  distressed: { eyes: "sad", mouth: "open" },
  uncomfortable: { eyes: "half", acc: "none" },
  overwhelmed: { eyes: "odd" },
  scared: SCARED,
  intimidated: SCARED,
  embarrassed: { eyes: "dot", blush: true },
  // angry
  frustrated: { mouth: "wavy" },
  envious: SIDE_EYE,
  jealous: SIDE_EYE,
  cynical: { ...SIDE_EYE, tint: "yellow" },
  grumpy: GRUMPY,
  cranky: GRUMPY,
  moody: GRUMPY,
  annoyed: IRKED,
  irritated: IRKED,
  // tired
  sleepy: { eyes: "closed" },
  exhausted: { mouth: "open", tint: "pale" },
  drained: { tint: "pale", anim: "still" },
  groggy: { eyes: "odd" },
  lazy: { eyes: "half", mouth: "smile" },
  lethargic: { mouth: "flat" },
  // sick
  nauseated: { acc: "none" },
  dirty: { eyes: "dot", acc: "none", tint: "pale" },
  cold: { eyes: "half", mouth: "grit", acc: "snow", tint: "blue", anim: "tremble" },
  hot: { mouth: "open", acc: "sweat", tint: "red", anim: "droop" },
  sore: { eyes: "sad", mouth: "grit", acc: "none", tint: "yellow", anim: "still" },
  // confused
  weird: { mouth: "tongue", acc: "none" },
  indescribable: { eyes: "star", acc: "sparkles" },
  surprised: { eyes: "wide", mouth: "open", acc: "exclaim", anim: "hop" },
  shocked: { eyes: "wide", mouth: "open", acc: "exclaim", tint: "pale", anim: "tremble" },
  // blank
  okay: { eyes: "dot", tint: "yellow", anim: "breathe" },
  bored: { acc: "dots", anim: "droop" },
  blah: { mouth: "wavy" },
  apathetic: { eyes: "closed" },
  numb: { eyes: "dot" },
  listless: { anim: "droop" },
  exanimate: { eyes: "closed", mouth: "open", anim: "droop" },
  // hungry
  thirsty: { eyes: "half", mouth: "open", acc: "glass", anim: "droop" },
  full: { eyes: "closed", mouth: "small", acc: "bubble", blush: true, anim: "breathe" },
  // silly
  giggly: { eyes: "closed", mouth: "grin", blush: true, anim: "bounce" },
  drunk: { eyes: "odd", blush: true },
  crazy: { eyes: "odd", mouth: "grin", anim: "shake" },
  dorky: { eyes: "glasses" },
  devious: SLY,
  mischievous: SLY,
  naughty: SLY,
  ditzy: { eyes: "odd", mouth: "smile", acc: "sparkles" },
};

export function faceSpec(family: MoodFamily, key: string | null | undefined): FaceSpec {
  const override = key ? MOOD_FACES[key] : undefined;
  return override ? { ...SPECS[family], ...override } : SPECS[family];
}

// ── Classic (pixel) ─────────────────────────────────────────────────────────
// Letters are palette colours; "." is transparent. Faces sit at (0,4) on the
// 20×20 canvas so accessories have the top-right corner to themselves.

const PAL: Record<string, string> = {
  K: "#3b2a17", // outline
  W: "#ffffff",
  M: "#8c2b2b", // inside of a mouth
  P: "#ff8fa8", // blush, tongue
  R: "#e0344a", // hearts
  B: "#5aa8f0", // water
  G: "#f0b000", // gold
  S: "#b8b8c4", // steam
  C: "#8d93a8", // rain cloud
  H: "#fffbe0", // highlight
  A: "var(--mood-glyph)", // zzz, ?, fork… drawn off the face, so they flip in dark mode
};

const TINTS: Record<Tint, { fill: string; shade: string }> = {
  yellow: { fill: "#ffd447", shade: "#f0b429" },
  red: { fill: "#ff9a6b", shade: "#ee6f47" },
  green: { fill: "#c4dd78", shade: "#9fbd52" },
  pale: { fill: "#f1e6a8", shade: "#dccb82" },
  blue: { fill: "#bfe0ff", shade: "#90c0ec" },
};

const FACE = [
  ".....KKKKKK.....",
  "...KKFFFFFFKK...",
  "..KFHHFFFFFFFK..",
  ".KFHFFFFFFFFFFK.",
  ".KFFFFFFFFFFFFK.",
  "KFFFFFFFFFFFFFFK",
  "KFFFFFFFFFFFFFFK",
  "KFFFFFFFFFFFFFFK",
  "KFFFFFFFFFFFFFFK",
  "KFFFFFFFFFFFFFSK",
  "KFFFFFFFFFFFFFSK",
  ".KFFFFFFFFFFFSK.",
  ".KFFFFFFFFFFFSK.",
  "..KFFFFFFFFSSK..",
  "...KKSSSSSSKK...",
  ".....KKKKKK.....",
];

// Eyes: face rows 4–7, cols 3–12.
const EYES: Record<Eyes, string[]> = {
  dot:    ["..........", ".KK....KK.", ".KK....KK.", ".........."],
  happy:  ["..........", ".KK....KK.", "K..K..K..K", ".........."],
  closed: ["..........", "..........", "K..K..K..K", ".KK....KK."],
  wide:   ["KKK....KKK", "KWK....KWK", "KKK....KKK", ".........."],
  star:   [".K......K.", "KGK....KGK", ".K......K.", ".........."],
  heart:  ["R.R....R.R", "RRR....RRR", ".R......R.", ".........."],
  sad:    ["..K....K..", "KK......KK", ".KK....KK.", ".........."],
  angry:  ["KK......KK", "..K....K..", ".KK....KK.", ".........."],
  half:   ["..........", "KKK....KKK", ".KK....KK.", ".........."],
  odd:    ["KKK.......", "KWK....KK.", "KKK....KK.", ".........."],
  wink:   ["..........", ".KK.......", ".KK...KKKK", ".........."],
  glasses:["KKKK..KKKK", "KWKKKKKWKK", "KKKK..KKKK", ".........."],
};

// Mouths: face rows 9–12, cols 3–12.
const MOUTHS: Record<Mouth, string[]> = {
  smile:  ["..........", "K........K", ".K......K.", "..KKKKKK.."],
  grin:   [".KKKKKKKK.", ".KMMMMMMK.", "..KMPPMK..", "...KKKK..."],
  small:  ["..........", "..K....K..", "...KKKK...", ".........."],
  flat:   ["..........", "...KKKK...", "..........", ".........."],
  frown:  ["..........", "...KKKK...", "..K....K..", ".K......K."],
  open:   ["....KK....", "...KMMK...", "...KMMK...", "....KK...."],
  wavy:   ["..........", ".K..KK..K.", "..KK..KK..", ".........."],
  grit:   ["..........", ".KKKKKKKK.", ".KWKWKWKK.", ".KKKKKKKK."],
  tongue: ["..........", ".K......K.", "..KKKKKK..", "....PP...."],
  drool:  ["..KKKKKK..", "..KMMMMK..", "...KKKKB..", ".......B.."],
};

// Accessories: [x, y, sprite] on the 20×20 canvas, animated as one group.
const ACCS: Record<Acc, [number, number, string[]] | null> = {
  none: null,
  sparkles: [13, 0, ["...G...", "..GWG..", "...G..G", "......W", "G.....G", "......."]],
  heart: [14, 0, [".R.R.", "RRRRR", ".RRR.", "..R.."]],
  tear: [4, 11, ["B.", "B.", "BB"]],
  sweat: [15, 2, [".B.", "BBB", "BWB", ".B."]],
  steam: [12, 0, ["C...C", ".C.C.", "C...C"]],
  zzz: [13, 0, ["AAA....", ".A.....", "AAA.AA.", "....A..", "....AA."]],
  thermo: [11, 13, ["....R", "...K.", "..K..", ".K..."]],
  question: [15, 0, [".AA.", "A..A", "..A.", ".A..", "....", ".A.."]],
  bulb: [15, 0, [".GG.", "GGGG", "GGGG", ".GG.", ".SS."]],
  star: [14, 0, ["..G..", ".GGG.", "GGGGG", ".G.G."]],
  clock: [14, 0, [".AAA.", "AWAWA", "AWAAA", "AWWWA", ".AAA."]],
  fork: [16, 0, ["A.A", "A.A", "AAA", ".A.", ".A."]],
  dots: [14, 0, ["....A", "..A..", "A...."]],
  twinkle: [16, 1, [".G.", "GWG", ".G."]],
  mug: [13, 0, ["..S.S.", ".S.S..", "AAAAA.", "AMMMAA", "AMMMA.", ".AAA.."]],
  glass: [15, 0, ["A...A", "A...A", "ABBBA", "ABBBA", ".AAA."]],
  rain: [12, 0, [".CCC...", "CCCCCC.", ".CCCCC.", "..B.B..", ".B.B..."]],
  broken: [14, 0, ["RR.RR", "RRR.R", ".R.R.", "..R.."]],
  snow: [15, 0, ["B.B.B", ".BBB.", "BBWBB", ".BBB.", "B.B.B"]],
  exclaim: [17, 0, ["RR", "RR", "RR", "..", "RR"]],
  bubble: [15, 1, [".AA.", "A..A", "A..A", ".AA."]],
};

type PathMap = Map<string, string[]>;

function paint(paths: PathMap, sprite: string[], ox: number, oy: number, colours: Record<string, string>) {
  sprite.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = colours[row[x]];
      if (!c) continue;
      let list = paths.get(c);
      if (!list) paths.set(c, (list = []));
      list.push(`M${ox + x} ${oy + y}h1v1h-1z`);
    }
  });
}

function toPaths(paths: PathMap, prefix = "") {
  return Array.from(paths, ([fill, d]) => <path key={prefix + fill} fill={fill} d={d.join("")} />);
}

const classicCache = new Map<string, { face: ReactElement[]; eyes: ReactElement[]; acc: ReactElement[] }>();

function classicParts(spec: FaceSpec) {
  const sig = `${spec.eyes}|${spec.mouth}|${spec.acc}|${spec.tint ?? ""}|${spec.blush ? 1 : 0}`;
  const hit = classicCache.get(sig);
  if (hit) return hit;
  const tint = TINTS[spec.tint ?? "yellow"];

  const face: PathMap = new Map();
  paint(face, FACE, 0, 4, { ...PAL, F: tint.fill, S: tint.shade });
  // Features go in their own map: sharing the face's map would draw the
  // mouth's outline pixels in the same <path> as the face outline, under the fill.
  const features: PathMap = new Map();
  if (spec.blush) paint(features, ["PP..........PP"], 1, 12, PAL);
  paint(features, MOUTHS[spec.mouth], 3, 13, PAL);

  const eyes: PathMap = new Map();
  paint(eyes, EYES[spec.eyes], 3, 8, PAL);

  const acc: PathMap = new Map();
  const a = ACCS[spec.acc];
  if (a) paint(acc, a[2], a[0], a[1], PAL);

  const parts = { face: [...toPaths(face), ...toPaths(features, "f")], eyes: toPaths(eyes), acc: toPaths(acc) };
  classicCache.set(sig, parts);
  return parts;
}

// ── Ink (hand-drawn) ────────────────────────────────────────────────────────
// 24×24, strokes in --mood-ink so the faces read in dark mode too.

const INK_EYES: Record<Eyes, string> = {
  dot:    "M8.6 10.2v.8M15.4 10.2v.8",
  happy:  "M7.3 11c.6-1.2 1.9-1.2 2.5 0M14.2 11c.6-1.2 1.9-1.2 2.5 0",
  closed: "M7.3 10.4c.6 1.1 1.9 1.1 2.5 0M14.2 10.4c.6 1.1 1.9 1.1 2.5 0",
  wide:   "M8.6 8.9a1.3 1.5 0 1 0 .01 0M15.4 8.9a1.3 1.5 0 1 0 .01 0",
  star:   "M8.6 8.6v3M7.1 10.1h3M15.4 8.6v3M13.9 10.1h3",
  heart:  "M8.6 11.6 7.3 10.2c-.7-.8.4-2 1.3-1.1.9-.9 2 .3 1.3 1.1zM15.4 11.6l-1.3-1.4c-.7-.8.4-2 1.3-1.1.9-.9 2 .3 1.3 1.1z",
  sad:    "M7.2 8.9 9.6 8.2M16.8 8.9l-2.4-.7M8.6 10.6v.7M15.4 10.6v.7",
  angry:  "M7.1 8.1 9.8 9.2M16.9 8.1l-2.7 1.1M8.7 10.7v.7M15.3 10.7v.7",
  half:   "M7.2 10h2.8M14 10h2.8M8.6 10.6v.4M15.4 10.6v.4",
  odd:    "M8.6 8.7a1.4 1.6 0 1 0 .01 0M15.4 10.3v.6",
  wink:   "M8.6 10.1v.9M14.1 10.6h2.7",
  glasses:"M6.3 10.2a2.3 2.1 0 1 0 4.6 0a2.3 2.1 0 1 0-4.6 0M13.1 10.2a2.3 2.1 0 1 0 4.6 0a2.3 2.1 0 1 0-4.6 0M10.9 10h2.2M8.6 10.1v.5M15.4 10.1v.5",
};

const INK_MOUTHS: Record<Mouth, string> = {
  smile:  "M8.4 14.3c1.8 2.3 5.4 2.3 7.2 0",
  grin:   "M8 13.8h8c-.4 3.4-7.6 3.4-8 0z",
  small:  "M10.2 14.8c1 .9 2.6.9 3.6 0",
  flat:   "M10 15h4",
  frown:  "M9.2 16.1c1.4-1.7 4.2-1.7 5.6 0",
  open:   "M12 13.9a1.3 1.6 0 1 0 .01 0",
  wavy:   "M8.8 15.2c.8-.9 1.4.9 2.2 0s1.4.9 2.2 0 1.4.9 2.2 0",
  grit:   "M8.6 13.9h6.8v2.2H8.6zM10.9 13.9v2.2M13.1 13.9v2.2",
  tongue: "M8.6 14c1.9 1.6 4.9 1.6 6.8 0M11 14.9v1.1c0 1.2 2 1.2 2 0V14.9",
  drool:  "M9.2 13.9h5.6c-.3 2.6-5.3 2.6-5.6 0zM14.4 15.3c.1.9.1 1.6-.1 2.2",
};

const INK_ACCS: Record<Acc, { d: string; fill?: string } | null> = {
  none: null,
  sparkles: { d: "M20 2.5v3M18.5 4h3M21.5 8.5v2M20.5 9.5h2", fill: "none" },
  heart: { d: "M20 7.2 18 5.1c-1-1.1.6-2.8 2-1.5 1.4-1.3 3 .4 2 1.5z", fill: "var(--mood-heart)" },
  tear: { d: "M7.6 12.6c-.8 1.2-.8 2.3 0 2.3s.8-1.1 0-2.3z", fill: "var(--mood-water)" },
  sweat: { d: "M19.8 3.8c-1.1 1.6-1.1 3 0 3s1.1-1.4 0-3z", fill: "var(--mood-water)" },
  steam: { d: "M17.5 1.8c1 .7-1 1.4 0 2.1s-1 1.4 0 2.1M21 1.8c1 .7-1 1.4 0 2.1s-1 1.4 0 2.1", fill: "none" },
  zzz: { d: "M16.5 2.2h3l-3 3h3M20.6 6.2h2l-2 2h2", fill: "none" },
  thermo: { d: "M14.6 15.7l5.4-3.6", fill: "none" },
  question: { d: "M18.6 3.3c.2-1.6 3.3-1.6 3.3.2 0 1.3-1.6 1.4-1.6 2.7M20.3 8.1v.3", fill: "none" },
  bulb: { d: "M20.2 1.6a2.3 2.3 0 0 0-1.3 4.2v1h2.6v-1a2.3 2.3 0 0 0-1.3-4.2zM19.2 8.1h2", fill: "var(--mood-gold)" },
  star: { d: "m20 1.5.8 1.7 1.9.3-1.4 1.3.3 1.9-1.6-.9-1.7.9.3-1.9-1.4-1.3 1.9-.3z", fill: "var(--mood-gold)" },
  clock: { d: "M20 1.8a2.7 2.7 0 1 0 .01 0M20 3v1.6l1.1.7", fill: "none" },
  fork: { d: "M19 1.6v2.2c0 .9 2 .9 2 0V1.6M20 1.6v7", fill: "none" },
  dots: { d: "M17.4 7.4v.1M19.4 5v.1M21.8 2.4v.1", fill: "none" },
  twinkle: { d: "M20.5 2.5v4M18.5 4.5h4", fill: "none" },
  mug: { d: "M17 4.6h3.8v3.2c0 .7-.5 1.2-1.2 1.2h-1.4c-.7 0-1.2-.5-1.2-1.2zM20.8 5.4h.6a1 1 0 0 1 0 2h-.6M18.2 1.3c.6.6-.6 1.2 0 1.8M19.6 1.3c.6.6-.6 1.2 0 1.8", fill: "var(--mood-paper)" },
  glass: { d: "M17.5 1.6h4.2l-.6 6.8h-3zM17.8 4.6h3.6", fill: "none" },
  rain: { d: "M16.6 5.3a1.8 1.8 0 0 1 .4-3.5 2.2 2.2 0 0 1 4.1.4 1.6 1.6 0 0 1 .3 3.1zM17.6 7v1.3M19.6 7v1.3M21.5 7v1.3", fill: "var(--mood-paper)" },
  broken: { d: "M20 7.4 18 5.3c-1-1.1.6-2.8 2-1.5 1.4-1.3 3 .4 2 1.5zM20 3.9l-.7 1.3 1 .8-.4 1.3", fill: "var(--mood-heart)" },
  snow: { d: "M20 1.4v6.2M17.3 2.9l5.4 3.2M17.3 6.1l5.4-3.2", fill: "none" },
  exclaim: { d: "M20.6 1.5v4.3M20.6 7.8v.2", fill: "none" },
  bubble: { d: "M20 2.7a1.7 1.7 0 1 0 .01 0", fill: "none" },
};

// A slightly lopsided circle, so the face looks drawn rather than stamped.
const INK_FACE = "M12 3.3c4.9-.1 8.7 3.7 8.6 8.8-.1 4.9-3.8 8.6-8.7 8.6-4.9 0-8.5-3.9-8.5-8.8 0-4.8 3.8-8.5 8.6-8.6z";

function inkParts(spec: FaceSpec) {
  const a = INK_ACCS[spec.acc];
  const faceFill =
    spec.tint === "red" ? "var(--mood-ink-red)" :
    spec.tint === "green" ? "var(--mood-ink-green)" :
    spec.tint === "blue" ? "var(--mood-ink-blue)" : "var(--mood-paper)";
  return {
    face: (
      <>
        <path d={INK_FACE} fill={faceFill} />
        {spec.blush && <path d="M5.8 13.2h1.6M16.6 13.2h1.6" stroke="var(--mood-heart)" strokeOpacity=".45" strokeWidth="1.4" />}
        <path d={INK_MOUTHS[spec.mouth]} fill={spec.mouth === "grin" || spec.mouth === "drool" ? "var(--mood-ink)" : "none"} />
      </>
    ),
    eyes: <path d={INK_EYES[spec.eyes]} fill={spec.eyes === "heart" ? "var(--mood-heart)" : "none"} />,
    acc: a ? <path d={a.d} fill={a.fill ?? "none"} /> : null,
  };
}

// ── Component ───────────────────────────────────────────────────────────────

export function MoodIcon({
  moodKey,
  mood,
  family: familyProp,
  theme,
  size = 20,
  className = "",
  style,
  title,
}: {
  moodKey?: string | null;
  /** The mood's words; used to find a face when there is no key. */
  mood?: string | null;
  /** Draw a family's face directly, when there's no particular mood. */
  family?: MoodFamily;
  theme?: string | null;
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  const resolved = familyProp ? null : resolveMood(moodKey, mood);
  const family = familyProp ?? resolved?.family;
  if (!family) return null;
  const key = familyProp ? (getMood(moodKey)?.family === familyProp ? moodKey : null) : resolved?.mood?.key;
  const spec = faceSpec(family, key);
  const t = normalizeMoodTheme(theme);
  const { anim, acc } = spec;
  const cls = `mood-icon mood-icon-${t} mood-anim-${anim} ${className}`.trim();
  const a11y = title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true as const };

  if (t === "classic") {
    const p = classicParts(spec);
    return (
      <svg className={cls} style={style} width={size} height={size} viewBox="0 0 20 20" shapeRendering="crispEdges" {...a11y}>
        {title && <title>{title}</title>}
        <g className="mood-body">
          {p.face}
          <g className="mood-eyes">{p.eyes}</g>
        </g>
        {p.acc.length > 0 && <g className={`mood-acc mood-acc-${acc}`}>{p.acc}</g>}
      </svg>
    );
  }

  const p = inkParts(spec);
  return (
    <svg
      className={cls} style={style} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="var(--mood-ink)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
      {...a11y}
    >
      {title && <title>{title}</title>}
      <g className="mood-body">
        {p.face}
        <g className="mood-eyes">{p.eyes}</g>
      </g>
      {p.acc && <g className={`mood-acc mood-acc-${acc}`}>{p.acc}</g>}
    </svg>
  );
}
