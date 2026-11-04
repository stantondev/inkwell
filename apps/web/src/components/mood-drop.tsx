// The "Ink drops" mood theme: every mood is a little drop of Inkwell ink.
//
// The drop's shape carries the mood as much as its face does: it stands tall
// when it's happy, its tip flops over when it's sad, and it spreads into a
// puddle when it's tired. Props (a nightcap, a mug, a rain cloud) are drawn
// into the picture rather than stuck in a corner.
//
// Drawn on a 48×48 canvas with flat fills only: no ids, gradients or filters,
// so any number of them can sit on one page and they render the same
// everywhere. Features are thick enough to read at 16px.

import type { ReactElement } from "react";
import type { Acc, Eyes, FaceSpec, Mouth, Pose, Tint } from "./mood-icon";

// ── Colours ─────────────────────────────────────────────────────────────────

interface Ink { rim: string; body: string; glow: string; feat: string; inner: string; light: boolean }

const PAPER = "#fdf8ee";
const DEEP = "#121b33";

const INKS: Record<Tint | "ink", Ink> = {
  ink: { rim: "#17213d", body: "#2d4a8a", glow: "#3d5fa6", feat: PAPER, inner: DEEP, light: false },
  // Violet ink, for the grumbling and the merely okay. (Brown read badly.)
  yellow: { rim: "#2c1a4a", body: "#5a3a8f", glow: "#6e4ca6", feat: PAPER, inner: "#1a0f2e", light: false },
  red: { rim: "#4f141b", body: "#9b2c33", glow: "#b5434a", feat: PAPER, inner: "#2c0b0f", light: false },
  green: { rim: "#29391a", body: "#587629", glow: "#6c8c35", feat: PAPER, inner: "#18210e", light: false },
  // Washed-out ink: drained, blank, frightened.
  pale: { rim: "#7d89a3", body: "#b3bdd1", glow: "#c6cede", feat: "#1a2744", inner: "#1a2744", light: true },
  blue: { rim: "#4d84b8", body: "#9ccaf0", glow: "#b9daf5", feat: "#1a2744", inner: "#1a2744", light: true },
};

const GOLD = "#e8b530";
const GOLD_DARK = "#a97a12";
const RED = "#d9364e";
const RED_DARK = "#9c1f33";
const WATER = "#6fb3ee";
const WATER_DARK = "#2f78bd";
const PINK = "#f4a3b5";
const CREAM = "#f4ead6";
const CLOUD = "#cfd5e2";
const CLOUD_DARK = "#8d96ab";
const SILVER = "#a9b1c2";
/** Strokes drawn off the drop (zzz, ?, thought bubbles) flip in dark mode. */
const GLYPH = "var(--mood-ink)";

// ── Bodies ──────────────────────────────────────────────────────────────────

interface Body {
  d: string;
  /** The shine on the upper left. */
  shine: string;
  /** Where the face sits, relative to a standing drop. */
  face: [number, number];
  /** Where a hat goes, and how it tilts. */
  tip: [number, number, number];
}

const BODIES: Record<Pose, Body> = {
  drop: {
    d: "M24 2.6c4 8 17 16.7 17 28.2A17 16.4 0 0 1 7 30.8C7 19.3 20 10.6 24 2.6z",
    shine: "M12.6 27.6c.5-4.6 3.1-8.8 6.6-12.2",
    face: [0, 0],
    tip: [24, 4.6, 0],
  },
  droop: {
    // The tip has flopped over to the left.
    d: "M12.4 10.2c4.4-3.6 10.6-1.6 13.8 4.4C32.6 19.4 41 24.8 41 32.6A17 15 0 0 1 7 32.6c0-6.6 4.4-11.6 9-15-2.6-1.6-4.6-4.6-3.6-7.4z",
    shine: "M12.4 30.2c.6-3.6 2.6-6.6 5.6-9",
    face: [0, 1.6],
    tip: [14.6, 10.2, -58],
  },
  puddle: {
    d: "M24 17.2c2.4 3 7 4.6 11.6 6.1 5.4 1.8 9.4 5.6 9.4 11.1 0 6.8-9.4 11.8-21 11.8S3 41.2 3 34.4c0-5.5 4-9.3 9.4-11.1C17 21.8 21.6 20.2 24 17.2z",
    shine: "M8.6 31.2c1.2-2.8 3.8-4.8 7-5.8",
    face: [0, 3.6],
    tip: [24, 18.6, 0],
  },
};

