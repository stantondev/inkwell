"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
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

  // Sync the draft into the editor + lock body scroll ONLY when the modal opens.
  // Must not depend on `initialDraftHtml` — parent re-renders on each keystroke
  // would otherwise bump `editorKeyRef` and remount the LetterEditor mid-type.
  useEffect(() => {
    if (!open) return;

    htmlRef.current = initialDraftRef.current;
    editorKeyRef.current += 1;
    setError(null);

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isDirty = useCallback(() => {
    const stripped = htmlRef.current.replace(/<[^>]*>/g, "").trim();
    return stripped.length > 0;
  }, []);

  const attemptClose = useCallback(() => {
    if (isDirty()) {
      const ok = window.confirm(
        "Discard this letter? Your draft will be lost."
      );
      if (!ok) return;
      htmlRef.current = "";
      onDraftChange("");
    }
    setError(null);
    onClose();
  }, [isDirty, onDraftChange, onClose]);

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
        body: JSON.stringify({ body_html: html }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(
          json.errors?.body?.[0] ?? json.error ?? "Failed to send letter"
        );
        return;
      }
      htmlRef.current = "";
      onDraftChange("");
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
      <div
        className="stationery-backdrop"
        onClick={attemptClose}
        aria-hidden="true"
      />
      <div className="stationery-modal-wrap">
        <div
          ref={dialogRef}
          className="stationery-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Write a letter"
        >
            <header className="stationery-modal-header">
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
              <button
                type="button"
                className="stationery-close"
                onClick={attemptClose}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <div className="stationery-paper">
              <LetterEditor
                key={editorKeyRef.current}
                content={htmlRef.current}
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
                  {isMac ? "⌘" : "Ctrl+"}↵ to send · Esc to close
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
