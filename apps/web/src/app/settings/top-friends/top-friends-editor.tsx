"use client";

import { useState } from "react";
import { Avatar } from "@/components/avatar";

interface Friend {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface TopFriendSlot {
  position: number;
  user: Friend;
}

const MAX_SLOTS = 6;

export function TopFriendsEditor({
  topFriends,
  friends,
}: {
  topFriends: TopFriendSlot[];
  friends: Friend[];
}) {
  // Build initial slots array (positions 1-8, null if empty)
  const initialSlots: (Friend | null)[] = Array.from({ length: MAX_SLOTS }, (_, i) => {
    const slot = topFriends.find(t => t.position === i + 1);
    return slot?.user ?? null;
  });

  const [slots, setSlots] = useState<(Friend | null)[]>(initialSlots);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Friends not yet in a slot
  const available = friends.filter(f => !slots.some(s => s?.id === f.id));

  function addFriend(friend: Friend) {
    setSlots(prev => {
      const empty = prev.findIndex(s => s === null);
      if (empty === -1) return prev; // all slots full
      const next = [...prev];
      next[empty] = friend;
      return next;
    });
  }

  function removeSlot(index: number) {
    setSlots(prev => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  }

  function moveUp(index: number) {
    if (index === 0) return;
    setSlots(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    if (index === MAX_SLOTS - 1) return;
    setSlots(prev => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);

    const payload = slots
      .map((user, i) => user ? { friend_id: user.id, position: i + 1 } : null)
      .filter(Boolean);

    try {
      const res = await fetch("/api/top-friends", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friends: payload }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
      } else {
        setSaved(true);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Choose up to 6 pen pals to feature on your profile. Use the arrows to reorder them.
      </p>

      {/* Current slots */}
      <div className="rounded-xl border overflow-hidden"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        {slots.map((friend, i) => (
          <div key={i}
            className={`flex items-center gap-3 px-4 py-3 ${i < MAX_SLOTS - 1 ? "border-b" : ""}`}
            style={{ borderColor: "var(--border)" }}>
            <span className="text-xs w-4 text-center flex-shrink-0" style={{ color: "var(--muted)" }}>
              {i + 1}
            </span>
            {friend ? (
              <>
                <Avatar url={friend.avatar_url} name={friend.display_name} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{friend.display_name}</p>
                  <p className="text-xs truncate" style={{ color: "var(--muted)" }}>@{friend.username}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveUp(i)} disabled={i === 0}
                    className="p-1 rounded disabled:opacity-20 hover:bg-[var(--surface-hover)] transition"
                    aria-label="Move up">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 15l-6-6-6 6"/>
                    </svg>
                  </button>
                  <button onClick={() => moveDown(i)} disabled={i === MAX_SLOTS - 1 || slots[i + 1] === null}
                    className="p-1 rounded disabled:opacity-20 hover:bg-[var(--surface-hover)] transition"
                    aria-label="Move down">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </button>
                  <button onClick={() => removeSlot(i)}
                    className="p-1 rounded hover:bg-[var(--surface-hover)] transition ml-1"
                    aria-label="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              <span className="text-sm italic" style={{ color: "var(--muted)" }}>Empty slot</span>
            )}
          </div>
        ))}
      </div>

      {/* Add friends */}
      {available.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-widest mb-3"
            style={{ color: "var(--muted)" }}>Add a pen pal</h3>
          <div className="flex flex-wrap gap-2">
            {available.map(f => (
              <button key={f.id} onClick={() => addFriend(f)}
                disabled={!slots.some(s => s === null)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm disabled:opacity-40 hover:border-[var(--accent)] transition"
                style={{ borderColor: "var(--border)" }}>
                <Avatar url={f.avatar_url} name={f.display_name} size={20} />
                {f.display_name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button onClick={handleSave} disabled={saving}
          className="rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60 transition"
          style={{ background: "var(--accent)", color: "#fff" }}>
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm font-medium" style={{ color: "var(--success)" }}>✓ Saved</span>}
        {error && <span className="text-sm" style={{ color: "var(--danger)" }}>{error}</span>}
      </div>
    </div>
  );
}
