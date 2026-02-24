"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resizeEntryImage } from "@/lib/image-utils";

const categories = [
  { value: "idea", label: "Idea", placeholder: "Describe your idea for Inkwell..." },
  { value: "feature", label: "Feature", placeholder: "What feature would you like to see?" },
  { value: "bug", label: "Bug", placeholder: "What happened? What did you expect?" },
  { value: "question", label: "Question", placeholder: "What would you like to know?" },
];

interface Attachment {
  file: File;
  preview: string; // object URL for display
}

export default function NewFeedbackPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("idea");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");

  const placeholder = categories.find((c) => c.value === category)?.placeholder ?? "";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const remaining = 3 - attachments.length;
    const accepted = files.slice(0, remaining);
    const newAttachments = accepted.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
    // Reset input so the same file can be re-selected if removed
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function uploadAttachment(att: Attachment): Promise<string | null> {
    try {
      const dataUri = await resizeEntryImage(att.file);
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUri }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.data?.id ?? null;
    } catch {
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setStatus("sending");
    setError("");

    try {
      // Upload screenshots first (in parallel)
      const imageIds = attachments.length > 0
        ? (await Promise.all(attachments.map(uploadAttachment))).filter(Boolean) as string[]
        : [];

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          category,
          image_ids: imageIds,
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

          {/* Screenshots */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
              Screenshots{" "}
              <span style={{ fontWeight: 400 }}>(optional, up to 3)</span>
            </label>

            {/* Previews */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map((att, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={att.preview}
                      alt={`Screenshot ${i + 1}`}
                      className="rounded-lg border object-cover"
                      style={{ height: 80, maxWidth: 140, borderColor: "var(--border)" }}
                    />
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full text-white"
                      style={{ background: "#B91C1C", width: 18, height: 18, fontSize: 11 }}
                      aria-label="Remove screenshot"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {attachments.length < 3 && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Add screenshot
                </button>
              </>
            )}
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
