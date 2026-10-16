/**
 * Turning a picture into a sticker, in the browser: clearing a plain
 * background and trimming the empty space around what's left. No AI, just
 * colour: it removes the background colour that touches the picture's edges
 * (a white wall, a desk, the sky), the way a magic-wand tool does.
 */

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, 4 bytes a pixel, as in ImageData. */
  data: Uint8ClampedArray;
}

const MAX_DISTANCE = Math.sqrt(3 * 255 * 255);

/**
 * The background colour: the most common colour along the picture's edges
 * (grouped coarsely, then averaged), so a subject touching one edge doesn't
 * decide it.
 */
export function backgroundColour(px: Pixels): [number, number, number] {
  const { width: w, height: h, data: d } = px;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (d[i + 3] < 10) return;
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += d[i];
    bucket.g += d[i + 1];
    bucket.b += d[i + 2];
    buckets.set(key, bucket);
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    add(0, y);
    add(w - 1, y);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) if (!best || bucket.n > best.n) best = bucket;
  if (!best) return [255, 255, 255];
  return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
}

/**
 * A copy of the picture with the background cleared. `tolerance` (0–100) is
 * how different from the background colour a pixel may be and still go.
 * Only background connected to the edges goes, so a white shirt in the
 * middle of a white-walled photo stays. The cut has a soft edge.
 */
export function removeBackground(px: Pixels, tolerance: number): Pixels {
  const { width: w, height: h } = px;
  const src = px.data;
  const data = new Uint8ClampedArray(src);
  const [br, bg, bb] = backgroundColour(px);
  const limit = (Math.max(1, Math.min(100, tolerance)) / 100) * MAX_DISTANCE * 0.6;
  const soft = limit * 0.65;

  const dist = (p: number) => {
    const i = p * 4;
    if (src[i + 3] < 10) return 0; // already see-through
    return Math.sqrt((src[i] - br) ** 2 + (src[i + 1] - bg) ** 2 + (src[i + 2] - bb) ** 2);
  };

  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const push = (p: number) => {
    if (seen[p]) return;
    seen[p] = 1;
    if (dist(p) <= limit) queue[tail++] = p;
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const d = dist(p);
    // Fully clear well inside the tolerance; fade out near its edge.
    const keep = d <= soft ? 0 : (d - soft) / (limit - soft);
    data[p * 4 + 3] = Math.round(src[p * 4 + 3] * keep);
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  return { width: w, height: h, data };
}

/** The box around everything that isn't see-through, or null if nothing is left. */
export function opaqueBounds(px: Pixels, threshold = 12): { x: number; y: number; w: number; h: number } | null {
  const { width: w, height: h, data: d } = px;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Width and height for a picture scaled to fit within `max` on its longer side. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
