/**
 * Server-side image conversion with sharp (already a dependency; its prebuilt
 * libvips reads AVIF, WebP and GIF). Route handlers only: never import this
 * from client code.
 *
 * Used where a reader can't take what's stored: AVIF entry images for clients
 * that don't ask for AVIF (older browsers, email, fediverse servers), and
 * share-preview cards, which can only draw PNG and JPEG. Returns null if sharp
 * is unavailable or the file can't be read, so callers can fall back.
 */

type Sharp = typeof import("sharp");
let sharpPromise: Promise<Sharp | null> | null = null;

function loadSharp(): Promise<Sharp | null> {
  if (!sharpPromise) {
    sharpPromise = import("sharp")
      .then((m) => {
        const sharp = (m.default ?? m) as Sharp;
        // One conversion at a time on these small machines.
        sharp.concurrency(1);
        sharp.cache(false);
        return sharp;
      })
      .catch((err) => {
        console.error("[image-convert] sharp unavailable:", err);
        return null;
      });
  }
  return sharpPromise;
}

// Recently converted files, so a burst of requests for the same image (a
// fediverse post fanning out, a newsletter being opened) converts it once.
const MAX_CACHED = 32;
const cache = new Map<string, Buffer>();

export async function toJpeg(
  input: Buffer,
  cacheKey?: string,
  maxDimension?: number
): Promise<Buffer | null> {
  if (cacheKey) {
    const hit = cache.get(cacheKey);
    if (hit) {
      cache.delete(cacheKey);
      cache.set(cacheKey, hit);
      return hit;
    }
  }

  const sharp = await loadSharp();
  if (!sharp) return null;

  try {
    const out = await sharp(input, { limitInputPixels: 40_000_000, animated: false })
      .rotate()
      .resize(maxDimension ? { width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true } : undefined)
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    if (cacheKey) {
      cache.set(cacheKey, out);
      if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
    }
    return out;
  } catch (err) {
    console.error("[image-convert] could not convert image:", err);
    return null;
  }
}
