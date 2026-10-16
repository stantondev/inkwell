"use client";

import Link from "next/link";
import { Component, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { columnTracks, type ProfileBlock, type ProfileBlockType, type ProfileHome, type ProfileSection } from "@/lib/profile-home";
import {
  BLOCK_INFO,
  LAYOUT_PRESETS,
  TEMPLATES,
  addSection,
  applyPreset,
  applyTemplate,
  dropBlock,
  dropIndex,
  findBlock,
  insertBlock,
  isSingleton,
  moveAcross,
  moveSection,
  neighbourColumn,
  newBlock,
  nudgeBlock,
  presetOf,
  removeBlock,
  removeSection,
  resizeColumns,
  sectionRemovable,
  shuffleHome,
  updateConfig,
  type DropTarget,
} from "@/lib/home-edit";
import { historyReducer, initHistory } from "@/lib/home-history";
import { ProfileFrame, type ProfileFrameProps } from "@/app/[username]/profile-frame";
import { ProfileBlockView, blockVisible, type ProfileContext } from "@/app/[username]/profile-layout";
import { BlockSettings } from "./block-settings";
import { WidgetTray, TRAY_PREFIX } from "./widget-tray";
import { EditorStickers, StickerBar, StickerDrawer, useStickerEditing, type StickerEditing } from "./sticker-editing";
import s from "./arrange.module.css";

interface Props {
  initialHome: ProfileHome;
  ctx: ProfileContext;
  frame: ProfileFrameProps;
  username: string;
}

type Drag = { kind: "block"; id: string } | { kind: "tray"; type: ProfileBlockType } | null;

/** Why a piece of the profile shows nothing yet, and where to change that. */
const EMPTY_HINTS: Partial<Record<ProfileBlockType, string>> = {
  pinned: "Pin entries from their pages and they'll show here.",
  tags: "Shows once your entries have tags.",
  series: "Shows once you start a series.",
  music: "Pick a song in Customize, or connect ListenBrainz in Settings → Listening.",
  support: "Add a link in Settings → Support link.",
  newsletter: "Turn on your newsletter in Settings → Newsletter.",
  custom_html: "Write it in Settings → Customize.",
  note: "Empty note: edit it to write something.",
  photo: "No picture yet: edit it to add one.",
  quote: "Empty quote: edit it to add the words.",
  now: "Edit it to say what you're up to.",
  countdown: "Edit it to choose a date.",
  links: "Edit it to add your links.",
};

const draftKey = (username: string) => `inkwell-arrange-draft:${username}`;

/**
 * Where the pointer would drop something, read from the page itself: the
 * block or column under the pointer. Nothing on the page moves while
 * dragging (only a line shows where it will land), so this can't feed back
 * into itself the way moving blocks live did.
 */
function targetAt(x: number, y: number, draggingId: string | null): DropTarget | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!(el instanceof HTMLElement)) continue;
    const blockId = el.dataset.dropBlock;
    const columnId = el.dataset.dropCol;
    if (blockId && columnId) {
      if (blockId === draggingId) return null;
      const r = el.getBoundingClientRect();
      const before = el.dataset.dropFlow === "1" ? x < r.left + r.width / 2 : y < r.top + r.height / 2;
      return { columnId, blockId, edge: before ? "before" : "after" };
    }
    const column = el.dataset.dropColumn;
    if (column) {
      // In the gaps of a column: before the first block whose middle is below the pointer.
      const blocks = Array.from(el.querySelectorAll<HTMLElement>(":scope > [data-drop-block]"));
      const flow = el.dataset.dropFlow === "1";
      for (const b of blocks) {
        const r = b.getBoundingClientRect();
        const ahead = flow ? y < r.bottom && (y < r.top || x < r.left + r.width / 2) : y < r.top + r.height / 2;
        if (ahead) {
          if (b.dataset.dropBlock === draggingId) return null;
          return { columnId: column, blockId: b.dataset.dropBlock!, edge: "before" };
        }
      }
      return { columnId: column, blockId: null, edge: "end" };
    }
  }
  return null;
}

