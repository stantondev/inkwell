"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function EntryActions({ entryId, username, showEdit = true }: { entryId: string; username: string; showEdit?: boolean }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Permanently delete this entry? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/entries/${entryId}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        router.push(`/${username}`);
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {showEdit && (
        <Link href={`/editor?edit=${entryId}`}
          className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          Edit
        </Link>
      )}
      <button onClick={handleDelete} disabled={deleting}
        className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50"
        style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
        {deleting ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}
