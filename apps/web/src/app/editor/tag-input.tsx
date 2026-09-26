"use client";

import { useRef, useState } from "react";

// Tags as chips. The editor still keeps them as "a, b, c" (that's what it
// saves and restores), so this only changes how they're typed and shown.

function split(value: string): string[] {
  return value.split(",").map((t) => t.trim()).filter(Boolean);
}

function clean(tag: string): string {
  return tag.replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, 50);
}

export function TagInput({ value, onChange, max = 20 }: { value: string; onChange: (value: string) => void; max?: number }) {
  const tags = split(value);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (text: string) => {
    const incoming = text.split(",").map(clean).filter(Boolean);
    if (incoming.length === 0) return;
    const seen = new Set(tags.map((t) => t.toLowerCase()));
    const next = [...tags];
    for (const t of incoming) {
      if (next.length >= max) break;
      if (!seen.has(t.toLowerCase())) {
        next.push(t);
        seen.add(t.toLowerCase());
      }
    }
    onChange(next.join(", "));
    setDraft("");
  };

  const remove = (index: number) => {
    onChange(tags.filter((_, i) => i !== index).join(", "));
    inputRef.current?.focus();
  };

  return (
    <div className="tag-input" onClick={() => inputRef.current?.focus()}>
      {tags.map((tag, i) => (
        <span key={`${tag}-${i}`} className="tag-input-chip">
          #{tag}
          <button type="button" onClick={(e) => { e.stopPropagation(); remove(i); }} aria-label={`Remove tag ${tag}`}>
            ×
          </button>
        </span>
      ))}
      {tags.length < max && (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) commit(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") {
              if (draft.trim()) {
                e.preventDefault();
                commit(draft);
              }
            } else if (e.key === "Backspace" && !draft && tags.length > 0) {
              e.preventDefault();
              remove(tags.length - 1);
            }
          }}
          onBlur={() => draft.trim() && commit(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.includes(",")) {
              e.preventDefault();
              commit(draft + text);
            }
          }}
          placeholder={tags.length === 0 ? "coffee, 2026, writing" : "Add a tag"}
          aria-label="Add a tag"
          className="tag-input-field"
          enterKeyHint="done"
        />
      )}
    </div>
  );
}
