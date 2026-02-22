"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteCommentButton({ commentId }: { commentId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this comment?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button onClick={handleDelete} disabled={deleting}
      className="flex-shrink-0 p-1 rounded opacity-40 hover:opacity-100 transition disabled:opacity-20"
      aria-label="Delete comment">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6"/><path d="M14 11v6"/>
        <path d="M9 6V4h6v2"/>
      </svg>
    </button>
  );
}
