"use client";

/**
 * The stamp album as a book: a leather-bound stockbook whose pages hold four
 * glassine strips of four stamps. The writer arranges the stamps readers sent
 * them by dragging (or, on phones and keyboards, "Move it" then a space), names
 * their pages, picks paper and cover. New stamps wait in an envelope until
 * they're mounted. The catalogue at the front prints a space for every design.
 *
 * Nothing on the page moves during a drag: the drop target is shown and the
 * move happens once, on release. Edits are pure (lib/stamp-book.ts) and saved
 * a moment after they stop.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { FloatingPopup } from "@/components/floating-popup";
import { StampImpression } from "@/components/stamp-impression";
import { StampArt } from "@/components/stamp-art";
import { STAMP_CONFIG, formatStampDay, stampInfo, stampSeed } from "@/components/stamp-config";
import {
  COVERS,
  COVER_LABELS,
  PAPERS,
  PAPER_LABELS,
  PER_STRIP,
  STRIPS,
  addPage,
  arrivals as arrivalsOf,
  cleanBook,
  findSpot,
  mountAll,
  placeStamp,
  removePage,
  setCover,
  shiftPage,
  sortBook,
  unmountStamp,
  updatePage,
  type Book,
  type BookPage,
  type Cover,
  type Paper,
  type SortKey,
} from "@/lib/stamp-book";
import { hand, fell } from "../play/fonts";
import { BookCatalogue } from "./book-catalogue";
import { BookLoupe } from "./book-loupe";
import type { AlbumStamp } from "./stamp-album";
import s from "./stamp-book.module.css";

const FONT_CLASS = `${hand.variable} ${fell.variable}`;
const DESIGN_ORDER = Object.keys(STAMP_CONFIG);
const COVER_SWATCH: Record<Cover, string> = { oxblood: "#5b201c", forest: "#22402d", navy: "#1f2c4e", ink: "#1d1c21" };
const PAPER_SWATCH: Record<Paper, string> = { cream: "#f3ead4", black: "#1c1c1f", kraft: "#c7a676" };

// ── History (Undo/Redo) ──────────────────────────────────────────────────

interface History {
  past: Book[];
  present: Book;
  future: Book[];
  /** Typing a page title is one step, not one per letter. */
  lastKey: string | null;
}
type Act = { type: "apply"; book: Book; key?: string } | { type: "undo" } | { type: "redo" };

function historyReducer(h: History, a: Act): History {
  if (a.type === "undo") {
    if (!h.past.length) return h;
    return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null };
  }
  if (a.type === "redo") {
    if (!h.future.length) return h;
    return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null };
  }
  if (a.book === h.present || JSON.stringify(a.book) === JSON.stringify(h.present)) return h;
  if (a.key && a.key === h.lastKey) return { ...h, present: a.book };
  return { past: [...h.past, h.present].slice(-60), present: a.book, future: [], lastKey: a.key ?? null };
}

// ── Leaves ───────────────────────────────────────────────────────────────

type Leaf = { kind: "catalogue" } | { kind: "page"; page: BookPage; index: number } | { kind: "add" } | { kind: "blank" };

function leafLabel(l: Leaf): string {
  if (l.kind === "catalogue") return "Catalogue";
  if (l.kind === "page") return `Page ${l.index + 1}${l.page.title ? ` · ${l.page.title}` : ""}`;
  return "A new page";
}

// ── Drag and drop pieces ────────────────────────────────────────────────

