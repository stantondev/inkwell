/// <reference lib="webworker" />
/**
 * The sticker maker's subject finder, off the main thread so the page keeps
 * moving while the model works. Runs IMG.LY's open-source background-removal
 * model (ISNet, the small quantised one) on this device; nothing is uploaded.
 * The model and runtime come from /cutout/ on Inkwell itself.
 */

import { segmentForeground } from "@imgly/background-removal";

interface FindMessage {
  id: number;
  width: number;
  height: number;
  /** RGBA, 4 bytes a pixel. */
  rgba: ArrayBuffer;
  publicPath: string;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (e: MessageEvent<FindMessage>) => {
  const { id, width, height, rgba, publicPath } = e.data;
  try {
    const input = new Blob([rgba], { type: `image/x-rgba8;width=${width};height=${height}` });
    const out = await segmentForeground(input, {
      publicPath,
      model: "isnet_quint8",
      device: "cpu",
      output: { format: "image/x-rgba8", quality: 1 },
      progress: (key, current, total) => {
        if (key.startsWith("fetch:")) scope.postMessage({ id, type: "progress", current, total, key });
      },
    });
    const data = new Uint8Array(await out.arrayBuffer());
    const alpha = new Uint8ClampedArray(width * height);
    for (let p = 0, i = 3; p < alpha.length; p++, i += 4) alpha[p] = data[i];
    scope.postMessage({ id, type: "done", alpha: alpha.buffer }, [alpha.buffer]);
  } catch (err) {
    scope.postMessage({ id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
