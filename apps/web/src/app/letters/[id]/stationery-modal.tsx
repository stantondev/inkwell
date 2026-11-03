"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useCloseOnOutsideClick, useMovableBox } from "@/hooks/use-movable-box";
import { Avatar } from "@/components/avatar";
import { LetterEditor } from "@/components/letter-editor";
import type { LetterMessage } from "./page";

interface StationeryModalProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  recipientDisplayName: string;
  recipientUsername: string;
  recipientAvatarUrl: string | null;
  initialDraftHtml: string;
  onDraftChange: (html: string) => void;
  onSent: (message: LetterMessage) => void;
  /** The envelope stamp: its value and chooser (members only). */
  stamp?: { value: string | null; chooser: React.ReactNode };
}

export function StationeryModal({
  open,
  onClose,
  conversationId,
  recipientDisplayName,
  recipientUsername,
  recipientAvatarUrl,
  initialDraftHtml,
  onDraftChange,
  onSent,
  stamp,
}: StationeryModalProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMac, setIsMac] = useState(false);
  const [mounted, setMounted] = useState(false);
  const htmlRef = useRef(initialDraftHtml);
  const editorKeyRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setIsMac(
      navigator.platform?.toUpperCase().includes("MAC") ||
        navigator.userAgent?.includes("Mac")
    );
  }, []);

  // Capture `initialDraftHtml` in a ref so the open-effect reads the latest value
  // without depending on it (which would remount the editor on every keystroke).
  const initialDraftRef = useRef(initialDraftHtml);
  useEffect(() => {
    initialDraftRef.current = initialDraftHtml;
  }, [initialDraftHtml]);

  // Sync the draft into the editor ONLY when the modal opens. The thread
  // behind isn't locked: it keeps scrolling, so earlier letters can be read
  // while writing, and the sheet can be moved off them.
  // Must not depend on `initialDraftHtml` — parent re-renders on each keystroke
  // would otherwise bump `editorKeyRef` and remount the LetterEditor mid-type.
  useEffect(() => {
    if (!open) return;

    htmlRef.current = initialDraftRef.current;
    editorKeyRef.current += 1;
    setError(null);
  }, [open]);

  // Closing keeps the draft: it's shared with the reply bar and saved in the
  // browser, so nothing is thrown away by stepping out of the stationery.
  const attemptClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  // Pick the sheet up by its header or footer and move it. On a phone, where
  // it fills the screen, it only slides down (to show the letters above) and a
  // tap on the header brings it back up.
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const move = useMovableBox(open, {
    handle: ".stationery-modal-header, .stationery-modal-footer",
    axis: isPhone ? "y" : "both",
    tapToReset: isPhone,
    keepVisible: isPhone ? 110 : 64,
  });
  useCloseOnOutsideClick([dialogRef], open, attemptClose);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        attemptClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, attemptClose]);

  // Focus trap — keep tabbing inside the dialog
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", handleKey);
    return () => dialog.removeEventListener("keydown", handleKey);
  }, [open]);

  const send = async () => {
    const html = htmlRef.current;
    const stripped = html.replace(/<[^>]*>/g, "").trim();
    if (!stripped || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/letters/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_html: html, stamp_type: stamp?.value ?? null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(
          json.errors?.body?.[0] ??
            (json.errors?.body_html ? "This letter is too long to send in one piece." : null) ??
            json.error ??
            "Failed to send letter"
        );
        return;
      }
      htmlRef.current = "";
      editorKeyRef.current += 1;
      onSent(json.data);
      onClose();
    } catch {
      setError("Failed to send letter — please try again");
    } finally {
      setSending(false);
    }
  };

  if (!mounted || !open) return null;

  const content = (
    <>
      <div className="stationery-backdrop" aria-hidden="true" />
      <div className="stationery-modal-wrap">
        <div
          ref={dialogRef}
          className={`stationery-modal${move.dragging ? " is-dragging" : ""}${move.moved ? " is-moved" : ""}`}
          style={{ translate: `${move.offset.x}px ${move.offset.y}px` }}
          onPointerDown={move.onPointerDown}
          role="dialog"
          aria-modal="true"
          aria-label="Write a letter"
        >
            <header className="stationery-modal-header" title={isPhone ? undefined : "Drag to move"}>
              <span className="stationery-drag-bar" aria-hidden="true" />
              <div className="stationery-salutation">
                <span className="stationery-label">To</span>
                <Avatar
                  url={recipientAvatarUrl}
                  name={recipientDisplayName}
                  size={32}
                />
                <div className="stationery-recipient">
                  <div className="stationery-recipient-name">
                    {recipientDisplayName}
                  </div>
                  <div className="stationery-recipient-username">
                    @{recipientUsername}
                  </div>
                </div>
              </div>
              <div className="stationery-header-end">
                {stamp?.chooser}
                <button
                  type="button"
                  className="stationery-close"
                  onClick={attemptClose}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </header>

            <div className="stationery-paper">
              <LetterEditor
                key={editorKeyRef.current}
                // The editor is created fresh each time the stationery opens
                // (nothing renders while it's closed), and TipTap reads
                // `content` only then, so this is the draft as of opening. A
                // ref here showed the draft from the previous render: empty,
                // when the draft had been written in the reply bar.
                content={initialDraftHtml}
                onChange={(html) => {
                  htmlRef.current = html;
                  onDraftChange(html);
                }}
                onSubmit={send}
                autoFocus
                placeholder="Dear friend…"
              />
            </div>

            <footer className="stationery-modal-footer">
              {error ? (
                <div className="stationery-error">{error}</div>
              ) : (
                <span className="stationery-hint">
                  {isMac ? "⌘" : "Ctrl+"}↵ to send · Esc keeps your draft
                </span>
              )}
              <button
                type="button"
                className="stationery-send-btn"
                onClick={send}
                disabled={sending}
              >
                {sending ? (
                  "Sending…"
                ) : (
                  <>
                    Seal &amp; Send <span aria-hidden="true">✉</span>
                  </>
                )}
              </button>
            </footer>
          </div>
        </div>
      </>
    );

  return createPortal(content, document.body);
}
