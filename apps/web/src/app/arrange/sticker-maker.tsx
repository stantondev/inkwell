"use client";

/**
 * Making a sticker from a picture: cut out what's in it, tidy the edges with
 * a brush, add a white die-cut edge, name it, save it to "Your stickers".
 *
 * Three ways to cut: keep the whole picture; "Find the subject", a model that
 * runs on this device in a worker (lib/subject-finder.ts; the picture is
 * never uploaded for it); or "Plain background", a colour fill from the
 * edges (lib/sticker-cutout.ts). Either cut gives an alpha mask the Erase and
 * Restore brushes then paint on. The server only gets the finished picture.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { OwnSticker } from "@/lib/profile-home";
import {
  alphaOf,
  firmUpAlpha,
  fitWithin,
  keepMainPieces,
  opaqueBounds,
  paintMask,
  removeBackground,
  withAlpha,
  type Pixels,
} from "@/lib/sticker-cutout";
import { findSubject, subjectFinderSupported } from "@/lib/subject-finder";
import s from "./arrange.module.css";

const MAX_SIDE = 600;
const PAD = 4;

type Mode = "whole" | "subject" | "colour";
type Tool = "erase" | "restore";

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

/** The finished sticker on a canvas, trimmed to what's left (null if nothing is). */
function finish(px: Pixels, trim: boolean): HTMLCanvasElement | null {
  const box = trim ? opaqueBounds(px) : { x: 0, y: 0, w: px.width, h: px.height };
  if (!box) return null;
  const pad = trim ? PAD : 0;
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

/** The model's mask, tidied: firm edges, and only the main subject. */
function tidySubject(base: Pixels, mask: Uint8ClampedArray): Uint8ClampedArray {
  return alphaOf(keepMainPieces(firmUpAlpha(withAlpha(base, mask))));
}

type Finding = { state: "idle" } | { state: "working"; downloaded: number | null } | { state: "failed" };

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
  const [mode, setMode] = useState<Mode>("whole");
  const [tolerance, setTolerance] = useState(20);
  /** The model's tidied mask for this picture, kept so switching back is instant. */
  const [subjectMask, setSubjectMask] = useState<Uint8ClampedArray | null>(null);
  const [finding, setFinding] = useState<Finding>({ state: "idle" });
  /** The mask being shown and brushed; null = the whole picture. */
  const [mask, setMask] = useState<Uint8ClampedArray | null>(null);
  /** Bumped on every brush stroke so the canvas redraws (the mask is edited in place). */
  const [strokes, setStrokes] = useState(0);
  const [tool, setTool] = useState<Tool>("erase");
  const [brush, setBrush] = useState(18);
  const [outline, setOutline] = useState(true);
  const [name, setName] = useState(() => file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").slice(0, 60));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const supported = useMemo(() => subjectFinderSupported(), []);
  const base = loaded?.pixels ?? null;

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

  /** The mask a cut starts from, before any brushing. */
  const autoMask = useCallback(
    (m: Mode): Uint8ClampedArray | null => {
      if (!base || m === "whole") return null;
      if (m === "colour") return alphaOf(removeBackground(base, tolerance));
      return subjectMask ? new Uint8ClampedArray(subjectMask) : null;
    },
    [base, tolerance, subjectMask],
  );

  // A new cut (or a new tolerance) starts over from its automatic mask.
  useEffect(() => {
    setMask(mode === "subject" && !subjectMask ? null : autoMask(mode));
  }, [mode, autoMask, subjectMask]);

  async function runFinder() {
    if (!base || finding.state === "working") return;
    setError(null);
    setFinding({ state: "working", downloaded: null });
    try {
      const raw = await findSubject(base, (p) => setFinding({ state: "working", downloaded: p.downloaded }));
      setSubjectMask(tidySubject(base, raw));
      setFinding({ state: "idle" });
    } catch {
      setFinding({ state: "failed" });
    }
  }

  function choose(m: Mode) {
    setMode(m);
    if (m === "subject" && !subjectMask && supported) void runFinder();
  }

  // Draw the picture as it stands onto the stage canvas.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !base) return;
    c.width = base.width;
    c.height = base.height;
    const px = mask ? withAlpha(base, mask) : base;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), 0, 0);
  }, [base, mask, strokes]);

  // ── Brushing ──────────────────────────────────────────────────────────
  const last = useRef<{ x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; r: number } | null>(null);
  const frame = useRef(0);

  function toPixels(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = base ? base.width / rect.width : 1;
    return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k, k, rect };
  }

  function stroke(x: number, y: number, k: number) {
    if (!mask || !base) return;
    const from = last.current ?? { x, y };
    paintMask(mask, base.width, base.height, from.x, from.y, x, y, brush * k, tool === "erase" ? 0 : 255);
    last.current = { x, y };
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        setStrokes((n) => n + 1);
      });
    }
  }

  const brushing = !!mask;

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
          ) : loaded?.gif ? (
            <span className={`${s.makerPreview} ${outline ? "sticker-outline" : ""}`} style={{ aspectRatio: `${loaded.gif.ratio}`, width: `min(220px, ${Math.round(220 * loaded.gif.ratio)}px)`, maxWidth: "100%" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={loaded.gif.dataUrl} alt="Your sticker" className="sticker-picture" />
            </span>
          ) : base ? (
            <span
              className={`${s.makerPreview} ${s.makerCanvasWrap} ${outline && mask ? "sticker-outline" : ""}`}
              style={{ aspectRatio: `${base.width / base.height}`, width: `min(100%, ${Math.round(300 * (base.width / base.height))}px)` }}
            >
              <canvas
                ref={canvas}
                className={`sticker-picture ${brushing ? s.brushable : ""}`}
                aria-label={brushing ? `Your sticker. Drag to ${tool === "erase" ? "erase" : "restore"}.` : "Your sticker"}
                role="img"
                onPointerDown={(e) => {
                  if (!brushing) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const p = toPixels(e);
                  last.current = null;
                  stroke(p.x, p.y, p.k);
                }}
                onPointerMove={(e) => {
                  if (!brushing) return;
                  const p = toPixels(e);
                  setCursor({ x: e.clientX - p.rect.left, y: e.clientY - p.rect.top, r: brush });
                  if (e.buttons & 1 || e.pointerType === "touch") {
                    if (last.current) stroke(p.x, p.y, p.k);
                  }
                }}
                onPointerUp={() => {
                  last.current = null;
                }}
                onPointerLeave={() => setCursor(null)}
                onPointerCancel={() => {
                  last.current = null;
                  setCursor(null);
                }}
              />
              {brushing && cursor && (
                <span
                  className={s.brushCursor}
                  style={{ left: cursor.x, top: cursor.y, width: cursor.r * 2, height: cursor.r * 2 }}
                  aria-hidden="true"
                />
              )}
              {finding.state === "working" && (
                <span className={s.makerBusy} role="status">
                  <span className={s.spinner} aria-hidden="true" />
                  {finding.downloaded !== null
                    ? `Getting the subject finder ready… ${Math.round(finding.downloaded * 100)}%`
                    : "Finding the subject…"}
                </span>
              )}
            </span>
          ) : (
            <p className={s.trayHint}>Opening your picture…</p>
          )}
        </div>

        {loaded?.gif ? (
          <p className={s.trayHint}>Animated GIFs stay just as they are, so they can&apos;t be cut out.</p>
        ) : base ? (
          <div className={s.makerControls}>
            <div className={s.cutChoices} role="radiogroup" aria-label="Cut out">
              {(
                [
                  ["whole", "Whole picture"],
                  ["subject", "Find the subject"],
                  ["colour", "Plain background"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  className={s.cutChoice}
                  disabled={m === "subject" && !supported}
                  onClick={() => choose(m)}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "subject" && (
              <p className={s.fieldHint}>
                {!supported
                  ? "This browser can't run the subject finder. Try “Plain background”, or another browser."
                  : finding.state === "failed"
                    ? <>The subject finder couldn&apos;t start. <button type="button" className={s.linkBtn} onClick={runFinder}>Try again</button></>
                    : <>Runs on your device: your picture isn&apos;t sent anywhere to do this. The first time, it downloads the finder (56 MB). <a href="/ai#subject-finder" target="_blank" rel="noopener">How it works</a></>}
              </p>
            )}
            {mode === "colour" && (
              <label className={s.field}>
                <span>How much to remove</span>
                <input type="range" min={3} max={60} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
                <span className={s.fieldHint}>Clears the colour around the edges: a wall, a desk, the sky.</span>
              </label>
            )}

            {brushing && (
              <div className={s.brushRow}>
                <div className={s.segment} role="group" aria-label="Brush">
                  <button type="button" aria-pressed={tool === "erase"} onClick={() => setTool("erase")}>Erase</button>
                  <button type="button" aria-pressed={tool === "restore"} onClick={() => setTool("restore")}>Restore</button>
                </div>
                <label className={s.brushSize}>
                  <span>Size</span>
                  <input type="range" min={4} max={48} value={brush} onChange={(e) => setBrush(Number(e.target.value))} aria-label="Brush size" />
                </label>
                <button type="button" className={s.linkBtn} onClick={() => setMask(autoMask(mode))}>Start over</button>
              </div>
            )}
            {brushing && <p className={s.fieldHint}>Brush over any bits that shouldn&apos;t be there, or bring back bits that went missing.</p>}
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
          <button
            type="button"
            className={s.saveBtn}
            onClick={save}
            disabled={saving || failed || !loaded || finding.state === "working" || (mode === "subject" && !mask)}
          >
            {saving ? "Saving…" : "Save sticker"}
          </button>
        </div>
      </div>
    </>
  );

  async function save() {
    setError(null);
    let data: string | null = null;
    let ratio = 1;
    if (loaded?.gif) {
      data = loaded.gif.dataUrl;
      ratio = loaded.gif.ratio;
    } else if (base) {
      const done = finish(mask ? withAlpha(base, mask) : base, !!mask);
      if (!done) {
        setError("Nothing would be left. Restore some of the picture, or keep the whole thing.");
        return;
      }
      data = encode(done, maxBytes);
      ratio = done.width / done.height;
    }
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
}
