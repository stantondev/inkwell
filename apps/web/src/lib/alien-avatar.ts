/**
 * Inkwell alien avatars — a hand-drawn, composable SVG avatar system.
 *
 * Replaces the DiceBear dependency. Everything here is pure string building:
 * no runtime deps, works on the server, and the output feeds the same
 * renderSvgToDataUri() canvas step the previous builder used.
 *
 * Two styles share one storage shape ({ style, options }):
 *   portrait — head + eyes + antennae + mouth + literary prop (reads at 24px)
 *   scene    — a full illustration; swappable skin + background only
 *
 * All art is drawn on a 120x120 viewBox. Avatars render inside a circular
 * crop, so anything outside radius 60 from (60,60) is cut — keep detail
 * inside that circle. When an avatar frame is applied the whole image is
 * scaled into the frame's inner circle, so composition is unaffected.
 */

export const ALIEN_INK = "#1a2744"; // --ink-midnight

export interface AlienAvatarOptions {
  [key: string]: string;
}
const PAPER = "#fdfaf3";
const WAX = "#b8434f";
const FLAME = "#e8a33d";

export interface AlienPaletteEntry {
  label: string;
  hex: string;
}

export const ALIEN_SKINS: Record<string, AlienPaletteEntry> = {
  sage: { label: "Sage", hex: "#a8c5a0" },
  moss: { label: "Moss", hex: "#b8c4b0" },
  mint: { label: "Mint", hex: "#9fc3bd" },
  sky: { label: "Sky", hex: "#a9c8e0" },
  lilac: { label: "Lilac", hex: "#c3b1d9" },
  blush: { label: "Blush", hex: "#e8b4b8" },
  butter: { label: "Butter", hex: "#e8d5a0" },
  clay: { label: "Clay", hex: "#c9b8a8" },
};

export const ALIEN_BGS: Record<string, AlienPaletteEntry> = {
  parchment: { label: "Parchment", hex: "#f3e9db" },
  cream: { label: "Cream", hex: "#faf3e6" },
  oat: { label: "Oat", hex: "#ece0cd" },
  dusk: { label: "Dusk", hex: "#dfd3c3" },
  sage: { label: "Sage wash", hex: "#e4ebdf" },
  ink: { label: "Ink wash", hex: "#dbe2ef" },
};

interface HeadDef {
  label: string;
  path: string;
  eyeY: number;
  topY: number;
}

export const ALIEN_HEADS: Record<string, HeadDef> = {
  teardrop: {
    label: "Teardrop",
    path: "M60 15 C83 15 96 32 96 51 C96 67 85 81 72 89 C67 92 53 92 48 89 C35 81 24 67 24 51 C24 32 37 15 60 15Z",
    eyeY: 50,
    topY: 15,
  },
  bulb: {
    label: "Bulb",
    path: "M60 16 C84 16 98 34 98 56 C98 78 82 94 60 94 C38 94 22 78 22 56 C22 34 36 16 60 16Z",
    eyeY: 52,
    topY: 16,
  },
  dome: {
    label: "Dome",
    path: "M60 10 C80 10 92 27 92 47 C92 63 86 79 76 89 C70 95 50 95 44 89 C34 79 28 63 28 47 C28 27 40 10 60 10Z",
    eyeY: 48,
    topY: 10,
  },
  pear: {
    label: "Pear",
    path: "M60 18 C76 18 87 31 89 47 C91 66 80 93 60 93 C40 93 29 66 31 47 C33 31 44 18 60 18Z",
    eyeY: 52,
    topY: 18,
  },
  lantern: {
    label: "Lantern",
    path: "M60 14 C80 14 93 26 93 42 C93 54 90 64 86 74 C82 85 72 92 60 92 C48 92 38 85 34 74 C30 64 27 54 27 42 C27 26 40 14 60 14Z",
    eyeY: 48,
    topY: 14,
  },
};

const hl = (x: number, y: number, r = 2.9) =>
  `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.75}" fill="#fff" opacity=".92"/>`;

