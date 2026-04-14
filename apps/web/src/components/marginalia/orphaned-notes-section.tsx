"use client";

import { AvatarWithFrame } from "@/components/avatar-with-frame";
import type { MarginNote } from "@/lib/marginalia/types";

interface OrphanedNotesSectionProps {
  notes: MarginNote[];
  viewerId: string;
  entryUserId: string;
  onDelete: (id: string) => void | Promise<void>;
}

/**
 * Renders notes whose anchors could not be resolved against the current
 * entry body — typically because the entry was edited after the note was
 * written. Shown as a collapsed `<details>` at the foot of the entry.
 */
export function OrphanedNotesSection({
  notes,
  viewerId,
  entryUserId,
  onDelete,
}: OrphanedNotesSectionProps) {
  if (notes.length === 0) return null;

  return (
    <details className="marginalia-orphaned-section">
      <summary>
        {notes.length} marginalia{notes.length === 1 ? "" : ""} whose passages
        have since changed
      </summary>
      <ul className="marginalia-orphaned-list">
        {notes.map((note) => {
          const canDelete = note.user_id === viewerId || entryUserId === viewerId;
          return (
            <li key={note.id} className="marginalia-orphaned-item">
              <div className="marginalia-orphaned-header">
                {note.author && (
                  <AvatarWithFrame
                    url={note.author.avatar_url}
                    name={note.author.display_name || note.author.username}
                    size={22}
                    frame={note.author.avatar_frame}
                    animation={note.author.avatar_animation}
                    subscriptionTier={note.author.subscription_tier ?? undefined}
                  />
                )}
                <span className="marginalia-orphaned-name">
                  {note.author?.display_name || note.author?.username || "Anonymous"}
                </span>
              </div>
              <blockquote className="marginalia-orphaned-quote">
                &ldquo;{note.quote_text}&rdquo;
              </blockquote>
              <div
                className="marginalia-orphaned-body"
                dangerouslySetInnerHTML={{ __html: note.note_html }}
              />
              {canDelete && (
                <button
                  type="button"
                  className="marginalia-orphaned-delete"
                  onClick={() => onDelete(note.id)}
                >
                  Delete
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
