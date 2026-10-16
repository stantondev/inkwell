"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { columnTracks, type ProfileBlock, type ProfileBlockType, type ProfileHome, type ProfileSection } from "@/lib/profile-home";
import {
  BLOCK_INFO,
  LAYOUT_PRESETS,
  TEMPLATES,
  addSection,
  applyPreset,
  applyTemplate,
  findBlock,
  insertBlock,
  isSingleton,
  moveSection,
  newBlock,
  nudgeBlock,
  presetOf,
  removeBlock,
  removeSection,
  resizeColumns,
  sectionRemovable,
  shuffleHome,
  updateConfig,
} from "@/lib/home-edit";
import { ProfileFrame, type ProfileFrameProps } from "@/app/[username]/profile-frame";
import { ProfileBlockView, blockVisible, type ProfileContext } from "@/app/[username]/profile-layout";
import { BlockSettings } from "./block-settings";
import { WidgetTray, TRAY_PREFIX } from "./widget-tray";
import s from "./arrange.module.css";

interface Props {
  initialHome: ProfileHome;
  ctx: ProfileContext;
  frame: ProfileFrameProps;
  username: string;
}

type Drag = { kind: "block"; id: string } | { kind: "tray"; type: ProfileBlockType } | null;

const COL = "col:";

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

