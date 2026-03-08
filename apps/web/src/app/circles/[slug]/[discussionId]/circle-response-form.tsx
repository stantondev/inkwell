"use client";

import { useState, useRef } from "react";
import { useMentionAutocomplete } from "@/hooks/use-mention-autocomplete";
import { MentionDropdown } from "@/components/mention-dropdown";

interface Props {
  discussionId: string;
  onSubmitted: () => void;
}

export default function CircleResponseForm({ discussionId, onSubmitted }: Props) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    mentionUsers,
    mentionIndex,
    showDropdown,
    handleMentionChange,
    handleMentionKeyDown,
    insertMention,
  } = useMentionAutocomplete({ textareaRef, text: body, setText: setBody });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/circles/discussions/${discussionId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (res.ok) {
        setBody("");
        onSubmitted();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to post response");
      }
    } catch {
      setError("Something went wrong");
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ position: "relative" }}>
        <div className="circle-response-form">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleMentionChange}
            onKeyDown={(e) => {
              if (handleMentionKeyDown(e)) return;
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Add your voice... (use @ to mention someone)"
            maxLength={6000}
          />
        </div>
        {showDropdown && (
          <MentionDropdown
            users={mentionUsers}
            activeIndex={mentionIndex}
            onSelect={insertMention}
            position="above"
          />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
          {body.length > 0 ? `${body.length}/6000` : ""}
        </span>
        <button type="submit" disabled={submitting || !body.trim()} className="circle-btn" style={{ fontSize: "0.8125rem" }}>
          {submitting ? "Posting..." : "Add Your Voice"}
        </button>
      </div>
      {error && <p style={{ color: "#c53030", fontSize: "0.8125rem", marginTop: "0.375rem" }}>{error}</p>}
    </form>
  );
}
