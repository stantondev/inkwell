/**
 * Stamp drawings, as SVG markup strings.
 *
 * Strings (not React) so the same drawing serves the page (inline), the
 * PNG route that fediverse servers fetch as a custom emoji
 * (app/api/stamps/[type]/route.ts), and anything else that needs a file.
 *
 * Rules: viewBox 0 0 80 96; no ids (a page shows the same stamp many times),
 * no <defs>/gradients/patterns/masks/filters/clip paths (librsvg rasterizes
 * these for the PNG route, and ids would collide on a page), no external
 * fonts (Georgia/serif only), flat fills and opacity, no scripts. Every
 * drawing is a perforated postage stamp on its own paper, so it reads on
 * light and dark pages alike.
 *
 * The family: cream perforated paper, a coloured picture panel with a fine
 * frame line, a round denomination badge top left, INKWELL top right, and
 * the stamp's name in small capitals on a band along the bottom. Each design
 * has its own dominant colour so a cluster looks like a well-travelled
 * envelope corner. Pictures are drawn as bold flat shapes (they must read at
 * 28px wide) with faint engraved hatching as detail for larger sizes.
 */

export const STAMP_VIEWBOX = { w: 80, h: 96 };

export interface StampArtOptions {
  /** For "abroad" stamps: a unicode emoji, or… */
  emoji?: string | null;
  /** …a custom emoji image (https). */
  emojiUrl?: string | null;
  /**
   * Set when rasterizing with librsvg/sharp: it has no colour emoji font,
   * so a unicode emoji would come out as a black blob. A globe is drawn
   * instead (custom emoji images are unaffected).
   */
  rasterSafe?: boolean;
}

const PAPER = "#fbf6ea";
const FONT = "Georgia, serif";

/** The picture area: everything above the name band. */
const ART = { x: 7, y: 7, w: 66, h: 67 };

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Round to two decimals, for compact markup. */
const n = (v: number) => String(Math.round(v * 100) / 100);

// ─── Shared geometry ──────────────────────────────────────────────────────

/** A rectangle with round perforation notches along every edge. */
function perforated(w: number, h: number, r: number): string {
  const step = r * 4;
  const edge = (len: number) => {
    const c = Math.max(1, Math.floor(len / step));
    return { c, pad: (len - c * 2 * r) / (c + 1) };
  };
  const top = edge(w);
  const side = edge(h);
  let d = "M0 0";
  let x = 0;
  for (let i = 0; i < top.c; i++) {
    x += top.pad;
    d += `H${n(x)}A${r} ${r} 0 0 0 ${n(x + 2 * r)} 0`;
    x += 2 * r;
  }
  d += `H${w}`;
  let y = 0;
  for (let i = 0; i < side.c; i++) {
    y += side.pad;
    d += `V${n(y)}A${r} ${r} 0 0 0 ${w} ${n(y + 2 * r)}`;
    y += 2 * r;
  }
  d += `V${h}`;
  x = w;
  for (let i = 0; i < top.c; i++) {
    x -= top.pad;
    d += `H${n(x)}A${r} ${r} 0 0 0 ${n(x - 2 * r)} ${h}`;
    x -= 2 * r;
  }
  d += "H0";
  y = h;
  for (let i = 0; i < side.c; i++) {
    y -= side.pad;
    d += `V${n(y)}A${r} ${r} 0 0 0 0 ${n(y - 2 * r)}`;
    y -= 2 * r;
  }
  return d + "Z";
}

type Pt = [number, number];
type Box = { x: number; y: number; w: number; h: number };

/** Clip a convex polygon to a box (Sutherland–Hodgman), so rays and stripes stay inside the panel. */
function clip(poly: Pt[], b: Box): Pt[] {
  const edges: [(p: Pt) => boolean, (a: Pt, c: Pt) => Pt][] = [
    [(p) => p[0] >= b.x, (a, c) => lerpX(a, c, b.x)],
    [(p) => p[0] <= b.x + b.w, (a, c) => lerpX(a, c, b.x + b.w)],
    [(p) => p[1] >= b.y, (a, c) => lerpY(a, c, b.y)],
    [(p) => p[1] <= b.y + b.h, (a, c) => lerpY(a, c, b.y + b.h)],
  ];
  let out = poly;
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) {
        out.push(cut(prev, cur));
      }
    }
    if (!out.length) break;
  }
  return out;
}
function lerpX(a: Pt, c: Pt, x: number): Pt {
  const t = (x - a[0]) / (c[0] - a[0]);
  return [x, a[1] + t * (c[1] - a[1])];
}
function lerpY(a: Pt, c: Pt, y: number): Pt {
  const t = (y - a[1]) / (c[1] - a[1]);
  return [a[0] + t * (c[0] - a[0]), y];
}
const polyD = (p: Pt[]) => (p.length < 3 ? "" : "M" + p.map(([x, y]) => `${n(x)} ${n(y)}`).join("L") + "Z");

/** Sunburst wedges from a centre, clipped to the picture area. */
function rays(cx: number, cy: number, count: number, fill: string, opacity = 1, box: Box = ART): string {
  let d = "";
  const R = 120;
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI * 2;
    const a1 = ((i + 0.5) / count) * Math.PI * 2;
    d += polyD(
      clip(
        [
          [cx, cy],
          [cx + R * Math.cos(a0), cy + R * Math.sin(a0)],
          [cx + R * Math.cos(a1), cy + R * Math.sin(a1)],
        ],
        box,
      ),
    );
  }
  return `<path d="${d}" fill="${fill}" opacity="${opacity}"/>`;
}

/** Engraved horizontal hatching across a box. */
function hatch(b: Box, step: number, color: string, opacity: number, width = 0.3): string {
  let d = "";
  for (let y = b.y + step / 2; y < b.y + b.h; y += step) d += `M${n(b.x)} ${n(y)}H${n(b.x + b.w)}`;
  return `<path d="${d}" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/>`;
}

/** Heart with its point at the bottom; s ≈ half its width. */
function heartD(cx: number, cy: number, s: number): string {
  return `M${n(cx)} ${n(cy + s)}C${n(cx - 1.55 * s)} ${n(cy + 0.05 * s)} ${n(cx - 0.95 * s)} ${n(cy - 1.15 * s)} ${n(cx)} ${n(cy - 0.42 * s)}C${n(cx + 0.95 * s)} ${n(cy - 1.15 * s)} ${n(cx + 1.55 * s)} ${n(cy + 0.05 * s)} ${n(cx)} ${n(cy + s)}Z`;
}