// Face anchors on a standing drop.
const EL = 18.4, ER = 29.6, EY = 31.2, MY = 37.4;
/** Faces are drawn a little larger than life so they read at 16px. */
const FACE_SCALE = 1.14;
function faceTransform(fx: number, fy: number) {
  return `translate(${fx} ${fy}) translate(24 34) scale(${FACE_SCALE}) translate(-24 -34)`;
}
const HATS: ReadonlySet<Acc> = new Set<Acc>(["nightcap", "beret", "partyhat"]);

// ── Small shapes ────────────────────────────────────────────────────────────

/** A four-pointed sparkle with curved sides. */
function sparkle(x: number, y: number, r: number) {
  const k = r * 0.18;
  return `M${x} ${y - r}C${x + k} ${y - k} ${x + k} ${y - k} ${x + r} ${y}C${x + k} ${y + k} ${x + k} ${y + k} ${x} ${y + r}C${x - k} ${y + k} ${x - k} ${y + k} ${x - r} ${y}C${x - k} ${y - k} ${x - k} ${y - k} ${x} ${y - r}z`;
}

function heart(x: number, y: number, s: number) {
  // Point at (x, y + s); lobes above.
  return `M${x} ${y + s}C${x - s * 0.9} ${y + s * 0.35} ${x - s * 1.25} ${y - s * 0.15} ${x - s * 0.95} ${y - s * 0.62}C${x - s * 0.62} ${y - s * 1.08} ${x - s * 0.08} ${y - s * 0.86} ${x} ${y - s * 0.38}C${x + s * 0.08} ${y - s * 0.86} ${x + s * 0.62} ${y - s * 1.08} ${x + s * 0.95} ${y - s * 0.62}C${x + s * 1.25} ${y - s * 0.15} ${x + s * 0.9} ${y + s * 0.35} ${x} ${y + s}z`;
}

/** A droplet, point up. */
function droplet(x: number, y: number, s: number) {
  return `M${x} ${y - s}C${x + s * 0.35} ${y - s * 0.3} ${x + s * 0.75} ${y + s * 0.05} ${x + s * 0.75} ${y + s * 0.42}A${s * 0.75} ${s * 0.72} 0 0 1 ${x - s * 0.75} ${y + s * 0.42}C${x - s * 0.75} ${y + s * 0.05} ${x - s * 0.35} ${y - s * 0.3} ${x} ${y - s}z`;
}

function cloud(x: number, y: number, s: number) {
  return `M${x - s * 1.5} ${y + s * 0.6}a${s * 0.62} ${s * 0.62} 0 0 1 .1-${s * 1.24}a${s * 0.8} ${s * 0.8} 0 0 1 ${s * 1.3}-.6a${s * 0.9} ${s * 0.9} 0 0 1 ${s * 1.6} ${s * 0.5}a${s * 0.62} ${s * 0.62} 0 0 1 .1 ${s * 1.34}z`;
}

const R = (d: string, fill: string, extra: Record<string, string | number> = {}, key?: string) => (
  <path key={key} d={d} fill={fill} stroke="none" {...extra} />
);
const S = (d: string, stroke: string, w: number, key?: string, extra: Record<string, string | number> = {}) => (
  <path key={key} d={d} fill="none" stroke={stroke} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" {...extra} />
);

// ── Eyes ────────────────────────────────────────────────────────────────────

