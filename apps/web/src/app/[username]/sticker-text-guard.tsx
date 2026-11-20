"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps stickers off a card's words on narrow screens.
 *
 * Stickers are placed on a wide screen, where a card's text leaves room
 * beside it. On a phone the same text runs the full width of the card, so a
 * sticker that sat in the margin lands on top of a line. Below 640px this
 * moves any sticker that covers text or a button to the nearest spot on the
 * card where it covers nothing (or, failing that, the least), and puts it
 * back when the screen is wide again. The saved arrangement never changes.
 */
const PHONE = "(max-width: 639px)";
const STEP = 6;

type Rect = { l: number; t: number; r: number; b: number };

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Rects (relative to the host) of the words and controls a sticker shouldn't cover. */
function obstacles(host: HTMLElement, origin: DOMRect): Rect[] {
  const out: Rect[] = [];
  const add = (r: DOMRect) => {
    if (r.width < 1 || r.height < 1) return;
    out.push({ l: r.left - origin.left, t: r.top - origin.top, r: r.right - origin.left, b: r.bottom - origin.top });
  };
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest(".sticker-layer") || !n.textContent?.trim()
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    range.selectNodeContents(n);
    for (const r of Array.from(range.getClientRects())) add(r);
  }
  for (const el of Array.from(host.querySelectorAll<HTMLElement>("a, button, input, textarea, select, svg"))) {
    if (el.closest(".sticker-layer")) continue;
    add(el.getBoundingClientRect());
  }
  return out;
}

function place(host: HTMLElement) {
  const stickers = Array.from(host.querySelectorAll<HTMLElement>(".sticker-layer > .sticker"));
  for (const s of stickers) {
    s.style.left = s.dataset.origLeft ?? s.style.left;
    s.style.top = s.dataset.origTop ?? s.style.top;
  }
  if (!window.matchMedia(PHONE).matches) return;

  const origin = host.getBoundingClientRect();
  const blocks = obstacles(host, origin);
  if (blocks.length === 0) return;
  const W = origin.width;
  const H = origin.height;

  for (const s of stickers) {
    const box = s.getBoundingClientRect();
    const w = box.width;
    const h = box.height;
    const cx = box.left + w / 2 - origin.left;
    const cy = box.top + h / 2 - origin.top;
    const cost = (x: number, y: number) => {
      const r = { l: x - w / 2, t: y - h / 2, r: x + w / 2, b: y + h / 2 };
      let sum = 0;
      for (const o of blocks) sum += overlap(r, o);
      return sum;
    };
    const start = cost(cx, cy);
    if (start === 0) continue;

    // Search the card (letting a sticker hang a little past its edge, as
    // writers often place them) for the spot nearest the original that
    // covers the least.
    let best = { x: cx, y: cy, c: start, d: 0 };
    const minX = w * 0.15, maxX = W - w * 0.15;
    const minY = Math.min(cy, h * 0.15), maxY = Math.max(cy, H - h * 0.15);
    for (let x = minX; x <= maxX; x += STEP) {
      for (let y = minY; y <= maxY; y += STEP) {
        const c = cost(x, y);
        const d = Math.hypot(x - cx, y - cy);
        if (c < best.c || (c === best.c && d < best.d)) best = { x, y, c, d };
      }
    }
    if (best.d === 0) continue;
    if (s.dataset.origLeft === undefined) {
      s.dataset.origLeft = s.style.left;
      s.dataset.origTop = s.style.top;
    }
    s.style.left = `${best.x}px`;
    s.style.top = `${best.y}px`;
  }
}

export function StickerTextGuard() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = ref.current?.closest<HTMLElement>(".sticker-host");
    if (!host) return;
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => place(host));
    };
    run();
    // Fonts and pictures change where the words wrap.
    document.fonts?.ready.then(run).catch(() => {});
    const ro = new ResizeObserver(run);
    ro.observe(host);
    const mq = window.matchMedia(PHONE);
    mq.addEventListener("change", run);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mq.removeEventListener("change", run);
    };
  }, []);
  return <span ref={ref} hidden />;
}