/** Inkwell's nib (the logo mark): s = 1 is 14 wide, 24 tall. */
function nibD(cx: number, cy: number, s: number): string {
  return `M${n(cx - 7 * s)} ${n(cy - 11 * s)}H${n(cx + 7 * s)}C${n(cx + 8.5 * s)} ${n(cy - 2 * s)} ${n(cx + 5 * s)} ${n(cy + 5 * s)} ${n(cx)} ${n(cy + 13 * s)}C${n(cx - 5 * s)} ${n(cy + 5 * s)} ${n(cx - 8.5 * s)} ${n(cy - 2 * s)} ${n(cx - 7 * s)} ${n(cy - 11 * s)}Z`;
}
function nib(cx: number, cy: number, s: number, fill: string, cut: string): string {
  return (
    `<path d="${nibD(cx, cy, s)}" fill="${fill}"/>` +
    `<path d="M${n(cx)} ${n(cy)}V${n(cy + 12 * s)}" stroke="${cut}" stroke-width="${n(1.1 * s)}"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy - s)}" r="${n(2 * s)}" fill="${cut}"/>`
  );
}

/** A teardrop leaf pointing up, centred on its middle; s = half its length. */
function leafD(cx: number, cy: number, s: number, wide = 0.55): string {
  return `M${n(cx)} ${n(cy - s)}C${n(cx + s * wide * 1.3)} ${n(cy - s * 0.4)} ${n(cx + s * wide)} ${n(cy + s * 0.6)} ${n(cx)} ${n(cy + s)}C${n(cx - s * wide)} ${n(cy + s * 0.6)} ${n(cx - s * wide * 1.3)} ${n(cy - s * 0.4)} ${n(cx)} ${n(cy - s)}Z`;
}

/** A five-petal blossom. */
function blossom(cx: number, cy: number, r: number, petal: string, centre: string, rot = 0): string {
  let s = "";
  for (let i = 0; i < 5; i++) {
    const a = ((i * 72 + rot) * Math.PI) / 180;
    s += `<circle cx="${n(cx + Math.cos(a) * r * 0.62)}" cy="${n(cy + Math.sin(a) * r * 0.62)}" r="${n(r * 0.5)}" fill="${petal}"/>`;
  }
  return s + `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.32)}" fill="${centre}"/>`;
}

/** A small four-point sparkle. */
function sparkle(cx: number, cy: number, s: number, fill: string, opacity = 1): string {
  return `<path d="M${n(cx)} ${n(cy - s)}Q${n(cx + s * 0.18)} ${n(cy - s * 0.18)} ${n(cx + s)} ${n(cy)}Q${n(cx + s * 0.18)} ${n(cy + s * 0.18)} ${n(cx)} ${n(cy + s)}Q${n(cx - s * 0.18)} ${n(cy + s * 0.18)} ${n(cx - s)} ${n(cy)}Q${n(cx - s * 0.18)} ${n(cy - s * 0.18)} ${n(cx)} ${n(cy - s)}Z" fill="${fill}" opacity="${opacity}"/>`;
}

/** The stamp's name in small capitals, fitted to the band. */
function label(text: string, color: string): string {
  const words = text.toUpperCase().split(/\s+/);
  const ls = 0.35;
  const cap = (ch: string) => (ch === "I" ? 0.38 : "MW".includes(ch) ? 0.92 : ch === "J" ? 0.45 : 0.7);
  let width = 0; // at font-size 1
  let chars = 0;
  words.forEach((w, i) => {
    width += cap(w[0]);
    for (const ch of w.slice(1)) width += cap(ch) * 0.8;
    chars += w.length;
    if (i < words.length - 1) {
      width += 0.3;
      chars += 1;
    }
  });
  const size = Math.min(6.6, (58 - ls * chars) / width);
  const small = n(size * 0.8);
  const body = words
    .map((w) => `<tspan font-size="${n(size)}">${esc(w[0])}</tspan>${w.length > 1 ? `<tspan font-size="${small}">${esc(w.slice(1))}</tspan>` : ""}`)
    .join(" ");
  return `<text x="40" y="${n(81.5 + size * 0.35)}" text-anchor="middle" font-family="${FONT}" letter-spacing="${ls}" fill="${color}">${body}</text>`;
}

// ─── The frame every stamp shares ─────────────────────────────────────────

interface Design {
  /** Picture background. */
  bg: string;
  /** Name band colour, and the ink on it. */
  band: string;
  bandInk: string;
  /** Fine frame line and the INKWELL lettering (on the picture). */
  frame: string;
  top: string;
  /** Denomination (default "5"). */
  denom?: string;
  /** Badge colours (default: paper disc, band-coloured figure). */
  badge?: string;
  badgeInk?: string;
  name: string;
  art: () => string;
  /** Where INKWELL sits (right-aligned), if not the top-right corner. */
  topAt?: [number, number];
}

function frame(d: Design): string {
  const badge = d.badge ?? PAPER;
  const badgeInk = d.badgeInk ?? d.band;
  const denom = d.denom ?? "5";
  const dSize = denom.length > 1 ? 5 : 6.6;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 96">` +
    `<path d="${perforated(80, 96, 2.5)}" fill="${PAPER}" stroke="#000" stroke-opacity="0.13" stroke-width="0.5"/>` +
    `<rect x="7" y="7" width="66" height="82" fill="${d.bg}"/>` +
    d.art() +
    `<rect x="7" y="74" width="66" height="15" fill="${d.band}"/>` +
    `<path d="M7 74.4H73" stroke="${d.bandInk}" stroke-width="0.4" opacity="0.5"/>` +
    `<rect x="9.3" y="9.3" width="61.4" height="77.4" fill="none" stroke="${d.frame}" stroke-width="0.45" opacity="0.6"/>` +
    `<circle cx="15" cy="15" r="4.9" fill="${badge}"/>` +
    `<circle cx="15" cy="15" r="4.1" fill="none" stroke="${badgeInk}" stroke-width="0.3" opacity="0.6"/>` +
    `<text x="15" y="${n(15 + dSize * 0.36)}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="${dSize}" fill="${badgeInk}">${esc(denom)}</text>` +
    `<text x="${(d.topAt ?? [68.5, 16.3])[0]}" y="${(d.topAt ?? [68.5, 16.3])[1]}" text-anchor="end" font-family="${FONT}" font-size="4.3" letter-spacing="0.9" fill="${d.top}">INKWELL</text>` +
    label(d.name, d.bandInk) +
    `<rect x="7" y="7" width="66" height="82" fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="0.4"/>` +
    `</svg>`
  );
}

// ─── The designs ──────────────────────────────────────────────────────────

/** Fake gradient: horizontal bands of colour down the picture area. */
function bands(stops: [number, string][]): string {
  let s = "";
  for (let i = 0; i < stops.length; i++) {
    const [y, c] = stops[i];
    const y2 = i + 1 < stops.length ? stops[i + 1][0] : 74;
    s += `<rect x="7" y="${y}" width="66" height="${n(y2 - y)}" fill="${c}"/>`;
  }
  return s;
}

