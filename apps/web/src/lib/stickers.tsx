/**
 * Inkwell's sticker packs: small inline SVG drawings writers pin to the
 * edges of their page's cards (Arrange my page). Inline, not image files, so
 * the accent-coloured ones take the page's own accent (`var(--sticker-accent)`).
 *
 * Rules for the drawings: no ids (masks, gradients, filters, textPath), since
 * a page can show the same sticker many times; flat fills and opacity only.
 * Keys must match `@sticker_keys` / `@plus_sticker_keys` in
 * apps/api/lib/inkwell/profile_home.ex.
 */

import type { ReactNode } from "react";

export interface StickerDef {
  key: string;
  label: string;
  /** Natural width : height of the drawing. */
  viewBox: [number, number];
  draw: () => ReactNode;
}

export interface StickerPack {
  id: string;
  label: string;
  blurb: string;
  plus: boolean;
  stickers: StickerDef[];
}

const INK = "#2b2620";
const PAPER = "#fbf6ea";
const ACCENT = "var(--sticker-accent, #2d4a8a)";

/** A rectangle with round perforation notches along every edge (a postage stamp). */
function perforated(w: number, h: number, r: number): string {
  const step = r * 4;
  const edge = (len: number) => {
    const n = Math.max(1, Math.floor(len / step));
    const pad = (len - n * 2 * r) / (n + 1);
    return { n, pad };
  };
  const top = edge(w);
  const side = edge(h);
  let d = `M0 0`;
  // top, left → right
  let x = 0;
  for (let i = 0; i < top.n; i++) {
    x += top.pad;
    d += ` H${x} A${r} ${r} 0 0 0 ${x + 2 * r} 0`;
    x += 2 * r;
  }
  d += ` H${w}`;
  // right, top → bottom
  let y = 0;
  for (let i = 0; i < side.n; i++) {
    y += side.pad;
    d += ` V${y} A${r} ${r} 0 0 0 ${w} ${y + 2 * r}`;
    y += 2 * r;
  }
  d += ` V${h}`;
  // bottom, right → left
  x = w;
  for (let i = 0; i < top.n; i++) {
    x -= top.pad;
    d += ` H${x} A${r} ${r} 0 0 0 ${x - 2 * r} ${h}`;
    x -= 2 * r;
  }
  d += ` H0`;
  // left, bottom → top
  y = h;
  for (let i = 0; i < side.n; i++) {
    y -= side.pad;
    d += ` V${y} A${r} ${r} 0 0 0 0 ${y - 2 * r}`;
    y -= 2 * r;
  }
  return d + " Z";
}

/** A strip of tape with torn, zig-zag ends. */
function tape(w: number, h: number, tooth = 3): string {
  let d = `M${tooth} 0 H${w - tooth}`;
  for (let y = 0; y < h; y += tooth * 2) d += ` L${w} ${Math.min(h, y + tooth)} L${w - tooth} ${Math.min(h, y + tooth * 2)}`;
  d += ` H${tooth}`;
  for (let y = h; y > 0; y -= tooth * 2) d += ` L0 ${Math.max(0, y - tooth)} L${tooth} ${Math.max(0, y - tooth * 2)}`;
  return d + " Z";
}

const nib = (cx: number, cy: number, s: number, fill: string, bg: string) => (
  <>
    <path
      d={`M${cx - 7 * s} ${cy - 11 * s} H${cx + 7 * s} C${cx + 8.5 * s} ${cy - 2 * s} ${cx + 5 * s} ${cy + 5 * s} ${cx} ${cy + 13 * s} C${cx - 5 * s} ${cy + 5 * s} ${cx - 8.5 * s} ${cy - 2 * s} ${cx - 7 * s} ${cy - 11 * s} Z`}
      fill={fill}
    />
    <path d={`M${cx} ${cy} V${cy + 12 * s}`} stroke={bg} strokeWidth={1.1 * s} />
    <circle cx={cx} cy={cy - 1 * s} r={2 * s} fill={bg} />
  </>
);

