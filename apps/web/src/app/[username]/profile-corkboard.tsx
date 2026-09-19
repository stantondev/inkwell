"use client";

import { useEffect, useState } from "react";
import { StickyNoteCard } from "@/components/sticky-note-card";
import type { JournalEntry } from "@/components/journal-entry-card";
import { STICKY_SAVED_EVENT } from "@/components/jot-composer";
import { JotPrompt } from "@/components/jot-prompt";

const PER_PAGE = 6;

// The profile's entry listing doesn't repeat the author on every row.
function withAuthor(list: JournalEntry[], username: string, displayName: string): JournalEntry[] {
  return list.map((s) => (s.author ? s : { ...s, author: { username, display_name: displayName, avatar_url: null } }));
}

/**
 * The profile's corkboard: the writer's latest Stickies, pinned up above
 * their journal entries. Hidden when there are none (except for the writer,
 * who gets a prompt to jot the first one).
 */
export function ProfileCorkboard({
  username,
  displayName,
  initialStickies,
  total,
  isOwnProfile,
  mutedColor,
}: {
  username: string;
  displayName: string;
  initialStickies: JournalEntry[];
  total: number;
  isOwnProfile: boolean;
  mutedColor?: string;
}) {
  const [stickies, setStickies] = useState(() => withAuthor(initialStickies, username, displayName));
  const [count, setCount] = useState(total);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // The writer's new sticky pins itself to the board right away
  useEffect(() => {
    if (!isOwnProfile) return;
    function onSaved(e: Event) {
      const { entry, edited } = (e as CustomEvent<{ entry: JournalEntry; edited: boolean }>).detail;
      if (entry.author?.username !== username) return;
      setStickies((prev) =>
        edited || prev.some((s) => s.id === entry.id)
          ? prev.map((s) => (s.id === entry.id ? { ...s, ...entry } : s))
          : [entry, ...prev]
      );
      if (!edited) setCount((c) => c + 1);
    }
    window.addEventListener(STICKY_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(STICKY_SAVED_EVENT, onSaved);
  }, [isOwnProfile, username]);

  async function loadMore() {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/entries?kind=sticky&per_page=${PER_PAGE}&page=${page + 1}`);
      if (res.ok) {
        const data = await res.json();
        const more = withAuthor(data.data ?? [], username, displayName);
        setStickies((prev) => [...prev, ...more.filter((m) => !prev.some((p) => p.id === m.id))]);
        setPage((p) => p + 1);
      }
    } finally {
      setLoading(false);
    }
  }

  if (stickies.length === 0 && !isOwnProfile) return null;

  return (
    <section className="profile-corkboard mb-8" aria-label="Stickies">
      <h2 className="text-sm font-medium uppercase tracking-widest mb-3" style={{ color: mutedColor }}>
        Stickies
      </h2>

      {stickies.length === 0 ? (
        <div className="py-2">
          <JotPrompt label="Stick your first thought here…" />
        </div>
      ) : (
        <>
          {isOwnProfile && (
            <div className="mb-2">
              <JotPrompt />
            </div>
          )}
          <div className="sticky-board">
            {stickies.map((s) => (
              <StickyNoteCard key={s.id} entry={s} variant="board" isOwn={isOwnProfile} />
            ))}
          </div>
          {stickies.length < count && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="text-sm italic hover:underline disabled:opacity-50"
                style={{ color: mutedColor, fontFamily: "var(--font-lora, Georgia, serif)" }}
              >
                {loading ? "Unpinning more…" : `More stickies (${count - stickies.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
