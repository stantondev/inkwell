"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  { value: "writing_craft", label: "Writing & Craft" },
  { value: "reading_books", label: "Reading & Books" },
  { value: "creative_arts", label: "Creative Arts" },
  { value: "lifestyle_interests", label: "Lifestyle & Interests" },
  { value: "tech_learning", label: "Tech & Learning" },
  { value: "community", label: "Community" },
];

export default function CreateCircleForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !category) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/circles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          category,
        }),
      });
      const data = await res.json();
      if (res.ok && data.data?.slug) {
        router.push(`/circles/${data.data.slug}`);
      } else {
        setError(data.error || "Failed to create circle");
      }
    } catch {
      setError("Something went wrong");
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="circle-card">
      <div style={{ marginBottom: "1.25rem" }}>
        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: "0.375rem" }}>
          Circle Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., The Midnight Writers"
          maxLength={100}
          required
          style={{
            width: "100%",
            padding: "0.625rem 0.75rem",
            fontSize: "0.9375rem",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            background: "var(--background)",
            color: "var(--foreground)",
            outline: "none",
          }}
        />
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: "0.375rem" }}>
          Category
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
          style={{
            width: "100%",
            padding: "0.625rem 0.75rem",
            fontSize: "0.9375rem",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            background: "var(--background)",
            color: "var(--foreground)",
            outline: "none",
            appearance: "none",
          }}
        >
          <option value="">Select a category...</option>
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: "0.375rem" }}>
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this circle about? What kind of discussions happen here?"
          maxLength={5000}
          rows={4}
          style={{
            width: "100%",
            padding: "0.625rem 0.75rem",
            fontSize: "0.9375rem",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            background: "var(--background)",
            color: "var(--foreground)",
            outline: "none",
            resize: "vertical",
            fontFamily: "inherit",
            lineHeight: 1.6,
          }}
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !name.trim() || !category}
        className="circle-btn"
        style={{ width: "100%", padding: "0.625rem", fontSize: "0.9375rem" }}
      >
        {submitting ? "Creating..." : "Found Your Circle"}
      </button>

      {error && <p style={{ color: "#c53030", fontSize: "0.8125rem", marginTop: "0.75rem", textAlign: "center" }}>{error}</p>}
    </form>
  );
}
