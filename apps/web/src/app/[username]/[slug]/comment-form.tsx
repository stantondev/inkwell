"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function CommentForm({ entryId, isLoggedIn }: { entryId: string; isLoggedIn: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border p-4 text-sm text-center"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        <Link href="/login" className="font-medium hover:underline"
          style={{ color: "var(--accent)" }}>
          Sign in
        </Link>{" "}
        to leave a comment.
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/entries/${entryId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_html: `<p>${text.replace(/\n/g, "<br>")}</p>` }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to post comment");
      } else {
        setText("");
        router.refresh();
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        placeholder="Write a comment…"
        className="w-full rounded-xl border px-4 py-3 text-sm bg-transparent outline-none focus:ring-2 focus:ring-[var(--accent)] transition resize-none"
        style={{ borderColor: "var(--border)" }}
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={submitting || !text.trim()}
          className="rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50 transition"
          style={{ background: "var(--accent)", color: "#fff" }}>
          {submitting ? "Posting…" : "Post comment"}
        </button>
        {error && <span className="text-sm" style={{ color: "var(--danger)" }}>{error}</span>}
      </div>
    </form>
  );
}
