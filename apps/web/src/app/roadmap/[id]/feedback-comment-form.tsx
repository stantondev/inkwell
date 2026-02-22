"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface FeedbackCommentFormProps {
  postId: string;
}

export function FeedbackCommentForm({ postId }: FeedbackCommentFormProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setStatus("sending");
    setError("");

    try {
      const res = await fetch(`/api/feedback/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });

      if (res.ok) {
        setBody("");
        setStatus("idle");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || data.errors?.body?.[0] || "Failed to post comment");
        setStatus("error");
      }
    } catch {
      setError("Failed to post comment");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={3000}
        placeholder="Add a comment..."
        className="w-full rounded-xl border px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 transition"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          color: "var(--foreground)",
        }}
      />
      {error && (
        <p className="text-xs" style={{ color: "#B91C1C" }}>{error}</p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {body.length}/3000
        </span>
        <button
          type="submit"
          disabled={!body.trim() || status === "sending"}
          className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
          style={{
            background: "var(--accent)",
            color: "#fff",
            opacity: !body.trim() || status === "sending" ? 0.5 : 1,
          }}
        >
          {status === "sending" ? "Posting..." : "Post Comment"}
        </button>
      </div>
    </form>
  );
}
