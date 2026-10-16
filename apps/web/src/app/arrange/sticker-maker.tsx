"use client";

/**
 * Making a sticker from a picture: clear a plain background, trim it, add a
 * white die-cut edge, name it, save it to "Your stickers". All the picture
 * work happens here in the browser (lib/sticker-cutout.ts); the server gets
 * the finished picture.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { OwnSticker } from "@/lib/profile-home";
import { fitWithin, opaqueBounds, removeBackground, type Pixels } from "@/lib/sticker-cutout";
import s from "./arrange.module.css";

const MAX_SIDE = 600;
const PAD = 4;

interface Loaded {
  /** An animated GIF small enough to keep as it is. */
  gif: { dataUrl: string; ratio: number } | null;
  pixels: Pixels | null;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("unreadable"));
    img.src = src;
  });
}

async function load(file: File, maxBytes: number): Promise<Loaded> {
  const url = await readAsDataUrl(file);
  const img = await loadImage(url);
  if (file.type === "image/gif" && file.size <= maxBytes) {
    return { gif: { dataUrl: url, ratio: img.naturalWidth / img.naturalHeight }, pixels: null };
  }
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height);
  return { gif: null, pixels: { width, height, data: data.data } };
}

/** The finished sticker on a canvas: background cleared (if asked) and trimmed. */
function render(pixels: Pixels, cut: boolean, tolerance: number): HTMLCanvasElement | null {
  const px = cut ? removeBackground(pixels, tolerance) : pixels;
  const box = cut ? opaqueBounds(px) : { x: 0, y: 0, w: px.width, h: px.height };
  if (!box) return null;
  const pad = cut ? PAD : 0;
  const canvas = document.createElement("canvas");
  canvas.width = box.w + pad * 2;
  canvas.height = box.h + pad * 2;
  const ctx = canvas.getContext("2d")!;
  const full = new ImageData(new Uint8ClampedArray(px.data), px.width, px.height);
  ctx.putImageData(full, pad - box.x, pad - box.y, box.x, box.y, box.w, box.h);
  return canvas;
}

function encode(canvas: HTMLCanvasElement, maxBytes: number): string | null {
  const webp = canvas.toDataURL("image/webp", 0.9).startsWith("data:image/webp");
  let current = canvas;
  for (let i = 0; i < 6; i++) {
    const uri = webp ? current.toDataURL("image/webp", 0.88) : current.toDataURL("image/png");
    // base64 is 4/3 the size of the file
    if ((uri.length - uri.indexOf(",") - 1) * 0.75 <= maxBytes) return uri;
    const smaller = document.createElement("canvas");
    smaller.width = Math.max(1, Math.round(current.width * 0.8));
    smaller.height = Math.max(1, Math.round(current.height * 0.8));
    smaller.getContext("2d")!.drawImage(current, 0, 0, smaller.width, smaller.height);
    current = smaller;
  }
  return null;
}

export function StickerMaker({
  file,
  maxBytes,
  onSaved,
  onCancel,
}: {
  file: File;
  maxBytes: number;
  onSaved: (sticker: OwnSticker) => void;
  onCancel: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [cut, setCut] = useState(false);
  const [tolerance, setTolerance] = useState(20);
  const [outline, setOutline] = useState(true);
  const [name, setName] = useState(() => file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").slice(0, 60));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    load(file, maxBytes)
      .then((l) => live && setLoaded(l))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [file, maxBytes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onCancel();
    window.addEventListener("keydown", onKey);
    dialog.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  const result = useMemo(() => {
    if (!loaded?.pixels) return null;
    const canvas = render(loaded.pixels, cut, tolerance);
    return canvas ? { canvas, preview: canvas.toDataURL("image/png") } : null;
  }, [loaded, cut, tolerance]);

  const preview = loaded?.gif?.dataUrl ?? result?.preview ?? null;
  const ratio = loaded?.gif?.ratio ?? (result ? result.canvas.width / result.canvas.height : 1);

  async function save() {
    setError(null);
    const data = loaded?.gif?.dataUrl ?? (result ? encode(result.canvas, maxBytes) : null);
    if (!data) {
      setError("That picture is too big to make into a sticker. Try a smaller one.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/me/stickers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, name, outline, ratio: Math.round(ratio * 1000) / 1000 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't save that sticker. Try again.");
      onSaved(body.data as OwnSticker);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that sticker. Try again.");
      setSaving(false);
    }
  }

  return (
    <>
      <div className={s.sheetBackdrop} onClick={() => !saving && onCancel()} />
      <div className={`${s.sheet} ${s.maker}`} role="dialog" aria-modal="true" aria-label="Make a sticker" tabIndex={-1} ref={dialog} data-sticker-drawer data-sticker-maker>
        <div className={s.trayHead}>
          <h2>Make a sticker</h2>
          <button type="button" className={s.iconBtn} onClick={onCancel} disabled={saving} aria-label="Close">✕</button>
        </div>

        <div className={s.makerStage}>
          {failed ? (
            <p className={s.trayHint}>That picture couldn&apos;t be opened. Try a PNG, JPEG, WebP or GIF.</p>
          ) : !preview ? (
            <p className={s.trayHint}>{loaded ? "Nothing would be left. Lower “How much to remove”." : "Opening your picture…"}</p>
          ) : (
            <span className={`${s.makerPreview} ${outline ? "sticker-outline" : ""}`} style={{ aspectRatio: `${ratio}`, width: `min(190px, ${Math.round(190 * ratio)}px)`, flexShrink: 1, maxWidth: "100%" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Your sticker" className="sticker-picture" />
            </span>
          )}
        </div>

        {loaded?.gif ? (
          <p className={s.trayHint}>Animated GIFs stay just as they are, so their background can&apos;t be removed.</p>
        ) : loaded?.pixels ? (
          <div className={s.makerControls}>
            <label className={s.checkRow}>
              <input type="checkbox" checked={cut} onChange={(e) => setCut(e.target.checked)} />
              <span>
                <strong>Remove the background</strong>
                <span className={s.fieldHint}>Works best on a plain background: a wall, a desk, the sky.</span>
              </span>
            </label>
            {cut && (
              <label className={s.field}>
                <span>How much to remove</span>
                <input type="range" min={3} max={60} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
              </label>
            )}
          </div>
        ) : null}

        <label className={s.checkRow}>
          <input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} />
          <span>
            <strong>White edge</strong>
            <span className={s.fieldHint}>A die-cut border around the shape.</span>
          </span>
        </label>

        <label className={s.field}>
          <span>Name (just for you)</span>
          <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>

        {error && <p className={s.makerError} role="alert">{error}</p>}

        <div className={s.makerActions}>
          <button type="button" className={s.toolBtn} onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className={s.saveBtn} onClick={save} disabled={saving || !preview}>
            {saving ? "Saving…" : "Save sticker"}
          </button>
        </div>
      </div>
    </>
  );
}