export const ALIEN_EYES: Record<string, { label: string; render: (y: number) => string }> = {
  almond: {
    label: "Almond",
    render: (y) => `
      <ellipse cx="45" cy="${y}" rx="12" ry="8.5" transform="rotate(-18 45 ${y})" fill="${ALIEN_INK}"/>
      <ellipse cx="75" cy="${y}" rx="12" ry="8.5" transform="rotate(18 75 ${y})" fill="${ALIEN_INK}"/>
      ${hl(41, y - 4, 3.2)}${hl(71, y - 4, 3.2)}`,
  },
  round: {
    label: "Round",
    render: (y) => `
      <circle cx="46" cy="${y}" r="9.5" fill="${ALIEN_INK}"/><circle cx="74" cy="${y}" r="9.5" fill="${ALIEN_INK}"/>
      ${hl(42.5, y - 3.4)}${hl(70.5, y - 3.4)}`,
  },
  wonder: {
    label: "Wonder",
    render: (y) => `
      <circle cx="45" cy="${y}" r="12" fill="#fff" stroke="${ALIEN_INK}" stroke-width="2.6"/>
      <circle cx="75" cy="${y}" r="12" fill="#fff" stroke="${ALIEN_INK}" stroke-width="2.6"/>
      <circle cx="47" cy="${y + 1}" r="6" fill="${ALIEN_INK}"/><circle cx="73" cy="${y + 1}" r="6" fill="${ALIEN_INK}"/>
      ${hl(44.6, y - 1.6, 2.2)}${hl(70.6, y - 1.6, 2.2)}`,
  },
  content: {
    label: "Content",
    render: (y) => `
      <path d="M34 ${y + 2} q11.5 -11 23 0" fill="none" stroke="${ALIEN_INK}" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M63 ${y + 2} q11.5 -11 23 0" fill="none" stroke="${ALIEN_INK}" stroke-width="3.4" stroke-linecap="round"/>`,
  },
  three: {
    label: "Three",
    render: (y) => `
      <circle cx="60" cy="${y - 7}" r="10.5" fill="${ALIEN_INK}"/>${hl(56.6, y - 10.4, 3.2)}
      <circle cx="39" cy="${y + 10}" r="7.2" fill="${ALIEN_INK}"/>${hl(36.6, y + 7.6, 2.2)}
      <circle cx="81" cy="${y + 10}" r="7.2" fill="${ALIEN_INK}"/>${hl(78.6, y + 7.6, 2.2)}`,
  },
  four: {
    label: "Four",
    render: (y) => `
      <circle cx="43" cy="${y - 7}" r="7.2" fill="${ALIEN_INK}"/><circle cx="77" cy="${y - 7}" r="7.2" fill="${ALIEN_INK}"/>
      <circle cx="48" cy="${y + 9}" r="4.6" fill="${ALIEN_INK}"/><circle cx="72" cy="${y + 9}" r="4.6" fill="${ALIEN_INK}"/>
      ${hl(40.6, y - 9.6, 2.4)}${hl(74.6, y - 9.6, 2.4)}`,
  },
  wink: {
    label: "Wink",
    render: (y) => `
      <ellipse cx="45" cy="${y}" rx="12" ry="8.5" transform="rotate(-18 45 ${y})" fill="${ALIEN_INK}"/>
      ${hl(41, y - 4, 3.2)}
      <path d="M63 ${y + 2} q11.5 -11 23 0" fill="none" stroke="${ALIEN_INK}" stroke-width="3.4" stroke-linecap="round"/>`,
  },
};

const stalk = (d: string) =>
  `<path d="${d}" fill="none" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linecap="round"/>`;
const bulbTip = (x: number, y: number, skin: string, r = 4) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${skin}" stroke="${ALIEN_INK}" stroke-width="2.2"/>`;

export const ALIEN_ANTENNAE: Record<
  string,
  { label: string; render: (skin: string, topY: number) => string }