const DESIGNS: Record<string, Design> = {
  // A heart pressed into blush paper, the press rippling outward.
  felt: {
    bg: "#f0c2bb",
    band: "#a5324a",
    bandInk: PAPER,
    frame: "#a5324a",
    top: "#a5324a",
    name: "I felt this",
    art: () =>
      [30, 25.5, 21, 17]
        .map((r, i) => `<circle cx="40" cy="44.5" r="${r}" fill="none" stroke="#b9455c" stroke-width="${0.6 + i * 0.25}" opacity="${0.16 + i * 0.1}"/>`)
        .join("") +
      hatch(ART, 2.2, "#b9455c", 0.08) +
      `<path d="${heartD(41.3, 46, 13.5)}" fill="#7d2034" opacity="0.45"/>` +
      `<path d="${heartD(40, 44.5, 13.5)}" fill="#c83f58"/>` +
      `<path d="M40.5 37.4C44 32.5 49.5 31.6 52 34.5" fill="none" stroke="#8e2338" stroke-width="0.5" opacity="0.55"/>` +
      `<path d="M44.5 52C48.5 48.6 51 45 51.6 41.5M41 55.2C47 51 52.6 46.6 53.6 40.6" fill="none" stroke="#8e2338" stroke-width="0.45" opacity="0.5"/>` +
      `<ellipse cx="31.6" cy="38.2" rx="3.4" ry="2" transform="rotate(-38 31.6 38.2)" fill="#f19aa8" opacity="0.85"/>` +
      sparkle(60, 25, 2.6, "#c83f58", 0.7) +
      sparkle(21.5, 60, 2, "#c83f58", 0.55),
  },

  // A seedling rising against the morning sun.
  rooting: {
    bg: "#f8e9b8",
    band: "#2f5d39",
    bandInk: "#f8e9b8",
    frame: "#2f5d39",
    top: "#2f5d39",
    name: "Rooting for you",
    art: () =>
      rays(40, 58, 22, "#f1cf6f", 0.6) +
      `<circle cx="40" cy="58" r="16" fill="#efb848" opacity="0.45"/>` +
      `<circle cx="40" cy="58" r="12.5" fill="#e99a30"/>` +
      `<path d="M7 60C18 54 28 54.5 38 58.5C49 62.5 60 55 73 56V74H7Z" fill="#8bb365"/>` +
      `<path d="M7 66.5C20 61 32 61.5 42 65C52 68.5 62 63.5 73 64V74H7Z" fill="#4c7d45"/>` +
      hatch({ x: 7, y: 64, w: 66, h: 10 }, 1.4, "#2f5d39", 0.3) +
      `<path d="M40.2 66C40.5 58 39 52.5 40.6 45" fill="none" stroke="#2f5d39" stroke-width="1.7" stroke-linecap="round"/>` +
      `<path d="M40.3 55.5C34 55.5 27.6 51.6 25.8 43.6C33.2 43.2 39 47.6 40.3 55.5Z" fill="#5f9e45"/>` +
      `<path d="M40.3 55.5C36 51.5 31.8 48.4 27.6 45.6" fill="none" stroke="#2f5d39" stroke-width="0.6" opacity="0.7"/>` +
      `<path d="M40.6 48.8C45.3 46.6 51.5 41.4 53.6 32.4C45 32.8 40.4 39.4 40.6 48.8Z" fill="#7cbd52"/>` +
      `<path d="M40.6 48.8C44 43.6 47.4 39.4 51.6 35" fill="none" stroke="#2f5d39" stroke-width="0.6" opacity="0.7"/>` +
      `<path d="M37 66.4Q40.2 63.2 43.6 66.4" fill="#3a6636"/>` +
      `<path d="M20 26.5q1.6-1.6 3.2 0q1.6-1.6 3.2 0M55 39q1.2-1.2 2.4 0q1.2-1.2 2.4 0" fill="none" stroke="#2f5d39" stroke-width="0.6" stroke-linecap="round" opacity="0.75"/>`,
  },

  // A gold nib trailing an ink flourish across a night-blue sheet.
  beautifully_said: {
    bg: "#2d4a8a",
    band: "#1b2d5c",
    bandInk: "#f3e3b8",
    frame: "#f3e3b8",
    top: "#f3e3b8",
    name: "Beautifully said",
    art: () =>
      bands([
        [7, "#24407e"],
        [26, "#2d4a8a"],
        [48, "#355596"],
      ]) +
      hatch(ART, 1.5, "#fbf6ea", 0.07) +
      `<path d="M36.2 56.6C33 60.2 27.6 61.8 23.4 59.6C19 57.2 19.2 51 23.4 50.8C27.8 50.6 28 57.4 24 61.6C21.2 64.8 26.6 67.4 36.6 66.6C46.4 65.8 55 62.6 63.6 63.4" fill="none" stroke="#f3e3b8" stroke-width="1.3" stroke-linecap="round"/>` +
      `<path d="M23.4 50.8C20.6 48.4 21 44 24.4 43.2" fill="none" stroke="#f3e3b8" stroke-width="0.6" stroke-linecap="round" opacity="0.7"/>` +
      `<circle cx="64.6" cy="63.5" r="1.1" fill="#f3e3b8"/>` +
      `<g transform="translate(46.4 43.4) rotate(38) scale(0.82) translate(-42 -33)">` +
      `<rect x="33.4" y="6.6" width="17.2" height="6.2" rx="1" fill="#1b2d5c"/>` +
      `<rect x="33.4" y="8.4" width="17.2" height="1.4" fill="#d9b45a"/>` +
      `<path d="${nibD(42, 31, 1.7)}" fill="#e6c167"/>` +
      `<path d="M42 12.3H53.9C56.4 27.6 50.5 39.5 42 53.1Z" fill="#c69a3e"/>` +
      `<path d="M35.4 17.4C36 26 38.4 33 41.2 39M48.6 17.4C48 26 45.6 33 42.8 39" fill="none" stroke="#8a6624" stroke-width="0.4" opacity="0.6"/>` +
      `<path d="M38.6 20.6Q42 23.6 45.4 20.6M39.2 23.4Q42 25.8 44.8 23.4" fill="none" stroke="#8a6624" stroke-width="0.4" opacity="0.7"/>` +
      `<path d="M42 31V53" stroke="#1b2d5c" stroke-width="1.1"/>` +
      `<circle cx="42" cy="29.6" r="2.6" fill="#1b2d5c"/>` +
      `</g>`,
  },

  // Two cupped hands holding a small flame at dusk.
  holding_space: {
    bg: "#5c4c8c",
    band: "#43366f",
    bandInk: "#f3e7ef",
    frame: "#f3e7ef",
    top: "#f3e7ef",
    name: "Holding space",
    art: () =>
      bands([
        [7, "#4f4180"],
        [24, "#655498"],
        [38, "#8471ae"],
        [51, "#a88dbf"],
        [62, "#cfa9c6"],
      ]) +
      [
        [20, 26, 0.7],
        [27, 33, 0.5],
        [58, 30, 0.6],
        [64, 40, 0.45],
        [17, 42, 0.45],
        [50, 22, 0.5],
      ]
        .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fbf1dc"/>`)
        .join("") +
      sparkle(31, 21, 2.2, "#fbf1dc", 0.9) +
      [17, 12, 8].map((r, i) => `<circle cx="40" cy="45" r="${r}" fill="#ffe2a0" opacity="${0.14 + i * 0.1}"/>`).join("") +
      `<rect x="36.8" y="47" width="6.4" height="12" rx="0.8" fill="#f8ecd8"/>` +
      `<path d="M36.8 48.2Q38 50.6 39 48.6Q40.2 51.6 41.2 48.4" fill="none" stroke="#e5d2b4" stroke-width="0.7"/>` +
      `<path d="M40 47V45.6" stroke="#4f4180" stroke-width="0.5"/>` +
      `<path d="M40 35.4C43 39.4 43.4 42.4 40 45.6C36.6 42.4 37 39.4 40 35.4Z" fill="#f5a83a"/>` +
      `<path d="M40 39.4C41.4 41.4 41.4 43 40 44.6C38.6 43 38.6 41.4 40 39.4Z" fill="#fff0b8"/>` +
      // the hands, left then mirrored
      [1, -1]
        .map(
          (k) =>
            `<g transform="${k === 1 ? "" : "translate(80 0) scale(-1 1)"}">` +
            `<path d="M40 71C30 71.4 20.4 68 16.4 59.6C15.4 57.6 17 55.6 19 56.8L22.6 60C21.6 57.4 23.8 55.8 25.8 57.6L28.4 60.6C28 58.4 30 57.2 31.8 58.8C34.4 61.2 37 62.6 40 63Z" fill="#f2d4bd"/>` +
            `<path d="M40 71C31 71.2 23.4 69 19.4 64.4C25 67.6 32 68.2 40 67.4Z" fill="#d9ad96"/>` +
            `<path d="M22.6 60C23.6 61.6 24.6 62.6 26 63.4M28.4 60.6C29.4 62 30.4 62.8 31.8 63.4" fill="none" stroke="#a97f7a" stroke-width="0.45" opacity="0.8"/>` +
            `<path d="M40 71C30 71.4 20.4 68 16.4 59.6C15.4 57.6 17 55.6 19 56.8L22.6 60C21.6 57.4 23.8 55.8 25.8 57.6L28.4 60.6C28 58.4 30 57.2 31.8 58.8C34.4 61.2 37 62.6 40 63" fill="none" stroke="#7d5f78" stroke-width="0.5"/>` +
            `</g>`,
        )
        .join(""),
  },

  // An envelope sealed with a heart, a few flowers tucked in behind.
  thank_you: {
    bg: "#ec8b6f",
    band: "#b6452f",
    bandInk: PAPER,
    frame: "#fff3e4",
    top: "#fff3e4",
    name: "Thank you",
    art: () =>
      bands([
        [7, "#e87e63"],
        [30, "#ec8b6f"],
        [52, "#f09a7d"],
      ]) +
      hatch(ART, 1.8, "#ffffff", 0.08) +
      `<path d="M33.6 44C32.8 37 31 32.6 27.6 28.6M40 44V26.6M46.4 44C47.2 37.4 49 33.4 52.4 29.8" fill="none" stroke="#3f7a42" stroke-width="1"/>` +
      `<path d="${leafD(30.4, 37, 3.8, 0.5)}" transform="rotate(-50 30.4 37)" fill="#5c9a50"/>` +
      `<path d="${leafD(49.6, 37.6, 3.6, 0.5)}" transform="rotate(55 49.6 37.6)" fill="#5c9a50"/>` +
      blossom(27.4, 27.6, 6, "#fbe9ef", "#f2b93c", 10) +
      blossom(40, 25.2, 6.8, "#f4a8b6", "#d9563d", 50) +
      blossom(52.8, 28.8, 5.8, "#fff6e8", "#f2b93c", 30) +
      `<rect x="15.5" y="41" width="49" height="30" rx="1.2" fill="#b6452f" opacity="0.35" transform="translate(0.8 1)"/>` +
      `<rect x="15.5" y="41" width="49" height="30" rx="1.2" fill="#fbf1e0"/>` +
      `<path d="M15.5 71L35 55M64.5 71L45 55" fill="none" stroke="#dcbf98" stroke-width="0.7"/>` +
      `<path d="M15.5 41.6L40 58.8L64.5 41.6V41H15.5Z" fill="#f2e1c4"/>` +
      `<path d="M15.5 41.6L40 58.8L64.5 41.6" fill="none" stroke="#c9a57a" stroke-width="0.7"/>` +
      `<circle cx="40" cy="58.4" r="6" fill="#a8243a"/>` +
      `<path d="${heartD(40, 58.4, 3.7)}" fill="#d8405a"/>` +
      `<path d="M37 56.6Q38 55.4 39.2 56.2" fill="none" stroke="#f7a6b2" stroke-width="0.6"/>`,
  },

  // A sun laughing so hard it's crying, confetti everywhere.
  made_me_laugh: {
    bg: "#f8d24c",
    band: "#d4631b",
    bandInk: PAPER,
    frame: "#9a4a0e",
    top: "#9a4a0e",
    name: "Made me laugh",
    art: () =>
      rays(40, 43, 18, "#f4b935", 0.9) +
      (() => {
        let d = "";
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const a1 = a - 0.16;
          const a2 = a + 0.16;
          d += `M${n(40 + 15 * Math.cos(a1))} ${n(43 + 15 * Math.sin(a1))}L${n(40 + 21 * Math.cos(a))} ${n(43 + 21 * Math.sin(a))}L${n(40 + 15 * Math.cos(a2))} ${n(43 + 15 * Math.sin(a2))}Z`;
        }
        return `<path d="${d}" fill="#ee7f22"/>`;
      })() +
      `<circle cx="40" cy="43" r="16" fill="#f39a2c"/>` +
      `<circle cx="40" cy="43" r="14.2" fill="#f8b53a"/>` +
      `<ellipse cx="30.6" cy="47" rx="3" ry="2" fill="#ef6a4e" opacity="0.55"/>` +
      `<ellipse cx="49.4" cy="47" rx="3" ry="2" fill="#ef6a4e" opacity="0.55"/>` +
      `<path d="M30.6 40.6Q33.6 36.4 36.6 40.6M43.4 40.6Q46.4 36.4 49.4 40.6" fill="none" stroke="#5e2410" stroke-width="1.5" stroke-linecap="round"/>` +
      `<path d="M31.4 44.4H48.6C48.4 51.6 44.2 55.4 40 55.4C35.8 55.4 31.6 51.6 31.4 44.4Z" fill="#5e2410"/>` +
      `<path d="M32.3 44.4H47.7L47.4 46.4H32.6Z" fill="#fffaf0"/>` +
      `<path d="M35.4 52.6C37 50 43 50 44.6 52.6C43 54.8 37 54.8 35.4 52.6Z" fill="#e8566a"/>` +
      `<path d="M28.4 40.2C26.6 42.6 26.6 44.4 28 45C29.6 44.6 29.6 42.6 28.4 40.2Z" fill="#5fb6e4"/>` +
      `<path d="M51.6 40.2C50.4 42.6 50.4 44.6 52 45C53.4 44.4 53.4 42.6 51.6 40.2Z" fill="#5fb6e4"/>` +
      [
        [16, 30, "#2d4a8a", 20],
        [62, 27, "#c8304a", -30],
        [18, 58, "#3f8a4f", 40],
        [63, 57, "#2d4a8a", -15],
        [23, 23, "#c8304a", 60],
        [57, 66, "#7a4bb0", 25],
        [27, 68, "#c8304a", -45],
      ]
        .map(([x, y, c, r]) => `<rect x="${n(+x - 1.6)}" y="${n(+y - 0.8)}" width="3.2" height="1.6" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`)
        .join("") +
      `<circle cx="64" cy="44" r="1" fill="#fffaf0"/><circle cx="15" cy="45" r="1" fill="#fffaf0"/><circle cx="48" cy="20" r="0.9" fill="#3f8a4f"/>`,
  },

  // The prestige stamp: an engraved fountain pen in a gold oval medallion,
  // after the Penny Black.
  first_class: {
    bg: "#9a1c2d",
    band: "#6a0f1c",
    bandInk: "#ecc979",
    frame: "#ecc979",
    top: "#ecc979",
    denom: "1d",
    badge: "#ecc979",
    badgeInk: "#6a0f1c",
    name: "First class",
    art: () =>
      hatch(ART, 1.5, "#5c0b17", 0.5, 0.45) +
      [27.5, 29.5].map((ry, i) => `<ellipse cx="40" cy="43" rx="${ry - 5}" ry="${ry}" fill="none" stroke="#d9ac4f" stroke-width="0.4" opacity="${0.6 - i * 0.2}"/>`).join("") +
      `<ellipse cx="40" cy="43" rx="20.6" ry="25.6" fill="none" stroke="#f2d58a" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="0 3.5"/>` +
      `<ellipse cx="40" cy="43" rx="19" ry="24" fill="#d4a443"/>` +
      `<ellipse cx="40" cy="43" rx="17.2" ry="22.2" fill="#7c1424"/>` +
      `<ellipse cx="40" cy="43" rx="15.8" ry="20.8" fill="#f4e7c9"/>` +
      // the pen, standing
      `<rect x="36.2" y="25" width="7.6" height="20.5" rx="2.4" fill="#9a1c2d"/>` +
      `<path d="M38 26.5V44M39.6 26V44.8" stroke="#d9637a" stroke-width="0.35" opacity="0.6"/>` +
      `<rect x="35.8" y="34.4" width="8.4" height="1.6" fill="#d4a443"/>` +
      `<path d="M42.4 26.4V36.6Q42.4 38 41.4 38" fill="none" stroke="#d4a443" stroke-width="0.9"/>` +
      `<rect x="37.4" y="45.4" width="5.2" height="4" fill="#4a0a13"/>` +
      `<path d="${nibD(40, 55, 0.62)}" fill="#c08d32"/>` +
      `<path d="M40 55V63" stroke="#4a0a13" stroke-width="0.5"/><circle cx="40" cy="54.4" r="0.9" fill="#4a0a13"/>` +
      // laurel sprigs up either side of the pen
      [1, -1]
        .map((k) => {
          const P: Pt[] = [
            [29.6, 62],
            [24.8, 55],
            [24.2, 42],
            [27.8, 30],
          ];
          const at = (t: number): Pt => {
            const u = 1 - t;
            return [0, 1].map((j) => u * u * u * P[0][j] + 3 * u * u * t * P[1][j] + 3 * u * t * t * P[2][j] + t * t * t * P[3][j]) as Pt;
          };
          let s = `<path d="M29.6 62C24.8 55 24.2 42 27.8 30" fill="none" stroke="#b08a34" stroke-width="0.5"/>`;
          [0.14, 0.38, 0.62, 0.86].forEach((t, i) => {
            const [x, y] = at(t);
            const [x2, y2] = at(t + 0.02);
            const ang = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI + 90;
            for (const side of [-1, 1]) {
              s += `<path d="${leafD(x, y - 2.4, 2.4, 0.42)}" transform="rotate(${n(ang + side * 42 + (side === 1 ? i * 2 : 0))} ${n(x)} ${n(y)})" fill="${side === 1 ? "#b08a34" : "#8a6a26"}"/>`;
            }
          });
          return `<g${k === -1 ? ' transform="translate(80 0) scale(-1 1)"' : ""}>${s}</g>`;
        })
        .join("") +
      [14.5, 65.5]
        .map((x) => `<path d="M${x} 64.6L${x + 1.4} 67.2L${x} 69.8L${x - 1.4} 67.2Z" fill="#ecc979"/><circle cx="${x}" cy="67.2" r="0.5" fill="#6a0f1c"/>`)
        .join(""),
  },

  // Autumn 2026 commemorative: leaves falling through amber air.
  autumn_2026: {
    bg: "#f2c066",
    band: "#86331a",
    bandInk: "#fbecd2",
    frame: "#86331a",
    top: "#86331a",
    name: "Autumn leaves",
    art: () =>
      bands([
        [7, "#f4cb72"],
        [24, "#f0b85c"],
        [42, "#eba54e"],
        [58, "#e49345"],
      ]) +
      hatch(ART, 1.8, "#ffffff", 0.1) +
      `<path d="M14 30Q26 25 34 31M48 59Q58 55 66 59M18 50Q24 47 30 49" fill="none" stroke="#fff6e0" stroke-width="0.6" stroke-linecap="round" opacity="0.7"/>` +
      maple(38, 42, 17, -14, "#b44322", "#7a2a13") +
      maple(59, 25, 7.5, 35, "#d3792a", "#8a3e14") +
      `<path d="${leafD(60, 52, 6, 0.5)}" transform="rotate(130 60 52)" fill="#8f2e1c"/>` +
      `<path d="M60 46.4V57.6" stroke="#5e1a0e" stroke-width="0.4" transform="rotate(130 60 52)"/>` +
      `<path d="${leafD(20, 22, 5, 0.6)}" transform="rotate(-35 20 22)" fill="#c97b2a"/>` +
      `<path d="M20 17V27" stroke="#8a4a14" stroke-width="0.4" transform="rotate(-35 20 22)"/>` +
      `<text x="12" y="70.5" font-family="${FONT}" font-weight="bold" font-size="8.4" letter-spacing="0.4" fill="#7a2a13">2026</text>`,
  },

  // Keepsake: a red wax seal, pressed with the Inkwell nib, on an envelope.
  wax_seal: {
    bg: "#efe2c6",
    band: "#6b1016",
    bandInk: "#ecc979",
    frame: "#8a6a44",
    top: "#7a5a36",
    denom: "50",
    badge: "#6b1016",
    badgeInk: "#ecc979",
    name: "Sealed with care",
    art: () =>
      hatch(ART, 1.5, "#b89a6e", 0.18) +
      `<path d="M7 74L36 47M73 74L44 47" stroke="#cdb48a" stroke-width="0.7"/>` +
      `<path d="M7 7H73V9L40 47L7 9Z" fill="#e6d4b0"/>` +
      `<path d="M7 9L40 47L73 9" fill="none" stroke="#b8976a" stroke-width="0.7"/>` +
      `<path d="M7 8.6L40 46.6L73 8.6" fill="none" stroke="#fff8e8" stroke-width="0.5" opacity="0.7" transform="translate(0 1.2)"/>` +
      (() => {
        // A wobbly blob of wax with two drips.
        const pts: string[] = [];
        const N = 36;
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          let r = 15 + 0.9 * Math.sin(a * 5 + 0.7) + 0.6 * Math.sin(a * 9 + 2);
          if (Math.abs(a - 2.1) < 0.28) r += 3.4 * Math.cos(((a - 2.1) / 0.28) * (Math.PI / 2));
          if (Math.abs(a - 0.55) < 0.22) r += 2.4 * Math.cos(((a - 0.55) / 0.22) * (Math.PI / 2));
          pts.push(`${n(40 + r * Math.cos(a))} ${n(47 + r * Math.sin(a))}`);
        }
        return `<path d="M${pts.join("L")}Z" fill="#7a1219" transform="translate(0.8 1)"/><path d="M${pts.join("L")}Z" fill="#a81f27"/>`;
      })() +
      `<circle cx="40" cy="47" r="10.8" fill="#8c171e"/>` +
      `<circle cx="40" cy="47" r="10.8" fill="none" stroke="#c63a40" stroke-width="0.9" opacity="0.8"/>` +
      `<path d="M30.4 41.6A11.6 11.6 0 0 1 43 35.6" fill="none" stroke="#e57a7c" stroke-width="1.2" stroke-linecap="round" opacity="0.65"/>` +
      `<path d="${nibD(40.4, 47.6, 0.6)}" fill="#c4383e"/>` +
      nib(40, 47, 0.6, "#5e0b11", "#8c171e") +
      `<circle cx="51.6" cy="36.6" r="1.2" fill="#f08a8a" opacity="0.6"/>`,
  },

  // Keepsake: gold on deep navy, an engraved rosette around a gold medallion.
  gilded: {
    bg: "#15224a",
    band: "#cfa64c",
    bandInk: "#15224a",
    frame: "#d9b45a",
    top: "#e6c677",
    denom: "50",
    badge: "#e6c677",
    badgeInk: "#15224a",
    name: "Pure gold",
    art: () =>
      bands([
        [7, "#13204a"],
        [30, "#172654"],
        [56, "#13204a"],
      ]) +
      (() => {
        let s = "";
        for (let i = 0; i < 18; i++) {
          s += `<ellipse cx="40" cy="42" rx="25" ry="8.5" transform="rotate(${i * 10} 40 42)"/>`;
        }
        let t = "";
        for (let i = 0; i < 9; i++) {
          t += `<ellipse cx="40" cy="42" rx="17" ry="5" transform="rotate(${i * 20 + 10} 40 42)"/>`;
        }
        return `<g fill="none" stroke="#d9b45a" stroke-width="0.32" opacity="0.65">${s}</g><g fill="none" stroke="#f0d68a" stroke-width="0.25" opacity="0.5">${t}</g>`;
      })() +
      `<circle cx="40" cy="42" r="14.4" fill="none" stroke="#e6c677" stroke-width="1.3" stroke-linecap="round" stroke-dasharray="0 4.52"/>` +
      `<circle cx="40" cy="42" r="12.4" fill="#15224a"/>` +
      `<circle cx="40" cy="42" r="11.6" fill="#a8812e"/>` +
      `<circle cx="39.4" cy="41.4" r="10.8" fill="#d9b45a"/>` +
      `<path d="M30.4 38A10 10 0 0 1 40 31.4A9.6 9.6 0 0 0 32.6 40Z" fill="#f6e3a6"/>` +
      `<circle cx="40" cy="42" r="9.4" fill="none" stroke="#a8812e" stroke-width="0.4"/>` +
      nib(40, 42, 0.58, "#15224a", "#d9b45a") +
      [
        [13.5, 66.5],
        [66.5, 66.5],
      ]
        .map(([x, y]) => `<path d="M${x} ${y - 2.6}L${x + 1.2} ${y}L${x} ${y + 2.6}L${x - 1.2} ${y}Z M${x - 2.6} ${y}L${x} ${y - 1.2}L${x + 2.6} ${y}L${x} ${y + 1.2}Z" fill="#d9b45a"/>`)
        .join("") +
      `<rect x="7" y="72.6" width="66" height="1.4" fill="#a8812e"/>`,
  },

  // Keepsake: a pink wildflower pressed flat on a card, taped down.
  pressed_flower: {
    bg: "#a9bb9a",
    band: "#5c7254",
    bandInk: "#f7f0e0",
    frame: "#4a5e44",
    top: "#3f5239",
    denom: "50",
    badge: "#f7f0e0",
    badgeInk: "#5c7254",
    name: "A flower for you",
    art: () =>
      hatch(ART, 1.6, "#ffffff", 0.12) +
      `<g transform="rotate(-4 40 44)">` +
      `<rect x="17" y="20" width="46" height="50" fill="#5c7254" opacity="0.35" transform="translate(1 1.2)"/>` +
      `<rect x="17" y="20" width="46" height="50" fill="#f8f1e1"/>` +
      `<path d="M44 66C43 58 41.4 50 39.4 38" fill="none" stroke="#6c8a58" stroke-width="1"/>` +
      `<path d="M42.6 56.6C48 55.6 52 51.4 53 46.4C47.6 47.6 44 51.6 42.6 56.6Z" fill="#87a46f"/>` +
      `<path d="M41.8 50C36.6 49.8 32.6 46.4 31.2 41.4C36.6 42.2 40.4 45.4 41.8 50Z" fill="#7a9864"/>` +
      `<path d="M42.6 56.6L51 48M41.8 50L33.4 43" stroke="#4f6a42" stroke-width="0.35" opacity="0.7"/>` +
      `<path d="M43.4 60C47 63 50.6 62.4 52.4 60.4" fill="none" stroke="#6c8a58" stroke-width="0.8"/>` +
      `<path d="${leafD(53.6, 58.6, 2.6, 0.6)}" transform="rotate(70 53.6 58.6)" fill="#c97a92"/>` +
      (() => {
        let s = "";
        for (let i = 0; i < 7; i++) {
          const a = i * (360 / 7) + 8;
          s += `<path d="${leafD(39, 25.6, 7, 0.52)}" transform="rotate(${n(a)} 39 33)" fill="${i % 2 ? "#e58fa4" : "#ec9fb2"}"/>`;
          s += `<path d="M39 32V21" stroke="#c76a84" stroke-width="0.3" opacity="0.7" transform="rotate(${n(a)} 39 33)"/>`;
        }
        return s;
      })() +
      `<circle cx="39" cy="33" r="3" fill="#d99a35"/>` +
      `<circle cx="39" cy="33" r="1.6" fill="#b87622"/>` +
      `</g>` +
      `<rect x="13" y="17" width="12" height="4.4" fill="#efe4c8" opacity="0.85" transform="rotate(-38 19 19.2)"/>` +
      `<rect x="56" y="62" width="12" height="4.4" fill="#efe4c8" opacity="0.85" transform="rotate(-38 62 64.2)"/>`,
  },

  // Retired: a cassette tape over seventies stripes.
  throwback: {
    bg: "#2b8b87",
    band: "#1c5c59",
    bandInk: "#f6e6c4",
    frame: "#f6e6c4",
    top: "#f6e6c4",
    name: "Throwback",
    art: () =>
      `<rect x="7" y="26" width="66" height="5" fill="#f2b544"/>` +
      `<rect x="7" y="31" width="66" height="5" fill="#ec8a3a"/>` +
      `<rect x="7" y="36" width="66" height="5" fill="#d9532f"/>` +
      `<rect x="7" y="41" width="66" height="5" fill="#a83a3a"/>` +
      `<g transform="rotate(-9 40 46)">` +
      `<rect x="15.5" y="32.6" width="49" height="31" rx="2.4" fill="#173f3d" transform="translate(1 1.4)" opacity="0.5"/>` +
      `<rect x="15.5" y="32.6" width="49" height="31" rx="2.4" fill="#f4e7c8"/>` +
      `<rect x="19" y="35.6" width="42" height="19.4" rx="1.4" fill="#fbf6ea"/>` +
      `<rect x="19" y="35.6" width="42" height="3" fill="#ec8a3a"/>` +
      `<rect x="19" y="38.6" width="42" height="1.6" fill="#f2b544"/>` +
      `<path d="M22 49.6H32" stroke="#2b8b87" stroke-width="0.5"/>` +
      `<rect x="26.5" y="42.6" width="27" height="9" rx="4.5" fill="#2a2522"/>` +
      `<rect x="35" y="44.2" width="10" height="5.8" fill="#6b4a32" opacity="0.8"/>` +
      [31.2, 48.8]
        .map(
          (x) =>
            `<circle cx="${x}" cy="47.1" r="3.3" fill="#f4e7c8"/><circle cx="${x}" cy="47.1" r="1.4" fill="#2a2522"/>` +
            `<path d="M${x} 44.2V45.2M${x} 49V50M${x - 2.9} 47.1H${x - 1.9}M${x + 1.9} 47.1H${x + 2.9}" stroke="#2a2522" stroke-width="0.6"/>`,
        )
        .join("") +
      `<path d="M25 63.6L27.6 57.4H52.4L55 63.6Z" fill="#dccaa2"/>` +
      `<circle cx="32" cy="60.4" r="1" fill="#2a2522"/><circle cx="48" cy="60.4" r="1" fill="#2a2522"/>` +
      `<circle cx="18.2" cy="35.4" r="0.7" fill="#a89a7a"/><circle cx="61.8" cy="35.4" r="0.7" fill="#a89a7a"/><circle cx="18.2" cy="60.8" r="0.7" fill="#a89a7a"/><circle cx="61.8" cy="60.8" r="0.7" fill="#a89a7a"/>` +
      `</g>` +
      `<path d="M58 66C61 70 66 69 67 64" fill="none" stroke="#f4e7c8" stroke-width="0.6" opacity="0.7"/>`,
  },

  // Retired: a swooning face, back of the hand to the brow.
  i_cannot: {
    bg: "#c94a80",
    band: "#8a2152",
    bandInk: PAPER,
    frame: "#fde8f0",
    top: "#fde8f0",
    name: "I cannot",
    art: () =>
      rays(42, 47, 20, "#d6609a", 0.8) +
      `<circle cx="42" cy="47" r="16" fill="#7a1c4a" opacity="0.35" transform="translate(1 1.4)"/>` +
      `<circle cx="42" cy="47" r="16" fill="#fde2a8"/>` +
      `<ellipse cx="33.6" cy="53" rx="3" ry="1.9" fill="#f07a8a" opacity="0.6"/>` +
      `<ellipse cx="50.6" cy="53" rx="3" ry="1.9" fill="#f07a8a" opacity="0.6"/>` +
      `<path d="M33 47.2Q36 50.2 39 47.2M45 47.2Q48 50.2 51 47.2" fill="none" stroke="#5a1636" stroke-width="1.3" stroke-linecap="round"/>` +
      `<path d="M33.6 48.4L32.4 50M35.6 49.4L35.2 51.2M50.4 48.4L51.6 50M48.4 49.4L48.8 51.2" stroke="#5a1636" stroke-width="0.6" stroke-linecap="round"/>` +
      `<ellipse cx="42" cy="56.6" rx="2.4" ry="3" fill="#7a1c3e"/>` +
      // the back of a hand, flung to the brow
      (() => {
        const O = "#5a1636";
        const K = "#f4cf92";
        const fingers = "M36.6 33.4L41.6 36.6M36.4 35.4L41 39M35.4 37.2L39 40.4";
        const thumb = "M29.6 32.6L32.4 30.2";
        return (
          `<path d="M7 26.4L17.4 29.6L15.8 36.6L7 34Z" fill="#fde8f0"/>` +
          `<path d="M7 29.4L16.6 32.4" stroke="#c94a80" stroke-width="0.9"/>` +
          `<path d="M16.8 30L27 32L26 37.8L15.8 36Z" fill="${K}" stroke="${O}" stroke-width="0.55" stroke-linejoin="round"/>` +
          `<path d="${fingers} ${thumb}" stroke="${O}" stroke-width="3.5" stroke-linecap="round"/>` +
          `<ellipse cx="31.6" cy="35" rx="6.2" ry="3.8" transform="rotate(12 31.6 35)" fill="${K}" stroke="${O}" stroke-width="0.55"/>` +
          `<path d="${fingers} ${thumb}" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/>` +
          `<path d="M33.4 33.2Q35 34 35.6 35.6" fill="none" stroke="#c48a5a" stroke-width="0.4"/>`
        );
      })() +
      // dizzy hearts and stars
      `<path d="${heartD(56, 26, 3)}" fill="#fde8f0"/>` +
      `<path d="${heartD(44.6, 22.6, 2.2)}" fill="#fde8f0" opacity="0.85"/>` +
      sparkle(62.4, 36.6, 2.6, "#fde8f0") +
      sparkle(29, 24.4, 1.8, "#fde8f0", 0.8) +
      `<path d="M50.6 29.6Q56 34.6 62.6 30" fill="none" stroke="#fde8f0" stroke-width="0.6" stroke-dasharray="1 1.2" opacity="0.8"/>` +
      `<text x="64" y="70.6" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="9" fill="#fde8f0">!</text>`,
  },
};

