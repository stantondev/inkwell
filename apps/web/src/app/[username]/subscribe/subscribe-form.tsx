"use client";

import { useState, useRef } from "react";

export function SubscribeForm({ username }: { username: string }) {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const submitRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitRef.current || !email.trim()) return;
    submitRef.current = true;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/newsletter/${username}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), website: honeypot }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  };

  if (success) {
    return (
      <div className="text-center py-4">
        <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
          style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>
          </svg>
        </div>
        <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
          Check your email
        </h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          We sent a confirmation link to <strong>{email}</strong>. Click it to complete your subscription.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="rounded-lg border p-3 mb-4 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="flex-1 rounded-full border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
        />
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="rounded-full px-5 py-2.5 text-sm font-medium transition-opacity disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {submitting ? "..." : "Subscribe"}
        </button>
      </div>
      {/* Honeypot — hidden from real users, filled by bots */}
      <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }} aria-hidden="true">
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>
      <p className="text-xs text-center mt-3" style={{ color: "var(--muted)" }}>
        Free, no spam, unsubscribe anytime.
      </p>
    </form>
  );
}
