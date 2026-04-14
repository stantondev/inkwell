"use client";

/**
 * Main client wrapper for Inline Marginalia on the entry detail page.
 *
 * Responsibilities:
 *  - Hydrate initial margin notes fetched server-side into local state
 *  - On mount + resize + font-ready, resolve each anchor against the
 *    live DOM via the anchor.ts module, wrap matched ranges in
 *    <ink-mark>, and compute the margin column layout
 *  - Listen for `selectionchange` and show the floating "Add marginalia"
 *    button when the reader selects text inside the prose root
 *  - Mount the right-margin aside (desktop ≥1280px, reserved inside
 *    the prose wrapper via padding-right), inline cards
 *    (tablet 1024–1279px), or a bottom sheet (mobile <1024px) to render
 *    the notes
 *
 * Does NOT attempt SSR pre-marking — highlights fade in on hydration.
 * See /Users/stanton/.claude/plans/hidden-tinkering-lecun.md for design.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveAnchor } from "@/lib/marginalia/anchor";
import { wrapRange, unwrapMarks, measureMarks } from "@/lib/marginalia/wrap";
import type { MarginNote } from "@/lib/marginalia/types";
import { AddNoteButton } from "./add-note-button";
import { ComposeNotePopover } from "./compose-note-popover";
import { MarginNoteCard } from "./margin-note-card";
import { OrphanedNotesSection } from "./orphaned-notes-section";
import { MarginaliaBottomSheet } from "./marginalia-bottom-sheet";

interface MarginaliaReaderProps {
  entryId: string;
  entryUserId: string;
  initialNotes: MarginNote[];
  initialOrphaned: MarginNote[];
  viewer: {
    id: string;
    isLoggedIn: boolean;
  };
  children: React.ReactNode;
}

interface NoteLayout {
  note: MarginNote;
  /** Resolved position of the anchor's first <ink-mark>, in container coords */
  anchorTop: number | null;
  /** The vertical position after stacking collision avoidance */
  displayTop: number | null;
  /** Was this note displaced from its anchor by stacking? */
  displaced: boolean;
  height: number;
}

// ≥1280px: right-margin aside alongside the prose. We reserve
//          padding-right inside the marginalia wrapper so the aside
//          fits within the existing .entry-wide content area — no
//          spilling outside, no viewport-width assumptions.
// 1024-1279px: inline cards below paragraphs
// <1024px: bottom sheet on tap
const DESKTOP_BREAKPOINT = 1280;
const TABLET_BREAKPOINT = 1024;