/** A maple leaf, pointing up, centred; s ≈ its radius. */
function maple(cx: number, cy: number, s: number, rot: number, fill: string, vein: string): string {
  const half: Pt[] = [
    [0, -1],
    [0.13, -0.66],
    [0.3, -0.74],
    [0.27, -0.4],
    [0.6, -0.56],
    [0.54, -0.32],
    [0.96, -0.3],
    [0.78, -0.1],
    [0.88, 0.02],
    [0.44, 0.22],
    [0.5, 0.4],
    [0.1, 0.32],
    [0.05, 0.42],
  ];
  const pts: Pt[] = [...half, ...half.slice(1).reverse().map(([x, y]) => [-x, y] as Pt)];
  const d = "M" + pts.map(([x, y]) => `${n(cx + x * s)} ${n(cy + y * s)}`).join("L") + "Z";
  const v = `M${n(cx)} ${n(cy + 0.75 * s)}V${n(cy - 0.85 * s)}M${n(cx)} ${n(cy + 0.1 * s)}L${n(cx + 0.75 * s)} ${n(cy - 0.25 * s)}M${n(cx)} ${n(cy + 0.1 * s)}L${n(cx - 0.75 * s)} ${n(cy - 0.25 * s)}M${n(cx)} ${n(cy - 0.05 * s)}L${n(cx + 0.45 * s)} ${n(cy - 0.5 * s)}M${n(cx)} ${n(cy - 0.05 * s)}L${n(cx - 0.45 * s)} ${n(cy - 0.5 * s)}`;
  return `<g transform="rotate(${rot} ${n(cx)} ${n(cy)})"><path d="${d}" fill="${fill}"/><path d="${v}" fill="none" stroke="${vein}" stroke-width="${n(Math.max(0.35, s * 0.035))}" opacity="0.8"/></g>`;
}

