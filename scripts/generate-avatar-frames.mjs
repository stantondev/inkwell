// Generates Inkwell avatar frame SVGs.
// Geometry: viewBox 120x120, avatar photo is a circle at (60,60) r≈46.15
// (AvatarWithFrame renders the frame at 1.3x the avatar size). Every frame
// starts at r≈45 so it slightly overlaps the photo edge (no gap/seam) and
// stays inside the 120 box.
import { writeFileSync } from "node:fs";

// Run from the repo root: node scripts/generate-avatar-frames.mjs
const OUT = process.argv[2] || new URL("../apps/web/public/frames", import.meta.url).pathname;
const C = 60;
const f = (n) => +n.toFixed(2);
const rad = (d) => (d * Math.PI) / 180;
const pt = (r, deg) => [f(C + r * Math.cos(rad(deg))), f(C + r * Math.sin(rad(deg)))];
const P = ([x, y]) => `${x} ${y}`;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function annulus(r1, r2) {
  // filled ring via evenodd
  return `M${C - r2} ${C}a${r2} ${r2} 0 1 0 ${2 * r2} 0a${r2} ${r2} 0 1 0 ${-2 * r2} 0Z M${C - r1} ${C}a${r1} ${r1} 0 1 0 ${2 * r1} 0a${r1} ${r1} 0 1 0 ${-2 * r1} 0Z`;
}