function eyes(kind: Eyes, ink: Ink): ReactElement {
  const f = ink.feat;
  const W = 2.5;
  const dot = (x: number, y = EY, rx = 1.55, ry = 2) => <ellipse key={`d${x}`} cx={x} cy={y} rx={rx} ry={ry} fill={f} />;
  switch (kind) {
    case "dot":
      return <>{dot(EL)}{dot(ER)}</>;
    case "happy":
      return S(`M${EL - 2.4} ${EY + 1}c.9-2.6 3.9-2.6 4.8 0M${ER - 2.4} ${EY + 1}c.9-2.6 3.9-2.6 4.8 0`, f, W);
    case "closed":
      return S(`M${EL - 2.4} ${EY - .6}c.9 2.4 3.9 2.4 4.8 0M${ER - 2.4} ${EY - .6}c.9 2.4 3.9 2.4 4.8 0`, f, W);
    case "wide":
      return (
        <>
          <circle cx={EL} cy={EY - .4} r={3.3} fill={PAPER} stroke={ink.light ? ink.feat : "none"} strokeWidth={1.4} />
          <circle cx={ER} cy={EY - .4} r={3.3} fill={PAPER} stroke={ink.light ? ink.feat : "none"} strokeWidth={1.4} />
          <circle cx={EL + .5} cy={EY} r={1.6} fill={DEEP} />
          <circle cx={ER + .5} cy={EY} r={1.6} fill={DEEP} />
        </>
      );
    case "star":
      return <>{R(sparkle(EL, EY - .2, 3.5), GOLD)}{R(sparkle(ER, EY - .2, 3.5), GOLD)}</>;
    case "heart":
      return <>{R(heart(EL, EY - .2, 2.7), RED)}{R(heart(ER, EY - .2, 2.7), RED)}</>;
    case "sad":
      // Brows raised in the middle, the way a worried face lifts them.
      return (
        <>
          {S(`M${EL - 2.8} ${EY - 2.2}l4.4-1.7M${ER + 2.8} ${EY - 2.2}l-4.4-1.7`, f, 2.1)}
          {dot(EL, EY + .9, 1.45, 1.8)}{dot(ER, EY + .9, 1.45, 1.8)}
        </>
      );
    case "angry":
      return (
        <>
          {S(`M${EL - 2.8} ${EY - 3.6}l5 2.2M${ER + 2.8} ${EY - 3.6}l-5 2.2`, f, 2.3)}
          {dot(EL + .3, EY + .9, 1.45, 1.75)}{dot(ER - .3, EY + .9, 1.45, 1.75)}
        </>
      );
    case "half":
      return (
        <>
          {S(`M${EL - 2.7} ${EY - .2}h5.4M${ER - 2.7} ${EY - .2}h5.4`, f, 2.2)}
          <path d={`M${EL - 2} ${EY}a2 1.8 0 0 0 4 0zM${ER - 2} ${EY}a2 1.8 0 0 0 4 0z`} fill={f} />
        </>
      );
    case "odd":
      return (
        <>
          <circle cx={EL} cy={EY - .6} r={3.4} fill={PAPER} stroke={ink.light ? ink.feat : "none"} strokeWidth={1.4} />
          <circle cx={EL + .8} cy={EY - .2} r={1.6} fill={DEEP} />
          {dot(ER, EY + .6, 1.2, 1.4)}
        </>
      );
    case "wink":
      return <>{dot(EL)}{S(`M${ER - 2.5} ${EY + .4}c1-1.6 4-1.6 5 0`, f, W)}</>;
    case "glasses":
      return (
        <>
          {S(`M${EL + 3.6} ${EY - .4}h3.6M${EL - 3.6} ${EY - .8}l-2.6-1.4M${ER + 3.6} ${EY - .8}l2.6-1.4`, f, 1.6)}
          <circle cx={EL} cy={EY - .4} r={3.7} fill={ink.light ? "none" : "#ffffff22"} stroke={f} strokeWidth={1.9} />
          <circle cx={ER} cy={EY - .4} r={3.7} fill={ink.light ? "none" : "#ffffff22"} stroke={f} strokeWidth={1.9} />
          {dot(EL, EY - .3, 1.2, 1.5)}{dot(ER, EY - .3, 1.2, 1.5)}
        </>
      );
  }
}

// ── Mouths ──────────────────────────────────────────────────────────────────

