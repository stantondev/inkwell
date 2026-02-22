"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteCommentButtonClient({ commentId }: { commentId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this comment?")) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/feedback/comments/${commentId}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        router.refresh();
      }
    } catch {
      // silently fail
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="ml-auto text-xs transition-colors hover:underline"
      style={{ color: "var(--muted)", opacity: deleting ? 0.5 : 1 }}
    >
      {deleting ? "..." : "Delete"}
    </button>
  );
}
