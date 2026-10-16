"use client";

/**
 * Stickers in Arrange my page: the drawer they're picked from, placing one on
 * a card, and moving, turning, resizing and removing it.
 *
 * Like dragging blocks, every gesture redraws the page from the state it
 * started from (a preview) and goes into Undo once, when the finger or button
 * lifts. Where a sticker lands is read from the page under the pointer
 * (`[data-sticker-host]`), so it can't feed back into itself.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import type { ProfileHome, ProfileSticker } from "@/lib/profile-home";
import {
  MAX_STICKERS,
  addSticker,
  placeOn,
  raiseSticker,
  removeSticker,
  updateSticker,
} from "@/lib/home-edit";
import { STICKER_PACKS, StickerArt, isPlusSticker, stickerDef } from "@/lib/stickers";
import { stickerBoxStyle } from "@/app/[username]/sticker-layer";
import s from "./arrange.module.css";

export interface StickerEditing {
  selected: string | null;
  placing: string | null;
  draggingId: string | null;
  isPlus: boolean;
  select: (id: string | null) => void;
  startPlacing: (key: string) => void;
  cancelPlacing: () => void;
  /** Sticks the sticker being placed on the card under (x, y); false if there's no card there. */
  placeAt: (x: number, y: number) => boolean;
  onStickerPointerDown: (e: React.PointerEvent<HTMLElement>, st: ProfileSticker) => void;
  onHandlePointerDown: (e: React.PointerEvent<HTMLElement>, st: ProfileSticker) => void;
  onStickerKeyDown: (e: React.KeyboardEvent<HTMLElement>, st: ProfileSticker) => void;
  turn: (id: string, by: number) => void;
  grow: (id: string, by: number) => void;
  toFront: (id: string) => void;
  remove: (id: string) => void;
}

/** The card under a point on screen that a sticker can go on. */
function hostAt(x: number, y: number): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const host = (el as HTMLElement).closest?.<HTMLElement>("[data-sticker-host]");
    if (host) return host;
  }
  return null;
}

function placeOnHost(host: HTMLElement, x: number, y: number) {
  return placeOn(host.getBoundingClientRect(), x, y);
}

/** Scrolls the window while a sticker is held near the top or bottom of the screen. */
function edgeSpeed(y: number): number {
  const top = 96;
  const bottom = window.innerHeight - 72;
  if (y < top) return -Math.ceil((top - y) / 5);
  if (y > bottom) return Math.ceil((y - bottom) / 5);
  return 0;
}

