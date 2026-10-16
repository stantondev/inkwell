/**
 * "Find the subject" for the sticker maker: asks a model running in a worker
 * on this device which pixels are the thing in the picture. Returns an alpha
 * mask (one byte a pixel, 255 = keep). The first use downloads the model
 * (~56 MB, from Inkwell); the browser caches it after that.
 */

import type { Pixels } from "./sticker-cutout";

export interface FindProgress {
  /** 0–1 while downloading the model; null once it's thinking. */
  downloaded: number | null;
}

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./subject-finder.worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

/** Whether this browser can run it at all. */
export function subjectFinderSupported(): boolean {
  return typeof Worker !== "undefined" && typeof WebAssembly !== "undefined" && typeof OffscreenCanvas !== "undefined";
}

export function findSubject(px: Pixels, onProgress?: (p: FindProgress) => void): Promise<Uint8ClampedArray> {
  const w = getWorker();
  const id = nextId++;
  // Two files download at once (model and runtime); show their total.
  const fetched = new Map<string, [number, number]>();
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.id !== id) return;
      if (msg.type === "progress") {
        fetched.set(msg.key, [msg.current, msg.total]);
        let cur = 0;
        let total = 0;
        for (const [c, t] of fetched.values()) {
          cur += c;
          total += t;
        }
        // The runtime only starts downloading after the model, so keep the
        // bar from jumping back by counting it in from the start.
        const done = cur / Math.max(total, 56_000_000);
        onProgress?.({ downloaded: done >= 0.999 ? null : done });
        return;
      }
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      if (msg.type === "done") {
        resolve(new Uint8ClampedArray(msg.alpha));
      } else {
        // The library remembers a failed start forever; begin again next time.
        w.terminate();
        worker = null;
        reject(new Error(msg.message || "failed"));
      }
    };
    // A worker that couldn't start (blocked, or its script failed to load).
    const onError = () => {
      w.removeEventListener("message", onMessage);
      w.terminate();
      worker = null;
      reject(new Error("worker failed"));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError, { once: true });
    const rgba = new Uint8ClampedArray(px.data).buffer;
    w.postMessage(
      { id, width: px.width, height: px.height, rgba, publicPath: `${location.origin}/cutout/` },
      [rgba],
    );
  });
}