function DraggableStamp({
  stamp,
  width,
  dim,
  carried,
  justPlaced,
  disabled,
  onOpen,
  onCarry,
}: {
  stamp: AlbumStamp;
  width: number;
  dim: boolean;
  carried: boolean;
  justPlaced: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onCarry: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `stamp:${stamp.id}`, disabled });
  const info = stampInfo(stamp.type);
  const who = stamp.sender?.display_name || stamp.sender?.username || "a reader";
  const lean = `${(stampSeed(stamp.id + "lean") * 3 - 1.5).toFixed(2)}deg`;
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      className={[s.stampBtn, isDragging && s.dragging, dim && s.dim, carried && s.carried, justPlaced && s.justPlaced]
        .filter(Boolean)
        .join(" ")}
      style={{ "--lean": lean } as React.CSSProperties}
      aria-label={`${info?.label ?? "Stamp"} from ${who}, ${formatStampDay(stamp.stamped_on)}${stamp.note ? ", with a note" : ""}`}
      aria-roledescription="stamp"
      data-stamp-id={stamp.id}
      onClick={onOpen}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          onCarry();
        }
      }}
    >
      <StampImpression mark={stamp} width={width} postmark="full" straight />
    </button>
  );
}

function Slot({
  page,
  index,
  children,
  carrying,
  onPlace,
  label,
}: {
  page: string;
  index: number;
  children?: React.ReactNode;
  carrying: boolean;
  onPlace: () => void;
  label: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${page}:${index}` });
  if (carrying) {
    return (
      <button
        ref={setNodeRef}
        type="button"
        className={`${s.slot} ${s.slotTarget}`}
        onClick={onPlace}
        aria-label={label}
        data-slot={`${page}:${index}`}
      >
        {children}
      </button>
    );
  }
  return (
    <div ref={setNodeRef} className={`${s.slot}${isOver ? ` ${s.slotOver}` : ""}`} data-slot={`${page}:${index}`}>
      {children}
    </div>
  );
}

function TurnArrow({ dir, disabled, onTurn, dragging }: { dir: "prev" | "next"; disabled: boolean; onTurn: () => void; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `turn:${dir}`, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`${s.turn}${isOver && dragging ? ` ${s.turnOver}` : ""}`}
      onClick={onTurn}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous pages" : "Next pages"}
    >
      {dir === "prev" ? "‹" : "›"}
    </button>
  );
}

function EnvelopeDrop({ children, className, overClass }: { children: React.ReactNode; className: string; overClass: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `envelope:${useId()}` });
  return (
    <div ref={setNodeRef} className={`${className}${isOver ? ` ${overClass}` : ""}`} data-envelope-drop>
      {children}
    </div>
  );
}

// ── Saving ───────────────────────────────────────────────────────────────

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

async function putBook(book: Book, keepalive = false): Promise<boolean> {
  try {
    const res = await fetch("/api/me/stamp-album", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ album: book }),
      keepalive,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── The book ─────────────────────────────────────────────────────────────

export function StampBook({ stamps, saved, ownerName }: { stamps: AlbumStamp[]; saved: Book | null; ownerName: string }) {
  const initial = useMemo(() => cleanBook(saved, stamps), [saved, stamps]);
  const [hist, dispatch] = useReducer(historyReducer, { past: [], present: initial, future: [], lastKey: null });
  const book = hist.present;
  const apply = useCallback((next: Book, key?: string) => dispatch({ type: "apply", book: next, key }), []);

  const byId = useMemo(() => new Map(stamps.map((st) => [st.id, st])), [stamps]);
  const waiting = useMemo(() => arrivalsOf(book, stamps), [book, stamps]);

  // Layout: one page (phones) or a two-page spread, and how big the stamps are.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const [stampW, setStampW] = useState(60);
  const [catW, setCatW] = useState(40);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const isWide = w >= 760;
      setWide(isWide);
      const pageInner = isWide ? (w - 44 * 2 - 20 - 32) / 2 - 44 : w - 26 - 24;
      const cell = pageInner / PER_STRIP;
      setStampW(Math.max(40, Math.min(84, Math.round(cell * 0.76))));
      setCatW(Math.max(26, Math.min(48, Math.round(cell * 0.42))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const stampH = Math.round((stampW * 96) / 80);

  // Which leaf is open. Leaf 0 is the catalogue; phones start on page 1.
  const leaves: Leaf[] = useMemo(
    () => [{ kind: "catalogue" }, ...book.pages.map((page, index) => ({ kind: "page" as const, page, index })), { kind: "add" }],
    [book.pages],
  );
  const [at, setAt] = useState(1);
  const [turnDir, setTurnDir] = useState<"next" | "prev" | null>(null);
  const step = wide ? 2 : 1;
  const start = wide ? at - (at % 2) : Math.min(at, leaves.length - 1);
  const lastStart = wide ? leaves.length - 1 - ((leaves.length - 1) % 2) : leaves.length - 1;
  const goTo = useCallback(
    (leaf: number) => {
      const clamped = Math.max(0, Math.min(leaf, leaves.length - 1));
      setTurnDir(clamped > at ? "next" : clamped < at ? "prev" : null);
      setAt(clamped);
    },
    [at, leaves.length],
  );
  const turn = useCallback((by: -1 | 1) => goTo(start + by * step), [goTo, start, step]);
  useEffect(() => {
    if (at > leaves.length - 1) setAt(leaves.length - 1);
  }, [at, leaves.length]);
  useEffect(() => {
    if (!turnDir) return;
    const t = setTimeout(() => setTurnDir(null), 450);
    return () => clearTimeout(t);
  }, [turnDir, start]);

  // Highlighting one design (from the catalogue).
  const [highlight, setHighlight] = useState<string | null>(null);
  function pickDesign(type: string) {
    if (highlight === type) return setHighlight(null);
    setHighlight(type);
    const pi = book.pages.findIndex((p) => p.slots.some((id) => id && byId.get(id)?.type === type));
    if (pi >= 0 && !(wide && start === 0 && pi === 0)) goTo(pi + 1);
  }

  // Envelope, carrying, loupe, drag.
  const [trayOpen, setTrayOpen] = useState(false);
  const [carry, setCarry] = useState<string | null>(null);
  const [loupe, setLoupe] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [justPlaced, setJustPlaced] = useState<string | null>(null);
  const draggedRecently = useRef(false);
  const [turnHover, setTurnHover] = useState<"prev" | "next" | null>(null);

  const placed = useCallback((id: string) => {
    setJustPlaced(id);
    window.setTimeout(() => setJustPlaced((cur) => (cur === id ? null : cur)), 450);
  }, []);

  const sensors = useSensors(
    // Mouse and touch separately: a pointer sensor would claim a finger first,
    // and the browser would then take the gesture for scrolling. Touch waits
    // for a short hold, so swiping over a page of stamps still scrolls it.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  function onDragStart(e: DragStartEvent) {
    setDragId(String(e.active.id).replace(/^stamp:/, ""));
    setCarry(null);
  }
  function onDragOver(e: DragOverEvent) {
    const over = e.over ? String(e.over.id) : "";
    setTurnHover(over === "turn:prev" ? "prev" : over === "turn:next" ? "next" : null);
  }
  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id).replace(/^stamp:/, "");
    const over = e.over ? String(e.over.id) : "";
    setDragId(null);
    setTurnHover(null);
    draggedRecently.current = true;
    window.setTimeout(() => (draggedRecently.current = false), 0);
    dropOn(id, over);
  }
  function dropOn(id: string, over: string) {
    if (over.startsWith("slot:")) {
      const [, page, slot] = over.split(":");
      apply(placeStamp(book, id, { page, slot: Number(slot) }));
      placed(id);
    } else if (over.startsWith("envelope")) {
      apply(unmountStamp(book, id));
    }
  }
  // Holding a stamp over an arrow turns the pages.
  useEffect(() => {
    if (!turnHover || !dragId) return;
    const t = window.setInterval(() => turn(turnHover === "next" ? 1 : -1), 750);
    return () => window.clearInterval(t);
  }, [turnHover, dragId, turn]);

  function openStamp(id: string) {
    if (draggedRecently.current) return;
    if (carry) return;
    setLoupe(id);
  }

  // Album order: page by page, then the envelope (for the loupe's arrows).
  const order = useMemo(() => {
    const ids: string[] = [];
    for (const p of book.pages) for (const id of p.slots) if (id) ids.push(id);
    for (const st of waiting) ids.push(st.id);
    return ids;
  }, [book.pages, waiting]);

  // Saving, a moment after the last change.
  const savedJson = useRef(JSON.stringify(initial));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const latest = useRef(book);
  latest.current = book;
  const saveNow = useCallback(async () => {
    const json = JSON.stringify(latest.current);
    if (json === savedJson.current) return setSaveState((st) => (st === "pending" ? "saved" : st));
    setSaveState("saving");
    const ok = await putBook(latest.current);
    if (ok) {
      savedJson.current = json;
      setSaveState(JSON.stringify(latest.current) === json ? "saved" : "pending");
    } else setSaveState("error");
  }, []);
  useEffect(() => {
    if (JSON.stringify(book) === savedJson.current) return;
    setSaveState("pending");
    const t = window.setTimeout(saveNow, 700);
    return () => window.clearTimeout(t);
  }, [book, saveNow]);
  useEffect(() => {
    const flush = () => {
      if (JSON.stringify(latest.current) !== savedJson.current) void putBook(latest.current, true);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  // Keyboard: Undo/Redo, Escape to put down a carried stamp.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (loupe) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (e.key === "Escape" && carry) setCarry(null);
      else if (!carry && !dragId && e.key === "ArrowRight" && t?.tagName !== "BUTTON") turn(1);
      else if (!carry && !dragId && e.key === "ArrowLeft" && t?.tagName !== "BUTTON") turn(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [carry, loupe, dragId, turn]);

  // Menus
  const arrangeRef = useRef<HTMLButtonElement>(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const pageMenuRefs = useRef(new Map<string, HTMLButtonElement>());
  const [pageMenu, setPageMenu] = useState<string | null>(null);
  const pageMenuAnchor = useRef<HTMLElement | null>(null);
  pageMenuAnchor.current = pageMenu ? pageMenuRefs.current.get(pageMenu) ?? null : null;

  function sort(key: SortKey) {
    apply(sortBook(book, stamps, key, DESIGN_ORDER));
    setArrangeOpen(false);
    goTo(1);
  }
  function newPage(after?: string) {
    const next = addPage(book, after);
    apply(next);
    const added = next.pages.find((p) => !book.pages.some((q) => q.id === p.id));
    if (added) goTo(next.pages.indexOf(added) + 1);
  }

  // ── Rendering ──

  const carried = carry ? byId.get(carry) : null;
  const dragged = dragId ? byId.get(dragId) : null;

  function renderPage(leaf: Extract<Leaf, { kind: "page" }>) {
    const { page, index } = leaf;
    const empty = page.slots.every((x) => !x);
    return (
      <>
        <div className={s.pageHead}>
          <input
            className={s.pageTitle}
            value={page.title}
            maxLength={60}
            placeholder={`Name this page`}
            aria-label={`Name of page ${index + 1}`}
            onChange={(e) => apply(updatePage(book, page.id, { title: e.target.value }), `title:${page.id}`)}
          />
          <button
            type="button"
            className={s.pageMenuBtn}
            ref={(el) => {
              if (el) pageMenuRefs.current.set(page.id, el);
            }}
            aria-label={`Page ${index + 1} options`}
            aria-expanded={pageMenu === page.id}
            onClick={() => setPageMenu(pageMenu === page.id ? null : page.id)}
          >
            ⋯
          </button>
        </div>
        <div className={s.strips}>
          {Array.from({ length: STRIPS }, (_, r) => (
            <div key={r} className={s.strip}>
              {Array.from({ length: PER_STRIP }, (_, c) => {
                const i = r * PER_STRIP + c;
                const id = page.slots[i];
                const st = id ? byId.get(id) : null;
                return (
                  <Slot
                    key={i}
                    page={page.id}
                    index={i}
                    carrying={!!carry}
                    label={
                      st
                        ? `Swap with the ${stampInfo(st.type)?.label ?? "stamp"} on page ${index + 1}`
                        : `Page ${index + 1}, strip ${r + 1}, space ${c + 1}`
                    }
                    onPlace={() => {
                      if (!carry) return;
                      apply(placeStamp(book, carry, { page: page.id, slot: i }));
                      placed(carry);
                      setCarry(null);
                    }}
                  >
                    {st && carry ? (
                      <span
                        className={[s.stampBtn, carry === st.id && s.carried, highlight && st.type !== highlight && s.dim]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <StampImpression mark={st} width={stampW} postmark="full" straight />
                      </span>
                    ) : st ? (
                      <DraggableStamp
                        stamp={st}
                        width={stampW}
                        dim={!!highlight && st.type !== highlight}
                        carried={carry === st.id}
                        justPlaced={justPlaced === st.id}
                        onOpen={() => openStamp(st.id)}
                        onCarry={() => setCarry(st.id)}
                      />
                    ) : null}
                  </Slot>
                );
              })}
            </div>
          ))}
        </div>
        {empty && !carry && !dragId && (
          <p className={s.emptyNote}>
            {stamps.length === 0
              ? "When a reader sends you a stamp, it arrives in an envelope here, ready to mount."
              : "An empty page. Drag stamps here to start it."}
          </p>
        )}
        <div className={s.pageFoot}>— {index + 1} —</div>
      </>
    );
  }

  function renderLeaf(leaf: Leaf, side: "left" | "right" | "single") {
    const sideClass = side === "left" ? s.leafLeft : side === "right" ? s.leafRight : "";
    if (leaf.kind === "catalogue") {
      return (
        <div className={`${s.leaf} ${sideClass}`} data-paper="cream" key="catalogue">
          <BookCatalogue stamps={stamps} artWidth={catW} highlight={highlight} onPick={pickDesign} />
        </div>
      );
    }
    if (leaf.kind === "page") {
      return (
        <section
          className={`${s.leaf} ${sideClass}`}
          data-paper={leaf.page.paper}
          key={leaf.page.id}
          aria-label={`Page ${leaf.index + 1}${leaf.page.title ? `: ${leaf.page.title}` : ""}`}
        >
          {renderPage(leaf)}
        </section>
      );
    }
    if (leaf.kind === "add") {
      return (
        <div className={`${s.leaf} ${sideClass} ${s.addLeaf}`} data-paper="cream" key="add">
          <p>A fresh page.</p>
          <button type="button" className={s.addLeafBtn} onClick={() => newPage()}>
            ＋ Add a page
          </button>
        </div>
      );
    }
    return <div className={`${s.leaf} ${sideClass}`} data-paper="cream" key="blank" aria-hidden="true" />;
  }

  const left = leaves[start];
  const right: Leaf = leaves[start + 1] ?? { kind: "blank" };
  const pocket = Math.round(stampH * 0.44) + 6;
  const pageNow = book.pages.find((p) => p.id === pageMenu);
  const pageNowIndex = pageNow ? book.pages.indexOf(pageNow) : -1;

  return (
    <div className={`${s.album} ${FONT_CLASS}`}>
      <DndContext
        id="stamp-book-dnd"
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragId(null);
          setTurnHover(null);
        }}
        autoScroll={{ threshold: { x: 0, y: 0.12 } }}
      >
        {/* Toolbar */}
        <div className={s.toolbar}>
          <div className={s.toolbarGroup}>
            <select
              className={s.leafSelect}
              value={start}
              onChange={(e) => goTo(Number(e.target.value))}
              aria-label="Turn to"
            >
              {leaves.map((l, i) =>
                wide && i % 2 === 1 ? null : (
                  <option key={i} value={i}>
                    {wide && leaves[i + 1] ? `${leafLabel(l)} / ${leafLabel(leaves[i + 1])}` : leafLabel(l)}
                  </option>
                ),
              )}
            </select>
          </div>
          {highlight && (
            <span className={s.highlightChip}>
              Showing {stampInfo(highlight)?.label ?? highlight}
              <button type="button" onClick={() => setHighlight(null)} aria-label="Show every stamp">
                ×
              </button>
            </span>
          )}
          <span className={s.spacer} />
          <div className={s.toolbarGroup}>
            <span
              className={`${s.saveState}${saveState === "error" ? ` ${s.saveError}` : ""}${saveState === "saved" || saveState === "idle" ? ` ${s.saveQuiet}` : ""}`}
              aria-live="polite"
            >
              {saveState === "saving" || saveState === "pending" ? (
                "Saving…"
              ) : saveState === "saved" ? (
                "Saved"
              ) : saveState === "error" ? (
                <>
                  Not saved ·{" "}
                  <button type="button" onClick={saveNow}>
                    Try again
                  </button>
                </>
              ) : null}
            </span>
            <button
              type="button"
              className={`${s.tbtn} ${s.iconBtn}`}
              onClick={() => dispatch({ type: "undo" })}
              disabled={!hist.past.length}
              aria-label="Undo"
              title="Undo (⌘Z)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
            </button>
            <button
              type="button"
              className={`${s.tbtn} ${s.iconBtn}`}
              onClick={() => dispatch({ type: "redo" })}
              disabled={!hist.future.length}
              aria-label="Redo"
              title="Redo (⇧⌘Z)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
            </button>
            <button
              ref={arrangeRef}
              type="button"
              className={s.tbtn}
              aria-expanded={arrangeOpen}
              onClick={() => setArrangeOpen((o) => !o)}
            >
              Arrange ▾
            </button>
          </div>
        </div>

        <FloatingPopup anchorRef={arrangeRef} open={arrangeOpen} onClose={() => setArrangeOpen(false)} placement="bottom">
          <div className={s.menu} role="menu">
            <div className={s.menuLabel}>Remount everything</div>
            <button type="button" role="menuitem" className={s.menuItem} onClick={() => sort("date")} disabled={!stamps.length}>
              By date
              <small>Oldest first, page after page</small>
            </button>
            <button type="button" role="menuitem" className={s.menuItem} onClick={() => sort("design")} disabled={!stamps.length}>
              By design
              <small>Each design starts its own strip</small>
            </button>
            <button type="button" role="menuitem" className={s.menuItem} onClick={() => sort("sender")} disabled={!stamps.length}>
              By who sent them
              <small>A strip for each reader, most generous first</small>
            </button>
            <div className={s.menuRule} />
            <button
              type="button"
              role="menuitem"
              className={s.menuItem}
              onClick={() => {
                setArrangeOpen(false);
                newPage();
              }}
            >
              Add a page
            </button>
            <div className={s.menuRule} />
            <div className={s.menuLabel}>Cover</div>
            <div className={s.swatches}>
              {COVERS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={s.swatch}
                  style={{ background: COVER_SWATCH[c] }}
                  aria-pressed={book.cover === c}
                  aria-label={`${COVER_LABELS[c]} cover`}
                  title={COVER_LABELS[c]}
                  onClick={() => apply(setCover(book, c))}
                />
              ))}
            </div>
          </div>
        </FloatingPopup>

        <FloatingPopup anchorRef={pageMenuAnchor} open={!!pageNow} onClose={() => setPageMenu(null)} placement="bottom">
          {pageNow && (
            <div className={s.menu} role="menu">
              <div className={s.menuLabel}>Paper</div>
              <div className={s.swatches}>
                {PAPERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={s.swatch}
                    style={{ background: PAPER_SWATCH[p] }}
                    aria-pressed={pageNow.paper === p}
                    aria-label={`${PAPER_LABELS[p]} paper`}
                    title={PAPER_LABELS[p]}
                    onClick={() => apply(updatePage(book, pageNow.id, { paper: p }))}
                  />
                ))}
              </div>
              <div className={s.menuRule} />
              <button
                type="button"
                role="menuitem"
                className={s.menuItem}
                disabled={pageNowIndex <= 0}
                onClick={() => {
                  apply(shiftPage(book, pageNow.id, -1));
                  goTo(pageNowIndex);
                  setPageMenu(null);
                }}
              >
                Move page earlier
              </button>
              <button
                type="button"
                role="menuitem"
                className={s.menuItem}
                disabled={pageNowIndex >= book.pages.length - 1}
                onClick={() => {
                  apply(shiftPage(book, pageNow.id, 1));
                  goTo(pageNowIndex + 2);
                  setPageMenu(null);
                }}
              >
                Move page later
              </button>
              <button
                type="button"
                role="menuitem"
                className={s.menuItem}
                onClick={() => {
                  setPageMenu(null);
                  newPage(pageNow.id);
                }}
              >
                Add a page after this one
              </button>
              <div className={s.menuRule} />
              <button
                type="button"
                role="menuitem"
                className={`${s.menuItem} ${s.menuDanger}`}
                onClick={() => {
                  apply(removePage(book, pageNow.id));
                  setPageMenu(null);
                }}
              >
                {book.pages.length > 1 ? "Remove this page" : "Empty this page"}
                {pageNow.slots.some(Boolean) && <small>Its stamps go back in the envelope (Undo brings them back)</small>}
              </button>
            </div>
          )}
        </FloatingPopup>

        {/* The envelope: new arrivals wait here; drop a stamp on it to take it out of the album. */}
        {stamps.length > 0 && (
          <>
            <EnvelopeDrop className={s.envelopeRow} overClass={s.envelopeRowOver}>
              <button
                type="button"
                className={s.envelope}
                onClick={() => waiting.length && setTrayOpen((o) => !o)}
                aria-expanded={waiting.length ? trayOpen : undefined}
                aria-label={
                  waiting.length
                    ? `${trayOpen ? "Close" : "Open"} the envelope of new arrivals (${waiting.length})`
                    : "The envelope (empty)"
                }
                data-empty={waiting.length ? undefined : ""}
              >
                <span className={s.envelopeBack} />
                <span className={s.envelopePeek} aria-hidden="true">
                  {waiting.slice(-3).map((st) => (
                    <StampArt key={st.id} type={st.type} width={44} emoji={st.emoji} emojiUrl={st.emoji_url} />
                  ))}
                </span>
                <span className={s.envelopeFront} />
                <span className={s.envelopeFlap} />
                <span className={s.envelopeLabel}>{waiting.length ? "New arrivals" : "Envelope"}</span>
                {waiting.length > 0 && <span className={s.envelopeCount}>{waiting.length}</span>}
              </button>
              <div className={s.envelopeText}>
                {waiting.length > 0 ? (
                  <>
                    <h2>
                      {waiting.length === 1
                        ? "A stamp is waiting to be mounted"
                        : `${waiting.length} stamps are waiting to be mounted`}
                    </h2>
                    <p>Open the envelope and drag them onto a page wherever you like, or mount them after the last one.</p>
                    <div className={s.envelopeActions}>
                      <button type="button" className={`${s.tbtn} ${s.primary}`} onClick={() => apply(mountAll(book, waiting))}>
                        Mount {waiting.length === 1 ? "it" : "them all"}
                      </button>
                      <button type="button" className={s.tbtn} onClick={() => setTrayOpen((o) => !o)} aria-expanded={trayOpen}>
                        {trayOpen ? "Close the envelope" : "Open the envelope"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2>Every stamp is mounted</h2>
                    <p>
                      New stamps wait in this envelope until you mount them. Drop a stamp on it to take it out of the album.
                    </p>
                  </>
                )}
              </div>
            </EnvelopeDrop>
            {trayOpen && waiting.length > 0 && (
              <EnvelopeDrop className={s.tray} overClass={s.trayOver}>
                <div className={s.trayHead}>
                  <strong>On the desk</strong>
                  <span>{wide ? "Drag one onto a page" : "Press and hold one to move it, or tap it"}</span>
                </div>
                <div className={s.trayStamps}>
                  {waiting.map((st) => (
                    <DraggableStamp
                      key={st.id}
                      stamp={st}
                      width={Math.min(stampW, 64)}
                      dim={!!highlight && st.type !== highlight}
                      carried={carry === st.id}
                      justPlaced={false}
                      onOpen={() => openStamp(st.id)}
                      onCarry={() => setCarry(st.id)}
                    />
                  ))}
                </div>
              </EnvelopeDrop>
            )}
          </>
        )}

        {/* The book */}
        <div className={s.bookWrap} ref={wrapRef}>
          {wide && <TurnArrow dir="prev" disabled={start <= 0} onTurn={() => turn(-1)} dragging={!!dragId} />}
          <div className={s.book} data-cover={book.cover}>
            <div
              className={[s.spread, !wide && s.single, turnDir === "next" && s.turnNext, turnDir === "prev" && s.turnPrev]
                .filter(Boolean)
                .join(" ")}
              key={`${start}:${wide}`}
              style={{ "--slot-h": `${stampH + 12}px`, "--pocket": `${pocket}px` } as React.CSSProperties}
            >
              {wide ? (
                <>
                  {renderLeaf(left, "left")}
                  {renderLeaf(right, "right")}
                </>
              ) : (
                renderLeaf(left, "single")
              )}
            </div>
          </div>
          {wide && <TurnArrow dir="next" disabled={start >= lastStart} onTurn={() => turn(1)} dragging={!!dragId} />}
        </div>

        {!wide && (
          <div className={s.toolbar} style={{ justifyContent: "space-between", marginTop: 12 }}>
            <button type="button" className={s.tbtn} onClick={() => turn(-1)} disabled={start <= 0}>
              ‹ Back
            </button>
            <span className={s.saveState} style={{ textAlign: "center" }}>
              {leafLabel(left)}
            </span>
            <button type="button" className={s.tbtn} onClick={() => turn(1)} disabled={start >= lastStart}>
              Next ›
            </button>
          </div>
        )}

        <p className={s.hint}>
          {stamps.length === 0
            ? `${ownerName ? `${ownerName}’s` : "Your"} album is ready for its first stamp.`
            : wide
              ? "Drag a stamp to move it; hold it over an arrow to turn the page. Click one to look closer and read the back."
              : "Press and hold a stamp to move it. Tap one to look closer and read the back."}
        </p>

        <DragOverlay dropAnimation={null}>
          {dragged ? (
            <div className={s.overlay}>
              <StampImpression mark={dragged} width={stampW} postmark="full" straight />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {carried && (
        <div className={s.carryBar} role="status">
          <StampArt type={carried.type} width={22} emoji={carried.emoji} emojiUrl={carried.emoji_url} />
          <span className={s.carryText}>Choose a space for {stampInfo(carried.type)?.label ?? "this stamp"}</span>
          {findSpot(book, carried.id) && stamps.length > 0 && (
            <button
              type="button"
              onClick={() => {
                apply(unmountStamp(book, carried.id));
                setCarry(null);
              }}
            >
              Envelope
            </button>
          )}
          <button type="button" onClick={() => setCarry(null)}>
            Cancel
          </button>
        </div>
      )}

      {loupe && byId.get(loupe) && (
        <BookLoupe
          stamp={byId.get(loupe)!}
          mounted={!!findSpot(book, loupe)}
          position={{ index: Math.max(0, order.indexOf(loupe)), total: order.length }}
          fontClass={FONT_CLASS}
          onClose={() => setLoupe(null)}
          onStep={(by) => {
            const i = order.indexOf(loupe);
            const next = order[(i + by + order.length) % order.length];
            if (next) setLoupe(next);
          }}
          onMove={() => {
            setCarry(loupe);
            setLoupe(null);
          }}
          onUnmount={() => {
            apply(unmountStamp(book, loupe));
            setLoupe(null);
          }}
          onMount={() => {
            const st = byId.get(loupe);
            if (st) apply(mountAll(book, [st]));
            placed(loupe);
            setLoupe(null);
          }}
        />
      )}
    </div>
  );
}

