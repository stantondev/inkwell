"use client";

import { useEffect, useRef } from "react";
import { FloatingPopup } from "@/components/floating-popup";

// The last look before publishing: who can read it, and everything that
// happens with it that can't be taken back (emails, cross-posts, a circle).
// Publishing used to happen on the first click with none of this in view,
// so a private thought could go out public, or to the newsletter, unnoticed.

export interface PublishReviewLine {
  icon: string;
  text: React.ReactNode;
  tone?: "normal" | "muted" | "warn";
}

export function PublishReview({
  anchorRef,
  open,
  scheduling,
  lines,
  onConfirm,
  onCancel,
  onOpenSettings,
  busy,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  scheduling: string | null;
  lines: PublishReviewLine[];
  onConfirm: () => void;
  onCancel: () => void;
  onOpenSettings: () => void;
  busy: boolean;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => confirmRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <FloatingPopup anchorRef={anchorRef} open={open} onClose={onCancel} placement="bottom"
      className="publish-review" style={{ width: 340 }}>
      <div role="dialog" aria-label={scheduling ? "Schedule this entry" : "Publish this entry"}>
        <p className="publish-review-title">{scheduling ? "Schedule this entry?" : "Ready to publish?"}</p>
        <ul className="publish-review-lines">
          {lines.map((line, i) => (
            <li key={i} data-tone={line.tone ?? "normal"}>
              <span aria-hidden="true" className="publish-review-icon">{line.icon}</span>
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
        <div className="publish-review-actions">
          <button type="button" className="publish-review-settings" onClick={onOpenSettings}>
            Change settings
          </button>
          <button ref={confirmRef} type="button" className="editor-publish-btn" onClick={onConfirm} disabled={busy}>
            {scheduling ? `Schedule for ${scheduling}` : busy ? "Publishing…" : "Publish now"}
          </button>
        </div>
      </div>
    </FloatingPopup>
  );
}