// ─── From abroad: the fediverse sender's emoji in an airmail frame ────────

function airmailStripes(): string {
  // Red, paper, blue, paper parallelograms, period 18, clipped to the picture.
  const box = ART;
  let red = "";
  let blue = "";
  for (let i = -6, k = 0; i < 10; i++, k++) {
    const x0 = 7 + i * 9 - 10;
    const poly: Pt[] = [
      [x0, 74],
      [x0 + 4.6, 74],
      [x0 + 4.6 + 67, 7],
      [x0 + 67, 7],
    ];
    const d = polyD(clip(poly, box));
    if (k % 2) blue += d;
    else red += d;
  }
  return `<path d="${red}" fill="#c8323a"/><path d="${blue}" fill="#2d4a8a"/>`;
}

function globe(): string {
  return (
    `<circle cx="40" cy="42" r="14" fill="#a9cdea"/>` +
    `<path d="M31 33C34 31 37 32 37.5 35C38 38 34 38.6 33.6 41.6C33.2 44.6 30 45 28 42.6C26.6 40 28 35 31 33Z" fill="#6ea35c"/>` +
    `<path d="M43 30.6C47 29.6 51.6 32 52.6 35.6C50 35.6 48.6 37.6 46 37.4C43.6 37.2 41.6 33 43 30.6Z" fill="#6ea35c"/>` +
    `<path d="M42.6 44C46 42.4 50 44 50.6 47C50.8 50.6 47 54 44.6 53.4C42.8 52.8 43.6 49 41.8 47.4C40.8 46.4 41.2 44.6 42.6 44Z" fill="#6ea35c"/>` +
    `<path d="M26 42H54M40 28V56M40 28C33 33 33 51 40 56M40 28C47 33 47 51 40 56M28 35H52M28 49H52" fill="none" stroke="#2d4a8a" stroke-width="0.45" opacity="0.6"/>` +
    `<circle cx="40" cy="42" r="14" fill="none" stroke="#2d4a8a" stroke-width="0.9"/>`
  );
}

