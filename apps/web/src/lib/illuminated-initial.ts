// Inkwell Illuminated (Plus): the entry's first letter set on a gilded tile,
// the way a manuscript opened. The tile is drawn here as an SVG string and
// put into the entry's own HTML, around its real first letter, so the letter
// stays text (copying, search, screen readers and margin notes all still see
// "Once", not "nce"). The SVG has no text and no ids, so several can share a
// page. Colours and the opening animation live in globals.css (.illum*).

export type Illumination = "vine" | "stars" | "garden" | "quill";

export const ILLUMINATIONS: { id: Illumination; label: string; blurb: string }[] = [
  { id: "vine", label: "Vines", blurb: "White vine-stems curling from the corners, with gold berries." },
  { id: "stars", label: "Night sky", blurb: "A gold crescent moon and stars, joined like a constellation." },
  { id: "garden", label: "Garden", blurb: "Flowers climbing the edges on long stems." },
  { id: "quill", label: "Quill", blurb: "A feather quill behind the letter, its nib dipped in gold." },
];

export const DEFAULT_ILLUMINATION: Illumination = "vine";

// ── Small drawing helpers (viewBox 0 0 100 100) ───────────────────────────

const n = (v: number) => Math.round(v * 100) / 100;

/** A stroked line that draws itself in when the entry opens. */
const line = (d: string, cls = "v-line") => `<path class="${cls} illum-draw" pathLength="1" d="${d}"/>`;

/** A filled shape that appears once the lines are drawn. */
const shape = (d: string, cls: string) => `<path class="${cls} illum-pop" d="${d}"/>`;

const dot = (x: number, y: number, r: number, cls = "g-fill") =>
  `<circle class="${cls} illum-pop" cx="${n(x)}" cy="${n(y)}" r="${n(r)}"/>`;

function leaf(x: number, y: number, angle: number, len = 7): string {
  const a = (angle * Math.PI) / 180;
  const ex = x + Math.cos(a) * len;
  const ey = y + Math.sin(a) * len;
  const w = len * 0.42;
  const px = -Math.sin(a) * w;
  const py = Math.cos(a) * w;
  const mx = (x + ex) / 2;
  const my = (y + ey) / 2;
  return shape(`M${n(x)} ${n(y)}Q${n(mx + px)} ${n(my + py)} ${n(ex)} ${n(ey)}Q${n(mx - px)} ${n(my - py)} ${n(x)} ${n(y)}Z`, "v-fill");
}

function sparkle(x: number, y: number, r: number, cls = "g-fill"): string {
  return shape(
    `M${n(x)} ${n(y - r)}Q${n(x)} ${n(y)} ${n(x + r)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y + r)}Q${n(x)} ${n(y)} ${n(x - r)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y - r)}Z`,
    cls,
  );
}

function flower(x: number, y: number, r: number): string {
  let petals = "";
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * (Math.PI / 180);
    petals += `<circle class="v-fill" cx="${n(x + Math.cos(a) * r * 0.62)}" cy="${n(y + Math.sin(a) * r * 0.62)}" r="${n(r * 0.48)}"/>`;
  }
  return `<g class="illum-pop">${petals}<circle class="g-fill" cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.36)}"/></g>`;
}

/** Draw `inner` again, turned half round the centre (the opposite corner). */
const opposite = (inner: string) => `${inner}<g transform="rotate(180 50 50)">${inner}</g>`;

// ── The gilt frame every illumination shares ──────────────────────────────

function boss(x: number, y: number): string {
  return `<path class="g-fill g-edge" d="M${x} ${y - 3.6}L${x + 3.6} ${y}L${x} ${y + 3.6}L${x - 3.6} ${y}Z"/><circle class="g-dark" cx="${x}" cy="${y}" r=".9"/>`;
}

const FRAME =
  `<rect class="g-rim" x="2.4" y="2.4" width="95.2" height="95.2" rx="2.6"/>` +
  `<rect class="g-hi" x="2.4" y="2.4" width="95.2" height="95.2" rx="2.6"/>` +
  `<rect class="g-rule" x="8.5" y="8.5" width="83" height="83"/>` +
  boss(8.5, 8.5) + boss(91.5, 8.5) + boss(8.5, 91.5) + boss(91.5, 91.5);

