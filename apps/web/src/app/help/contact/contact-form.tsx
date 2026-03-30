"use client";

import { useState } from "react";

const CATEGORIES = [
  { value: "account", label: "Account Issue" },
  { value: "bug", label: "Bug Report" },
  { value: "billing", label: "Billing & Subscription" },
  { value: "report", label: "Content Report" },
  { value: "feature", label: "Feature Request" },
  { value: "other", label: "Other" },
];

export function ContactForm({
  username,
}: {
  username?: string | null;
}) {
  const [category, setCategory] = useState("other");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    email.trim().length > 0 &&
    subject.trim().length > 0 &&
    message.trim().length > 0 &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
          website, // honeypot
          username: username ?? undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong. Please try again.");
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div
        className="rounded-xl border p-8 text-center"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {/* Wax seal icon */}
        <svg
          className="mx-auto mb-4"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--accent)" }}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <h2
          className="text-lg font-bold mb-2"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Your message has been sealed and sent
        </h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          We&rsquo;ll respond to <strong>{email}</strong> as soon as we can.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border p-6 sm:p-8"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {/* Honeypot — invisible to real users */}
      <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }} aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          type="text"
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="space-y-5">
        {/* Category */}
        <div>
          <label
            htmlFor="contact-category"
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--muted)" }}
          >
            Category
          </label>
          <select
            id="contact-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none"
            style={{
              borderColor: "var(--border)",
              color: "var(--foreground)",
              fontFamily: "var(--font-lora, Georgia, serif)",
            }}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="contact-email"
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--muted)" }}
          >
            Your Email
          </label>
          <input
            id="contact-email"
            type="email"
            required
            maxLength={320}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none"
            style={{
              borderColor: "var(--border)",
              color: "var(--foreground)",
              fontFamily: "var(--font-lora, Georgia, serif)",
            }}
          />
        </div>

        {/* Subject */}
        <div>
          <label
            htmlFor="contact-subject"
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--muted)" }}
          >
            Subject
          </label>
          <input
            id="contact-subject"
            type="text"
            required
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What can we help with?"
            className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none"
            style={{
              borderColor: "var(--border)",
              color: "var(--foreground)",
              fontFamily: "var(--font-lora, Georgia, serif)",
              fontStyle: "italic",
            }}
          />
        </div>

        {/* Message */}
        <div>
          <label
            htmlFor="contact-message"
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--muted)" }}
          >
            Message
          </label>
          <textarea
            id="contact-message"
            required
            maxLength={5000}
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what's going on..."
            className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none resize-y"
            style={{
              borderColor: "var(--border)",
              color: "var(--foreground)",
              fontFamily: "var(--font-lora, Georgia, serif)",
            }}
          />
          <p className="text-xs mt-1 text-right" style={{ color: "var(--muted)" }}>
            {message.length} / 5000
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm" style={{ color: "#ef4444" }}>
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-full py-2.5 text-sm font-medium transition-opacity"
          style={{
            background: "var(--accent)",
            color: "white",
            opacity: canSubmit ? 1 : 0.5,
            fontFamily: "var(--font-lora, Georgia, serif)",
          }}
        >
          {submitting ? "Sending..." : "Send Message"}
        </button>
      </div>
    </form>
  );
}
