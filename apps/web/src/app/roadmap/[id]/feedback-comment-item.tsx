"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { DeleteCommentButtonClient } from "./delete-comment-button";

export interface FeedbackComment {
  id: string;
  body: string;
  author: {
    id: string | null;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  created_at: string;
  edited_at?: string | null;
}

// Comments are stored as HTML built from plain text ("<p>line<br>line</p>",
// with @mentions as links). Editing works on the plain text again.
function toPlainText(body: string): string {
  if (!body.startsWith("<p>")) return body;
  const doc = new DOMParser().parseFromString(body.replace(/<br\s*\/?>/gi, "\n"), "text/html");
  return doc.body.textContent ?? "";
}

export function FeedbackCommentItem({
  comment,
  when,
  canEdit,
  canDelete,
}: {
  comment: FeedbackComment;
  /** "3d ago", computed on the server so the rendered text matches on hydration. */
  when: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEditing() {
    setDraft(toPlainText(comment.body));
    setError("");
    setEditing(true);
  }

  async function save() {
    if (!draft.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/feedback/comments/${comment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || data.errors?.body?.[0] || "Couldn't save your edit");
      }
    } catch {
      setError("Couldn't save your edit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Avatar url={comment.author.avatar_url} name={comment.author.display_name} size={24} />
        <span className="text-xs font-medium">
          {comment.author.username !== "[deleted]" ? (
            <Link href={`/${comment.author.username}`} className="hover:underline">
              @{comment.author.username}
            </Link>
          ) : (
            <span>@{comment.author.username}</span>
          )}
        </span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {when}
          {comment.edited_at && " · edited"}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {canEdit && !editing && (
            <button onClick={startEditing} className="text-xs hover:underline" style={{ color: "var(--muted)" }}>
              Edit
            </button>
          )}
          {canDelete && <DeleteCommentButtonClient commentId={comment.id} />}
        </span>
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
            }}
            rows={3}
            maxLength={3000}
            autoFocus
            aria-label="Edit your comment"
            className="w-full rounded-xl border px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 transition"
            style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          />
          {error && <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <button onClick={() => setEditing(false)} className="text-xs hover:underline" style={{ color: "var(--muted)" }}>
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!draft.trim() || saving}
              className="rounded-full px-4 py-1.5 text-sm font-medium"
              style={{ background: "var(--accent)", color: "#fff", opacity: !draft.trim() || saving ? 0.5 : 1 }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : comment.body.startsWith("<p>") ? (
        <div className="text-sm leading-relaxed prose-mentions" dangerouslySetInnerHTML={{ __html: comment.body }} />
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{comment.body}</p>
      )}
    </div>
  );
}
