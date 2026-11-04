// Mood icons: one little face per mood family, in two themes.
//
// Ink drops (the default, theme id "ink") are little drops of Inkwell ink
// whose shape and props carry the mood; they're drawn in mood-drop.tsx.
// Classic is pixel art on a 20×20 grid — drawn from ASCII sprites below and
// merged into one <path> per colour, so each icon is a handful of nodes. Both animate with CSS
// (see .mood-icon in globals.css), and stand still under reduced motion.
//
// No hooks, so it renders on the server as well as in client components.

import type { CSSProperties, ReactElement } from "react";
import { resolveMood, normalizeMoodTheme, getMood, type MoodFamily } from "@/lib/moods";
import { dropParts } from "./mood-drop";

export type Eyes = "dot" | "happy" | "closed" | "wide" | "star" | "heart" | "sad" | "angry" | "half" | "odd" | "wink" | "glasses";
export type Mouth = "smile" | "grin" | "small" | "flat" | "frown" | "open" | "wavy" | "grit" | "tongue" | "drool";
export type Acc = "none" | "sparkles" | "heart" | "tear" | "sweat" | "steam" | "zzz" | "thermo" | "question" | "bulb" | "star" | "clock" | "fork" | "dots" | "twinkle"
  | "mug" | "glass" | "rain" | "broken" | "snow" | "exclaim" | "bubble"
  // Worn by the ink drops; the pixel theme swaps in its nearest prop.
  | "nightcap" | "beret" | "partyhat" | "scarf" | "rosette";
type Anim = "bounce" | "hop" | "pulse" | "breathe" | "sway" | "shake" | "tremble" | "droop" | "wobble" | "still";
export type Tint = "yellow" | "red" | "green" | "pale" | "blue";
/** The ink drop's posture: standing, its tip flopped over, or spread into a puddle. */
export type Pose = "drop" | "droop" | "puddle";

export interface FaceSpec { eyes: Eyes; mouth: Mouth; acc: Acc; anim: Anim; tint?: Tint; blush?: boolean; pose?: Pose }

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
  sad:          { eyes: "sad",    mouth: "frown",  acc: "tear",     anim: "droop", pose: "droop" },
  anxious:      { eyes: "wide",   mouth: "wavy",   acc: "sweat",    anim: "tremble" },
  angry:        { eyes: "angry",  mouth: "grit",   acc: "steam",    anim: "shake", tint: "red" },
  tired:        { eyes: "half",   mouth: "small",  acc: "zzz",      anim: "droop", pose: "puddle" },
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
  jubilant: { eyes: "happy", acc: "partyhat" },
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
  relaxed: { eyes: "half", mouth: "smile", pose: "puddle" },
  mellow: { eyes: "half", pose: "puddle" },
  peaceful: { mouth: "smile", acc: "twinkle" },
  relieved: { mouth: "smile", acc: "sweat" },
  cozy: { acc: "scarf", blush: true },
  complacent: { eyes: "half", mouth: "flat" },
  recumbent: { mouth: "smile", acc: "zzz", anim: "droop", pose: "puddle" },
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
  artistic: { eyes: "closed", mouth: "smile", acc: "beret" },
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
  proud: { eyes: "closed", mouth: "grin", acc: "rosette", blush: true },
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
  sleepy: { eyes: "closed", acc: "nightcap" },
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
  bored: { acc: "dots", anim: "droop", pose: "puddle" },
  blah: { mouth: "wavy" },
  apathetic: { eyes: "closed", pose: "puddle" },
  numb: { eyes: "dot" },
  listless: { anim: "droop", pose: "droop" },
  exanimate: { eyes: "closed", mouth: "open", anim: "droop", pose: "puddle" },
  // hungry
  thirsty: { eyes: "half", mouth: "open", acc: "glass", anim: "droop" },
  full: { eyes: "closed", mouth: "small", acc: "bubble", blush: true, anim: "breathe", pose: "puddle" },
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
const ACCS: Partial<Record<Acc, [number, number, string[]] | null>> = {
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

// The pixel theme has no hats; these show its nearest prop instead.
const CLASSIC_ACC: Partial<Record<Acc, Acc>> = {
  nightcap: "zzz", beret: "none", partyhat: "sparkles", scarf: "mug", rosette: "star",
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
  const a = ACCS[CLASSIC_ACC[spec.acc] ?? spec.acc];
  if (a) paint(acc, a[2], a[0], a[1], PAL);

  const parts = { face: [...toPaths(face), ...toPaths(features, "f")], eyes: toPaths(eyes), acc: toPaths(acc) };
  classicCache.set(sig, parts);
  return parts;
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

  const p = dropParts(spec);
  return (
    <svg className={cls} style={style} width={size} height={size} viewBox="0 0 48 48" {...a11y}>
      {title && <title>{title}</title>}
      <g transform={p.fit}>
        <g className="mood-body">
          {p.body}
          {p.face}
          <g className="mood-eyes">{p.eyes}</g>
          {p.worn}
        </g>
      </g>
      {p.acc && <g className={`mood-acc mood-acc-${acc}`}>{p.acc}</g>}
    </svg>
  );
}
