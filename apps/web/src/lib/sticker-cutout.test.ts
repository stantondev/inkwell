// Tests for turning pictures into stickers. Run: npm run test:arrange -w apps/web
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  alphaOf,
  backgroundColour,
  firmUpAlpha,
  fitWithin,
  keepMainPieces,
  opaqueBounds,
  paintMask,
  removeBackground,
  withAlpha,
  type Pixels,
} from "./sticker-cutout";

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

/** A w×h picture whose alpha is given per pixel (colour is grey). */
function withAlphas(w: number, h: number, a: (x: number, y: number) => number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([128, 128, 128, a(x, y)], (y * w + x) * 4);
  return { width: w, height: h, data };
}

test("firming up clears the haze and makes the subject solid", () => {
  const px = withAlphas(5, 1, (x) => [0, 60, 135, 200, 255][x]);
  const out = firmUpAlpha(px);
  assert.deepEqual([0, 1, 2, 3, 4].map((x) => alpha(out, x, 0)), [0, 0, 128, 255, 255]);
  // the original is untouched
  assert.equal(alpha(px, 1, 0), 60);
});

test("keeping the main pieces drops specks but keeps a second big piece", () => {
  // a 10×10 subject, a 6×6 second subject (36% of it), a 2×2 speck (4%)
  const px = withAlphas(40, 20, (x, y) =>
    (x < 10 && y < 10) || (x >= 20 && x < 26 && y < 6) || (x >= 35 && x < 37 && y >= 15 && y < 17) ? 255 : 0,
  );
  const out = keepMainPieces(px);
  assert.equal(alpha(out, 5, 5), 255);
  assert.equal(alpha(out, 22, 3), 255);
  assert.equal(alpha(out, 35, 15), 0);
  // pieces touching only at a corner are one piece
  const diagonal = keepMainPieces(withAlphas(10, 10, (x, y) => (x === y ? 255 : 0)));
  assert.equal(alpha(diagonal, 9, 9), 255);
});

test("a mask can be read off a picture and put back on it", () => {
  const px = withAlphas(3, 2, (x, y) => x * 50 + y);
  const mask = alphaOf(px);
  assert.deepEqual([...mask], [0, 50, 100, 1, 51, 101]);
  mask[0] = 255;
  const out = withAlpha(px, mask);
  assert.equal(alpha(out, 0, 0), 255);
  assert.equal(out.data[0], 128); // colour kept
  assert.equal(alpha(px, 0, 0), 0); // original untouched
});

test("the brush erases and restores along a stroke, softly at the rim", () => {
  const w = 40;
  const h = 20;
  const mask = new Uint8ClampedArray(w * h).fill(255);
  paintMask(mask, w, h, 5, 10, 35, 10, 4, 0);
  const at = (x: number, y: number) => mask[y * w + x];
  // erased all along the line, not just at its ends
  for (const x of [5, 12, 20, 28, 35]) assert.equal(at(x, 10), 0);
  // the rim fades, and outside the brush nothing changes
  assert.ok(at(20, 13) > 0 && at(20, 13) < 255, `rim ${at(20, 13)}`);
  assert.equal(at(20, 16), 255);
  assert.equal(at(0, 0), 255);
  // restoring brings it back
  paintMask(mask, w, h, 5, 10, 35, 10, 4, 255);
  assert.equal(at(20, 10), 255);
  // a stroke off the edge of the picture doesn't throw or wrap round
  paintMask(mask, w, h, -10, -10, 2, 2, 6, 0);
  assert.equal(at(0, 0), 0);
  assert.equal(at(w - 1, 0), 255);
});
