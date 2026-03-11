"use client";

import { useState, useRef } from "react";
import { CircleEditor } from "@/components/circle-editor";

interface Props {
  circleId: string;
  circleSlug: string;
  canCreatePrompt: boolean;
  onCreated: () => void;
}

export default function CreateDiscussionForm({ circleId, circleSlug, canCreatePrompt, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [isPrompt, setIsPrompt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [editorKey, setEditorKey] = useState(0);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim() || !bodyHtml || bodyHtml === "<p></p>") return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/circles/${circleId}/discussions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body_html: bodyHtml, is_prompt: isPrompt }),
      });
      if (res.ok) {
        setTitle("");
        setBodyHtml("");
        setIsPrompt(false);
        setEditorKey((k) => k + 1);
        onCreated();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create discussion");
      }
    } catch {
      setError("Something went wrong");
    }
    setSubmitting(false);
  };

  const hasContent = title.trim() && bodyHtml && bodyHtml !== "<p></p>";

  return (
    <form onSubmit={handleSubmit} className="circle-card" style={{ marginBottom: "1.5rem" }}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Discussion title"
        maxLength={300}
        style={{
          width: "100%",
          padding: "0.5rem 0.75rem",
          fontSize: "0.9375rem",
          fontFamily: "var(--font-lora, Georgia, serif)",
          fontWeight: 600,
          border: "1px solid var(--border)",
          borderRadius: "0.5rem",
          background: "var(--surface)",
          color: "var(--foreground)",
          marginBottom: "0.75rem",
          outline: "none",
        }}
      />

      <CircleEditor
        key={editorKey}
        onChange={setBodyHtml}
        placeholder="Share your thoughts… (use @ to mention someone)"
        maxLength={50000}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem" }}>
        <div>
          {canCreatePrompt && (
            <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.8125rem", color: "var(--muted)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isPrompt}
                onChange={(e) => setIsPrompt(e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />
              Mark as Circle Prompt
            </label>
          )}
        </div>
        <button type="submit" disabled={submitting || !hasContent} className="circle-btn" style={{ fontSize: "0.8125rem" }}>
          {submitting ? "Creating..." : "Start Discussion"}
        </button>
      </div>

      {error && <p style={{ color: "#c53030", fontSize: "0.8125rem", marginTop: "0.5rem" }}>{error}</p>}
    </form>
  );
}