const DESK: StickerDef[] = [
  {
    key: "stamp",
    label: "Postage stamp",
    viewBox: [80, 96],
    draw: () => (
      <>
        <path d={perforated(80, 96, 2.6)} fill={PAPER} stroke="rgba(0,0,0,0.12)" strokeWidth="0.6" />
        <rect x="8" y="8" width="64" height="80" fill={ACCENT} />
        <rect x="11" y="11" width="58" height="74" fill="none" stroke={PAPER} strokeWidth="1" opacity="0.7" />
        {nib(40, 42, 1.4, PAPER, ACCENT)}
        <text x="40" y="76" textAnchor="middle" fontFamily="Georgia, serif" fontSize="9" letterSpacing="1.5" fill={PAPER}>INKWELL</text>
        <text x="15" y="23" fontFamily="Georgia, serif" fontSize="10" fontWeight="bold" fill={PAPER}>5</text>
      </>
    ),
  },
  {
    key: "postmark",
    label: "Postmark",
    viewBox: [120, 64],
    draw: () => (
      <g fill="none" stroke={INK} opacity="0.72">
        <circle cx="32" cy="32" r="28" strokeWidth="2.2" />
        <circle cx="32" cy="32" r="21" strokeWidth="1.2" />
        <text x="32" y="28" textAnchor="middle" fontFamily="Georgia, serif" fontSize="5.6" letterSpacing="0.6" fill={INK} stroke="none">INKWELL</text>
        <text x="32" y="39" textAnchor="middle" fontFamily="Georgia, serif" fontSize="9" fill={INK} stroke="none">★</text>
        {[18, 26, 34, 42].map((y) => (
          <path key={y} d={`M64 ${y} q7 -5 14 0 t14 0 t14 0 t14 0`} strokeWidth="2" strokeLinecap="round" />
        ))}
      </g>
    ),
  },
  {
    key: "airmail",
    label: "Airmail tape",
    viewBox: [128, 26],
    draw: () => (
      <>
        <rect x="0" y="0" width="128" height="26" fill="#fffdf7" />
        {Array.from({ length: 10 }, (_, i) => {
          const x = i * 12;
          const fill = i % 4 === 0 ? "#c8463c" : i % 4 === 2 ? "#2f5596" : PAPER;
          return <path key={i} d={`M${x + 8} 0 H${x + 20} L${x + 12} 26 H${x} Z`} fill={fill} />;
        })}
      </>
    ),
  },
  {
    key: "washi-dots",
    label: "Washi tape, dotted",
    viewBox: [120, 28],
    draw: () => (
      <>
        <path d={tape(120, 28)} fill={ACCENT} opacity="0.55" />
        {Array.from({ length: 12 }, (_, i) => (
          <circle key={i} cx={10 + i * 9.2} cy={i % 2 ? 10 : 18} r="2.2" fill="#fff" opacity="0.7" />
        ))}
      </>
    ),
  },
  {
    key: "washi-plain",
    label: "Washi tape, kraft",
    viewBox: [120, 28],
    draw: () => (
      <>
        <path d={tape(120, 28)} fill="#d9be8c" opacity="0.78" />
        <path d="M6 9 H114 M6 19 H114" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
      </>
    ),
  },
  {
    key: "paperclip",
    label: "Paper clip",
    viewBox: [28, 80],
    draw: () => (
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 22 V60 a6 6 0 0 1 -12 0 V14 a9 9 0 0 1 18 0 V66 a10 10 0 0 1 -20 0 V26" stroke="#7d848e" strokeWidth="3.2" />
        <path d="M18 22 V60 a6 6 0 0 1 -12 0 V14 a9 9 0 0 1 18 0 V66 a10 10 0 0 1 -20 0 V26" stroke="#e3e7ec" strokeWidth="1.1" />
      </g>
    ),
  },
  {
    key: "daisy",
    label: "Pressed daisy",
    viewBox: [64, 90],
    draw: () => (
      <>
        <path d="M32 40 C30 58 34 72 30 88" stroke="#6f8f4e" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M31 66 C22 60 16 62 12 66 C20 70 26 70 31 66 Z" fill="#7fa05a" />
        {Array.from({ length: 12 }, (_, i) => (
          <ellipse key={i} cx="32" cy="17" rx="4.6" ry="12" fill="#fffdf6" stroke="#d9d2c0" strokeWidth="0.8" transform={`rotate(${i * 30} 32 30)`} />
        ))}
        <circle cx="32" cy="30" r="7" fill="#e8b531" />
        <circle cx="30" cy="28" r="2.2" fill="#f4cf5e" />
      </>
    ),
  },
  {
    key: "leaf",
    label: "Pressed leaf",
    viewBox: [56, 90],
    draw: () => (
      <>
        <path d="M28 4 C52 22 52 60 28 80 C4 60 4 22 28 4 Z" fill="#8aa35e" />
        <path d="M28 6 V88" stroke="#5f7a3c" strokeWidth="1.6" strokeLinecap="round" />
        {[20, 32, 44, 56].map((y) => (
          <path key={y} d={`M28 ${y + 8} L${y < 40 ? 16 : 14} ${y} M28 ${y + 8} L${y < 40 ? 40 : 42} ${y}`} stroke="#5f7a3c" strokeWidth="1.1" fill="none" strokeLinecap="round" />
        ))}
      </>
    ),
  },
  {
    key: "inkblot",
    label: "Ink blot",
    viewBox: [80, 70],
    draw: () => (
      <g fill={ACCENT}>
        <path d="M38 8 C48 6 52 16 60 16 C70 16 74 28 68 36 C64 42 72 50 64 56 C56 62 50 54 42 60 C32 66 22 60 22 52 C22 46 12 46 12 36 C12 26 22 26 24 18 C26 10 32 9 38 8 Z" />
        <circle cx="74" cy="12" r="3.4" />
        <circle cx="8" cy="58" r="2.6" />
        <circle cx="66" cy="64" r="2" />
        <circle cx="16" cy="14" r="1.8" />
      </g>
    ),
  },
  {
    key: "heart",
    label: "Heart",
    viewBox: [64, 58],
    draw: () => (
      <>
        <path d="M32 54 C14 42 4 32 4 19 C4 9 12 3 20 3 C26 3 30 7 32 12 C34 7 38 3 44 3 C52 3 60 9 60 19 C60 32 50 42 32 54 Z" fill={ACCENT} />
        <path d="M14 14 C16 10 20 9 23 10" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  {
    key: "star",
    label: "Gold star",
    viewBox: [64, 62],
    draw: () => (
      <path
        d="M32 3 L40 22 L60 23 L44 36 L50 57 L32 45 L14 57 L20 36 L4 23 L24 22 Z"
        fill="#e7b43c"
        stroke="#b8862a"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    ),
  },
  {
    key: "ticket",
    label: "Ticket stub",
    viewBox: [110, 52],
    draw: () => (
      <>
        <path d="M0 0 H110 V18 A8 8 0 0 0 110 34 V52 H0 V34 A8 8 0 0 0 0 18 Z" fill="#f2d7a6" />
        <path d="M80 4 V48" stroke="#b9925a" strokeWidth="1.2" strokeDasharray="3 3" />
        <text x="40" y="24" textAnchor="middle" fontFamily="Georgia, serif" fontSize="11" letterSpacing="1.5" fill="#6b4b1f">ADMIT</text>
        <text x="40" y="38" textAnchor="middle" fontFamily="Georgia, serif" fontSize="11" letterSpacing="1.5" fill="#6b4b1f">ONE</text>
        <text x="95" y="30" textAnchor="middle" fontFamily="Georgia, serif" fontSize="9" fill="#6b4b1f" transform="rotate(-90 95 27)">No 27</text>
      </>
    ),
  },
];

const KEEPSAKES: StickerDef[] = [
  {
    key: "wax-seal",
    label: "Wax seal",
    viewBox: [72, 72],
    draw: () => (
      <>
        <path d="M36 3 C44 2 48 8 55 9 C63 11 64 19 68 25 C72 32 68 38 69 45 C70 54 62 57 57 63 C51 70 44 67 36 70 C28 72 22 66 15 63 C7 59 6 51 4 44 C2 36 6 30 6 23 C7 14 15 12 21 8 C26 4 30 4 36 3 Z" fill="#9e2a2b" />
        <circle cx="36" cy="36" r="20" fill="none" stroke="#7b1f20" strokeWidth="2.4" />
        <circle cx="36" cy="36" r="17" fill="#b33637" />
        <text x="36" y="45" textAnchor="middle" fontFamily="Georgia, serif" fontSize="24" fontStyle="italic" fill="#7b1f20">I</text>
        <path d="M18 22 C22 16 28 14 32 14" stroke="#fff" strokeOpacity="0.35" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  {
    key: "photo-corner",
    label: "Gilded corner",
    viewBox: [56, 56],
    draw: () => (
      <>
        <path d="M0 0 H56 L0 56 Z" fill="#c9a24a" />
        <path d="M6 6 H42 L6 42 Z" fill="none" stroke="#f1d78f" strokeWidth="1.4" />
        <path d="M0 0 H56 L0 56 Z" fill="none" stroke="#8f6c21" strokeWidth="1" />
      </>
    ),
  },
  {
    key: "rose",
    label: "Pressed rose",
    viewBox: [70, 96],
    draw: () => (
      <>
        <path d="M35 44 C33 62 37 78 33 94" stroke="#5f7a3c" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M34 70 C24 62 14 64 10 70 C20 76 28 75 34 70 Z" fill="#7fa05a" />
        <path d="M36 60 C46 52 56 54 60 60 C50 66 42 65 36 60 Z" fill="#7fa05a" />
        <circle cx="35" cy="26" r="22" fill="#c5485d" />
        <path d="M35 10 C46 12 50 22 46 30 C42 38 30 38 26 30 C22 22 28 16 35 18 C41 20 42 28 36 30" fill="none" stroke="#8e2b3d" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M16 22 C14 32 20 42 30 46 M54 22 C56 32 50 42 40 46" fill="none" stroke="#a63a4f" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  {
    key: "moon",
    label: "Moon and stars",
    viewBox: [80, 72],
    draw: () => (
      <>
        <path d="M44 6 C26 8 14 22 14 38 C14 56 30 68 48 66 C38 62 30 52 30 38 C30 24 36 12 44 6 Z" fill="#e7c25b" />
        <path d="M62 14 L64.5 20 L71 20.5 L66 24.5 L67.5 31 L62 27.5 L56.5 31 L58 24.5 L53 20.5 L59.5 20 Z" fill="#e7c25b" />
        <path d="M68 44 L69.4 47.4 L73 47.6 L70.2 49.8 L71 53.4 L68 51.4 L65 53.4 L65.8 49.8 L63 47.6 L66.6 47.4 Z" fill="#e7c25b" />
      </>
    ),
  },
  {
    key: "par-avion",
    label: "Par avion label",
    viewBox: [120, 48],
    draw: () => (
      <>
        <rect x="1" y="1" width="118" height="46" rx="3" fill="#2f5596" />
        <rect x="5" y="5" width="110" height="38" rx="2" fill={PAPER} />
        <text x="60" y="23" textAnchor="middle" fontFamily="Georgia, serif" fontSize="13" fontWeight="bold" letterSpacing="2" fill="#2f5596">PAR AVION</text>
        <text x="60" y="36" textAnchor="middle" fontFamily="Georgia, serif" fontSize="8.5" letterSpacing="1.5" fill="#2f5596">BY AIR MAIL</text>
      </>
    ),
  },
  {
    key: "butterfly",
    label: "Butterfly",
    viewBox: [80, 64],
    draw: () => (
      <>
        <path d="M39 30 C30 8 8 2 6 14 C4 26 18 32 38 33 Z" fill={ACCENT} />
        <path d="M41 30 C50 8 72 2 74 14 C76 26 62 32 42 33 Z" fill={ACCENT} />
        <path d="M38 34 C24 36 12 46 18 54 C24 60 34 50 39 38 Z" fill={ACCENT} opacity="0.75" />
        <path d="M42 34 C56 36 68 46 62 54 C56 60 46 50 41 38 Z" fill={ACCENT} opacity="0.75" />
        <circle cx="16" cy="16" r="3" fill="#fff" opacity="0.55" />
        <circle cx="64" cy="16" r="3" fill="#fff" opacity="0.55" />
        <rect x="38.5" y="20" width="3" height="28" rx="1.5" fill={INK} />
        <path d="M40 21 C38 14 34 10 31 9 M40 21 C42 14 46 10 49 9" stroke={INK} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </>
    ),
  },
];

export const STICKER_PACKS: StickerPack[] = [
  { id: "desk", label: "Desk drawer", blurb: "Stamps, tape, pressed flowers and doodles.", plus: false, stickers: DESK },
  { id: "keepsakes", label: "Keepsakes", blurb: "Wax seals, gilded corners and more.", plus: true, stickers: KEEPSAKES },
];

const BY_KEY = new Map(STICKER_PACKS.flatMap((p) => p.stickers.map((s) => [s.key, { def: s, plus: p.plus }] as const)));

export function stickerDef(key: string): StickerDef | null {
  return BY_KEY.get(key)?.def ?? null;
}

export function isPlusSticker(key: string): boolean {
  return BY_KEY.get(key)?.plus ?? false;
}

/** Base width of a sticker at scale 1, in px; never wider than 40% of its card. */
export const STICKER_BASE = 72;

/** One sticker's drawing. */
export function StickerArt({ def }: { def: StickerDef }) {
  return (
    <svg viewBox={`0 0 ${def.viewBox[0]} ${def.viewBox[1]}`} width="100%" height="100%" aria-hidden="true" focusable="false" style={{ display: "block", overflow: "visible" }}>
      {def.draw()}
    </svg>
  );
}
