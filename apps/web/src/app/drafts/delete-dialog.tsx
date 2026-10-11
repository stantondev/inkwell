"use client";

import { useEffect, useRef } from "react";
import { decodeEntities } from "@/lib/decode-entities";
import styles from "./drafts.module.css";

export interface PendingDelete {
  ids: string[];
  /** One draft from its row menu (DELETE /api/entries/:id) vs. a selection. */
  single: boolean;
  title: string | null;
  /** Scheduled drafts among those we know about. */
  scheduledCount: number;
}

const NUMBER = new Intl.NumberFormat("en-US");

export function DeleteDialog({
  pending,
  deleting,
  progress,
  onCancel,
  onConfirm,
}: {
  pending: PendingDelete;
  deleting: boolean;
  progress: { done: number; total: number } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  // Start on Cancel, so Enter doesn't delete by accident; Esc closes.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);

  const count = pending.ids.length;
  const heading = pending.single || count === 1 ? "Delete this draft?" : `Delete ${NUMBER.format(count)} drafts?`;
  const title = pending.title ? decodeEntities(pending.title) : null;

  let text = pending.single && title ? `“${title}” will be deleted. This can't be undone.` : "This can't be undone.";
  if (pending.scheduledCount > 0) {
    text +=
      count === 1
        ? " It won't be published."
        : pending.scheduledCount === count
          ? " They're scheduled and won't be published."
          : ` ${NUMBER.format(pending.scheduledCount)} of them ${pending.scheduledCount === 1 ? "is" : "are"} scheduled and won't be published.`;
  }

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-drafts-title"
        aria-describedby="delete-drafts-text"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-drafts-title" className={styles.dialogTitle}>
          {heading}
        </h2>
        <p id="delete-drafts-text" className={styles.dialogText}>
          {text}
        </p>
        <div className={styles.dialogButtons}>
          <button ref={cancelRef} type="button" className={styles.button} onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonDanger}`}
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting
              ? progress
                ? `Deleting… ${NUMBER.format(progress.done)}/${NUMBER.format(progress.total)}`
                : "Deleting…"
              : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