function mouth(kind: Mouth, ink: Ink): ReactElement {
  const f = ink.feat;
  const W = 2.5;
  switch (kind) {
    case "smile":
      return S(`M19.4 ${MY - 1}c2.4 3.2 6.8 3.2 9.2 0`, f, W);
    case "grin":
      return (
        <>
          <path d={`M18.4 ${MY - 1.6}h11.2c-.6 5-10.6 5-11.2 0z`} fill={ink.light ? ink.inner : f} />
          {!ink.light && <path d={`M21.6 ${MY + 1.6}c1.4-1 3.4-1 4.8 0-1.4 1-3.4 1-4.8 0z`} fill={PINK} />}
        </>
      );
    case "small":
      return S(`M21.4 ${MY - .4}c1.4 1.4 3.8 1.4 5.2 0`, f, W);
    case "flat":
      return S(`M20.8 ${MY}h6.4`, f, W);
    case "frown":
      return S(`M19.8 ${MY + 1.4}c2.2-2.8 6.2-2.8 8.4 0`, f, W);
    case "open":
      return <ellipse cx={24} cy={MY} rx={2.3} ry={2.8} fill={ink.inner} stroke={f} strokeWidth={1.8} />;
    case "wavy":
      return S(`M18.8 ${MY + .2}c1-1.4 2-1.4 2.6 0s1.6 1.4 2.6 0 1.6-1.4 2.6 0 1.6 1.4 2.6 0`, f, 2.2);
    case "grit":
      return (
        <>
          <rect x={18.6} y={MY - 1.8} width={10.8} height={3.8} rx={1.2} fill={f} />
          {S(`M22.2 ${MY - 1.8}v3.8M25.8 ${MY - 1.8}v3.8M18.6 ${MY + .1}h10.8`, ink.body, 1.1)}
        </>
      );
    case "tongue":
      return (
        <>
          <path d={`M23 ${MY + .8}v2.2c0 2.2 3.6 2.2 3.6 0V${MY + .8}z`} fill={PINK} stroke={ink.light ? ink.feat : "none"} strokeWidth={1} />
          {S(`M19.4 ${MY - .6}c2.6 2.4 6.6 2.4 9.2 0`, f, W)}
        </>
      );
    case "drool":
      return (
        <>
          <path d={`M19.6 ${MY - 1.6}h8.8c-.4 4.4-8.4 4.4-8.8 0z`} fill={ink.inner} stroke={f} strokeWidth={1.8} strokeLinejoin="round" />
          {R(droplet(27.6, MY + 3.8, 2.2), WATER)}
        </>
      );
  }
}

// ── Things worn or held (move with the drop) ────────────────────────────────

