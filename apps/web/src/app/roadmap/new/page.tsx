"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const categories = [
  { value: "idea", label: "Idea", placeholder: "Describe your idea for Inkwell..." },
  { value: "feature", label: "Feature", placeholder: "What feature would you like to see?" },
  { value: "bug", label: "Bug", placeholder: "What happened? What did you expect?" },
  { value: "question", label: "Question", placeholder: "What would you like to know?" },
];

export default function NewFeedbackPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("idea");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");

  const placeholder = categories.find((c) => c.value === category)?.placeholder ?? "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setStatus("sending");
    setError("");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          category,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push(`/roadmap/${data.data.id}`);
      } else {
        const msg =
          data.error ||
          data.errors?.title?.[0] ||
          data.errors?.body?.[0] ||
          "Something went wrong";
        setError(msg);
        setStatus("error");
      }
    } catch {
      setError("Failed to submit. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Back link */}
        <Link
          href="/roadmap"
          className="inline-flex items-center gap-1 text-sm mb-6 transition-colors hover:underline"
          style={{ color: "var(--muted)" }}
        >
          ← Back to Roadmap
        </Link>

        <h1
          className="text-2xl font-semibold mb-6"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Submit Feedback
        </h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Category selector */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium border transition-colors"
                  style={{
                    borderColor: category === c.value ? "var(--accent)" : "var(--border)",
                    background: category === c.value ? "var(--accent)" : "transparent",
                    color: category === c.value ? "#fff" : "var(--muted)",
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="A short, descriptive title"
              className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 transition"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
                color: "var(--foreground)",
              }}
            />
            <p className="text-xs mt-1 text-right" style={{ color: "var(--muted)" }}>
              {title.length}/200
            </p>
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
              Details
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              rows={8}
              placeholder={placeholder}
              className="w-full rounded-xl border px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 transition"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
                color: "var(--foreground)",
              }}
            />
            <p className="text-xs mt-1 text-right" style={{ color: "var(--muted)" }}>
              {body.length}/5000
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm" style={{ color: "#B91C1C" }}>
              {error}
            </p>
          )}

          {/* Submit */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!title.trim() || !body.trim() || status === "sending"}
              className="rounded-full px-6 py-2 text-sm font-medium transition-colors"
              style={{
                background: "var(--accent)",
                color: "#fff",
                opacity: !title.trim() || !body.trim() || status === "sending" ? 0.5 : 1,
              }}
            >
              {status === "sending" ? "Submitting..." : "Submit"}
            </button>
            <Link
              href="/roadmap"
              className="text-sm transition-colors hover:underline"
              style={{ color: "var(--muted)" }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
