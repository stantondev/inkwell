"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";

// The ⋮⋮ handle in the left margin: hover a paragraph, heading, list,
// picture or embed to see it, drag it to move the block, click it to select
// the block (then Delete removes it, ⌘C copies it). Keyboard: ⌘⇧↑ / ⌘⇧↓
// move the block the cursor is in (see moveBlock). Mouse and trackpad only;
// on phones it stays out of the way.

/** Moves the top-level block holding the cursor one place up or down. */
export function moveBlock(editor: Editor, direction: -1 | 1): boolean {
  const { state, view } = editor;
  const { selection, doc } = state;
  const index = selection.$from.index(0);
  const target = index + direction;
  if (target < 0 || target >= doc.childCount) return true;

  let start = 0;
  for (let i = 0; i < index; i++) start += doc.child(i).nodeSize;
  const node = doc.child(index);
  const end = start + node.nodeSize;
  const neighbour = doc.child(target);

  const tr = state.tr;
  let newStart: number;
  if (direction === -1) {
    newStart = start - neighbour.nodeSize;
    tr.delete(start, end).insert(newStart, node);
  } else {
    tr.insert(end + neighbour.nodeSize, node).delete(start, end);
    newStart = start + neighbour.nodeSize;
  }

  // Keep the cursor (or selection) where it was inside the moved block.
  try {
    tr.setSelection(
      selection instanceof NodeSelection
        ? NodeSelection.create(tr.doc, newStart)
        : TextSelection.create(tr.doc, newStart + (selection.from - start), newStart + (selection.to - start)),
    );
  } catch {
    tr.setSelection(Selection.near(tr.doc.resolve(newStart + 1)));
  }
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function BlockHandle({ editor, containerRef }: { editor: Editor; containerRef: React.RefObject<HTMLElement | null> }) {
  const [target, setTarget] = useState<{ el: HTMLElement; top: number } | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const pm = editor.view.dom as HTMLElement;

    const blockAt = (y: number): HTMLElement | null => {
      const pmRect = pm.getBoundingClientRect();
      const hit = document.elementFromPoint(pmRect.left + 12, y);
      let el = hit as HTMLElement | null;
      while (el && el.parentElement !== pm) {
        if (el === pm || !pm.contains(el)) return null;
        el = el.parentElement;
      }
      return el && el.parentElement === pm ? el : null;
    };

    const onMove = (e: MouseEvent) => {
      if (draggingRef.current) return;
      const pmRect = pm.getBoundingClientRect();
      // Show it from the margin to the right edge of the writing
      if (e.clientX < pmRect.left - 56 || e.clientX > pmRect.right + 8) return setTarget(null);
      const el = blockAt(e.clientY);
      if (!el) return setTarget(null);
      const box = el.getBoundingClientRect();
      const containerTop = container.getBoundingClientRect().top;
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 30;
      const textual = /^(P|H1|H2|H3|UL|OL|BLOCKQUOTE)$/.test(el.tagName);
      const paddingTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
      const top = box.top - containerTop + (textual ? paddingTop + (lineHeight - 24) / 2 : 6);
      setTarget((prev) => (prev?.el === el && Math.abs(prev.top - top) < 1 ? prev : { el, top }));
    };
    const onLeave = () => { if (!draggingRef.current) setTarget(null); };
    const onKey = () => setTarget(null);

    // The handle sits in the margin, outside the editor, so listen on the
    // whole page and work out which block the pointer is level with.
    document.addEventListener("mousemove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    pm.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      pm.removeEventListener("keydown", onKey);
    };
  }, [editor, containerRef]);

  const nodeStart = (el: HTMLElement): number | null => {
    const { view } = editor;
    let found: number | null = null;
    view.state.doc.forEach((_node, offset) => {
      if (found === null && view.nodeDOM(offset) === el) found = offset;
    });
    return found;
  };

  const selectBlock = (): NodeSelection | null => {
    if (!target) return null;
    const start = nodeStart(target.el);
    if (start === null) return null;
    const sel = NodeSelection.create(editor.state.doc, start);
    editor.view.dispatch(editor.state.tr.setSelection(sel));
    return sel;
  };

  if (!target) return null;

  return (
    <button
      type="button"
      className="block-handle"
      style={{ top: target.top }}
      draggable
      aria-label="Move or select this block"
      title="Drag to move · click to select · ⌘⇧↑ ⌘⇧↓ move it with the keyboard"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => {
        selectBlock();
        editor.view.focus();
      }}
      onDragStart={(e) => {
        const sel = selectBlock();
        if (!sel || !e.dataTransfer) return;
        draggingRef.current = true;
        const slice = sel.content();
        const { dom, text } = editor.view.serializeForClipboard(slice);
        e.dataTransfer.clearData();
        e.dataTransfer.setData("text/html", dom.innerHTML);
        e.dataTransfer.setData("text/plain", text);
        e.dataTransfer.effectAllowed = "copyMove";
        e.dataTransfer.setDragImage(target.el, 0, 0);
        // ProseMirror's own drop handling moves it (removing the original).
        editor.view.dragging = { slice, move: true, node: sel } as typeof editor.view.dragging;
      }}
      onDragEnd={() => {
        draggingRef.current = false;
        setTarget(null);
      }}
    >
      <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
        <circle cx="2.5" cy="3" r="1.4" /><circle cx="7.5" cy="3" r="1.4" />
        <circle cx="2.5" cy="8" r="1.4" /><circle cx="7.5" cy="8" r="1.4" />
        <circle cx="2.5" cy="13" r="1.4" /><circle cx="7.5" cy="13" r="1.4" />
      </svg>
    </button>
  );
}
