"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// "Delete this draft?" — the editor's one destructive question. A small
// paper card over a dimmed page; Cancel has focus, so Enter or Escape never
// deletes anything by accident.

export function DeleteDialog({
  open,
  title,
  body,
  confirmLabel,
  busyLabel = "Deleting…",
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busyLabel?: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => cancelRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ zIndex: 1000, background: "rgba(20, 16, 12, 0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="editor-delete-title"
        aria-describedby="editor-delete-body"
        className="w-full rounded-xl border p-5 shadow-xl"
        style={{ maxWidth: 400, background: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }}
      >
        <p
          id="editor-delete-title"
          className="text-base font-medium mb-2"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          {title}
        </p>
        <p id="editor-delete-body" className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          {body}
        </p>
        {error && (
          <p role="alert" className="text-sm mb-4" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm border disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--foreground)", minHeight: 40 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--danger)", color: "#fff", minHeight: 40 }}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