export function MarginaliaReader({
  entryId,
  entryUserId,
  initialNotes,
  initialOrphaned,
  viewer,
  children,
}: MarginaliaReaderProps) {
  const proseWrapperRef = useRef<HTMLDivElement>(null);
  const marginColumnRef = useRef<HTMLDivElement>(null);
  const noteHeightsRef = useRef<Map<string, number>>(new Map());

  const [notes, setNotes] = useState<MarginNote[]>(initialNotes);
  const [orphaned, setOrphaned] = useState<MarginNote[]>(initialOrphaned);
  const [layouts, setLayouts] = useState<NoteLayout[]>([]);
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);

  // Selection -> floating button state
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [pendingSelection, setPendingSelection] = useState<Range | null>(null);
  const [composing, setComposing] = useState(false);
  // Mirror `composing` into a ref so the selectionchange handler (captured
  // in useEffect below) can read the current value without needing to be
  // torn down and re-registered every time composing flips.
  const composingRef = useRef(false);
  useEffect(() => {
    composingRef.current = composing;
  }, [composing]);

  // Mobile bottom sheet: which notes are open (by anchor ID). null = closed
  const [bottomSheetNoteId, setBottomSheetNoteId] = useState<string | null>(null);

  // Viewport size for layout mode. IMPORTANT: initialize with a fixed
  // default so SSR and client first-render agree (no hydration mismatch).
  // The real viewport width is read in an effect below.
  const [viewportWidth, setViewportWidth] = useState<number>(1400);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setViewportWidth(window.innerWidth);
    }
  }, []);

  const layoutMode: "desktop" | "tablet" | "mobile" =
    viewportWidth >= DESKTOP_BREAKPOINT
      ? "desktop"
      : viewportWidth >= TABLET_BREAKPOINT
        ? "tablet"
        : "mobile";

  // ── Resolve anchors + wrap marks ──────────────────────────────────

  const getProseRoot = useCallback((): HTMLElement | null => {
    // The EntryContent component renders its body inside a div whose ID is
    // `entry-${id}`. That's our prose root.
    return document.getElementById(`entry-${entryId}`);
  }, [entryId]);

  const resolveAndWrapAll = useCallback(async () => {
    const root = getProseRoot();
    if (!root) return;

    // Clear any existing marks before re-wrapping
    unwrapMarks(root);

    const freshlyOrphaned: string[] = [];
    for (const note of notes) {
      if (note.orphaned) continue;
      const status = await resolveAnchor(root, note);
      if (status.kind === "exact" || status.kind === "fuzzy") {
        wrapRange(root, status.range, note.id);
      } else {
        freshlyOrphaned.push(note.id);
      }
    }

    // Mark notes that failed to resolve as orphaned in local state so the
    // orphan section renders them. (We don't hit the server here — the
    // server-side "mark orphaned" sweep is a later enhancement.)
    if (freshlyOrphaned.length > 0) {
      setNotes((prev) =>
        prev.map((n) =>
          freshlyOrphaned.includes(n.id) ? { ...n, orphaned: true } : n,
        ),
      );
      setOrphaned((prev) => {
        const moved = notes.filter((n) => freshlyOrphaned.includes(n.id));
        return [...prev, ...moved];
      });
    }

    computeLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, getProseRoot]);

  // ── Layout math ────────────────────────────────────────────────────

  const computeLayout = useCallback(() => {
    const root = getProseRoot();
    const col = marginColumnRef.current;
    if (!root) return;

    const nonOrphaned = notes.filter((n) => !n.orphaned);
    const colRect = col?.getBoundingClientRect();

    // Read pass — compute anchor positions for every note
    const anchoredNotes: NoteLayout[] = nonOrphaned.map((note) => {
      const rect = measureMarks(root, note.id);
      if (!rect) {
        return {
          note,
          anchorTop: null,
          displayTop: null,
          displaced: false,
          height: noteHeightsRef.current.get(note.id) ?? 80,
        };
      }
      const anchorTop = colRect
        ? rect.top - colRect.top
        : rect.top + window.scrollY;
      return {
        note,
        anchorTop,
        displayTop: anchorTop,
        displaced: false,
        height: noteHeightsRef.current.get(note.id) ?? 80,
      };
    });

    // Sort by anchor position and stack
    anchoredNotes.sort((a, b) => {
      if (a.anchorTop == null) return 1;
      if (b.anchorTop == null) return -1;
      return a.anchorTop - b.anchorTop;
    });

    const GAP = 12;
    let cursor = -Infinity;
    for (const n of anchoredNotes) {
      if (n.anchorTop == null) continue;
      const desired = Math.max(n.anchorTop, cursor + GAP);
      if (desired > n.anchorTop + 1) n.displaced = true;
      n.displayTop = desired;
      cursor = desired + n.height;
    }

    setLayouts(anchoredNotes);
  }, [notes, getProseRoot]);

  // Mount effect — resolve + wrap + compute layout on hydration
  useEffect(() => {
    // Run after paint so EntryContent's dangerouslySetInnerHTML has
    // settled into the DOM
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      await resolveAndWrapAll();
    };

    // Wait one tick + fonts ready
    const raf = requestAnimationFrame(() => {
      run();
      // Re-run after fonts settle (line heights change)
      if (typeof document !== "undefined" && "fonts" in document) {
        document.fonts.ready.then(() => {
          if (!cancelled) computeLayout();
        });
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, notes.length]);

  // Resize observer on the prose root — triggers recompute when images
  // load, window resizes, or layout otherwise shifts
  useEffect(() => {
    const root = getProseRoot();
    if (!root) return;

    let raf: number | null = null;
    const scheduleRecompute = () => {
      if (raf != null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        computeLayout();
        raf = null;
      });
    };

    const ro = new ResizeObserver(scheduleRecompute);
    ro.observe(root);

    const onResize = () => {
      setViewportWidth(window.innerWidth);
      scheduleRecompute();
    };
    window.addEventListener("resize", onResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [getProseRoot, computeLayout]);

  // ── Selection → floating Add button ───────────────────────────────

  useEffect(() => {
    if (!viewer.isLoggedIn) return;
    if (layoutMode === "mobile") return; // desktop/tablet creation only for MVP

    let debounce: ReturnType<typeof setTimeout> | null = null;

    const handler = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        // If the compose popover is already open, freeze state — the user
        // is typing a note and the selection has intentionally collapsed.
        // Clearing pendingSelection here would unmount the popover mid-type.
        if (composingRef.current) return;

        const selection = window.getSelection();
        const root = getProseRoot();
        if (
          !selection ||
          selection.isCollapsed ||
          selection.rangeCount === 0 ||
          !root
        ) {
          setSelectionRect(null);
          setPendingSelection(null);
          return;
        }

        const range = selection.getRangeAt(0);
        // Verify the range is inside the prose root
        if (
          !root.contains(range.startContainer) ||
          !root.contains(range.endContainer)
        ) {
          setSelectionRect(null);
          setPendingSelection(null);
          return;
        }

        // Skip selections that are already inside an ink-mark (editing an
        // existing highlight is not a thing in MVP)
        const startEl =
          range.startContainer.nodeType === Node.ELEMENT_NODE
            ? (range.startContainer as Element)
            : range.startContainer.parentElement;
        if (startEl?.closest("ink-mark")) {
          setSelectionRect(null);
          return;
        }

        const rect = range.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) {
          setSelectionRect(null);
          return;
        }
        setSelectionRect(rect);
        setPendingSelection(range.cloneRange());
      }, 100);
    };

    document.addEventListener("selectionchange", handler);
    return () => {
      document.removeEventListener("selectionchange", handler);
      if (debounce) clearTimeout(debounce);
    };
  }, [viewer.isLoggedIn, layoutMode, getProseRoot]);

  // ── API actions ────────────────────────────────────────────────────

  const handleCreateNote = useCallback(
    async (range: Range, noteHtml: string, anchor: import("@/lib/marginalia/types").AnchorData) => {
      try {
        const res = await fetch(`/api/entries/${entryId}/margin-notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quote_text: anchor.quote_text,
            quote_prefix: anchor.quote_prefix,
            quote_suffix: anchor.quote_suffix,
            text_position_start: anchor.text_position_start,
            text_position_end: anchor.text_position_end,
            note_html: noteHtml,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to save note");
        }

        const body = await res.json();
        const newNote: MarginNote = body.data;
        setNotes((prev) => [...prev, newNote]);
        setComposing(false);
        setPendingSelection(null);
        setSelectionRect(null);
        // Wrap mark immediately so user sees the highlight land
        const root = getProseRoot();
        if (root) wrapRange(root, range, newNote.id);
        // Next tick: recompute layout
        requestAnimationFrame(() => computeLayout());
      } catch (err) {
        console.error(err);
        alert("Could not save your marginalia. Please try again.");
      }
    },
    [entryId, getProseRoot, computeLayout],
  );

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      if (!confirm("Delete this marginalia?")) return;
      try {
        const res = await fetch(`/api/margin-notes/${noteId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Delete failed");
        const root = getProseRoot();
        if (root) unwrapMarks(root, noteId);
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        setOrphaned((prev) => prev.filter((n) => n.id !== noteId));
        requestAnimationFrame(() => computeLayout());
      } catch (err) {
        console.error(err);
        alert("Could not delete the note.");
      }
    },
    [getProseRoot, computeLayout],
  );

  const handleEditNote = useCallback(
    async (noteId: string, noteHtml: string) => {
      try {
        const res = await fetch(`/api/margin-notes/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note_html: noteHtml }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Edit failed");
        }
        const body = await res.json();
        const updated: MarginNote = body.data;
        setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
      } catch (err) {
        console.error(err);
        alert("Could not update the note.");
      }
    },
    [],
  );

  const registerNoteHeight = useCallback(
    (noteId: string, height: number) => {
      const prev = noteHeightsRef.current.get(noteId);
      if (prev !== height) {
        noteHeightsRef.current.set(noteId, height);
        // Debounce layout recompute on height changes
        requestAnimationFrame(() => computeLayout());
      }
    },
    [computeLayout],
  );

  // Mobile: highlight tap target handler
  useEffect(() => {
    if (layoutMode !== "mobile") return;
    const root = getProseRoot();
    if (!root) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const mark = target?.closest?.("ink-mark") as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute("data-marginalia-id");
      if (id) {
        e.preventDefault();
        setBottomSheetNoteId(id);
      }
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [layoutMode, getProseRoot, notes]);

  const visibleNotes = useMemo(
    () => notes.filter((n) => !n.orphaned),
    [notes],
  );

  // Apply .has-marginalia class to the wrapper when we have notes or are
  // logged in (so the grid layout engages)
  const wrapperClass =
    layoutMode === "desktop" && (visibleNotes.length > 0 || viewer.isLoggedIn)
      ? "entry-marginalia-wrapper entry-marginalia-wrapper--with-aside"
      : "entry-marginalia-wrapper";

  // Show a one-time dismissible hint to logged-in readers explaining
  // that they can select text to leave a margin note. Persisted in
  // localStorage so seasoned users never see it again.
  const [hintDismissed, setHintDismissed] = useState<boolean>(true);
  useEffect(() => {
    try {
      setHintDismissed(
        typeof window !== "undefined" &&
          window.localStorage.getItem("inkwell-marginalia-hint") === "dismissed",
      );
    } catch {
      setHintDismissed(true);
    }
  }, []);
  const dismissHint = useCallback(() => {
    setHintDismissed(true);
    try {
      window.localStorage.setItem("inkwell-marginalia-hint", "dismissed");
    } catch {
      // ignore
    }
  }, []);

  const showHint =
    viewer.isLoggedIn &&
    layoutMode !== "mobile" &&
    !hintDismissed &&
    viewer.id !== entryUserId;

  return (
    <div
      ref={proseWrapperRef}
      className={wrapperClass}
      data-marginalia-active={viewer.isLoggedIn && layoutMode !== "mobile" ? "true" : undefined}
    >
      {showHint && (
        <div className="marginalia-hint" role="note" aria-label="How to annotate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span>
            <em>Select any passage</em> to leave a note alongside it.
          </span>
          <button
            type="button"
            onClick={dismissHint}
            aria-label="Dismiss marginalia hint"
            className="marginalia-hint-dismiss"
          >
            ×
          </button>
        </div>
      )}
      <div className="entry-marginalia-prose">{children}</div>

      {/* Desktop right margin column */}
      {layoutMode === "desktop" && (
        <aside ref={marginColumnRef} className="marginalia-aside" aria-label="Marginalia">
          {layouts.map((layout) => (
            <MarginNoteCard
              key={layout.note.id}
              note={layout.note}
              layoutMode="desktop"
              topPx={layout.displayTop}
              displaced={layout.displaced}
              focused={focusedNoteId === layout.note.id}
              viewerId={viewer.id}
              entryUserId={entryUserId}
              onHeight={(h) => registerNoteHeight(layout.note.id, h)}
              onFocus={() => setFocusedNoteId(layout.note.id)}
              onBlur={() => setFocusedNoteId(null)}
              onEdit={handleEditNote}
              onDelete={handleDeleteNote}
            />
          ))}
        </aside>
      )}

      {/* Tablet: inline cards below-right of anchor (simplified for MVP —
          render all notes in a single column below the entry body) */}
      {layoutMode === "tablet" && visibleNotes.length > 0 && (
        <div className="marginalia-tablet-list">
          {visibleNotes.map((note) => (
            <MarginNoteCard
              key={note.id}
              note={note}
              layoutMode="tablet"
              topPx={null}
              displaced={false}
              focused={false}
              viewerId={viewer.id}
              entryUserId={entryUserId}
              onHeight={() => {}}
              onFocus={() => {}}
              onBlur={() => {}}
              onEdit={handleEditNote}
              onDelete={handleDeleteNote}
            />
          ))}
        </div>
      )}

      {/* Mobile bottom sheet */}
      {layoutMode === "mobile" && bottomSheetNoteId && (
        <MarginaliaBottomSheet
          notes={visibleNotes.filter((n) => n.id === bottomSheetNoteId)}
          onClose={() => setBottomSheetNoteId(null)}
          viewerId={viewer.id}
          entryUserId={entryUserId}
          onEdit={handleEditNote}
          onDelete={handleDeleteNote}
        />
      )}

      {/* Orphaned section at the foot */}
      {orphaned.length > 0 && (
        <OrphanedNotesSection
          notes={orphaned}
          viewerId={viewer.id}
          entryUserId={entryUserId}
          onDelete={handleDeleteNote}
        />
      )}

      {/* Floating Add button (when text selected, not composing) */}
      {selectionRect && pendingSelection && !composing && (
        <AddNoteButton
          rect={selectionRect}
          onClick={() => {
            // Flip the ref synchronously so any in-flight selectionchange
            // handler won't clobber pendingSelection/selectionRect before
            // the popover has a chance to mount.
            composingRef.current = true;
            setComposing(true);
          }}
        />
      )}

      {/* Compose popover */}
      {composing && pendingSelection && selectionRect && (
        <ComposeNotePopover
          rect={selectionRect}
          range={pendingSelection}
          proseRoot={getProseRoot()}
          onCancel={() => {
            setComposing(false);
            setPendingSelection(null);
            setSelectionRect(null);
            window.getSelection()?.removeAllRanges();
          }}
          onSubmit={handleCreateNote}
        />
      )}
    </div>
  );
}
