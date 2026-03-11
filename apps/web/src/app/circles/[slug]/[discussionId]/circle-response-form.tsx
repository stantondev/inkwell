"use client";

import { useState } from "react";
import { CircleEditor } from "@/components/circle-editor";

interface Props {
  discussionId: string;
  onSubmitted: () => void;
}

export default function CircleResponseForm({ discussionId, onSubmitted }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [editorKey, setEditorKey] = useState(0);

  const handleSubmit = async (html: string) => {
    if (!html || html === "<p></p>" || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/circles/discussions/${discussionId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_html: html }),
      });
      if (res.ok) {
        setEditorKey((k) => k + 1);
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
    <div>
      <CircleEditor
        key={editorKey}
        onSubmit={handleSubmit}
        placeholder="Add your voice… (use @ to mention someone)"
        compact
        maxLength={6000}
        submitLabel={submitting ? "Posting..." : "Add Your Voice"}
        disabled={submitting}
      />
      {error && <p style={{ color: "#c53030", fontSize: "0.8125rem", marginTop: "0.375rem" }}>{error}</p>}
    </div>
  );
}
