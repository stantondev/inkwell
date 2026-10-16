// Tests for turning pictures into stickers. Run: npm run test:arrange -w apps/web
import { test } from "node:test";
import assert from "node:assert/strict";

import { backgroundColour, fitWithin, opaqueBounds, removeBackground, type Pixels } from "./sticker-cutout";

/** A w×h picture filled with `bg`, with a `fg` square from (x0,y0) to (x1,y1). */
function picture(w: number, h: number, bg: number[], fg: number[], box: [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
      data.set([...(inside ? fg : bg), 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}
const alpha = (px: Pixels, x: number, y: number) => px.data[(y * px.width + x) * 4 + 3];

test("the background is the colour around the edges", () => {
  assert.deepEqual(backgroundColour(picture(20, 20, [250, 250, 245], [10, 20, 200], [5, 5, 14, 14])), [250, 250, 245]);
  // A subject touching one edge doesn't win.
  assert.deepEqual(backgroundColour(picture(20, 20, [0, 128, 0], [200, 0, 0], [0, 5, 6, 14])), [0, 128, 0]);
});

test("removing the background clears it and keeps the subject", () => {
  const px = picture(30, 30, [255, 255, 255], [40, 60, 160], [10, 10, 19, 19]);
  const out = removeBackground(px, 20);
  assert.equal(alpha(out, 0, 0), 0);
  assert.equal(alpha(out, 5, 25), 0);
  assert.equal(alpha(out, 15, 15), 255);
  assert.deepEqual(opaqueBounds(out), { x: 10, y: 10, w: 10, h: 10 });
  // The original is left alone.
  assert.equal(alpha(px, 0, 0), 255);
});

test("background-coloured parts inside the subject stay", () => {
  // A white square inside a blue ring on a white background.
  const px = picture(30, 30, [255, 255, 255], [30, 30, 200], [5, 5, 24, 24]);
  for (let y = 12; y <= 17; y++) for (let x = 12; x <= 17; x++) px.data.set([255, 255, 255, 255], (y * 30 + x) * 4);
  const out = removeBackground(px, 30);
  assert.equal(alpha(out, 14, 14), 255, "the enclosed white stays");
  assert.equal(alpha(out, 1, 1), 0);
});

test("a nearly-white shadow goes at higher tolerance only", () => {
  const px = picture(20, 20, [255, 255, 255], [20, 20, 20], [8, 8, 11, 11]);
  for (let x = 0; x < 20; x++) px.data.set([225, 225, 225, 255], (19 * 20 + x) * 4); // a grey strip along the bottom
  assert.ok(alpha(removeBackground(px, 5), 3, 19) > 0);
  assert.equal(alpha(removeBackground(px, 40), 3, 19), 0);
});

test("nothing left means no bounds; sizes fit within the limit", () => {
  const blank = picture(10, 10, [255, 255, 255], [255, 255, 255], [0, 0, -1, -1]);
  assert.equal(opaqueBounds(removeBackground(blank, 20)), null);
  assert.deepEqual(fitWithin(1200, 600, 600), { width: 600, height: 300 });
  assert.deepEqual(fitWithin(300, 900, 600), { width: 200, height: 600 });
  assert.deepEqual(fitWithin(100, 50, 600), { width: 100, height: 50 });
});
