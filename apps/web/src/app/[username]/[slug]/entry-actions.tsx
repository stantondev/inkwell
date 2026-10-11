"use client";

import { useState } from "react";
import Link from "next/link";
import { DeleteEntryDialog } from "./delete-entry-dialog";
import styles from "./entry-page.module.css";

/**
 * Edit/History/Delete as plain buttons. The writer's own entry page uses the
 * "Your entry" strip (owner-strip.tsx) instead; this is what an admin sees on
 * someone else's entry or sticky (showEdit=false).
 */
export function EntryActions({ entryId, username, showEdit = true }: { entryId: string; username: string; showEdit?: boolean }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showEdit && (
        <>
          <Link href={`/editor?edit=${entryId}`} className={styles.ownerButton}>
            Edit
          </Link>
          <Link href={`/editor/history?entry=${entryId}`} className={styles.ownerButton} title="Version history">
            History
          </Link>
        </>
      )}
      <button type="button" onClick={() => setConfirming(true)} className={styles.adminDelete}>
        Delete
      </button>
      <DeleteEntryDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        entryId={entryId}
        username={username}
        ownEntry={showEdit}
      />
    </div>
  );
}