function worn(acc: Acc, body: Body, ink: Ink): ReactElement | null {
  const [tx, ty, rot] = body.tip;
  const [fx, fy] = body.face;
  const at = (children: ReactElement) => <g transform={`translate(${tx} ${ty}) rotate(${rot})`}>{children}</g>;
  const nearFace = (children: ReactElement) => <g transform={`translate(${fx} ${fy})`}>{children}</g>;
  const onFace = (children: ReactElement) => <g transform={faceTransform(fx, fy)}>{children}</g>;
  switch (acc) {
    case "nightcap":
      return at(
        <>
          <path d="M-6.4 2.6C-6 -4.6 1 -8.6 7.6 -6.2c3 1.2 5 3.4 6 6.6-2.6-1.8-5.6-2.6-8-1.6.4 1.4.6 2.4.6 3.8z" fill="#4f6fb8" />
          {S("M-1.4 -4.8c1.2 2 1.6 4.4 1.4 7.2M3.8 -6.6c.8 1.4 1 3.2.9 5", "#dfe6f5", 1.6)}
          <rect x={-7.4} y={1.6} width={14.6} height={3.4} rx={1.7} fill={CREAM} />
          <circle cx={13.8} cy={1} r={2.4} fill={CREAM} />
        </>,
      );
    case "beret":
      return at(
        <>
          <g transform="translate(0 2.2) rotate(-8)">
            <path d="M-8.6 1.8c-.4-4.4 4.4-7.6 10.2-7.2 5.2.4 8.6 3.4 7.4 6.8-.6 1.6-3.4 1.8-8 1.6s-9.2 .4-9.6-1.2z" fill="#c23a3f" />
            {S("M-6 0c3-1.6 8.8-2.2 12.6-.6", "#8f2730", 1.2)}
            {S("M1.2 -5.6l.8-2.2", "#c23a3f", 1.8)}
          </g>
        </>,
      );
    case "partyhat":
      return at(
        <>
          <path d="M-5.4 3.4L0.6 -11.6 6.6 3.4z" fill={GOLD} />
          {S("M-3.6 -1.2l7.6 1.4M-1.6 -6.2l5 1", RED, 1.9)}
          <circle cx={0.6} cy={-12.4} r={2.2} fill={RED} />
          {S("M-5.6 3.4h12.4", GOLD_DARK, 1.6)}
        </>,
      );
    case "scarf":
      return nearFace(
        <>
          <path d="M8 40.8c7.6 3.2 24.4 3.2 32 0l-.6 3.8c-7.4 2.8-23.4 2.8-30.8 0z" fill="#c23a3f" />
          {S("M12 42.6l.3 2.2M17.4 43.4l.2 2.4M23.6 43.8v2.4M29.8 43.4l-.2 2.4M35.2 42.6l-.3 2.2", "#f2d9a6", 1.2)}
          <path d="M33.8 43.4l2.6 4.4 3.6-1.4-2.4-4.6z" fill="#a62e33" />
        </>,
      );
    case "mug":
      return nearFace(
        <>
          {S("M36.6 30.2c1-1 -.6-2.2.4-3.4M39.6 30.2c1-1 -.6-2.2.4-3.4", CLOUD_DARK, 1.2)}
          <path d="M33.4 32h8.6v7.4c0 1.8-1.4 3.2-3.2 3.2h-2.2c-1.8 0-3.2-1.4-3.2-3.2z" fill={CREAM} stroke={ink.rim} strokeWidth={1.1} />
          <path d="M33.4 34.6h8.6v2.4h-8.6z" fill="#c23a3f" />
          <path d="M42 34h1.2a2 2 0 0 1 0 4H42" fill="none" stroke={ink.rim} strokeWidth={1.3} />
          {/* A hand-ish nub holding it. */}
          <ellipse cx={33.2} cy={37.6} rx={2} ry={1.6} fill={ink.body} stroke={ink.rim} strokeWidth={.8} />
        </>,
      );
    case "glass":
      return nearFace(
        <>
          <path d="M33.6 29.6h8l-1 12.4c-.1 .9-.8 1.4-1.6 1.4h-2.8c-.8 0-1.5-.5-1.6-1.4z" fill="#e6f2fc" stroke={WATER_DARK} strokeWidth={1.1} />
          <path d="M34.6 34.2h6l-.7 7.6c0 .5-.4.8-.9.8h-2.8c-.5 0-.9-.3-.9-.8z" fill={WATER} />
          <ellipse cx={33.4} cy={38} rx={2} ry={1.6} fill={ink.body} stroke={ink.rim} strokeWidth={.8} />
        </>,
      );
    case "rosette":
      return nearFace(
        <>
          <path d="M34 40.6l-2 7 2.6-1.2 1.4 2.4 1.2-7.4zM37 40.6l2 7-2.6-1.2-1.4 2.4-1.2-7.4z" fill={RED} />
          <circle cx={35.4} cy={38.4} r={4.4} fill={GOLD} />
          <circle cx={35.4} cy={38.4} r={2.7} fill="none" stroke={GOLD_DARK} strokeWidth={1.1} />
        </>,
      );
    case "thermo":
      return onFace(
        <g>
          {S("M27.4 37.8l12-6.6", ink.light ? ink.feat : DEEP, 4.2)}
          {S("M27.4 37.8l12-6.6", PAPER, 2.4)}
          {S("M27.6 37.7l3-1.7", RED, 2.4)}
        </g>,
      );
    default:
      return null;
  }
}

// ── Things floating nearby (drift on their own) ─────────────────────────────

