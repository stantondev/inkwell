#!/usr/bin/env node
/**
 * Fetches the files for "Find the subject" in the sticker maker into
 * public/cutout/, so readers' browsers load them from Inkwell and not from a
 * third party. Runs before `dev` and `build`.
 *
 * What it fetches is pinned in cutout-resources.json (IMG.LY's open-source
 * background-removal model, the small "isnet_quint8" one, ~44 MB, and the
 * single-threaded ONNX runtime, ~12 MB). Every piece is named by its SHA-256
 * and checked against it, so a changed or tampered file is refused.
 *
 * A download failure warns and exits 0 so a CDN outage can't block a deploy;
 * the sticker maker then says the subject finder isn't available. Set
 * CUTOUT_REQUIRED=1 to make it fail instead.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/";
const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "cutout-resources.json"), "utf8"));
const out = join(here, "..", "public", "cutout");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function present(chunk) {
  const file = join(out, chunk.name);
  if (!existsSync(file)) return false;
  const buf = readFileSync(file);
  return buf.length === chunk.offsets[1] - chunk.offsets[0] && sha256(buf) === chunk.hash;
}

async function download(chunk) {
  const res = await fetch(SOURCE + chunk.name);
  if (!res.ok) throw new Error(`${chunk.name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== chunk.hash) throw new Error(`${chunk.name}: checksum doesn't match`);
  const tmp = join(out, `${chunk.name}.part`);
  writeFileSync(tmp, buf);
  renameSync(tmp, join(out, chunk.name));
  return buf.length;
}

async function main() {
  mkdirSync(out, { recursive: true });
  const chunks = Object.values(manifest).flatMap((entry) => entry.chunks);
  const missing = chunks.filter((c) => !present(c));
  if (missing.length === 0) {
    writeFileSync(join(out, "resources.json"), JSON.stringify(manifest));
    return;
  }
  console.log(`[cutout] fetching ${missing.length} of ${chunks.length} model pieces…`);
  let bytes = 0;
  // A few at a time: each piece is up to 4 MB.
  for (let i = 0; i < missing.length; i += 4) {
    const sizes = await Promise.all(missing.slice(i, i + 4).map(download));
    bytes += sizes.reduce((a, b) => a + b, 0);
  }
  // Written last, so a half-finished download never looks complete.
  writeFileSync(join(out, "resources.json"), JSON.stringify(manifest));
  console.log(`[cutout] done (${(bytes / 1e6).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.warn(`[cutout] couldn't fetch the subject finder's model: ${err.message}`);
  if (process.env.CUTOUT_REQUIRED === "1") process.exit(1);
});
