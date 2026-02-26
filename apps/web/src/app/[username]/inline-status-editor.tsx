"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface InlineStatusEditorProps {
  initialStatus: string | null;
  mutedColor: string;
  accentColor: string;
}

export function InlineStatusEditor({
  initialStatus,
  mutedColor,
  accentColor,
}: InlineStatusEditorProps) {
  const [status, setStatus] = useState(initialStatus ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(initialStatus ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const save = useCallback(async (newStatus: string) => {
    const trimmed = newStatus.trim();
    // Don't save if nothing changed
    if (trimmed === (status || "")) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_status: trimmed || null }),
      });
      if (res.ok) {
        setStatus(trimmed);
        setEditing(false);
      }
    } catch {
      // silent fail, keep editing open
    } finally {
      setSaving(false);
    }
  }, [status]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      save(draft);
    } else if (e.key === "Escape") {
      setDraft(status || "");
      setEditing(false);
    }
  }

  function handleBlur() {
    // Small delay to allow click events to fire first
    setTimeout(() => {
      if (editing && !saving) {
        save(draft);
      }
    }, 150);
  }

  // ── Editing mode ──
  if (editing) {
    return (
      <div className="flex items-center gap-2 mt-1 mb-3">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          maxLength={280}
          placeholder="What are you up to?"
          disabled={saving}
          className="flex-1 text-sm italic rounded-lg border px-3 py-1.5 outline-none transition-colors"
          style={{
            borderColor: accentColor,
            background: "transparent",
            color: mutedColor,
            opacity: saving ? 0.5 : 1,
          }}
        />
        <span className="text-[10px] tabular-nums shrink-0" style={{ color: mutedColor, opacity: 0.5 }}>
          {draft.length}/280
        </span>
      </div>
    );
  }

  // ── Display mode: has status ──
  if (status) {
    return (
      <button
        onClick={() => { setDraft(status); setEditing(true); }}
        className="group flex items-center gap-1.5 mt-1 mb-3 text-left transition-opacity hover:opacity-80"
        title="Click to edit status"
      >
        <p className="text-sm italic" style={{ color: mutedColor }}>
          &ldquo;{status}&rdquo;
        </p>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
          style={{ color: mutedColor }}
          aria-hidden="true"
        >
          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      </button>
    );
  }

  // ── Display mode: no status (placeholder) ──
  return (
    <button
      onClick={() => { setDraft(""); setEditing(true); }}
      className="mt-1 mb-3 text-sm italic transition-opacity hover:opacity-80"
      style={{ color: mutedColor, opacity: 0.4 }}
      title="Set a status"
    >
      Set a status...
    </button>
  );
}