export function useStickerEditing({
  getHome,
  commit,
  preview,
  isPlus,
  note,
}: {
  getHome: () => ProfileHome;
  commit: (next: ProfileHome, before?: ProfileHome) => void;
  preview: (home: ProfileHome) => void;
  isPlus: boolean;
  note: (text: string) => void;
}): StickerEditing {
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  // Escape stops placing or lets go of the sticker; a press anywhere but a
  // sticker or its bar lets go too.
  useEffect(() => {
    if (!selected && !placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPlacing(null);
      setSelected(null);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-sticker-id], [data-sticker-bar], [data-sticker-drawer]")) return;
      if (placing) return;
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [selected, placing]);

  const placeAt = useCallback(
    (x: number, y: number) => {
      if (!placing) return false;
      const host = hostAt(x, y);
      if (!host?.dataset.stickerHost) return false;
      const home = getHome();
      if (home.stickers.length >= MAX_STICKERS) {
        note(`A page holds up to ${MAX_STICKERS} stickers. Take one off to add another.`);
        setPlacing(null);
        return true;
      }
      const id = `k-${Math.random().toString(36).slice(2, 10)}`;
      // A little tilt, the way stickers go on by hand.
      const rotate = Math.round(Math.random() * 14 - 7);
      const next = addSticker(home, { id, key: placing, anchor: host.dataset.stickerHost, ...placeOnHost(host, x, y), rotate, scale: 1 });
      if (next === home) return false;
      commit(next);
      setPlacing(null);
      setSelected(id);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-sticker-id="${id}"]`)?.focus({ preventScroll: true }));
      return true;
    },
    [placing, getHome, commit, note],
  );

  const onStickerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, st: ProfileSticker) => {
      if (e.button !== 0 || placing) return;
      e.preventDefault();
      e.stopPropagation();
      setSelected(st.id);
      e.currentTarget.focus({ preventScroll: true });

      const before = getHome();
      const r = e.currentTarget.getBoundingClientRect();
      // Keep the sticker where it was grabbed, not centred on the pointer.
      const off = { x: r.left + r.width / 2 - e.clientX, y: r.top + r.height / 2 - e.clientY };
      const start = { x: e.clientX, y: e.clientY };
      let pointer = { ...start };
      let moved = false;
      let last = before;
      let speed = 0;
      let frame = 0;
      // Off every card (over a block's buttons, past an edge), it stays with
      // the card it was last on and hangs off that card's edge.
      let lastHost = e.currentTarget.closest<HTMLElement>("[data-sticker-host]");

      const place = () => {
        const under = hostAt(pointer.x, pointer.y);
        const host = under?.dataset.stickerHost ? under : lastHost?.isConnected ? lastHost : null;
        if (!host?.dataset.stickerHost) return;
        lastHost = host;
        const pos = placeOnHost(host, pointer.x + off.x, pointer.y + off.y);
        last = updateSticker(before, st.id, { anchor: host.dataset.stickerHost, ...pos });
        preview(last);
      };
      const scroll = () => {
        frame = 0;
        if (!speed) return;
        window.scrollBy(0, speed);
        place();
        frame = requestAnimationFrame(scroll);
      };
      const move = (ev: PointerEvent) => {
        pointer = { x: ev.clientX, y: ev.clientY };
        if (!moved) {
          if (Math.hypot(pointer.x - start.x, pointer.y - start.y) < 4) return;
          moved = true;
          setDraggingId(st.id);
        }
        place();
        speed = edgeSpeed(pointer.y);
        if (speed && !frame) frame = requestAnimationFrame(scroll);
      };
      const end = () => {
        cleanup.current?.();
        if (moved && last !== before) commit(last, before);
      };
      cleanup.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        if (frame) cancelAnimationFrame(frame);
        cleanup.current = null;
        setDraggingId(null);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [placing, getHome, preview, commit],
  );

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, st: ProfileSticker) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const box = e.currentTarget.closest<HTMLElement>("[data-sticker-id]");
      if (!box) return;
      const r = box.getBoundingClientRect();
      const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const a0 = Math.atan2(e.clientY - c.y, e.clientX - c.x);
      const d0 = Math.max(8, Math.hypot(e.clientX - c.x, e.clientY - c.y));
      const before = getHome();
      let last = before;

      const move = (ev: PointerEvent) => {
        const a = Math.atan2(ev.clientY - c.y, ev.clientX - c.x);
        let rotate = st.rotate + ((a - a0) * 180) / Math.PI;
        if (ev.shiftKey) rotate = Math.round(rotate / 15) * 15;
        const scale = st.scale * (Math.hypot(ev.clientX - c.x, ev.clientY - c.y) / d0);
        last = updateSticker(before, st.id, { rotate, scale });
        preview(last);
      };
      const end = () => {
        cleanup.current?.();
        if (last !== before) commit(last, before);
      };
      cleanup.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        cleanup.current = null;
        setDraggingId(null);
      };
      setDraggingId(st.id);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [getHome, preview, commit],
  );

  const change = useCallback(
    (id: string, patch: (st: ProfileSticker) => Partial<ProfileSticker>) => {
      const home = getHome();
      const st = home.stickers.find((x) => x.id === id);
      if (st) commit(updateSticker(home, id, patch(st)));
    },
    [getHome, commit],
  );

  const turn = useCallback((id: string, by: number) => change(id, (st) => ({ rotate: st.rotate + by })), [change]);
  const grow = useCallback((id: string, by: number) => change(id, (st) => ({ scale: st.scale + by })), [change]);
  const toFront = useCallback((id: string) => commit(raiseSticker(getHome(), id)), [commit, getHome]);
  const remove = useCallback(
    (id: string) => {
      commit(removeSticker(getHome(), id));
      setSelected(null);
    },
    [commit, getHome],
  );

  const onStickerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>, st: ProfileSticker) => {
      const big = e.shiftKey ? 5 : 1;
      const yStep = st.edge === "free" ? 1 : 2;
      const by: Partial<Record<string, () => void>> = {
        ArrowLeft: () => change(st.id, (x) => ({ x: x.x - big })),
        ArrowRight: () => change(st.id, (x) => ({ x: x.x + big })),
        ArrowUp: () => change(st.id, (x) => ({ y: x.y - yStep * big })),
        ArrowDown: () => change(st.id, (x) => ({ y: x.y + yStep * big })),
        "[": () => turn(st.id, e.shiftKey ? -15 : -5),
        "]": () => turn(st.id, e.shiftKey ? 15 : 5),
        "-": () => grow(st.id, -0.1),
        "=": () => grow(st.id, 0.1),
        "+": () => grow(st.id, 0.1),
        Delete: () => remove(st.id),
        Backspace: () => remove(st.id),
      };
      const fn = by[e.key];
      if (!fn) return;
      e.preventDefault();
      e.stopPropagation();
      fn();
    },
    [change, turn, grow, remove],
  );

  return {
    selected,
    placing,
    draggingId,
    isPlus,
    select: setSelected,
    startPlacing: (key: string) => {
      setSelected(null);
      setPlacing(key);
    },
    cancelPlacing: () => setPlacing(null),
    placeAt,
    onStickerPointerDown,
    onHandlePointerDown,
    onStickerKeyDown,
    turn,
    grow,
    toFront,
    remove,
  };
}

/** The stickers on one card in the editor: the same places as on the page, but you can pick them up. */
export function EditorStickers({ stickers, editing }: { stickers: ProfileSticker[]; editing: StickerEditing }) {
  if (stickers.length === 0) return null;
  return (
    <div className={s.stickerLayer}>
      {stickers.map((st) => {
        const def = stickerDef(st.key);
        if (!def) return null;
        const locked = !editing.isPlus && isPlusSticker(st.key);
        const isSelected = editing.selected === st.id;
        return (
          <button
            key={st.id}
            type="button"
            data-sticker-id={st.id}
            className={`${s.sticker} ${isSelected ? s.stickerSelected : ""} ${editing.draggingId === st.id ? s.stickerDragging : ""} ${locked ? s.stickerLocked : ""}`}
            style={stickerBoxStyle(st, def) as CSSProperties}
            aria-label={`${def.label} sticker${locked ? " (shows only with Plus)" : ""}. Arrow keys move it, [ and ] turn it, minus and plus resize it, Delete takes it off.`}
            aria-pressed={isSelected}
            title={locked ? "Visitors see this one only while you have Plus" : def.label}
            onPointerDown={(e) => editing.onStickerPointerDown(e, st)}
            onKeyDown={(e) => editing.onStickerKeyDown(e, st)}
            onClick={(e) => e.stopPropagation()}
            onFocus={() => editing.select(st.id)}
          >
            <StickerArt def={def} />
            {isSelected && (
              <span
                className={s.stickerHandle}
                aria-hidden="true"
                title="Drag to turn and resize"
                onPointerDown={(e) => editing.onHandlePointerDown(e, st)}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The bar at the bottom while placing a sticker or with one picked up. */
export function StickerBar({
  home,
  editing,
  shown,
}: {
  home: ProfileHome;
  editing: StickerEditing;
  /** Whether visitors see the card a sticker is on. */
  shown: (blockId: string) => boolean;
}) {
  if (editing.placing) {
    const def = stickerDef(editing.placing);
    return (
      <div className={s.stickerBar} data-sticker-bar role="status" aria-live="polite">
        <span className={s.stickerBarText}>Tap a card on your page to stick the {def?.label.toLowerCase() ?? "sticker"} on it.</span>
        <button type="button" className={s.toolBtn} onClick={editing.cancelPlacing}>Cancel</button>
      </div>
    );
  }
  const st = editing.selected ? home.stickers.find((x) => x.id === editing.selected) : null;
  if (!st) return null;
  const def = stickerDef(st.key);
  return (
    <div className={s.stickerBar} data-sticker-bar role="toolbar" aria-label="Sticker">
      <span className={s.stickerBarText}>
        <strong>{def?.label ?? "Sticker"}</strong>
        {shown(st.anchor) ? (
          <span className={s.hideSmall}> · drag to move, drag the dot to turn and resize</span>
        ) : (
          <span> · this card is empty, so visitors won&apos;t see it yet</span>
        )}
      </span>
      <button type="button" className={s.iconBtn} onClick={() => editing.turn(st.id, -15)} aria-label="Turn left" title="Turn left ( [ )">⟲</button>
      <button type="button" className={s.iconBtn} onClick={() => editing.turn(st.id, 15)} aria-label="Turn right" title="Turn right ( ] )">⟳</button>
      <button type="button" className={s.iconBtn} onClick={() => editing.grow(st.id, -0.15)} disabled={st.scale <= 0.4} aria-label="Smaller" title="Smaller ( − )">−</button>
      <button type="button" className={s.iconBtn} onClick={() => editing.grow(st.id, 0.15)} disabled={st.scale >= 2.5} aria-label="Bigger" title="Bigger ( + )">+</button>
      <button type="button" className={s.textBtn} onClick={() => editing.toFront(st.id)} title="Put it on top of the others">To front</button>
      <button type="button" className={s.textBtn} onClick={() => editing.remove(st.id)}>Remove</button>
      <button type="button" className={s.toolBtn} onClick={() => editing.select(null)}>Done</button>
    </div>
  );
}

/** Where stickers are picked from. */
export function StickerDrawer({
  home,
  editing,
  accent,
  onClose,
}: {
  home: ProfileHome;
  editing: StickerEditing;
  accent: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const full = home.stickers.length >= MAX_STICKERS;

  return (
    <aside className={s.tray} aria-label="Stickers" data-sticker-drawer style={{ "--sticker-accent": accent } as CSSProperties}>
      <div className={s.trayHead}>
        <h2>Stickers</h2>
        <button type="button" className={s.iconBtn} onClick={onClose} aria-label="Close">✕</button>
      </div>
      <p className={s.trayHint}>
        Pick one, then tap anywhere on a card to stick it there, or near an edge to let it hang off.
        {" "}{home.stickers.length} of {MAX_STICKERS} used.
      </p>
      {full && <p className={s.trayHint}><strong>Your page is full of stickers.</strong> Take one off to add another.</p>}
      {STICKER_PACKS.map((pack) => {
        const locked = pack.plus && !editing.isPlus;
        return (
          <section key={pack.id}>
            <h3 className={s.trayHeading}>
              {pack.label}
              {pack.plus && <span className={s.plusChip}>Plus</span>}
            </h3>
            <p className={s.trayHint}>
              {pack.blurb}
              {locked && (
                <>
                  {" "}
                  <Link href="/settings/billing" className={s.inlineLink}>Comes with Plus</Link>.
                </>
              )}
            </p>
            <div className={s.stickerGrid}>
              {pack.stickers.map((def) => (
                <button
                  key={def.key}
                  type="button"
                  className={s.stickerPick}
                  disabled={locked || full}
                  aria-label={locked ? `${def.label} (Plus)` : `Stick on ${def.label.toLowerCase()}`}
                  title={def.label}
                  onClick={() => {
                    editing.startPlacing(def.key);
                    onClose();
                  }}
                >
                  <span
                    className={s.stickerPickArt}
                    style={{ aspectRatio: `${def.viewBox[0]} / ${def.viewBox[1]}`, width: `${Math.min(100, (def.viewBox[0] / def.viewBox[1]) * 100)}%` }}
                  >
                    <StickerArt def={def} />
                  </span>
                  {locked && <span className={s.stickerPickLock} aria-hidden="true">🔒</span>}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </aside>
  );
}
