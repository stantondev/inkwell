// Tearing a letter into pieces for the Dead Letter Office.
//
// The sheet is cut along a jittered grid. Every inner edge is a ragged line
// shared by the two pieces on either side of it, so the pieces fit back
// together exactly. All coordinates are in sheet pixels (the sheet is drawn at
// a fixed logical size and scaled to fit the desk).

export interface Pt {
  x: number;
  y: number;
}

export interface Piece {
  id: number;
  row: number;
  col: number;
  polygon: Pt[];
  centroid: Pt;
}

/** Where a piece sits relative to its home: home is {x: 0, y: 0, turns: 0}. */
export interface PiecePose {
  x: number;
  y: number;
  /** Quarter turns, 0–3. */
  turns: number;
  /** A small tilt (degrees) that goes away once the piece is placed. */
  tilt: number;
}

/** A small seeded random number generator (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A ragged tear from a to b, endpoints included. The offset wanders like a
 * real tear (a damped random walk plus fibres) and fades to nothing at both
 * ends so neighbouring edges meet cleanly at the corners.
 */
export function raggedEdge(a: Pt, b: Pt, rand: () => number, amplitude = 7): Pt[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(4, Math.round(len / 9));
  const nx = -dy / len;
  const ny = dx / len;
  const pts: Pt[] = [{ ...a }];
  let walk = 0;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    walk = walk * 0.72 + (rand() - 0.5) * amplitude * 0.9;
    const fibre = (rand() - 0.5) * amplitude * 0.35;
    const envelope = Math.min(1, Math.sin(Math.PI * t) * 2.2);
    const off = Math.max(-amplitude, Math.min(amplitude, walk + fibre)) * envelope;
    pts.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
  }
  pts.push({ ...b });
  return pts;
}

function straight(a: Pt, b: Pt): Pt[] {
  return [{ ...a }, { ...b }];
}

export function polygonArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

export function polygonCentroid(poly: Pt[]): Pt {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  a /= 2;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Tear a w × h sheet into rows × cols pieces. Same seed, same tears. */
export function tearSheet(
  w: number,
  h: number,
  { rows = 3, cols = 2, seed = 1, amplitude = 7 }: { rows?: number; cols?: number; seed?: number; amplitude?: number } = {},
): Piece[] {
  const rand = seeded(seed);
  const cw = w / cols;
  const rh = h / rows;

  // Grid corners: inner corners wander a little; corners on the sheet's edge
  // stay on the edge.
  const nodes: Pt[][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: Pt[] = [];
    for (let c = 0; c <= cols; c++) {
      const onLeftRight = c === 0 || c === cols;
      const onTopBottom = r === 0 || r === rows;
      const jx = onLeftRight ? 0 : (rand() - 0.5) * cw * 0.28;
      const jy = onTopBottom ? 0 : (rand() - 0.5) * rh * 0.28;
      row.push({ x: c * cw + jx, y: r * rh + jy });
    }
    nodes.push(row);
  }

  // h[r][c]: from nodes[r][c] to nodes[r][c+1]; v[r][c]: nodes[r][c] → nodes[r+1][c].
  const hEdges: Pt[][][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: Pt[][] = [];
    for (let c = 0; c < cols; c++) {
      const inner = r > 0 && r < rows;
      row.push(inner ? raggedEdge(nodes[r][c], nodes[r][c + 1], rand, amplitude) : straight(nodes[r][c], nodes[r][c + 1]));
    }
    hEdges.push(row);
  }
  const vEdges: Pt[][][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Pt[][] = [];
    for (let c = 0; c <= cols; c++) {
      const inner = c > 0 && c < cols;
      row.push(inner ? raggedEdge(nodes[r][c], nodes[r + 1][c], rand, amplitude) : straight(nodes[r][c], nodes[r + 1][c]));
    }
    vEdges.push(row);
  }

  const pieces: Piece[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const top = hEdges[r][c];
      const right = vEdges[r][c + 1];
      const bottom = [...hEdges[r + 1][c]].reverse();
      const left = [...vEdges[r][c]].reverse();
      const polygon = [...top, ...right.slice(1), ...bottom.slice(1), ...left.slice(1, -1)];
      pieces.push({ id: r * cols + c, row: r, col: c, polygon, centroid: polygonCentroid(polygon) });
    }
  }
  return pieces;
}

/** CSS clip-path for a piece, in sheet pixels. */
export function clipPathOf(piece: Piece): string {
  return `polygon(${piece.polygon.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(", ")})`;
}

/**
 * Spread the pieces over the desk, which runs from (left, top) to
 * (right, bottom) in sheet coordinates (it may reach well beyond the sheet).
 * Each piece gets a random quarter turn (a third of them upright) and a tilt.
 * No piece starts in, or very near, its home.
 */
export function scatter(
  pieces: Piece[],
  desk: { left: number; top: number; right: number; bottom: number },
  seed: number,
  opts: { turns?: "none" | "some" | "all" } = {},
): PiecePose[] {
  const n = pieces.length;
  const cols = Math.ceil(Math.sqrt(n * ((desk.right - desk.left) / Math.max(1, desk.bottom - desk.top))));
  const rows = Math.ceil(n / cols);
  const slotW = (desk.right - desk.left) / cols;
  const slotH = (desk.bottom - desk.top) / rows;
  const slots: Pt[] = [];
  for (let s = 0; s < n; s++) {
    slots.push({ x: desk.left + (s % cols + 0.5) * slotW, y: desk.top + (Math.floor(s / cols) + 0.5) * slotH });
  }
  return scatterToSlots(pieces, slots, seed, { ...opts, jitter: { x: slotW * 0.17, y: slotH * 0.17 } });
}

/**
 * Put each piece's middle on one of `slots` (shuffled), with a little jitter
 * and a tilt. `turns`: "none" keeps every piece upright, "some" turns about two
 * in three, "all" turns every one.
 */
export function scatterToSlots(
  pieces: Piece[],
  slots: Pt[],
  seed: number,
  { turns = "some", jitter = { x: 20, y: 20 } }: { turns?: "none" | "some" | "all"; jitter?: { x: number; y: number } } = {},
): PiecePose[] {
  const rand = seeded(seed * 7919 + 13);
  // Shuffle the slots so neighbours don't land beside each other.
  const order = slots.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  return pieces.map((piece, i) => {
    const slot = slots[order[i % order.length]];
    const sx = slot.x + (rand() - 0.5) * 2 * jitter.x;
    const sy = slot.y + (rand() - 0.5) * 2 * jitter.y;
    let x = sx - piece.centroid.x;
    let y = sy - piece.centroid.y;
    // Never start already home.
    if (Math.hypot(x, y) < 60) {
      x += 80 * (rand() < 0.5 ? -1 : 1);
      y += 60;
    }
    const turned = turns === "all" || (turns === "some" && rand() > 0.34);
    const t = turned ? 1 + Math.floor(rand() * 3) : 0;
    const tilt = (rand() - 0.5) * 24;
    return { x, y, turns: t, tilt };
  });
}

/** How close (sheet px) a piece must be dropped to its home to settle in. */
export const SNAP_DISTANCE = 34;

/** A piece settles when it's upright and dropped near home. */
export function settles(pose: PiecePose, distance = SNAP_DISTANCE): boolean {
  return ((pose.turns % 4) + 4) % 4 === 0 && Math.hypot(pose.x, pose.y) <= distance;
}