// ── The four illuminations ────────────────────────────────────────────────

/** Deterministic scatter (the same tile on every page load). */
function scatter(seed: number, count: number, avoidCentre = true): [number, number, number][] {
  let x = seed;
  const rand = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const out: [number, number, number][] = [];
  while (out.length < count) {
    const px = 11 + rand() * 78;
    const py = 11 + rand() * 78;
    if (avoidCentre && Math.abs(px - 50) < 20 && Math.abs(py - 52) < 24) continue;
    out.push([px, py, rand()]);
  }
  return out;
}

/** The manuscript's diamond lattice behind the letter, with gold studs. */
const LATTICE = (() => {
  let d = "";
  for (let k = -80; k <= 80; k += 11) d += `M${10 + k} 10L${90 + k} 90M${90 - k} 10L${10 - k} 90`;
  let studs = "";
  for (let k = -77; k <= 77; k += 22) {
    for (let j = 0; j <= 80; j += 22) {
      const cx = 50 + k / 2 + j / 2 - 20;
      const cy = 10 + j / 2 - k / 2 + 30;
      if (cx > 12 && cx < 88 && cy > 12 && cy < 88) studs += `<circle cx="${n(cx)}" cy="${n(cy)}" r=".7"/>`;
    }
  }
  return `<g class="illum-ground"><path class="v-lattice" d="${d}"/><g class="g-stud">${studs}</g></g>`;
})();

const VINE = (() => {
  const scroll =
    line("M12 52C10 32 16 13 35 12C45 11 50 19 45 24C41 28 36 24 39 21", "v-line v-thick") +
    line("M13 36C18 33 23 34 25 38C26 41 23 43 21 41") +
    line("M22 13C22 18 26 21 30 20") +
    leaf(12, 44, 195, 8.5) + leaf(14, 28, 225, 8) + leaf(26, 12.5, 300, 7.5) + leaf(25, 38, 20, 6.5) +
    leaf(38, 12, 330, 6) + leaf(30, 20, 60, 5.5) +
    dot(21, 20, 1.7) + dot(18.3, 22.6, 1.3) + dot(21.5, 23.8, 1.1) + dot(33, 17, 1.4) + dot(16, 50, 1.3);
  const sprig =
    line("M88 12C80 13 74 18 75 25C76 30 81 31 82 27") +
    leaf(85, 12, 165, 7) + leaf(75, 21, 245, 6.5) + leaf(80, 16, 120, 5) +
    dot(88, 21, 1.6) + dot(85.6, 24.4, 1.2) + dot(88.6, 25.2, 1);
  return LATTICE + opposite(scroll + sprig);
})();

const STARS = (() => {
  const field = scatter(7, 34, false)
    .map(([x, y, r]) => `<circle class="v-fill v-star" cx="${n(x)}" cy="${n(y)}" r="${n(0.35 + r * 0.6)}"/>`)
    .join("");
  return (
    `<g class="illum-ground">${field}</g>` +
    line("M15 24L28 15L33 28L21 33Z", "v-line v-thin") +
    line("M68 86L79 77L89 82M79 77L80 66", "v-line v-thin") +
    shape("M73 13A12 12 0 1 0 90 31A9.5 9.5 0 1 1 73 13Z", "g-fill") +
    sparkle(15, 24, 5.5) + sparkle(28, 15, 3.4) + sparkle(33, 28, 2.6) + sparkle(21, 33, 2.2) +
    sparkle(79, 77, 5.5) + sparkle(68, 86, 2.8) + sparkle(89, 82, 2.4) + sparkle(80, 66, 2.2) +
    sparkle(14, 80, 3.6) + sparkle(86, 46, 2.4) + sparkle(46, 88, 2, "v-fill") + sparkle(54, 13, 2, "v-fill")
  );
})();