function arc(r, a0, a1) {
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${x0} ${y0}A${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
}

const svg = (title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">\n<title>${title}</title>\n${body.trim()}\n</svg>\n`;

// Variable-width stroke along a circular-ish centerline.
function brushPath(a0, a1, radiusAt, widthAt, steps = 160) {
  const outer = [];
  const inner = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + (a1 - a0) * t;
    const r = radiusAt(a, t);
    const w = widthAt(t) / 2;
    outer.push(pt(r + w, a));
    inner.push(pt(r - w, a));
  }
  inner.reverse();
  const [s0, s1] = [outer[0], inner[inner.length - 1]];
  const [e0, e1] = [outer[outer.length - 1], inner[0]];
  // round caps
  const capR = (p, q) => f(Math.hypot(p[0] - q[0], p[1] - q[1]) / 2);
  return (
    `M${P(s1)}A${capR(s0, s1)} ${capR(s0, s1)} 0 0 1 ${P(s0)}` +
    outer.slice(1).map((p) => `L${P(p)}`).join("") +
    `A${capR(e0, e1)} ${capR(e0, e1)} 0 0 1 ${P(e1)}` +
    inner.slice(1).map((p) => `L${P(p)}`).join("") +
    "Z"
  );
}

// A pointed leaf (vesica) centered at (x,y), pointing along angle `dir`.
function leaf(x, y, dir, len, wid) {
  const h = len / 2;
  const ux = Math.cos(rad(dir)), uy = Math.sin(rad(dir));
  const nx = -uy, ny = ux;
  const tip = [f(x + ux * h), f(y + uy * h)];
  const base = [f(x - ux * h), f(y - uy * h)];
  const c1 = [f(x + nx * wid), f(y + ny * wid)];
  const c2 = [f(x - nx * wid), f(y - ny * wid)];
  return {
    d: `M${P(base)}Q${P(c1)} ${P(tip)}Q${P(c2)} ${P(base)}Z`,
    vein: `M${P(base)}L${P([f(x + ux * h * 0.7), f(y + uy * h * 0.7)])}`,
  };
}

const frames = {};

// ── Classic ──────────────────────────────────────────────────────────
frames.classic = svg(
  "Classic",
  `
<defs>
  <linearGradient id="band" x1="0.15" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="#4263a8"/>
    <stop offset="0.55" stop-color="#2d4a8a"/>
    <stop offset="1" stop-color="#1c3163"/>
  </linearGradient>
</defs>
<path d="${annulus(45, 53)}" fill="url(#band)" fill-rule="evenodd"/>
<circle cx="60" cy="60" r="46.2" stroke="#f4ecdb" stroke-width="1.1"/>
<circle cx="60" cy="60" r="51.2" stroke="#f4ecdb" stroke-width="0.5" opacity="0.55"/>
<circle cx="60" cy="60" r="56.2" stroke="#2d4a8a" stroke-width="1.1"/>
<g fill="#2d4a8a" stroke="#f4ecdb" stroke-width="0.5">
  ${[0, 90, 180, 270]
    .map((a) => {
      const [x, y] = pt(56.2, a - 90);
      return `<path d="M${x} ${f(y - 3.4)}L${f(x + 2.3)} ${y}L${x} ${f(y + 3.4)}L${f(x - 2.3)} ${y}Z" transform="rotate(${a} ${x} ${y})"/>`;
    })
    .join("\n  ")}
</g>`
);

// ── Ink Ring (ensō) ──────────────────────────────────────────────────
{
  const a0 = 112, a1 = a0 + 318;
  const radiusAt = (a) => 51.4 + 0.7 * Math.sin(rad(a * 3 + 40)) + 0.35 * Math.sin(rad(a * 7));
  const widthAt = (t) => {
    if (t < 0.05) return 6.2 + 2.2 * (t / 0.05);
    if (t < 0.6) return 8.4 - 1.6 * ((t - 0.05) / 0.55) + 0.5 * Math.sin(t * 14);
    return Math.max(2.4, 6.8 - 5.4 * ((t - 0.6) / 0.28));
  };
  const body = brushPath(a0, a0 + (a1 - a0) * 0.88, radiusAt, widthAt);
  const tailStart = a0 + (a1 - a0) * 0.84;
  const streaks = [
    { off: -1.3, w: 1.0, end: 0.97 },
    { off: 0.1, w: 1.1, end: 1.0 },
    { off: 1.4, w: 0.8, end: 0.93 },
  ].map(({ off, w, end }) =>
    brushPath(
      tailStart,
      a0 + (a1 - a0) * end,
      (a) => radiusAt(a) + off,
      (t) => w * (1 - t * 0.75),
      40
    )
  );
  const drops = [
    [57.4, a0 - 16, 1.3],
    [58.6, a0 - 24, 0.7],
    [56.8, a1 + 20, 0.9],
  ]
    .map(([r, a, s]) => {
      const [x, y] = pt(r, a);
      return `<circle cx="${x}" cy="${y}" r="${s}"/>`;
    })
    .join("");
  frames["ink-ring"] = svg(
    "Ink Ring",
    `
<path d="${annulus(45, 59.2)}" fill="#fbf8f1" fill-rule="evenodd"/>
<circle cx="60" cy="60" r="59.2" stroke="#e6ddcb" stroke-width="0.6"/>
<g fill="#1d2944">
  <path d="${body}" opacity="0.94"/>
  <g opacity="0.8">${streaks.map((d) => `<path d="${d}"/>`).join("")}</g>
  <g opacity="0.85">${drops}</g>
</g>`
  );
}

// ── Notebook ─────────────────────────────────────────────────────────
{
  const coils = [];
  for (let i = 0; i < 8; i++) {
    const a = 131 + i * 14;
    const [hx, hy] = pt(49.6, a);
    coils.push(
      `<circle cx="${hx}" cy="${hy}" r="1.45" fill="#3b3a38"/>` +
        `<path d="M${P(pt(57.4, a + 3.2))}Q${P(pt(60.6, a + 2))} ${P(pt(59.7, a - 1.2))}" stroke="#7d848e" stroke-width="1.1" stroke-linecap="round" opacity="0.7"/>` +
        `<path d="M${hx} ${hy}Q${P(pt(55.5, a - 4.2))} ${P(pt(59.7, a - 1.2))}" stroke="url(#wire)" stroke-width="1.7" stroke-linecap="round"/>`
    );
  }
  frames.notebook = svg(
    "Notebook",
    `
<defs>
  <linearGradient id="wire" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#d9dde3"/>
    <stop offset="0.5" stop-color="#8b929c"/>
    <stop offset="1" stop-color="#4f555e"/>
  </linearGradient>
</defs>
<path d="${annulus(45, 57.5)}" fill="#fdfaf2" fill-rule="evenodd"/>
<circle cx="60" cy="60" r="57.5" stroke="#b3a88f" stroke-width="1.1"/>
<g stroke="#8fa9d4" stroke-width="0.55">
  <circle cx="60" cy="60" r="50.5"/>
  <circle cx="60" cy="60" r="54.3"/>
</g>
<circle cx="60" cy="60" r="46.6" stroke="#d9868a" stroke-width="0.9"/>
<g>${coils.join("")}</g>`
  );
}

// ── Wax Seal ─────────────────────────────────────────────────────────
{
  const r = rng(7);
  const pts = [];
  const N = 72;
  const bumps = Array.from({ length: 5 }, () => [r() * 360, 2 + r() * 1.6, 10 + r() * 10]);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * 360;
    let rr = 56.2 + 0.9 * Math.sin(rad(a * 5 + 20)) + 0.6 * Math.sin(rad(a * 9 + 70));
    for (const [ba, amp, wid] of bumps) {
      const d = Math.min(Math.abs(a - ba), 360 - Math.abs(a - ba));
      rr += amp * Math.exp(-(d * d) / (2 * wid * wid));
    }
    pts.push(pt(Math.min(rr, 59.6), a));
  }
  // smooth closed curve through points (Catmull-Rom → cubic)
  let d = `M${P(pts[0])}`;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    const c1 = [f(p1[0] + (p2[0] - p0[0]) / 6), f(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [f(p2[0] - (p3[0] - p1[0]) / 6), f(p2[1] - (p3[1] - p1[1]) / 6)];
    d += `C${P(c1)} ${P(c2)} ${P(p2)}`;
  }
  d += "Z";
  const inner = `M${C - 45} ${C}a45 45 0 1 0 90 0a45 45 0 1 0 -90 0Z`;
  const beads = Array.from({ length: 40 }, (_, i) => {
    const [x, y] = pt(52.2, i * 9);
    return `<circle cx="${x}" cy="${y}" r="0.75"/>`;
  }).join("");
  frames["wax-seal"] = svg(
    "Wax Seal",
    `
<defs>
  <radialGradient id="wax" cx="0.38" cy="0.3" r="0.8">
    <stop offset="0" stop-color="#d4473a"/>
    <stop offset="0.55" stop-color="#a3231d"/>
    <stop offset="1" stop-color="#6d1110"/>
  </radialGradient>
  <linearGradient id="rim" x1="0.2" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#5e0d0c"/>
    <stop offset="1" stop-color="#e06656"/>
  </linearGradient>
</defs>
<path d="${d} ${inner}" fill="url(#wax)" fill-rule="evenodd"/>
<path d="${d}" stroke="#5a0c0b" stroke-width="0.6" opacity="0.6"/>
<circle cx="60" cy="60" r="47.2" stroke="url(#rim)" stroke-width="3.2"/>
<circle cx="60" cy="60" r="45.6" stroke="#4a0908" stroke-width="0.9" opacity="0.7"/>
<g fill="#6d1110" opacity="0.75">${beads}</g>
<path d="${arc(54.6, 196, 262)}" stroke="#ffd9cf" stroke-width="1.3" stroke-linecap="round" opacity="0.55"/>
<path d="${arc(55, 270, 284)}" stroke="#ffd9cf" stroke-width="0.9" stroke-linecap="round" opacity="0.4"/>
<path d="${arc(49.8, 20, 70)}" stroke="#3a0605" stroke-width="1" stroke-linecap="round" opacity="0.35"/>`
  );
}

// ── Gilded ───────────────────────────────────────────────────────────
{
  const beads = Array.from({ length: 36 }, (_, i) => {
    const [x, y] = pt(51.3, i * 10 + 5);
    return `<circle cx="${x}" cy="${y}" r="1.25"/>`;
  }).join("");
  const ornament = (a) => {
    // crest: lozenge flanked by two scrolls, sits on the outer rim
    return `<g transform="rotate(${a} 60 60)">
    <path d="M60 1.2L63.4 5.6L60 10L56.6 5.6Z" fill="url(#goldV)" stroke="#6b4a14" stroke-width="0.6"/>
    <circle cx="60" cy="5.6" r="1.1" fill="#fff3c4"/>
    <path d="M56.2 6.8C52.4 5.4 49.6 7.2 50.4 9.4C51 11 53.4 10.6 53.2 9.2" stroke="#8c6420" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M63.8 6.8C67.6 5.4 70.4 7.2 69.6 9.4C69 11 66.6 10.6 66.8 9.2" stroke="#8c6420" stroke-width="1.1" stroke-linecap="round"/>
  </g>`;
  };
  frames.gilded = svg(
    "Gilded",
    `
<defs>
  <linearGradient id="gold" x1="0.1" y1="0" x2="0.9" y2="1">
    <stop offset="0" stop-color="#fbe9a8"/>
    <stop offset="0.3" stop-color="#d9a441"/>
    <stop offset="0.55" stop-color="#9b6c1f"/>
    <stop offset="0.78" stop-color="#e6bf5c"/>
    <stop offset="1" stop-color="#8a5f18"/>
  </linearGradient>
  <linearGradient id="goldV" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fbe9a8"/>
    <stop offset="1" stop-color="#b3812a"/>
  </linearGradient>
  <radialGradient id="bead" cx="0.35" cy="0.35" r="0.7">
    <stop offset="0" stop-color="#fff6d2"/>
    <stop offset="1" stop-color="#a3741f"/>
  </radialGradient>
</defs>
<path d="${annulus(45, 55.2)}" fill="url(#gold)" fill-rule="evenodd"/>
<path d="${annulus(49.2, 53.4)}" fill="#6e4b14" fill-rule="evenodd" opacity="0.55"/>
<g fill="url(#bead)">${beads}</g>
<circle cx="60" cy="60" r="45.5" stroke="#5c3f10" stroke-width="1"/>
<circle cx="60" cy="60" r="47.4" stroke="#fff1bf" stroke-width="0.6" opacity="0.8"/>
<circle cx="60" cy="60" r="55.2" stroke="#5c3f10" stroke-width="0.9"/>
${[0, 90, 180, 270].map(ornament).join("\n")}`
  );
}

// ── Constellation ────────────────────────────────────────────────────
{
  const r = rng(42);
  const dots = [];
  for (let i = 0; i < 70; i++) {
    const rr = 47.8 + r() * 7.6;
    const a = r() * 360;
    const [x, y] = pt(rr, a);
    const s = r() < 0.15 ? 0.7 : 0.3 + r() * 0.3;
    dots.push(`<circle cx="${x}" cy="${y}" r="${f(s)}" opacity="${f(0.45 + r() * 0.55)}"/>`);
  }
  const sparkle = (rr, a, s) => {
    const [x, y] = pt(rr, a);
    return `<path d="M${x} ${f(y - s)}Q${x} ${y} ${f(x + s)} ${y}Q${x} ${y} ${x} ${f(y + s)}Q${x} ${y} ${f(x - s)} ${y}Q${x} ${y} ${x} ${f(y - s)}Z"/>`;
  };
  // A small constellation along the upper-right of the band
  const cons = [
    [51.5, -78], [53.2, -62], [50.2, -47], [52.6, -30], [50.8, -14], [53.4, -4],
  ].map(([rr, a]) => pt(rr, a));
  const consLine = `M${cons.map(P).join("L")}`;
  const cons2 = [[52.5, 150], [50.4, 164], [53, 176], [51, 190]].map(([rr, a]) => pt(rr, a));
  const [mx, my] = pt(51.3, 118);
  frames.constellation = svg(
    "Constellation",
    `
<defs>
  <radialGradient id="night" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0.75" stop-color="#1f2f63"/>
    <stop offset="1" stop-color="#0d1633"/>
  </radialGradient>
</defs>
<path d="${annulus(45, 57.2)}" fill="url(#night)" fill-rule="evenodd"/>
<circle cx="60" cy="60" r="45.8" stroke="#d8b766" stroke-width="1"/>
<circle cx="60" cy="60" r="57.2" stroke="#d8b766" stroke-width="1.1"/>
<g fill="#e8eeff">${dots.join("")}</g>
<g stroke="#b9c8f5" stroke-width="0.45" opacity="0.7">
  <path d="${consLine}"/><path d="M${cons2.map(P).join("L")}"/>
</g>
<g fill="#fff6dc">
  ${cons.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.95"/>`).join("")}
  ${cons2.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.85"/>`).join("")}
  ${sparkle(51.5, -118, 3.2)}${sparkle(50.8, 30, 2.6)}${sparkle(52, 238, 2.2)}${sparkle(51.8, 72, 1.8)}
</g>
<g transform="translate(${mx} ${my}) rotate(-35)">
  <path d="M-2.6 -2.6A3.7 3.7 0 1 0 2.6 2.6A2.9 2.9 0 1 1 -2.6 -2.6Z" fill="#f3dc9a"/>
</g>`
  );
}

// ── Botanical (laurel wreath) ────────────────────────────────────────
{
  const STEM = 51.6;
  const greens = ["#3f6a37", "#5a8a47", "#4b7a3f", "#6c9a55"];
  const leaves = [];
  const berries = [];
  const branch = (side) => {
    // side = 1: right branch (from bottom going counter-clockwise up the right)
    // angles: bottom = 90; going up right side means decreasing angle to -72
    const start = 90 + side * -10;
    const end = side === 1 ? -74 : 254;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = start + (end - start) * t;
      const tangent = a + (side === 1 ? -90 : 90); // direction toward branch tip
      const len = 12.6 - 4.4 * t;
      const wid = 3.4 - 1.1 * t;
      for (const k of [-1, 1]) {
        const rr = STEM + k * (2.3 - 0.6 * t);
        const [x, y] = pt(rr, a + (side === 1 ? -1.6 : 1.6));
        const dir = tangent + k * (side === 1 ? 1 : -1) * 32;
        const L = leaf(x, y, dir, len, wid);
        const g = greens[(i * 2 + (k > 0 ? 1 : 0) + (side > 0 ? 0 : 1)) % greens.length];
        leaves.push(`<path d="${L.d}" fill="${g}"/><path d="${L.vein}" stroke="#d9e8c4" stroke-width="0.35" opacity="0.6"/>`);
      }
      if (i === 3 || i === 7) {
        const [bx, by] = pt(STEM + 4.6, a + side * -4);
        berries.push(`<circle cx="${bx}" cy="${by}" r="1.35"/>`);
      }
    }
    // tip leaf
    const [tx, ty] = pt(STEM, end + (side === 1 ? -2 : 2));
    const L = leaf(tx, ty, end + (side === 1 ? -90 : 90), 6, 1.8);
    leaves.push(`<path d="${L.d}" fill="${greens[3]}"/>`);
    return arc(STEM, Math.min(start, end), Math.max(start, end));
  };
  const stemR = branch(1);
  const stemL = branch(-1);
  frames.botanical = svg(
    "Botanical",
    `
<g stroke="#3a5a2f" stroke-width="0.7" stroke-linecap="round"><path d="${stemR}"/><path d="${stemL}"/></g>
<g>${leaves.join("")}</g>
<g fill="#a3313f" stroke="#6d1c27" stroke-width="0.35">${berries.join("")}</g>
<g transform="translate(60 106)">
  <path d="M-1.6 1.8C-3.5 5.5 -5.2 9 -7.6 12.6L-4.6 11.7L-3.5 14.2C-2 10.4 -0.9 6.4 0 2.4Z" fill="#8d2533"/>
  <path d="M1.6 1.8C3.5 5.5 5.2 9 7.6 12.6L4.6 11.7L3.5 14.2C2 10.4 0.9 6.4 0 2.4Z" fill="#7a1e2b"/>
  <path d="M0 0C-3 -4.4 -9.2 -4.6 -9 0.2C-8.8 4.6 -3.2 3.2 0 0.6Z" fill="#b13545" stroke="#6d1c27" stroke-width="0.5"/>
  <path d="M0 0C3 -4.4 9.2 -4.6 9 0.2C8.8 4.6 3.2 3.2 0 0.6Z" fill="#9c2c3b" stroke="#6d1c27" stroke-width="0.5"/>
  <ellipse cx="0" cy="0.3" rx="2" ry="2.3" fill="#c2414f" stroke="#6d1c27" stroke-width="0.5"/>
</g>`
  );
}

// ── Neon ─────────────────────────────────────────────────────────────
{
  const pink = arc(51.8, -84, 250);
  const cyan = arc(47.8, 120, 222);
  const cyan2 = arc(47.8, 300, 350);
  const capsAt = (r, a) => {
    const [x, y] = pt(r, a);
    return `<circle cx="${x}" cy="${y}" r="1.25"/>`;
  };
  frames.neon = svg(
    "Neon",
    `
<defs>
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="2.2"/>
  </filter>
</defs>
<path d="${annulus(45, 57.5)}" fill="#160d24" fill-rule="evenodd" opacity="0.92"/>
<g stroke-linecap="round">
  <path d="${pink}" stroke="#ff2fa4" stroke-width="5" filter="url(#glow)" opacity="0.9"/>
  <path d="${pink}" stroke="#ff5fbd" stroke-width="2.6"/>
  <path d="${pink}" stroke="#ffe6f5" stroke-width="1"/>
  <path d="${cyan}" stroke="#18d8ff" stroke-width="3.6" filter="url(#glow)" opacity="0.9"/>
  <path d="${cyan2}" stroke="#18d8ff" stroke-width="3.6" filter="url(#glow)" opacity="0.9"/>
  <path d="${cyan}" stroke="#7eeaff" stroke-width="1.8"/>
  <path d="${cyan2}" stroke="#7eeaff" stroke-width="1.8"/>
  <path d="${cyan}" stroke="#eafcff" stroke-width="0.6"/>
  <path d="${cyan2}" stroke="#eafcff" stroke-width="0.6"/>
</g>
<g fill="#3a3346">${capsAt(51.8, -84)}${capsAt(51.8, 250)}${capsAt(47.8, 120)}${capsAt(47.8, 222)}${capsAt(47.8, 300)}${capsAt(47.8, 350)}</g>
<circle cx="60" cy="60" r="57.5" stroke="#3b2a55" stroke-width="0.8"/>`
  );
}

// ── Postage (id: stamp) ──────────────────────────────────────────────
{
  // perforated square: edge 2..118, semicircle bites every ~7.6
  const lo = 2, hi = 118, n = 15, br = 1.9;
  const step = (hi - lo) / n;
  let d = `M${lo} ${lo}`;
  const side = (from, to, fixed, horiz, dir) => {
    let s = "";
    for (let i = 0; i < n; i++) {
      const c = from + dir * (i + 0.5) * step;
      const a = c - dir * br, b = c + dir * br;
      if (horiz) s += `L${f(a)} ${fixed}A${br} ${br} 0 0 ${dir > 0 === (fixed === lo) ? 0 : 0} ${f(b)} ${fixed}`;
      else s += `L${fixed} ${f(a)}A${br} ${br} 0 0 0 ${fixed} ${f(b)}`;
    }
    return s + (horiz ? `L${to} ${fixed}` : `L${fixed} ${to}`);
  };
  d += side(lo, hi, lo, true, 1);
  d += side(lo, hi, hi, false, 1);
  d += side(hi, lo, hi, true, -1);
  d += side(hi, lo, lo, false, -1);
  d += "Z";
  const hole = `M${C - 45} ${C}a45 45 0 1 0 90 0a45 45 0 1 0 -90 0Z`;
  // postmark wave lines, bottom-left corner, clipped outside the photo
  const waves = [0, 1, 2, 3]
    .map((i) => {
      const y = 96 + i * 4.2;
      return `M-2 ${y}q3.5 -2.6 7 0t7 0t7 0t7 0t7 0`;
    })
    .join("");
  frames.stamp = svg(
    "Postage",
    `
<defs>
  <path id="arcTop" d="${arc(50.3, 200, 340)}"/>
  <path id="arcBot" d="${arc(53.3, 145, 35)}"/>
  <clipPath id="outside"><path d="M0 0H120V120H0Z ${hole}" clip-rule="evenodd"/></clipPath>
</defs>
<path d="${d} ${hole}" fill="#fbf6e9" fill-rule="evenodd" stroke="#d8ccb2" stroke-width="0.5"/>
<path d="M7.5 7.5H112.5V112.5H7.5Z ${hole}" fill="#2d4a8a" fill-rule="evenodd"/>
<rect x="9.3" y="9.3" width="101.4" height="101.4" stroke="#f4ecdb" stroke-width="0.5" opacity="0.7"/>
<circle cx="60" cy="60" r="45.7" stroke="#f4ecdb" stroke-width="1.1"/>
<g font-family="Georgia, 'Times New Roman', serif" fill="#f4ecdb" font-weight="bold">
  <text font-size="5.4" letter-spacing="1.6" text-anchor="middle"><textPath href="#arcTop" startOffset="50%">INKWELL</textPath></text>
  <text x="105.6" y="108" font-size="10" text-anchor="middle" font-style="italic">5</text>
  <text x="14.4" y="17.8" font-size="10" text-anchor="middle" font-style="italic">5</text>
</g>
<g clip-path="url(#outside)" stroke="#1a1a1a" stroke-width="1" opacity="0.55" fill="none">
  <path d="${waves}"/>
</g>`
  );
}

for (const [id, content] of Object.entries(frames)) {
  writeFileSync(`${OUT}/${id}.svg`, content);
}
console.log("wrote", Object.keys(frames).join(", "));
