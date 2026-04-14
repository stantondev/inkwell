"use client";

import { useEffect, useRef, useState } from "react";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import type { MarginNote } from "@/lib/marginalia/types";

interface MarginNoteCardProps {
  note: MarginNote;
  layoutMode: "desktop" | "tablet" | "mobile";
  topPx: number | null;
  displaced: boolean;
  focused: boolean;
  viewerId: string;
  entryUserId: string;
  onHeight: (height: number) => void;
  onFocus: () => void;
  onBlur: () => void;
  onEdit: (noteId: string, noteHtml: string) => void | Promise<void>;
  onDelete: (noteId: string) => void | Promise<void>;
}

/**
 * A single rendered margin note card — paper aesthetic, Lora serif,
 * handwritten-ish feel.
 */
export function MarginNoteCard({
  note,
  layoutMode,
  topPx,
  displaced,
  focused,
  viewerId,
  entryUserId,
  onHeight,
  onFocus,
  onBlur,
  onEdit,
  onDelete,
}: MarginNoteCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const isOwnNote = note.user_id === viewerId;
  const isEntryAuthor = entryUserId === viewerId;
  const canEdit = isOwnNote;
  const canDelete = isOwnNote || isEntryAuthor;

  // Measure height once on mount and after edits
  useEffect(() => {
    if (!ref.current) return;
    const height = ref.current.getBoundingClientRect().height;
    if (height > 0) onHeight(height);
  });

  // Deterministic slight rotation based on ID hash for a handwritten feel
  const rotation = useRotation(note.id);

  const style: React.CSSProperties =
    layoutMode === "desktop" && topPx != null
      ? {
          position: "absolute",
          top: topPx,
          left: 0,
          width: "100%",
          transform: `rotate(${rotation}deg)`,
        }
      : { transform: `rotate(${rotation}deg)` };

  function startEdit() {
    // Strip tags for a plain-text editor (MVP)
    const plain = (note.note_html || "").replace(/<[^>]*>/g, "");
    setDraft(plain);
    setEditing(true);
  }

  async function saveEdit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const html = `<p>${escapeHtml(trimmed)}</p>`;
    await onEdit(note.id, html);
    setEditing(false);
  }

  return (
    <div
      ref={ref}
      id={`marginalia-${note.id}`}
      className={`marginalia-note-card${focused ? " is-focused" : ""}${
        displaced ? " is-displaced" : ""
      }`}
      data-marginalia-card={note.id}
      style={style}
      onMouseEnter={onFocus}
      onMouseLeave={onBlur}
    >
      <div className="marginalia-note-header">
        {note.author && (
          <AvatarWithFrame
            url={note.author.avatar_url}
            name={note.author.display_name || note.author.username}
            size={24}
            frame={note.author.avatar_frame}
            animation={note.author.avatar_animation}
            subscriptionTier={note.author.subscription_tier ?? undefined}
          />
        )}
        <div className="marginalia-note-byline">
          <span className="marginalia-note-name">
            {note.author?.display_name || note.author?.username || "Anonymous"}
          </span>
          {note.author && (
            <span className="marginalia-note-handle">@{note.author.username}</span>
          )}
        </div>
      </div>

      {editing ? (
        <div className="marginalia-note-edit">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 500))}
            rows={3}
            className="marginalia-compose-textarea"
          />
          <div className="marginalia-note-edit-buttons">
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="marginalia-compose-submit"
              disabled={!draft.trim()}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div
          className="marginalia-note-body"
          dangerouslySetInnerHTML={{ __html: note.note_html }}
        />
      )}

      {(canEdit || canDelete) && !editing && (
        <div className="marginalia-note-actions">
          {canEdit && (
            <button type="button" onClick={startEdit}>
              Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(note.id)}
              className="marginalia-note-delete"
            >
              Delete
            </button>
          )}
        </div>
      )}

      {note.edited_at && (
        <span className="marginalia-note-edited" title={note.edited_at}>
          (edited)
        </span>
      )}
    </div>
  );
}

/** Return a small rotation angle (-1.2deg to 1.2deg) derived from the note ID. */
function useRotation(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const normalized = ((hash % 240) - 120) / 100; // -1.2 to 1.2
  return normalized;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