const GARDEN = (() => {
  const climb =
    line("M13 90C18 74 10 58 15 42C17 34 14 27 18 21", "v-line v-thick") +
    line("M15 64C21 62 24 58 24 53") +
    line("M14 46C10 44 10 40 12 37") +
    leaf(14, 78, 200, 8) + leaf(15, 52, 330, 7.5) + leaf(16, 33, 205, 7) + leaf(14, 86, 340, 6) +
    flower(19, 17, 7) + flower(24, 50, 4.4) + flower(12, 35, 3.2) + dot(18, 70, 1.4) + dot(21, 72.5, 1.1);
  const bud =
    line("M90 87C83 87 78 85 75 80") + line("M87 87C88 82 86 78 83 76") +
    leaf(84, 87, 70, 6) + flower(73, 77, 4.2) + flower(83, 73, 3) + dot(66, 86, 1.2);
  const dots = scatter(3, 14)
    .map(([x, y]) => `<circle class="v-fill v-star" cx="${n(x)}" cy="${n(y)}" r=".55"/>`)
    .join("");
  return `<g class="illum-ground">${dots}</g>` + opposite(climb + bud);
})();

const QUILL = (() => {
  let ruled = "";
  for (let y = 22; y < 90; y += 9) ruled += `M11 ${y}H89`;
  return (
    `<g class="illum-ground"><path class="v-lattice" d="${ruled}"/><path class="v-margin" d="M24 11V89"/></g>` +
    shape("M89 11C72 13 49 33 33 66C49 49 70 34 89 11Z", "v-fill v-soft") +
    shape("M89 11C80 25 62 46 37 67C57 54 76 37 89 11Z", "v-fill v-faint") +
    line("M16 85L89 11", "v-line v-thick") +
    line("M44 50L35 46M52 42L44 37M60 34L53 29M68 27L62 22M76 20L71 16M50 52L50 44M58 44L59 36M66 36L67 28M74 28L75 21", "v-line v-faint") +
    shape("M12 89L14.6 79.6L20.4 85.4Z", "g-fill") +
    `<path class="g-dark illum-pop" d="M13 88L17.3 83.7"/>` +
    shape("M80 74C80 74 76.5 79 76.5 81.4A3.5 3.5 0 0 0 83.5 81.4C83.5 79 80 74 80 74Z", "g-fill") +
    shape("M87.5 65C87.5 65 85.8 67.8 85.8 69A1.7 1.7 0 0 0 89.2 69C89.2 67.8 87.5 65 87.5 65Z", "g-fill") +
    dot(70, 87, 1.3) + dot(74.5, 88, 0.8) + dot(25, 82, 1) + dot(22, 77.5, 0.6)
  );
})();

const MOTIFS: Record<Illumination, string> = { vine: VINE, stars: STARS, garden: GARDEN, quill: QUILL };

export function illumination(value: unknown): Illumination {
  return ILLUMINATIONS.some((o) => o.id === value) ? (value as Illumination) : DEFAULT_ILLUMINATION;
}

/** The tile's artwork: the motif under the gilt frame. */
export function illuminatedSvg(motif: Illumination): string {
  // The motif stays inside the inner gold rule (a nested svg clips to its box).
  return (
    `<svg class="illum-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">` +
    `<svg x="8.5" y="8.5" width="83" height="83" viewBox="8.5 8.5 83 83">${MOTIFS[motif]}</svg>${FRAME}</svg>`
  );
}

const LATIN = /[A-Za-zÀ-ÖØ-öø-ÿ]/;
const INLINE_TAG = /^<\/?(strong|b|em|i|u|s|mark|span|a|sub|sup)(\s[^>]*)?>/i;

/**
 * The entry's HTML with its first letter set on an illuminated tile, or null
 * when the entry doesn't open with a paragraph that starts with a Latin
 * letter (the page then uses the Classic capital).
 */
export function illuminateHtml(html: string, motif: Illumination, opts: { onGold?: boolean } = {}): string | null {
  const open = /^\s*<p(\s[^>]*)?>/i.exec(html);
  if (!open) return null;
  let i = open[0].length;
  for (;;) {
    const rest = html.slice(i);
    const tag = INLINE_TAG.exec(rest);
    if (tag) {
      i += tag[0].length;
      continue;
    }
    const space = /^\s+/.exec(rest);
    if (space) {
      i += space[0].length;
      continue;
    }
    break;
  }
  const letter = html.charAt(i);
  if (!LATIN.test(letter)) return null;
  const classes = `illum illum--${motif}${opts.onGold ? " illum--on-gold" : ""}`;
  return (
    html.slice(0, i) +
    `<span class="${classes}">${illuminatedSvg(motif)}<span class="illum-letter">${letter}</span></span>` +
    html.slice(i + 1)
  );
}
