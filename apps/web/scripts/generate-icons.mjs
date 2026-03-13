#!/usr/bin/env node
/**
 * One-time script to generate PNG icons from favicon.svg for PWA.
 * Run: node apps/web/scripts/generate-icons.mjs
 */
import sharp from "sharp";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const svgPath = join(publicDir, "favicon.svg");
const outDir = join(publicDir, "icons");

const svgBuffer = readFileSync(svgPath);

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

// Standard icons (transparent background)
for (const size of SIZES) {
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon-${size}x${size}.png`));
  console.log(`  ✓ icon-${size}x${size}.png`);
}

// Apple touch icon (180x180 with cream background for iOS rounded corners)
const APPLE_SIZE = 180;
const CREAM = { r: 250, g: 248, b: 245, alpha: 1 }; // #faf8f5

await sharp({
  create: {
    width: APPLE_SIZE,
    height: APPLE_SIZE,
    channels: 4,
    background: CREAM,
  },
})
  .composite([
    {
      input: await sharp(svgBuffer)
        .resize(Math.round(APPLE_SIZE * 0.75), Math.round(APPLE_SIZE * 0.75))
        .png()
        .toBuffer(),
      gravity: "centre",
    },
  ])
  .png()
  .toFile(join(outDir, "apple-touch-icon.png"));
console.log(`  ✓ apple-touch-icon.png (${APPLE_SIZE}x${APPLE_SIZE})`);

console.log("\nDone! Icons written to apps/web/public/icons/");