> = {
  pair: {
    label: "Pair",
    render: (skin, t) =>
      stalk(`M47 ${t + 9} C42 ${t - 2} 37 ${t - 6} 34 ${t - 8}`) + bulbTip(33, t - 9, skin) +
      stalk(`M73 ${t + 9} C78 ${t - 2} 83 ${t - 6} 86 ${t - 8}`) + bulbTip(87, t - 9, skin),
  },
  curl: {
    label: "Curl",
    render: (_skin, t) => stalk(`M58 ${t + 4} C48 ${t - 6} 40 ${t - 4} 38 ${t - 12} C37 ${t - 18} 45 ${t - 19} 45 ${t - 13}`),
  },
  quill: {
    label: "Quill",
    render: () =>
      stalk("M86 94 L99 52") +
      `<path d="M101 34 C92 40 89 52 95 61 C104 55 108 41 101 34Z" fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
      `<path d="M99 52 L96 58" stroke="${ALIEN_INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  },
  stalks: {
    label: "Eye stalks",
    render: (skin, t) =>
      stalk(`M46 ${t + 4} C38 ${t - 8} 30 ${t - 13} 25 ${t - 16}`) +
      `<circle cx="23" cy="${t - 17}" r="7" fill="${skin}" stroke="${ALIEN_INK}" stroke-width="2.4"/><circle cx="21.5" cy="${t - 17}" r="3" fill="${ALIEN_INK}"/>` +
      stalk(`M74 ${t + 4} C82 ${t - 8} 90 ${t - 13} 95 ${t - 16}`) +
      `<circle cx="97" cy="${t - 17}" r="7" fill="${skin}" stroke="${ALIEN_INK}" stroke-width="2.4"/><circle cx="98.5" cy="${t - 17}" r="3" fill="${ALIEN_INK}"/>`,
  },
  none: { label: "None", render: () => "" },
};

export const ALIEN_MOUTHS: Record<string, { label: string; render: (y: number) => string }> = {
  smile: {
    label: "Smile",
    render: (y) => `<path d="M54 ${y} q6 5 12 0" fill="none" stroke="${ALIEN_INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  },
  grin: {
    label: "Grin",
    render: (y) => `<path d="M48 ${y - 2} q12 11 24 0" fill="none" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linecap="round"/>`,
  },
  o: { label: "Oh", render: (y) => `<ellipse cx="60" cy="${y + 1}" rx="4" ry="4.8" fill="${ALIEN_INK}"/>` },
  wave: {
    label: "Wavy",
    render: (y) => `<path d="M51 ${y} q4.5 -4 9 0 t9 0" fill="none" stroke="${ALIEN_INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  },
  none: { label: "None", render: () => "" },
};

/** Perforation punch-outs along a rect, drawn in the background colour. */
function perforate(x: number, y: number, w: number, h: number, bg: string, step = 6, r = 2.1) {
  let out = "";
  for (let i = 0; i <= Math.round(w / step); i++) {
    const cx = x + (i * w) / Math.round(w / step);
    out += `<circle cx="${cx.toFixed(1)}" cy="${y}" r="${r}" fill="${bg}"/><circle cx="${cx.toFixed(1)}" cy="${y + h}" r="${r}" fill="${bg}"/>`;
  }
  for (let i = 0; i <= Math.round(h / step); i++) {
    const cy = y + (i * h) / Math.round(h / step);
    out += `<circle cx="${x}" cy="${cy.toFixed(1)}" r="${r}" fill="${bg}"/><circle cx="${x + w}" cy="${cy.toFixed(1)}" r="${r}" fill="${bg}"/>`;
  }
  return out;
}

export const ALIEN_PROPS: Record<
  string,
  { label: string; render: (y: number, bg: string, skin: string) => string }
> = {
  none: { label: "None", render: () => "" },
  glasses: {
    label: "Reading glasses",
    render: (y) => `
      <circle cx="45" cy="${y}" r="13.5" fill="none" stroke="${ALIEN_INK}" stroke-width="2.6"/>
      <circle cx="75" cy="${y}" r="13.5" fill="none" stroke="${ALIEN_INK}" stroke-width="2.6"/>
      <path d="M58.5 ${y} h3" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linecap="round"/>`,
  },
  monocle: {
    label: "Monocle",
    render: (y) => `
      <circle cx="76" cy="${y - 4}" r="14" fill="none" stroke="${ALIEN_INK}" stroke-width="2.8"/>
      <path d="M82 ${y + 8} C88 ${y + 18} 86 ${y + 26} 78 ${y + 30}" fill="none" stroke="${ALIEN_INK}" stroke-width="2" stroke-linecap="round"/>`,
  },
  book: {
    label: "Open book",
    render: () => `
      <path d="M6 100 C25 90 46 91 60 98 C74 91 95 90 114 100 L114 116 C95 106 74 105 60 112 C46 105 25 106 6 116 Z"
            fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2.7" stroke-linejoin="round"/>
      <path d="M60 98 L60 112" stroke="${ALIEN_INK}" stroke-width="2.2"/>
      <path d="M16 103 h28 M76 103 h28" stroke="${ALIEN_INK}" stroke-width="1.9" stroke-linecap="round" opacity=".4"/>`,
  },
  bigbook: {
    label: "Nose in a book",
    render: () => `
      <path d="M0 74 C22 63 46 65 60 76 C74 65 98 63 120 74 L120 120 L0 120 Z"
            fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2.8" stroke-linejoin="round"/>
      <path d="M60 76 L60 120" stroke="${ALIEN_INK}" stroke-width="2.4"/>
      <path d="M12 87 h34 M12 97 h34 M74 87 h34 M74 97 h34" stroke="${ALIEN_INK}" stroke-width="2" stroke-linecap="round" opacity=".4"/>`,
  },
  bookstack: {
    label: "Balanced books",
    render: (_y, _bg, skin) => `
      <path d="M28 22 L86 22 L86 32 L28 32Z" fill="${WAX}" stroke="${ALIEN_INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M33 12 L81 12 L81 22 L33 22Z" fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M38 3 L76 3 L76 12 L38 12Z" fill="${skin}" stroke="${ALIEN_INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M32 27 h50 M37 17 h40" stroke="${ALIEN_INK}" stroke-width="1.6" opacity=".35" stroke-linecap="round"/>`,
  },
  tea: {
    label: "Tea",
    render: () => `
      <path d="M40 96 q6 -7 0 -13 M60 96 q6 -7 0 -13 M80 96 q6 -7 0 -13"
            fill="none" stroke="${ALIEN_INK}" stroke-width="2.1" stroke-linecap="round" opacity=".55"/>
      <path d="M36 100 L84 100 L81 114 C80 119 40 119 39 114 Z" fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2.7" stroke-linejoin="round"/>
      <path d="M84 103 q10 4 -1 10" fill="none" stroke="${ALIEN_INK}" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M30 118 h60" stroke="${ALIEN_INK}" stroke-width="2.5" stroke-linecap="round"/>`,
  },
  scarf: {
    label: "Scarf",
    render: () => `
      <path d="M26 99 C40 90 80 90 94 99 C94 110 84 115 60 115 C36 115 26 110 26 99Z"
            fill="${WAX}" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M74 108 L82 120 L95 118 L86 105" fill="${WAX}" stroke="${ALIEN_INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
  },
  candle: {
    label: "Candlelight",
    render: () => `
      <path d="M74 106 L74 84 L90 84 L90 106Z" fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M68 106 h28" stroke="${ALIEN_INK}" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M82 84 L82 78" stroke="${ALIEN_INK}" stroke-width="2"/>
      <path d="M82 76 C87 71 86 64 82 60 C78 64 77 71 82 76Z" fill="${FLAME}" stroke="${ALIEN_INK}" stroke-width="2.2" stroke-linejoin="round"/>`,
  },
  letter: {
    label: "Sealed letter",
    render: () => `
      <path d="M22 96 L98 96 L98 120 L22 120Z" fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2.7" stroke-linejoin="round"/>
      <path d="M22 96 L60 114 L98 96" fill="none" stroke="${ALIEN_INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <circle cx="60" cy="111" r="6.5" fill="${WAX}" stroke="${ALIEN_INK}" stroke-width="2.2"/>`,
  },

  /* ---- Inkwell-specific ---- */
  stamp: {
    label: "Postage stamp",
    render: (_y, bg) => `
      <path d="M40 72 A26 26 0 0 1 48 114" fill="none" stroke="${ALIEN_INK}" stroke-width="2.2" opacity=".32" stroke-linecap="round"/>
      <path d="M48 70 A22 22 0 0 1 55 108" fill="none" stroke="${ALIEN_INK}" stroke-width="2.2" opacity=".22" stroke-linecap="round"/>
      <g transform="rotate(-6 78 91)">
        <rect x="59" y="72" width="38" height="38" fill="#cfe0ef" stroke="${ALIEN_INK}" stroke-width="2.4"/>
        <rect x="63.5" y="76.5" width="29" height="29" fill="none" stroke="${ALIEN_INK}" stroke-width="1.5" opacity=".45"/>
        ${perforate(59, 72, 38, 38, bg, 9.5, 1.9)}
        <path d="M78 100 C73.5 93 71 87.5 71 84 C71 79.5 85 79.5 85 84 C85 87.5 82.5 93 78 100Z"
              fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2.1" stroke-linejoin="round"/>
        <path d="M78 100 L78 87" stroke="${ALIEN_INK}" stroke-width="1.9" stroke-linecap="round"/>
        <circle cx="78" cy="84" r="2" fill="${ALIEN_INK}"/>
      </g>`,
  },
  inksplat: {
    label: "Ink splatter",
    render: () => `
      <path d="M44 88 C56 86 64 94 62 102 C60 111 48 114 40 109 C31 103 33 90 44 88Z" fill="${ALIEN_INK}" opacity=".88"/>
      <path d="M62 102 C68 104 72 110 69 115 C65 119 59 116 59 111Z" fill="${ALIEN_INK}" opacity=".8"/>
      <circle cx="76" cy="98" r="4.6" fill="${ALIEN_INK}" opacity=".75"/>
      <circle cx="86" cy="92" r="2.6" fill="${ALIEN_INK}" opacity=".6"/>
      <circle cx="30" cy="96" r="3.2" fill="${ALIEN_INK}" opacity=".62"/>
      <circle cx="24" cy="86" r="1.9" fill="${ALIEN_INK}" opacity=".45"/>
      <circle cx="92" cy="82" r="1.7" fill="${ALIEN_INK}" opacity=".4"/>`,
  },
  nibhalo: {
    label: "Nib halo",
    render: () => `
      <ellipse cx="60" cy="10" rx="21" ry="5.6" fill="none" stroke="${FLAME}" stroke-width="3"/>
      <path d="M60 19 C56 14 54.5 11 54.5 8.6 C54.5 4.6 65.5 4.6 65.5 8.6 C65.5 11 64 14 60 19Z" fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M60 19 L60 11" stroke="${ALIEN_INK}" stroke-width="1.7" stroke-linecap="round"/>
      <circle cx="36" cy="10" r="2.1" fill="${ALIEN_INK}" opacity=".55"/><circle cx="84" cy="10" r="2.1" fill="${ALIEN_INK}" opacity=".55"/>`,
  },
  nib: {
    label: "Dip pen",
    render: () => `
      <path d="M103 50 L110 57 L81 97 L73 90 Z" fill="#8c6a52" stroke="${ALIEN_INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M81 97 L73 90 L57 114 Z" fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M57 114 L77 94" stroke="${ALIEN_INK}" stroke-width="1.9" stroke-linecap="round"/>
      <circle cx="77.5" cy="93.5" r="2.3" fill="none" stroke="${ALIEN_INK}" stroke-width="1.8"/>`,
  },
};

/* ------------------------------------------------------------------ */
/* Scenes                                                              */
/* ------------------------------------------------------------------ */

/**
 * The seated alien in a scene is the SAME character as the portrait builder —
 * same head, eyes, antennae and expression — just smaller and seated, so
 * switching styles never changes who you are.
 *
 * Portrait parts are authored around a nominal head centre of (60, 54) in the
 * 120-box; anchoring there keeps every head shape sitting on the same neck.
 * `vector-effect: non-scaling-stroke` stops the shrink from thinning the ink
 * lines away to nothing against the scene's furniture.
 */
const SCENE_HEAD_ANCHOR_Y = 54;

/** Props worn on the face follow you into a scene; the scene supplies the rest. */
const FACE_PROPS = new Set(["glasses", "monocle"]);

function sceneCharacter(
  options: AlienAvatarOptions,
  skin: string,
  cx: number,
  cy: number,
  s: number
) {
  const head = ALIEN_HEADS[options.head] ?? ALIEN_HEADS.teardrop;
  const eyes = ALIEN_EYES[options.eyes] ?? ALIEN_EYES.almond;
  const antenna = ALIEN_ANTENNAE[options.antenna] ?? ALIEN_ANTENNAE.pair;
  const mouth = ALIEN_MOUTHS[options.mouth] ?? ALIEN_MOUTHS.smile;
  const faceProp = FACE_PROPS.has(options.prop) ? ALIEN_PROPS[options.prop] : null;

  const inner =
    antenna.render(skin, head.topY) +
    `<path d="${head.path}" fill="${skin}" stroke="${ALIEN_INK}" stroke-width="2.8" stroke-linejoin="round"/>` +
    eyes.render(head.eyeY) +
    mouth.render(head.eyeY + 21) +
    (faceProp ? faceProp.render(head.eyeY, "", skin) : "");

  return `<g vector-effect="non-scaling-stroke" transform="translate(${(cx - 60 * s).toFixed(2)} ${(cy - SCENE_HEAD_ANCHOR_Y * s).toFixed(2)}) scale(${s})" style="vector-effect:non-scaling-stroke">${inner}</g>`;
}

const limb = (d: string, skin: string, w = 9) =>
  `<path d="${d}" fill="none" stroke="${ALIEN_INK}" stroke-width="${w + 3}" stroke-linecap="round"/>` +
  `<path d="${d}" fill="none" stroke="${skin}" stroke-width="${w}" stroke-linecap="round"/>`;

const openBook = (x: number, y: number, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-24 2 C-14 -4 -6 -2 0 4 C6 -2 14 -4 24 2 L24 16 C14 10 6 12 0 18 C-6 12 -14 10 -24 16Z"
          fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M0 4 L0 18" stroke="${ALIEN_INK}" stroke-width="2.1"/>
    <path d="M-19 6 h13 M6 6 h13" stroke="${ALIEN_INK}" stroke-width="1.7" stroke-linecap="round" opacity=".38"/>
  </g>`;

export const ALIEN_SCENES: Record<
  string,
  { label: string; render: (options: AlienAvatarOptions, skin: string, bg: string) => string }
> = {
  armchair: {
    label: "The armchair",
    render: (options, skin) => `
      <path d="M20 112 L20 50 C20 32 37 22 60 22 C83 22 100 32 100 50 L100 112Z" fill="#8c6a52" stroke="${ALIEN_INK}" stroke-width="2.8" stroke-linejoin="round"/>
      <path d="M28 108 L28 52 C28 40 41 32 60 32 C79 32 92 40 92 52 L92 108Z" fill="#a8806a" stroke="${ALIEN_INK}" stroke-width="2.2"/>
      <path d="M8 112 L8 80 C8 72 22 72 22 80 L22 112Z" fill="#8c6a52" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M98 112 L98 80 C98 72 112 72 112 80 L112 112Z" fill="#8c6a52" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linejoin="round"/>
      ${sceneCharacter(options, skin, 60, 42, 0.53)}
      <path d="M47 66 C47 62 73 62 73 66 L77 92 L43 92Z" fill="${skin}" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linejoin="round"/>
      ${limb("M45 90 C38 99 38 106 42 112", skin, 9)}
      ${limb("M48 94 C62 100 78 96 86 88", skin, 10)}
      <circle cx="88" cy="86" r="6" fill="${skin}" stroke="${ALIEN_INK}" stroke-width="2.4"/>
      ${openBook(60, 68, 0.94)}`,
  },
  desk: {
    label: "The writing desk",
    render: (options, skin) => `
      ${sceneCharacter(options, skin, 58, 32, 0.50)}
      <path d="M45 54 C45 50 71 50 71 54 L75 80 L41 80Z" fill="${skin}" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linejoin="round"/>
      ${limb("M72 62 C84 65 88 72 86 78", skin, 8)}
      <path d="M2 82 L118 82 L118 92 L2 92Z" fill="#8c6a52" stroke="${ALIEN_INK}" stroke-width="2.7" stroke-linejoin="round"/>
      <path d="M14 92 L14 116 M106 92 L106 116" stroke="${ALIEN_INK}" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M24 70 L56 70 L56 82 L24 82Z" fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2.3" stroke-linejoin="round"/>
      <path d="M30 74 h20 M30 78 h13" stroke="${ALIEN_INK}" stroke-width="1.7" opacity=".45" stroke-linecap="round"/>
      <path d="M78 82 L78 73 C78 69 94 69 94 73 L94 82Z" fill="#2d4a8a" stroke="${ALIEN_INK}" stroke-width="2.3" stroke-linejoin="round"/>
      <path d="M86 70 L86 64" stroke="${ALIEN_INK}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M104 40 L88 68" stroke="${ALIEN_INK}" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M106 38 C97 44 94 56 100 65 C109 59 113 45 106 38Z" fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2.5" stroke-linejoin="round"/>`,
  },
  nook: {
    label: "The window seat",
    render: (options, skin) => `
      <path d="M22 8 L98 8 L98 76 L22 76Z" fill="#cfe0ef" stroke="${ALIEN_INK}" stroke-width="2.8" stroke-linejoin="round"/>
      <path d="M60 8 L60 76 M22 42 L98 42" stroke="${ALIEN_INK}" stroke-width="2.4"/>
      <circle cx="80" cy="25" r="9" fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2.2"/>
      <circle cx="36" cy="22" r="1.8" fill="${ALIEN_INK}" opacity=".5"/><circle cx="45" cy="31" r="1.4" fill="${ALIEN_INK}" opacity=".4"/>
      <path d="M6 76 L114 76 L114 88 L6 88Z" fill="#a8806a" stroke="${ALIEN_INK}" stroke-width="2.7" stroke-linejoin="round"/>
      ${sceneCharacter(options, skin, 46, 46, 0.49)}
      <path d="M34 66 C34 62 58 62 58 66 L61 88 L31 88Z" fill="${skin}" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linejoin="round"/>
      ${limb("M60 80 C74 82 84 80 92 76", skin, 9)}
      ${openBook(76, 70, 0.8)}
      <path d="M18 88 L102 88 C106 88 106 101 102 101 L18 101 C14 101 14 88 18 88Z" fill="${WAX}" stroke="${ALIEN_INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M60 89 L60 100" stroke="${ALIEN_INK}" stroke-width="1.8" opacity=".45"/>`,
  },
  stack: {
    label: "On a stack of books",
    render: (options, skin) => `
      <path d="M18 112 L102 112 L102 120 L18 120Z" fill="${WAX}" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M22 100 L98 100 L98 112 L22 112Z" fill="#7f9bc4" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M26 88 L94 88 L94 100 L26 100Z" fill="${PAPER}" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M30 76 L90 76 L90 88 L30 88Z" fill="#a8806a" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M28 106 h64 M32 94 h56 M36 82 h48" stroke="${ALIEN_INK}" stroke-width="1.7" opacity=".3" stroke-linecap="round"/>
      ${sceneCharacter(options, skin, 60, 28, 0.49)}
      <path d="M48 50 C48 46 72 46 72 50 L75 76 L45 76Z" fill="${skin}" stroke="${ALIEN_INK}" stroke-width="2.6" stroke-linejoin="round"/>
      ${limb("M47 74 C40 80 38 84 40 88", skin, 8)}
      ${limb("M73 74 C80 80 82 84 80 88", skin, 8)}
      ${openBook(60, 56, 0.86)}`,
  },
};

/* ------------------------------------------------------------------ */

const HALO_PROPS = new Set(["nibhalo", "bookstack"]);

/**
 * Build the avatar SVG for a stored { style, options } config.
 * Unknown keys fall back to the first defined option, so a config saved
 * by an older build (or the retired DiceBear styles) still renders.
 */
export function buildAlienSvg(style: string, options: AlienAvatarOptions): string {
  const skinKey = options.skin in ALIEN_SKINS ? options.skin : "sage";
  const bgKey = options.bg in ALIEN_BGS ? options.bg : "parchment";
  const skin = ALIEN_SKINS[skinKey].hex;
  const bg = ALIEN_BGS[bgKey].hex;

  const open = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="${bg}"/>`;

  if (style === "scene") {
    const sceneKey = options.scene in ALIEN_SCENES ? options.scene : "armchair";
    return `${open}${ALIEN_SCENES[sceneKey].render(options, skin, bg)}</svg>`;
  }

  const head = ALIEN_HEADS[options.head] ?? ALIEN_HEADS.teardrop;
  const eyes = ALIEN_EYES[options.eyes] ?? ALIEN_EYES.almond;
  const antenna = ALIEN_ANTENNAE[options.antenna] ?? ALIEN_ANTENNAE.pair;
  const mouth = ALIEN_MOUTHS[options.mouth] ?? ALIEN_MOUTHS.smile;
  const prop = ALIEN_PROPS[options.prop] ?? ALIEN_PROPS.none;

  // Props that sit above the head (halo, balanced books) would be hidden by
  // an antenna drawn over them, so antennae are suppressed for those.
  const antennaSvg = HALO_PROPS.has(options.prop) ? "" : antenna.render(skin, head.topY);

  return (
    open +
    antennaSvg +
    `<path d="${head.path}" fill="${skin}" stroke="${ALIEN_INK}" stroke-width="2.8" stroke-linejoin="round"/>` +
    eyes.render(head.eyeY) +
    mouth.render(head.eyeY + 21) +
    prop.render(head.eyeY, bg, skin) +
    "</svg>"
  );
}