export function ArrangeEditor({ initialHome, ctx, frame, username }: Props) {
  const [state, dispatch] = useReducer(historyReducer, initialHome, initHistory);
  const { home, past, future } = state;
  const [saved, setSaved] = useState(() => JSON.stringify(initialHome));
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error" | "note"; text?: string }>({ kind: "idle" });
  const [view, setView] = useState<"desktop" | "phone">("desktop");
  const [trayOpen, setTrayOpen] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [targetColumn, setTargetColumn] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | "layouts">(null);
  const [draft, setDraft] = useState<ProfileHome | null>(null);
  const [mounted, setMounted] = useState(false);
  const pointer = useRef({ x: 0, y: 0 });
  const homeRef = useRef(home);

  useEffect(() => {
    homeRef.current = home;
  }, [home]);
  const getHome = useCallback(() => homeRef.current, []);

  const dirty = JSON.stringify(home) !== saved;

  const commit = useCallback((next: ProfileHome, before?: ProfileHome) => {
    dispatch({ type: "commit", next, before });
    setStatus((st) => (st.kind === "saved" || st.kind === "note" ? { kind: "idle" } : st));
  }, []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const preview = useCallback((next: ProfileHome) => dispatch({ type: "preview", home: next }), []);
  const note = useCallback((text: string) => setStatus({ kind: "note", text }), []);
  const stickers = useStickerEditing({ getHome, commit, preview, isPlus: ctx.isPlus, note });
  const [stickerDrawer, setStickerDrawer] = useState(false);
  const swallowClick = useRef(false);

  // A copy of unsaved work in this browser tab, so a crash or a reload
  // doesn't lose it; offered back on the next visit.
  useEffect(() => {
    setMounted(true);
    try {
      const raw = sessionStorage.getItem(draftKey(username));
      if (raw && raw !== JSON.stringify(initialHome)) setDraft(JSON.parse(raw));
    } catch {
      // no storage: nothing to offer
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted || draft) return;
    try {
      if (dirty) sessionStorage.setItem(draftKey(username), JSON.stringify(home));
      else sessionStorage.removeItem(draftKey(username));
    } catch {
      // storage full or blocked: the page still works
    }
  }, [home, dirty, mounted, draft, username]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/me/home", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save your page. Try again.");
      const clean = data.data as ProfileHome;
      dispatch({ type: "replace", home: clean });
      setSaved(JSON.stringify(clean));
      setStatus({ kind: "saved" });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "Couldn't save your page. Try again." });
    }
  }

  // ── Adding ─────────────────────────────────────────────────────────────
  /** Where Add puts things: the column last picked, else a sidebar, else the last column. */
  function defaultColumn(h: ProfileHome): string {
    if (targetColumn && h.sections.some((sec) => sec.columns.some((c) => c.id === targetColumn))) return targetColumn;
    const columns = h.sections.flatMap((sec) => sec.columns);
    const side = columns.find((c) => c.span <= 4 && !c.blocks.some((b) => b.type === "entries" || b.type === "profile_card"));
    return (side ?? columns[columns.length - 1]).id;
  }

  function add(type: ProfileBlockType, columnId?: string, index?: number) {
    const block = newBlock(type);
    commit(insertBlock(home, block, columnId ?? defaultColumn(home), index));
    reveal(block.id, BLOCK_INFO[type].own && BLOCK_INFO[type].editable);
  }

  function reveal(id: string, openSettings?: boolean) {
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1600);
    window.setTimeout(() => document.getElementById(`arrange-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    if (openSettings) {
      setTrayOpen(false);
      setSettingsId(id);
    }
  }

  function moveBy(id: string, change: (h: ProfileHome) => ProfileHome, focus: string) {
    commit(change(home));
    // Keep focus on the button pressed, wherever the block went.
    requestAnimationFrame(() => document.getElementById(`arrange-${id}`)?.querySelector<HTMLButtonElement>(`[data-move="${focus}"]:not(:disabled)`)?.focus());
  }

  // ── Dragging ───────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  useEffect(() => {
    if (!drag) return;
    const onPointer = (e: PointerEvent) => (pointer.current = { x: e.clientX, y: e.clientY });
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) pointer.current = { x: t.clientX, y: t.clientY };
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("touchmove", onTouch);
    };
  }, [drag]);

  function startPointer(e: DragStartEvent) {
    const ev = e.activatorEvent as PointerEvent | TouchEvent | MouseEvent | null;
    if (ev && "touches" in ev && ev.touches[0]) pointer.current = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    else if (ev && "clientX" in ev) pointer.current = { x: ev.clientX, y: ev.clientY };
  }

  function onDragStart(e: DragStartEvent) {
    startPointer(e);
    const id = String(e.active.id);
    setDrag(id.startsWith(TRAY_PREFIX) ? { kind: "tray", type: id.slice(TRAY_PREFIX.length) as ProfileBlockType } : { kind: "block", id });
    setDrop(null);
  }

  const lastDropKey = useRef("");
  function onDragMove(e: DragMoveEvent) {
    const id = String(e.active.id);
    const t = targetAt(pointer.current.x, pointer.current.y, id.startsWith(TRAY_PREFIX) ? null : id);
    const key = t ? `${t.columnId}|${t.blockId}|${t.edge}` : "";
    if (key !== lastDropKey.current) {
      lastDropKey.current = key;
      setDrop(t);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const t = targetAt(pointer.current.x, pointer.current.y, id.startsWith(TRAY_PREFIX) ? null : id);
    setDrag(null);
    setDrop(null);
    lastDropKey.current = "";
    if (!t) return;
    if (id.startsWith(TRAY_PREFIX)) {
      add(id.slice(TRAY_PREFIX.length) as ProfileBlockType, t.columnId, dropIndex(home, t));
      return;
    }
    commit(dropBlock(home, id, t));
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1200);
  }

  function onDragCancel() {
    setDrag(null);
    setDrop(null);
    lastDropKey.current = "";
  }

  const labelOf = useCallback(
    (id: string): string => {
      const b = findBlock(home, id)?.block;
      return b ? BLOCK_INFO[b.type].label : "Block";
    },
    [home],
  );

  // ── Rendering ──────────────────────────────────────────────────────────
  const editing = settingsId ? findBlock(home, settingsId)?.block ?? null : null;
  const narrow = home.width === "narrow";

  const statusText =
    status.kind === "saving" ? "Saving…"
    : status.kind === "saved" ? "Saved"
    : status.kind === "error" || status.kind === "note" ? status.text ?? ""
    : dirty ? "Unsaved changes" : "";

  const toolbar = (
    <div className={s.toolbar} role="toolbar" aria-label="Arrange my page">
      <Link
        href={ctx.profileHref}
        className={s.toolLink}
        onClick={(e) => {
          if (dirty && !confirm("Leave without saving your changes?")) e.preventDefault();
        }}
      >
        <span aria-hidden="true">←</span> <span className={s.hideSmall}>My page</span>
      </Link>
      <span className={s.toolTitle}>Arrange my page</span>
      <span className={s.toolGroup}>
        <button type="button" className={s.toolBtn} onClick={undo} disabled={past.length === 0} aria-label="Undo" title="Undo (⌘Z)">↶</button>
        <button type="button" className={s.toolBtn} onClick={redo} disabled={future.length === 0} aria-label="Redo" title="Redo (⇧⌘Z)">↷</button>
      </span>
      <button type="button" className={`${s.toolBtn} ${s.toolPrimaryOutline}`} onClick={() => setTrayOpen(true)}>
        <span aria-hidden="true">＋</span> Add
      </button>
      <button
        type="button"
        className={s.toolBtn}
        aria-expanded={stickerDrawer}
        onClick={() => {
          setTrayOpen(false);
          setSettingsId(null);
          setStickerDrawer(true);
        }}
      >
        <span aria-hidden="true">✿</span> <span className={s.hideSmall}>Stickers</span>
      </button>
      <span className={s.menuWrap}>
        <button
          type="button"
          className={s.toolBtn}
          aria-expanded={menu === "layouts"}
          onClick={(e) => {
            e.stopPropagation();
            setMenu(menu === "layouts" ? null : "layouts");
          }}
        >
          Layouts <span aria-hidden="true">▾</span>
        </button>
        {menu === "layouts" && (
          <div className={s.menu} role="menu" onClick={(e) => e.stopPropagation()}>
            <p className={s.menuHeading}>Start from a layout</p>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                className={s.menuItem}
                onClick={() => {
                  commit(applyTemplate(home, t));
                  setMenu(null);
                  setStatus({ kind: "note", text: `Laid out as ${t.label}. Nothing was removed; Undo puts it back.` });
                }}
              >
                <strong>{t.label}</strong>
                <span>{t.blurb}</span>
              </button>
            ))}
            <p className={s.menuHeading}>Page width</p>
            <div className={s.segment}>
              {(["standard", "narrow"] as const).map((w) => (
                <button key={w} type="button" aria-pressed={home.width === w} onClick={() => commit({ ...home, width: w })}>
                  {w === "standard" ? "Wide" : "Narrow"}
                </button>
              ))}
            </div>
          </div>
        )}
      </span>
      <button
        type="button"
        className={s.toolBtn}
        title="A surprise arrangement of what's on your page"
        onClick={() => {
          commit(shuffleHome(home, (b) => blockVisible(b, ctx)));
          setStatus({ kind: "note", text: "Shuffled. Shuffle again, or Undo." });
        }}
      >
        <span aria-hidden="true">⚄</span> <span className={s.hideSmall}>Shuffle</span>
      </button>
      <span className={`${s.segment} ${s.viewToggle}`} aria-label="Preview size">
        <button type="button" aria-pressed={view === "desktop"} onClick={() => setView("desktop")} title="Wide screen">
          <span aria-hidden="true">▭</span><span className="sr-only">Wide screen</span>
        </button>
        <button type="button" aria-pressed={view === "phone"} onClick={() => setView("phone")} title="Phone">
          <span aria-hidden="true">▯</span><span className="sr-only">Phone</span>
        </button>
      </span>
      <span className={`${s.toolStatus} ${statusText ? "" : s.toolStatusEmpty}`} role="status" aria-live="polite">
        {statusText}
      </span>
      {status.kind === "saved" && !dirty && (
        <Link href={ctx.profileHref} className={s.toolLink}>See it</Link>
      )}
      <button type="button" className={s.saveBtn} onClick={save} disabled={!dirty || status.kind === "saving"}>
        Save
      </button>
    </div>
  );

  return (
    <div className={`arrange-shell ${s.shell} ${drag ? s.dragging : ""}`} onClick={() => menu && setMenu(null)}>
      {toolbar}
      {draft && (
        <div className={s.draftBar} role="alert">
          <span>You have changes from earlier that weren&apos;t saved.</span>
          <button
            type="button"
            className={s.textBtn}
            onClick={() => {
              commit(draft);
              setDraft(null);
            }}
          >
            Bring them back
          </button>
          <button
            type="button"
            className={s.toolBtn}
            onClick={() => {
              setDraft(null);
              try {
                sessionStorage.removeItem(draftKey(username));
              } catch {
                // ignore
              }
            }}
          >
            Discard
          </button>
        </div>
      )}
      <DndContext
        id="arrange-dnd"
        sensors={sensors}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        autoScroll={{ threshold: { x: 0, y: 0.12 }, acceleration: 6 }}
      >
        <ProfileFrame frame={frame} containerClassName="px-3 sm:px-4 pt-6 pb-24">
          <CanvasBoundary>
            <div
              className={`${s.canvas} ${view === "phone" ? s.phone : ""} ${stickers.placing ? s.placing : ""} @container mx-auto ${view === "phone" ? "" : narrow ? "max-w-2xl" : "max-w-7xl"}`}
              onPointerDownCapture={(e) => {
                // Placing a sticker: the press sticks it on, and nothing else
                // under it (a button, a drag) reacts.
                if (stickers.placing && stickers.placeAt(e.clientX, e.clientY)) {
                  e.preventDefault();
                  e.stopPropagation();
                  swallowClick.current = true;
                }
              }}
              onClickCapture={(e) => {
                if (!swallowClick.current) return;
                swallowClick.current = false;
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <InsertRow
                onAdd={(preset) => {
                  const { home: next, section } = addSection(home, 0, preset);
                  commit(next);
                  setTargetColumn(section.columns[0].id);
                }}
              />
              {home.sections.map((section, i) => (
                <div key={section.id}>
                  <EditorSection
                    home={home}
                    section={section}
                    index={i}
                    count={home.sections.length}
                    ctx={ctx}
                    view={view}
                    flash={flash}
                    drop={drop}
                    draggingId={drag?.kind === "block" ? drag.id : null}
                    targetColumn={targetColumn}
                    onTarget={setTargetColumn}
                    onPreset={(preset) => commit(applyPreset(home, section.id, preset))}
                    onMove={(dir) => commit(moveSection(home, section.id, dir))}
                    onRemove={() => {
                      const lose = section.columns.flatMap((c) => c.blocks).filter((b) => !isSingleton(b.type) && b.type !== "divider");
                      if (lose.length > 0 && !confirm(`This row has ${lose.length} thing${lose.length === 1 ? "" : "s"} you made in it. Remove it anyway? (Undo brings it back.)`)) return;
                      commit(removeSection(home, section.id));
                    }}
                    onResize={(left, delta, before) => commit(resizeColumns(before, section.id, left, delta), before)}
                    onResizePreview={(left, delta, before) => dispatch({ type: "preview", home: resizeColumns(before, section.id, left, delta) })}
                    getHome={getHome}
                    onBlockSettings={setSettingsId}
                    onBlockRemove={(id) => commit(removeBlock(home, id))}
                    onBlockNudge={(id, dir) => moveBy(id, (h) => nudgeBlock(h, id, dir), dir === -1 ? "up" : "down")}
                    onBlockAcross={(id, dir) => moveBy(id, (h) => moveAcross(h, id, dir), dir === -1 ? "left" : "right")}
                    stickers={stickers}
                  />
                  <InsertRow
                    onAdd={(preset) => {
                      const { home: next, section: added } = addSection(home, i + 1, preset);
                      commit(next);
                      setTargetColumn(added.columns[0].id);
                    }}
                  />
                </div>
              ))}
            </div>
          </CanvasBoundary>
        </ProfileFrame>

        {mounted && stickerDrawer && createPortal(
          <StickerDrawer home={home} editing={stickers} accent={ctx.styles.accent} onClose={() => setStickerDrawer(false)} />,
          document.body,
        )}

        {mounted && trayOpen && createPortal(
          <WidgetTray home={home} ctx={ctx} onAdd={(type) => add(type)} onClose={() => setTrayOpen(false)} />,
          document.body,
        )}

        <DragOverlay dropAnimation={null} style={{ pointerEvents: "none" }}>
          {drag ? (
            <div className={s.dragChip}>{drag.kind === "tray" ? BLOCK_INFO[drag.type].label : labelOf(drag.id)}</div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <StickerBar
        home={home}
        editing={stickers}
        shown={(id) => {
          const b = findBlock(home, id)?.block;
          return !b || blockVisible(b, ctx);
        }}
      />

      {mounted && editing && createPortal(
        <BlockSettings
          block={editing}
          ctx={ctx}
          onChange={(config, first) => {
            if (first) commit(updateConfig(home, editing.id, config));
            else dispatch({ type: "preview", home: updateConfig(homeRef.current, editing.id, config) });
          }}
          onClose={() => setSettingsId(null)}
        />,
        document.body,
      )}
    </div>
  );
}

/** If drawing the page ever fails, say so and keep the editor (and its unsaved work) alive. */
class CanvasBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error) {
      return (
        <div className={s.crash} role="alert">
          <p>Something on this page couldn&apos;t be drawn. Your changes are still here.</p>
          <button type="button" className={s.textBtn} onClick={() => this.setState({ error: false })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Rows ───────────────────────────────────────────────────────────────────

function InsertRow({ onAdd }: { onAdd: (preset: (typeof LAYOUT_PRESETS)[number]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className={s.insertRow} ref={ref}>
      <button type="button" className={s.insertBtn} aria-expanded={open} onClick={() => setOpen(!open)}>
        ＋ Add a row
      </button>
      {open && (
        <div className={s.presetPicker}>
          {LAYOUT_PRESETS.map((p) => (
            <button key={p.id} type="button" className={s.presetBtn} onClick={() => { onAdd(p); setOpen(false); }} title={p.label}>
              <PresetSketch preset={p} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PresetSketch({ preset }: { preset: (typeof LAYOUT_PRESETS)[number] }) {
  return (
    <span className={s.sketch} aria-hidden="true">
      {preset.style === "flow"
        ? [1, 2, 3].map((n) => <i key={n} style={{ flex: 1, height: n === 2 ? "60%" : "100%" }} />)
        : preset.spans.map((span, n) => <i key={n} style={{ flex: span }} />)}
    </span>
  );
}

interface SectionProps {
  home: ProfileHome;
  section: ProfileSection;
  index: number;
  count: number;
  ctx: ProfileContext;
  view: "desktop" | "phone";
  flash: string | null;
  drop: DropTarget | null;
  draggingId: string | null;
  targetColumn: string | null;
  onTarget: (id: string) => void;
  onPreset: (preset: (typeof LAYOUT_PRESETS)[number]) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onResize: (left: number, delta: number, before: ProfileHome) => void;
  onResizePreview: (left: number, delta: number, before: ProfileHome) => void;
  getHome: () => ProfileHome;
  onBlockSettings: (id: string) => void;
  onBlockRemove: (id: string) => void;
  onBlockNudge: (id: string, dir: -1 | 1) => void;
  onBlockAcross: (id: string, dir: -1 | 1) => void;
  stickers: StickerEditing;
}

function EditorSection(props: SectionProps) {
  const { section, index, count, view } = props;
  const preset = presetOf(section);
  const tracks = columnTracks(section.columns);
  const many = section.style === "columns" && section.columns.length > 1;
  const gridRef = useRef<HTMLDivElement>(null);

  return (
    <section className={s.section} aria-label={`Row ${index + 1}`}>
      <div className={s.sectionBar}>
        <span className={s.sectionName}>Row {index + 1}</span>
        <label className={s.sectionSelect}>
          <span className="sr-only">Row layout</span>
          <select
            value={preset ?? ""}
            onChange={(e) => {
              const p = LAYOUT_PRESETS.find((x) => x.id === e.target.value);
              if (p) props.onPreset(p);
            }}
          >
            {!preset && <option value="">Custom widths</option>}
            {LAYOUT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <span className={s.spacer} />
        <button type="button" className={s.iconBtn} onClick={() => props.onMove(-1)} disabled={index === 0} aria-label={`Move row ${index + 1} up`}>↑</button>
        <button type="button" className={s.iconBtn} onClick={() => props.onMove(1)} disabled={index === count - 1} aria-label={`Move row ${index + 1} down`}>↓</button>
        <button
          type="button"
          className={s.iconBtn}
          onClick={props.onRemove}
          disabled={!sectionRemovable(section)}
          aria-label={`Remove row ${index + 1}`}
          title={sectionRemovable(section) ? "Remove this row" : "Move your profile card and entries out of this row first"}
        >
          ✕
        </button>
      </div>

      <div
        ref={gridRef}
        className={many ? "grid gap-8 @3xl:grid-cols-[var(--cols-md)] @5xl:grid-cols-[var(--cols-lg)] @6xl:grid-cols-[var(--cols-xl)]" : ""}
        style={many ? ({ "--cols-md": tracks.md, "--cols-lg": tracks.lg, "--cols-xl": tracks.xl } as React.CSSProperties) : undefined}
      >
        {section.columns.map((column, ci) => (
          <EditorColumn
            key={column.id}
            props={props}
            columnId={column.id}
            blocks={column.blocks}
            flow={section.style === "flow"}
            resizer={
              many && ci < section.columns.length - 1 && view === "desktop" ? (
                <ColumnResizer
                  gridRef={gridRef}
                  left={ci}
                  spans={[column.span, section.columns[ci + 1].span]}
                  onResize={props.onResize}
                  onResizePreview={props.onResizePreview}
                  getHome={props.getHome}
                />
              ) : null
            }
          />
        ))}
      </div>
    </section>
  );
}

// ── Columns ────────────────────────────────────────────────────────────────

function EditorColumn({
  props,
  columnId,
  blocks,
  flow,
  resizer,
}: {
  props: SectionProps;
  columnId: string;
  blocks: ProfileBlock[];
  flow: boolean;
  resizer: ReactNode;
}) {
  const { drop } = props;
  const dropHere = drop?.columnId === columnId;
  return (
    <div
      className={`${s.column} ${flow ? s.columnFlow : ""} ${dropHere ? s.columnOver : ""} ${props.targetColumn === columnId ? s.columnTargeted : ""}`}
      data-drop-column={columnId}
      data-drop-flow={flow ? "1" : "0"}
      onPointerDown={() => props.onTarget(columnId)}
      onFocus={() => props.onTarget(columnId)}
    >
      {blocks.map((b) => (
        <EditorBlock
          key={b.id}
          block={b}
          columnId={columnId}
          flow={flow}
          props={props}
          dropEdge={dropHere && drop?.blockId === b.id ? drop.edge : null}
        />
      ))}
      {blocks.length === 0 ? (
        <p className={s.emptyColumn}>{dropHere ? "Drop it here" : "Drag something here, or click this column and use ＋ Add."}</p>
      ) : (
        dropHere && drop?.edge === "end" && <div className={s.dropEnd} aria-hidden="true" />
      )}
      {resizer}
    </div>
  );
}

function ColumnResizer({
  gridRef,
  left,
  spans,
  onResize,
  onResizePreview,
  getHome,
}: {
  gridRef: React.RefObject<HTMLDivElement | null>;
  left: number;
  spans: [number, number];
  onResize: SectionProps["onResize"];
  onResizePreview: SectionProps["onResizePreview"];
  getHome: () => ProfileHome;
}) {
  function start(e: React.PointerEvent<HTMLButtonElement>) {
    const grid = gridRef.current;
    if (!grid) return;
    e.preventDefault();
    e.stopPropagation();
    // The page as it was when the drag began: previews redraw from it, and
    // only the final width goes into Undo.
    const before = getHome();
    const unit = grid.getBoundingClientRect().width / 12;
    const x0 = e.clientX;
    let delta = 0;
    const move = (ev: PointerEvent) => {
      const d = Math.round((ev.clientX - x0) / unit);
      if (d !== delta) {
        delta = d;
        onResizePreview(left, d, before);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onResize(left, delta, before);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  return (
    <button
      type="button"
      className={`${s.resizer} hidden @3xl:block`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Column width"
      aria-valuemin={2}
      aria-valuemax={spans[0] + spans[1] - 2}
      aria-valuenow={spans[0]}
      aria-valuetext={`${spans[0]} of ${spans[0] + spans[1]} parts`}
      onPointerDown={start}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onResize(left, e.key === "ArrowLeft" ? -1 : 1, getHome());
        }
      }}
    />
  );
}

// ── Blocks ─────────────────────────────────────────────────────────────────

function EditorBlock({
  block,
  columnId,
  flow,
  props,
  dropEdge,
}: {
  block: ProfileBlock;
  columnId: string;
  flow: boolean;
  props: SectionProps;
  dropEdge: "before" | "after" | "end" | null;
}) {
  const { ctx, home } = props;
  const info = BLOCK_INFO[block.type];
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({ id: block.id });
  const dragging = props.draggingId === block.id;
  const visible = blockVisible(block, ctx);
  const preview = useMemo(() => {
    if (!visible) return null;
    if (block.type === "entries") return <EntriesPreview block={block} ctx={ctx} />;
    return <ProfileBlockView block={block} ctx={ctx} />;
  }, [block, ctx, visible]);

  const found = findBlock(home, block.id);
  const columns = home.sections.flatMap((x) => x.columns);
  const ci = found ? columns.findIndex((c) => c.id === found.column.id) : -1;
  const canUp = !!found && (found.index > 0 || ci > 0);
  const canDown = !!found && (found.index < found.column.blocks.length - 1 || ci < columns.length - 1);
  const canLeft = !!neighbourColumn(home, block.id, -1);
  const canRight = !!neighbourColumn(home, block.id, 1);
  const edgeClass =
    dropEdge === "before" ? (flow ? s.dropLeft : s.dropTop)
    : dropEdge === "after" ? (flow ? s.dropRight : s.dropBottom)
    : "";

  return (
    <div
      ref={setNodeRef}
      id={`arrange-${block.id}`}
      data-drop-block={block.id}
      data-drop-col={columnId}
      data-drop-flow={flow ? "1" : "0"}
      className={`${s.block} ${dragging ? s.blockDragging : ""} ${props.flash === block.id ? s.blockFlash : ""} ${edgeClass}`}
    >
      <div className={s.blockBar}>
        <button
          ref={setActivatorNodeRef}
          type="button"
          className={s.grip}
          {...attributes}
          {...listeners}
          aria-label={`Drag ${info.label} (or use the arrow buttons)`}
          // Pointer and touch only; keyboards use the arrow buttons, which
          // say where the block goes.
          tabIndex={-1}
        >
          <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" /><circle cx="3" cy="8" r="1.4" /><circle cx="9" cy="8" r="1.4" /><circle cx="3" cy="13" r="1.4" /><circle cx="9" cy="13" r="1.4" /></g></svg>
        </button>
        <span className={s.blockLabel}>{info.label}</span>
        <span className={s.spacer} />
        {info.editable && (
          <button type="button" className={s.textBtn} onClick={() => props.onBlockSettings(block.id)}>Edit</button>
        )}
        <span className={s.moves}>
          <button type="button" className={s.iconBtn} data-move="left" onClick={() => props.onBlockAcross(block.id, -1)} disabled={!canLeft} aria-label={`Move ${info.label} to the column on the left`} title="Move to the column on the left">←</button>
          <button type="button" className={s.iconBtn} data-move="up" onClick={() => props.onBlockNudge(block.id, -1)} disabled={!canUp} aria-label={`Move ${info.label} up`} title="Move up">↑</button>
          <button type="button" className={s.iconBtn} data-move="down" onClick={() => props.onBlockNudge(block.id, 1)} disabled={!canDown} aria-label={`Move ${info.label} down`} title="Move down">↓</button>
          <button type="button" className={s.iconBtn} data-move="right" onClick={() => props.onBlockAcross(block.id, 1)} disabled={!canRight} aria-label={`Move ${info.label} to the column on the right`} title="Move to the column on the right">→</button>
        </span>
        {!info.fixed && (
          <button type="button" className={s.iconBtn} onClick={() => props.onBlockRemove(block.id)} aria-label={`Take ${info.label} off the page`} title="Take off the page">✕</button>
        )}
      </div>
      <div
        className={s.stickerHost}
        data-sticker-host={block.id}
        style={{ "--sticker-accent": ctx.styles.accent } as React.CSSProperties}
      >
        {preview ? (
          <div className={s.blockBody} inert>
            {preview}
          </div>
        ) : (
          <button type="button" className={s.blockEmpty} onClick={info.editable ? () => props.onBlockSettings(block.id) : undefined} disabled={!info.editable}>
            {EMPTY_HINTS[block.type] ?? "Nothing to show here yet."}
          </button>
        )}
        <EditorStickers stickers={home.stickers.filter((st) => st.anchor === block.id)} editing={props.stickers} />
      </div>
    </div>
  );
}

/** Entries are long; the editor shows the first few so the page stays easy to move around. */
function EntriesPreview({ block, ctx }: { block: ProfileBlock; ctx: ProfileContext }) {
  const limit = block.config.limit ?? null;
  const entries = ctx.entries.initial.slice(0, Math.min(3, limit ?? 3));
  const looks: Record<string, string> = { cards: "as cards", full: "as full posts", preview: "as a list", magazine: "as a magazine" };
  const look = block.config.display ? looks[block.config.display] : null;
  const shown = Math.min(limit ?? ctx.entries.total, ctx.entries.total);
  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-widest mb-3" style={{ color: ctx.styles.muted }}>
        {limit ? "Latest entries" : "Journal entries"}
        <span className={s.chip}>{limit ? `latest ${limit}, then “See all”` : "all, with pages"}</span>
        {look && <span className={s.chip}>{look}</span>}
      </h2>
      <div className="flex flex-col gap-3">
        {entries.map((e) => (
          <article key={e.id} className={`profile-widget-card ${ctx.styles.borderRadius} border p-3`} style={ctx.styles.surface}>
            <h3 className="font-semibold" style={{ fontFamily: "var(--serif, var(--font-lora, Georgia, serif))" }}>{e.title || "Untitled"}</h3>
            {e.excerpt && <p className="text-sm line-clamp-2 mt-1" style={{ color: ctx.styles.muted }}>{e.excerpt}</p>}
          </article>
        ))}
        {entries.length === 0 && <p className="text-sm" style={{ color: ctx.styles.muted }}>Your entries will be here.</p>}
        {shown > entries.length && (
          <p className="text-xs" style={{ color: ctx.styles.muted }}>
            …{shown - entries.length} more on your page{limit && ctx.entries.total > limit ? `, ${ctx.entries.total.toLocaleString("en-US")} in your whole journal` : ""}
          </p>
        )}
      </div>
    </section>
  );
}
