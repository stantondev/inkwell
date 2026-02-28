"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface CommentData {
  id: string;
  body_html: string;
  created_at: string;
  edited_at: string | null;
}

interface Props {
  comment: CommentData;
  canEdit: boolean;
  canDelete: boolean;
}

function stripHtml(html: string): string {
  // Convert <br> to newlines, strip tags, decode entities
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function textToHtml(text: string): string {
  return `<p>${text.replace(/\n/g, "<br>")}</p>`;
}

// Check if comment was posted within the last 24 hours
function isWithinEditWindow(createdAt: string): boolean {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return now - created < twentyFourHours;
}

export function EditableComment({ comment, canEdit, canDelete }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);

  const withinWindow = canEdit && isWithinEditWindow(comment.created_at);

  function startEdit() {
    setEditText(stripHtml(comment.body_html));
    setEditing(true);
    setError("");
  }

  function cancelEdit() {
    setEditing(false);
    setEditText("");
    setError("");
  }

  async function handleSave() {
    if (!editText.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/comments/${comment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_html: textToHtml(editText) }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save edit");
      } else {
        setEditing(false);
        router.refresh();
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this comment?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      cancelEdit();
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }

  if (editing) {
    return (
      <>
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          autoFocus
          className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none focus:ring-2 focus:ring-[var(--accent)] transition resize-none"
          style={{ borderColor: "var(--accent)", fontSize: "0.925rem", lineHeight: 1.65 }}
        />
        <div className="flex items-center gap-2 mt-1.5">
          <button
            onClick={handleSave}
            disabled={saving || !editText.trim()}
            className="rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50 transition"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={cancelEdit}
            className="rounded-md px-3 py-1 text-xs transition hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            Cancel
          </button>
          {error && (
            <span className="text-xs" style={{ color: "var(--danger)" }}>{error}</span>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div
        className="prose-entry"
        style={{ fontSize: "0.925rem", lineHeight: 1.65 }}
        dangerouslySetInnerHTML={{ __html: comment.body_html }}
      />
      {(withinWindow || canDelete) && (
        <div className="flex items-center gap-1 mt-1">
          {withinWindow && (
            <button
              onClick={startEdit}
              className="text-xs transition hover:opacity-100 opacity-50"
              style={{ color: "var(--muted)" }}
              title="Edit comment"
            >
              Edit
            </button>
          )}
          {withinWindow && canDelete && (
            <span className="text-xs" style={{ color: "var(--muted)", opacity: 0.3 }}>·</span>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs transition hover:opacity-100 opacity-50 disabled:opacity-20"
              style={{ color: "var(--muted)" }}
              title="Delete comment"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </>
  );
}