function floating(acc: Acc, body: Body): ReactElement | null {
  const [fx, fy] = body.face;
  switch (acc) {
    case "sparkles":
      return <>{R(sparkle(39.6, 7.6, 5), GOLD)}{R(sparkle(45, 16, 2.6), GOLD)}{R(sparkle(33.6, 3, 1.8), GOLD)}</>;
    case "twinkle":
      return R(sparkle(40, 8.6, 4.6), GOLD);
    case "heart":
      return <>{R(heart(40, 8.4, 5), RED)}{R("M37.2 6.4c.6-1 1.6-1.4 2.4-1.2", "none", { stroke: "#ffffff", strokeOpacity: .7, strokeWidth: 1.2, strokeLinecap: "round" })}</>;
    case "broken":
      return (
        <>
          {R(`M39.4 13.4L35.6 9.4c-1.6-1.8-.8-4.6 1.6-4.8 1.2-.1 2 .6 2.6 1.4l-1 2.4 1.6 1.8z`, RED)}
          {R(`M40.8 13.4l3.8-4c1.6-1.8.8-4.6-1.6-4.8-1.2-.1-2 .6-2.6 1.4l-.4 1.2 1.6 2.2z`, RED)}
        </>
      );
    case "tear":
      return <g transform={faceTransform(fx, fy)}>{R(droplet(EL - 1.6, EY + 5.4, 2.6), WATER)}</g>;
    case "sweat":
      return <>{R(droplet(37.4, 18.2, 3.6), WATER)}{R("M36.4 18.6c0-1 .4-1.8 1-2.4", "none", { stroke: "#ffffff", strokeOpacity: .8, strokeWidth: .9, strokeLinecap: "round" })}</>;
    case "steam":
      return <>{R(cloud(11.4, 9.2, 2.6), CLOUD)}{R(cloud(39.4, 7.2, 3), CLOUD)}{S("M8.6 12.8l-2 1.6M42.2 11l2 1.6", CLOUD_DARK, 1.2)}</>;
    case "zzz":
      return S("M34.4 6.4h4.4l-4.4 4.6h4.4M40.6 1.6h3.4L40.6 5h3.4M41.4 11.4h2.4l-2.4 2.6h2.4", GLYPH, 1.8);
    case "question":
      return <>{S("M37.4 5.4c.4-3.4 6.8-3.4 6.8.4 0 2.8-3.4 2.8-3.4 5.6", GLYPH, 2.4)}<circle cx={40.8} cy={15.6} r={1.4} fill={GLYPH} /></>;
    case "bulb":
      return (
        <>
          {S("M40.2 -.6v1.6M45.6 3.6l-1.2 1M34.8 3.6l1.2 1M47 9h-1.6", GOLD_DARK, 1.3)}
          <path d="M40.2 2.6a5 5 0 0 0-2.8 9.2v1.6h5.6v-1.6a5 5 0 0 0-2.8-9.2z" fill={GOLD} />
          <rect x={37.6} y={13.8} width={5.2} height={2.6} rx={.8} fill={SILVER} />
          {S("M38.8 6.6c.4-.8 1-1.2 1.8-1.4", "#fff7d6", 1.2)}
        </>
      );
    case "star":
      return (
        <>
          <path d="M40.2 1.6l1.9 4.1 4.5.5-3.4 3 1 4.4-4-2.3-4 2.3 1-4.4-3.4-3 4.5-.5z" fill={GOLD} stroke={GOLD_DARK} strokeWidth={.9} strokeLinejoin="round" />
          {S("M33.4 13.4l-1.4 1.2M46.8 14.4l1 1", GOLD_DARK, 1.2)}
        </>
      );
    case "clock":
      return (
        <>
          <circle cx={36.8} cy={3.6} r={2} fill={RED_DARK} />
          <circle cx={43.6} cy={3.6} r={2} fill={RED_DARK} />
          <circle cx={40.2} cy={8.8} r={5.2} fill={CREAM} stroke={RED} strokeWidth={1.8} />
          {S("M40.2 5.8v3l2 1.4", DEEP, 1.3)}
          {S("M37 14l-1 1.4M43.4 14l1 1.4", RED_DARK, 1.3)}
        </>
      );
    case "fork":
      return <>{S("M38.6 1.6v4.2c0 1.8 3.4 1.8 3.4 0V1.6M40.3 1.6v4.6M40.3 6.6v9.2", SILVER, 1.6)}{S("M44.6 1.6c1.8 1.4 1.8 5.4 0 6.4v7.8", SILVER, 1.6)}</>;
    case "dots":
      return (
        <>
          <circle cx={33.6} cy={14.4} r={1.1} fill={GLYPH} />
          <circle cx={36.4} cy={11} r={1.6} fill={GLYPH} />
          {R(cloud(42.4, 5.4, 2.8), CREAM, { stroke: GLYPH, strokeWidth: 1.2 })}
        </>
      );
    case "rain":
      return (
        <>
          {R(cloud(39.4, 6.4, 3.2), CLOUD)}
          {R(cloud(39.4, 6.4, 3.2), "none", { stroke: CLOUD_DARK, strokeWidth: .9 })}
          {S("M35.6 11.6l-.8 2.2M39.4 11.6l-.8 2.2M43.2 11.6l-.8 2.2M37.4 15.6l-.6 1.6M41.2 15.6l-.6 1.6", WATER_DARK, 1.4)}
        </>
      );
    case "snow":
      return (
        <>
          {S("M40.2 2.4v12.4M34.8 5.5l10.8 6.2M34.8 11.7l10.8-6.2", WATER_DARK, 1.6)}
          {S("M38.6 3.6l1.6 1.6 1.6-1.6M38.6 13.6l1.6-1.6 1.6 1.6", WATER_DARK, 1.2)}
        </>
      );
    case "exclaim":
      return <>{S("M41.8 2.4v8.4", RED, 3.2)}<circle cx={41.8} cy={15.4} r={1.8} fill={RED} /></>;
    case "bubble":
      return (
        <>
          <circle cx={39.6} cy={9} r={4.6} fill="#e6f2fc" fillOpacity={.55} stroke={WATER_DARK} strokeWidth={1.2} />
          {S("M37.4 7.6c.4-1 1.2-1.6 2.2-1.8", "#ffffff", 1.1)}
          <circle cx={34.6} cy={15.6} r={1.6} fill="none" stroke={WATER_DARK} strokeWidth={1} />
        </>
      );
    default:
      return null;
  }
}

