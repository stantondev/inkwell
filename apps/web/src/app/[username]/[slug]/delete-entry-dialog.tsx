"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./entry-page.module.css";

/**
 * "Delete this entry?" — an in-page confirm (native <dialog>, so Esc, focus
 * and the backdrop come for free). Shows the API's error instead of failing
 * silently, and refreshes the nav counts after a delete.
 */
export function DeleteEntryDialog({
  open,
  onClose,
  entryId,
  username,
  ownEntry = true,
  kind = "entry",
}: {
  open: boolean;
  onClose: () => void;
  entryId: string;
  username: string;
  /** False when an admin is removing someone else's entry. */
  ownEntry?: boolean;
  kind?: "entry" | "sticky";
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/entries/${entryId}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        window.dispatchEvent(new Event("inkwell-nav-refresh"));
        ref.current?.close();
        router.push(`/${username}`);
        router.refresh();
        return;
      }
      let message = `We couldn't delete this ${kind}. Please try again.`;
      try {
        const body = await res.json();
        if (body && typeof body.error === "string" && body.error.trim()) message = body.error;
      } catch {
        /* not JSON */
      }
      setError(message);
    } catch {
      setError("We couldn't reach Inkwell. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={`delete-entry-${entryId}-title`}
      onClose={onClose}
      onCancel={(e) => {
        if (deleting) e.preventDefault();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself, outside its box.
        const dialog = ref.current;
        if (!dialog || e.target !== dialog || deleting) return;
        const r = dialog.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) dialog.close();
      }}
    >
      <h2 id={`delete-entry-${entryId}-title`} className={styles.dialogTitle}>
        {kind === "sticky" ? "Peel off this sticky?" : "Delete this entry?"}
      </h2>
      <p className={styles.dialogBody}>
        {kind === "sticky"
          ? "It's removed from your corkboard and from the fediverse. This can't be undone."
          : ownEntry
          ? "It's removed from your journal and from the fediverse. This can't be undone."
          : "It's removed from this writer's journal and from the fediverse. This can't be undone."}
      </p>
      {error && (
        <p className={styles.dialogError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.dialogButtons}>
        <button
          type="button"
          className={styles.dialogCancel}
          onClick={() => ref.current?.close()}
          disabled={deleting}
          autoFocus
        >
          Keep it
        </button>
        <button type="button" className={styles.dialogDelete} onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting…" : kind === "sticky" ? "Delete sticky" : "Delete entry"}
        </button>
      </div>
    </dialog>
  );
}
