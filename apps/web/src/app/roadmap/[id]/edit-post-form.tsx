"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
  { value: "idea", label: "Idea" },
  { value: "question", label: "Question" },
];

interface EditPostFormProps {
  postId: string;
  initialTitle: string;
  initialBody: string;
  initialCategory: string;
}

export function EditPostForm({
  postId,
  initialTitle,
  initialBody,
  initialCategory,
}: EditPostFormProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [category, setCategory] = useState(initialCategory);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/feedback/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, category }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? data.errors?.title?.[0] ?? data.errors?.body?.[0] ?? "Failed to save");
        return;
      }

      setEditing(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 text-xs transition-colors hover:underline"
        style={{ color: "var(--muted)" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
          <path d="m15 5 4 4"/>
        </svg>
        Edit
      </button>
    );
  }

  return (
    <div
      className="rounded-xl border p-4 sm:p-6 mt-4"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <h3
        className="text-sm font-semibold mb-3"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Edit Post
      </h3>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="edit-title" className="text-xs font-medium" style={{ color: "var(--muted)" }}>
            Title
          </label>
          <input
            id="edit-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="edit-category" className="text-xs font-medium" style={{ color: "var(--muted)" }}>
            Category
          </label>
          <select
            id="edit-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="edit-body" className="text-xs font-medium" style={{ color: "var(--muted)" }}>
            Description
          </label>
          <textarea
            id="edit-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-y"
            style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          />
        </div>

        {error && (
          <p className="text-xs rounded-lg px-3 py-2" style={{ background: "var(--danger-light, #fef2f2)", color: "var(--danger, #dc2626)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim() || !body.trim()}
            className="rounded-lg px-4 py-2 text-xs font-medium transition-opacity disabled:opacity-60"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => {
              setTitle(initialTitle);
              setBody(initialBody);
              setCategory(initialCategory);
              setError(null);
              setEditing(false);
            }}
            className="rounded-lg px-4 py-2 text-xs font-medium border transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