const WORN: ReadonlySet<Acc> = new Set<Acc>(["nightcap", "beret", "partyhat", "scarf", "mug", "glass", "rosette", "thermo"]);

/** The drawing, split so the CSS can move the body, blink the eyes and float the props. */
export function dropParts(spec: FaceSpec) {
  const body = BODIES[spec.pose ?? "drop"];
  const ink = INKS[spec.tint ?? "ink"];
  const [fx, fy] = body.face;
  const isWorn = WORN.has(spec.acc);
  // A hat on a standing drop would poke off the top, so that drop stands a little smaller.
  const fit = HATS.has(spec.acc) && (spec.pose ?? "drop") === "drop"
    ? "translate(24 47.4) scale(.84) translate(-24 -47.4)"
    : undefined;
  return {
    fit,
    body: (
      <>
        {/* The edge only shows in dark mode, where an ink-blue drop would melt into the page. */}
        <path d={body.d} fill={ink.rim} stroke="#dfe6f6" strokeWidth={2.4} style={{ strokeOpacity: "var(--mood-drop-edge, 0)" }} />
        <path d={body.d} fill={ink.body} transform="translate(-.9 -1.1) translate(24 30) scale(.95) translate(-24 -30)" />
        <ellipse cx={20} cy={36 + fy} rx={10} ry={7} fill={ink.glow} opacity={.55} />
        {S(body.shine, "#ffffff", 2.2, "shine", { strokeOpacity: ink.light ? .75 : .5 })}
        <circle cx={body.shine === BODIES.puddle.shine ? 18 : 21.4} cy={body.shine === BODIES.puddle.shine ? 23.6 : 12.4 + fy * 1.4} r={1.1} fill="#ffffff" fillOpacity={ink.light ? .8 : .45} />
      </>
    ),
    face: (
      <g transform={faceTransform(fx, fy)}>
        {spec.blush && (
          <>
            <ellipse cx={14.6} cy={MY - 1} rx={2.3} ry={1.5} fill={PINK} opacity={ink.light ? .9 : .7} />
            <ellipse cx={33.4} cy={MY - 1} rx={2.3} ry={1.5} fill={PINK} opacity={ink.light ? .9 : .7} />
          </>
        )}
        {mouth(spec.mouth, ink)}
      </g>
    ),
    eyes: <g transform={faceTransform(fx, fy)}>{eyes(spec.eyes, ink)}</g>,
    worn: isWorn ? worn(spec.acc, body, ink) : null,
    acc: isWorn ? null : floating(spec.acc, body),
  };
}