function abroad(opts: StampArtOptions): string {
  const url = typeof opts.emojiUrl === "string" && /^https:\/\/[^\s"'<>]+$/i.test(opts.emojiUrl) ? opts.emojiUrl : null;
  const emoji = !url && !opts.rasterSafe && typeof opts.emoji === "string" ? Array.from(opts.emoji.trim()).slice(0, 8).join("") : "";
  const centre = url
    ? `<image href="${esc(url)}" x="22" y="24" width="36" height="36" preserveAspectRatio="xMidYMid meet"/>`
    : emoji
      ? `<text x="40" y="53" text-anchor="middle" font-size="30">${esc(emoji)}</text>`
      : globe();
  return frame({
    bg: PAPER,
    band: "#2d4a8a",
    bandInk: PAPER,
    frame: "#2d4a8a",
    top: "#2d4a8a",
    name: "Par avion",
    topAt: [64.2, 19.6],
    art: () =>
      airmailStripes() +
      `<rect x="13" y="13" width="54" height="55" fill="${PAPER}"/>` +
      `<rect x="14.6" y="14.6" width="50.8" height="51.8" fill="none" stroke="#2d4a8a" stroke-width="0.35" opacity="0.5"/>` +
      `<path d="M50.5 63.4L58.6 59.6L57.2 61.4L60.4 62L58 62.6L58.6 64.4Z" fill="#2d4a8a" opacity="0.55"/>` +
      `<path d="M19 62.6q2.4-1.6 4.8 0t4.8 0t4.8 0" fill="none" stroke="#c8323a" stroke-width="0.5" opacity="0.5"/>` +
      centre,
  });
}

// ─── Unknown types: a plain ink-blue stamp ────────────────────────────────

const BLANK: Design = {
  bg: "#2d4a8a",
  band: "#1f3566",
  bandInk: PAPER,
  frame: PAPER,
  top: PAPER,
  name: "Inkwell",
  art: () => hatch(ART, 1.6, PAPER, 0.06) + nib(40, 42, 1.2, PAPER, "#2d4a8a"),
};

/** Stamp keys with a drawing of their own (plus "abroad"). */
export const STAMP_ART_TYPES: string[] = [...Object.keys(DESIGNS), "abroad"];

/** The dominant colour of each design, for borders, glows and placeholders. */
export function stampColor(type: string): string {
  if (type === "abroad") return "#c8323a";
  const d = DESIGNS[type];
  if (!d) return BLANK.bg;
  return type === "gilded" || type === "wax_seal" ? d.band : d.bg;
}

/** Full SVG markup for a stamp design. Unknown types get a plain stamp. */
export function stampArtSvg(type: string, opts: StampArtOptions = {}): string {
  if (type === "abroad") return abroad(opts);
  return frame(DESIGNS[type] ?? BLANK);
}