export function ArrangeEditor({ initialHome, ctx, frame, username }: Props) {
  const [home, setHome] = useState<ProfileHome>(initialHome);
  const [past, setPast] = useState<ProfileHome[]>([]);
  const [future, setFuture] = useState<ProfileHome[]>([]);
  const [saved, setSaved] = useState(() => JSON.stringify(initialHome));
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error" | "note"; text?: string }>({ kind: "idle" });
  const [view, setView] = useState<"desktop" | "phone">("desktop");
  const [trayOpen, setTrayOpen] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [targetColumn, setTargetColumn] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | "layouts">(null);
  const snapshot = useRef<ProfileHome | null>(null);
  // The current home for handlers that outlive a render (column resizing).
  const homeRef = useRef(home);
  useEffect(() => {
    homeRef.current = home;
  }, [home]);
  const getHome = useCallback(() => homeRef.current, []);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dirty = JSON.stringify(home) !== saved;

  // ── History ────────────────────────────────────────────────────────────
  const commit = useCallback((next: ProfileHome, before?: ProfileHome) => {
    setHome((current) => {
      const prev = before ?? current;
      if (JSON.stringify(prev) === JSON.stringify(next)) return current;
      setPast((p) => [...p.slice(-49), prev]);
      setFuture([]);
      return next;
    });
    setStatus((st) => (st.kind === "saved" || st.kind === "note" ? { kind: "idle" } : st));
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setHome((current) => {
        setFuture((f) => [current, ...f].slice(0, 50));
        return prev;
      });
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setHome((current) => {
        setPast((p) => [...p.slice(-49), current]);
        return next;
      });
      return f.slice(1);
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
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
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ── Saving ─────────────────────────────────────────────────────────────
  async function save() {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/me/home", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save your page.");
      const clean = data.data as ProfileHome;
      setHome(clean);
      setSaved(JSON.stringify(clean));
      setStatus({ kind: "saved" });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "Couldn't save your page." });
    }
  }

  // ── Adding ─────────────────────────────────────────────────────────────
  /** Where a click in the tray puts things: the column last clicked, else a sidebar, else the last column. */
  function defaultColumn(h: ProfileHome): string {
    if (targetColumn && h.sections.some((sec) => sec.columns.some((c) => c.id === targetColumn))) return targetColumn;
    const columns = h.sections.flatMap((sec) => sec.columns);
    const side = columns.find((c) => c.span <= 4 && !c.blocks.some((b) => b.type === "entries" || b.type === "profile_card"));
    return (side ?? columns[columns.length - 1]).id;
  }

  function add(type: ProfileBlockType, columnId?: string, index?: number) {
    const block = newBlock(type);
    const col = columnId ?? defaultColumn(home);
    commit(insertBlock(home, block, col, index));
    reveal(block.id, BLOCK_INFO[type].own && BLOCK_INFO[type].editable);
    return block;
  }

  function reveal(id: string, openSettings?: boolean) {
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1600);
    requestAnimationFrame(() => {
      document.getElementById(`arrange-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    if (openSettings) {
      setTrayOpen(false);
      setSettingsId(id);
    }
  }

  // ── Dragging ───────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const containerOf = useCallback(
    (id: string): string | null => {
      if (id.startsWith(COL)) return id.slice(COL.length);
      return findBlock(home, id)?.column.id ?? null;
    },
    [home],
  );

  const labelOf = useCallback(
    (id: string | number): string => {
      const key = String(id);
      if (key.startsWith(TRAY_PREFIX)) return BLOCK_INFO[key.slice(TRAY_PREFIX.length) as ProfileBlockType]?.label ?? "a new block";
      if (key.startsWith(COL)) return "an empty column";
      const b = findBlock(home, key)?.block;
      return b ? BLOCK_INFO[b.type].label : "a block";
    },
    [home],
  );

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${labelOf(active.id)} is over ${labelOf(over.id)}.` : `${labelOf(active.id)} isn't over anywhere it can go.`),
    onDragEnd: ({ active, over }) => (over ? `${labelOf(active.id)} dropped by ${labelOf(over.id)}.` : `${labelOf(active.id)} put back.`),
    onDragCancel: ({ active }) => `Moving ${labelOf(active.id)} cancelled; it's back where it was.`,
  };

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    snapshot.current = home;
    setDrag(id.startsWith(TRAY_PREFIX) ? { kind: "tray", type: id.slice(TRAY_PREFIX.length) as ProfileBlockType } : { kind: "block", id });
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    if (activeId.startsWith(TRAY_PREFIX)) return;
    const from = containerOf(activeId);
    const to = containerOf(String(over.id));
    if (!from || !to || from === to) return;
    // Across columns: move it now, so the page makes room as it goes.
    setHome((h) => {
      const target = h.sections.flatMap((x) => x.columns).find((c) => c.id === to);
      if (!target) return h;
      const overIndex = target.blocks.findIndex((b) => b.id === String(over.id));
      const found = findBlock(h, activeId);
      if (!found) return h;
      const without = removeBlock(h, activeId);
      return insertBlock(without, found.block, to, overIndex >= 0 ? overIndex : target.blocks.length);
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const before = snapshot.current ?? home;
    snapshot.current = null;
    setDrag(null);
    const activeId = String(active.id);

    if (activeId.startsWith(TRAY_PREFIX)) {
      if (!over) return;
      const type = activeId.slice(TRAY_PREFIX.length) as ProfileBlockType;
      const to = containerOf(String(over.id));
      if (!to) return;
      const col = home.sections.flatMap((x) => x.columns).find((c) => c.id === to);
      const index = col ? col.blocks.findIndex((b) => b.id === String(over.id)) : -1;
      add(type, to, index >= 0 ? index : undefined);
      return;
    }

    let next = home;
    if (over) {
      const from = containerOf(activeId);
      const to = containerOf(String(over.id));
      if (from && from === to && !String(over.id).startsWith(COL)) {
        next = {
          ...home,
          sections: home.sections.map((sec) => ({
            ...sec,
            columns: sec.columns.map((c) => {
              if (c.id !== to) return c;
              const a = c.blocks.findIndex((b) => b.id === activeId);
              const b = c.blocks.findIndex((x) => x.id === String(over.id));
              return a >= 0 && b >= 0 ? { ...c, blocks: arrayMove(c.blocks, a, b) } : c;
            }),
          })),
        };
      }
    }
    commit(next, before);
  }

  function onDragCancel() {
    if (snapshot.current) setHome(snapshot.current);
    snapshot.current = null;
    setDrag(null);
  }

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
        href={`/${username}`}
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
      <span className={s.menuWrap}>
        <button type="button" className={s.toolBtn} aria-expanded={menu === "layouts"} onClick={() => setMenu(menu === "layouts" ? null : "layouts")}>
          Layouts <span aria-hidden="true">▾</span>
        </button>
        {menu === "layouts" && (
          <div className={s.menu} role="menu">
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
                <button
                  key={w}
                  type="button"
                  aria-pressed={home.width === w}
                  onClick={() => commit({ ...home, width: w })}
                >
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
        <Link href={`/${username}`} className={s.toolLink}>See it</Link>
      )}
      <button type="button" className={s.saveBtn} onClick={save} disabled={!dirty || status.kind === "saving"}>
        Save
      </button>
    </div>
  );

  return (
    <div className={`arrange-shell ${s.shell}`} onClick={() => menu && setMenu(null)}>
      {toolbar}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        accessibility={{ announcements }}
      >
        <ProfileFrame frame={frame} containerClassName="px-3 sm:px-4 pt-6 pb-24">
          <div
            className={`${s.canvas} ${view === "phone" ? s.phone : ""} @container mx-auto ${view === "phone" ? "" : narrow ? "max-w-2xl" : "max-w-7xl"}`}
          >
            <InsertRow onAdd={(preset) => {
              const { home: next, section } = addSection(home, 0, preset);
              commit(next);
              setTargetColumn(section.columns[0].id);
            }} />
            {home.sections.map((section, i) => (
              <div key={section.id}>
                <EditorSection
                  section={section}
                  index={i}
                  count={home.sections.length}
                  ctx={ctx}
                  view={view}
                  flash={flash}
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
                  onResizePreview={(left, delta, before) => setHome(resizeColumns(before, section.id, left, delta))}
                  getHome={getHome}
                  onBlockSettings={setSettingsId}
                  onBlockRemove={(id) => commit(removeBlock(home, id))}
                  onBlockNudge={(id, dir) => {
                    commit(nudgeBlock(home, id, dir));
                    requestAnimationFrame(() => document.getElementById(`arrange-${id}`)?.querySelector<HTMLButtonElement>(`[data-nudge="${dir}"]`)?.focus());
                  }}
                />
                <InsertRow onAdd={(preset) => {
                  const { home: next, section: added } = addSection(home, i + 1, preset);
                  commit(next);
                  setTargetColumn(added.columns[0].id);
                }} />
              </div>
            ))}
          </div>
        </ProfileFrame>

        {mounted && trayOpen && createPortal(
          <WidgetTray
            home={home}
            ctx={ctx}
            onAdd={(type) => add(type)}
            onClose={() => setTrayOpen(false)}
          />,
          document.body,
        )}

        <DragOverlay dropAnimation={null}>
          {drag ? (
            <div className={s.dragChip}>
              {drag.kind === "tray" ? BLOCK_INFO[drag.type].label : labelOf(drag.id)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {mounted && editing && createPortal(
        <BlockSettings
          block={editing}
          ctx={ctx}
          onChange={(config, before) => {
            if (before) commit(updateConfig(home, editing.id, config));
            else setHome((h) => updateConfig(h, editing.id, config));
          }}
          onClose={() => setSettingsId(null)}
        />,
        document.body,
      )}
    </div>
  );
}

// ── Rows ───────────────────────────────────────────────────────────────────

function InsertRow({ onAdd }: { onAdd: (preset: (typeof LAYOUT_PRESETS)[number]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={s.insertRow}>
      <button type="button" className={s.insertBtn} aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        ＋ Add a row
      </button>
      {open && (
        <div className={s.presetPicker} onClick={(e) => e.stopPropagation()}>
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
  section: ProfileSection;
  index: number;
  count: number;
  ctx: ProfileContext;
  view: "desktop" | "phone";
  flash: string | null;
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
}

function EditorSection(props: SectionProps) {
  const { section, index, count, ctx, view } = props;
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
        className={
          section.style === "flow"
            ? s.flowGrid
            : many
              ? `grid gap-8 @3xl:grid-cols-[var(--cols-md)] @5xl:grid-cols-[var(--cols-lg)] @6xl:grid-cols-[var(--cols-xl)]`
              : ""
        }
        style={many ? ({ "--cols-md": tracks.md, "--cols-lg": tracks.lg, "--cols-xl": tracks.xl } as React.CSSProperties) : undefined}
      >
        {section.columns.map((column, ci) => (
          <EditorColumn
            key={column.id}
            columnId={column.id}
            blocks={column.blocks}
            flow={section.style === "flow"}
            ctx={ctx}
            flash={props.flash}
            targeted={props.targetColumn === column.id}
            onTarget={() => props.onTarget(column.id)}
            onBlockSettings={props.onBlockSettings}
            onBlockRemove={props.onBlockRemove}
            onBlockNudge={props.onBlockNudge}
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

interface ColumnProps {
  columnId: string;
  blocks: ProfileBlock[];
  flow: boolean;
  ctx: ProfileContext;
  flash: string | null;
  targeted: boolean;
  onTarget: () => void;
  onBlockSettings: (id: string) => void;
  onBlockRemove: (id: string) => void;
  onBlockNudge: (id: string, dir: -1 | 1) => void;
  resizer: React.ReactNode;
}

function EditorColumn(props: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: COL + props.columnId });
  return (
    <div
      ref={setNodeRef}
      className={`${s.column} ${props.flow ? s.columnFlow : ""} ${isOver ? s.columnOver : ""} ${props.targeted ? s.columnTargeted : ""}`}
      onPointerDown={props.onTarget}
      onFocus={props.onTarget}
    >
      <SortableContext items={props.blocks.map((b) => b.id)} strategy={props.flow ? rectSortingStrategy : verticalListSortingStrategy}>
        {props.blocks.map((b) => (
          <EditorBlock
            key={b.id}
            block={b}
            ctx={props.ctx}
            flash={props.flash === b.id}
            onSettings={() => props.onBlockSettings(b.id)}
            onRemove={() => props.onBlockRemove(b.id)}
            onNudge={(dir) => props.onBlockNudge(b.id, dir)}
          />
        ))}
      </SortableContext>
      {props.blocks.length === 0 && (
        <p className={s.emptyColumn}>Drag something here, or click a column and use ＋ Add.</p>
      )}
      {props.resizer}
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
      onResize(left, delta, before);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
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
  ctx,
  flash,
  onSettings,
  onRemove,
  onNudge,
}: {
  block: ProfileBlock;
  ctx: ProfileContext;
  flash: boolean;
  onSettings: () => void;
  onRemove: () => void;
  onNudge: (dir: -1 | 1) => void;
}) {
  const info = BLOCK_INFO[block.type];
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const visible = blockVisible(block, ctx);
  const preview = useMemo(() => {
    if (!visible) return null;
    if (block.type === "entries") return <EntriesPreview block={block} ctx={ctx} />;
    return <ProfileBlockView block={block} ctx={ctx} />;
  }, [block, ctx, visible]);

  return (
    <div
      ref={setNodeRef}
      id={`arrange-${block.id}`}
      className={`${s.block} ${isDragging ? s.blockDragging : ""} ${flash ? s.blockFlash : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div className={s.blockBar}>
        <button
          ref={setActivatorNodeRef}
          type="button"
          className={s.grip}
          aria-label={`Move ${info.label}`}
          {...attributes}
          {...listeners}
        >
          <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" /><circle cx="3" cy="8" r="1.4" /><circle cx="9" cy="8" r="1.4" /><circle cx="3" cy="13" r="1.4" /><circle cx="9" cy="13" r="1.4" /></g></svg>
        </button>
        <span className={s.blockLabel}>{info.label}</span>
        <span className={s.spacer} />
        {info.editable && (
          <button type="button" className={s.textBtn} onClick={onSettings}>Edit</button>
        )}
        <button type="button" className={s.iconBtn} data-nudge="-1" onClick={() => onNudge(-1)} aria-label={`Move ${info.label} up`}>↑</button>
        <button type="button" className={s.iconBtn} data-nudge="1" onClick={() => onNudge(1)} aria-label={`Move ${info.label} down`}>↓</button>
        {!info.fixed && (
          <button type="button" className={s.iconBtn} onClick={onRemove} aria-label={`Take ${info.label} off the page`} title="Take off the page">✕</button>
        )}
      </div>
      {preview ? (
        <div className={s.blockBody} inert>
          {preview}
        </div>
      ) : (
        <button type="button" className={s.blockEmpty} onClick={info.editable ? onSettings : undefined} disabled={!info.editable}>
          {EMPTY_HINTS[block.type] ?? "Nothing to show here yet."}
        </button>
      )}
    </div>
  );
}

/** Entries are long; the editor shows the first few so the page stays easy to move around. */
function EntriesPreview({ block, ctx }: { block: ProfileBlock; ctx: ProfileContext }) {
  const limit = block.config.limit ?? null;
  const entries = ctx.entries.initial.slice(0, Math.min(3, limit ?? 3));
  const looks: Record<string, string> = { cards: "as cards", full: "as full posts", preview: "as a list", magazine: "as a magazine" };
  const look = block.config.display ? looks[block.config.display] : null;
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
        {ctx.entries.total > entries.length && (
          <p className="text-xs" style={{ color: ctx.styles.muted }}>
            {limit
              ? `…${Math.min(limit, ctx.entries.total) - entries.length > 0 ? `${Math.min(limit, ctx.entries.total) - entries.length} more here, ` : ""}${ctx.entries.total.toLocaleString("en-US")} in your whole journal`
              : `…and ${ctx.entries.total - entries.length} more`}
          </p>
        )}
      </div>
    </section>
  );
}
