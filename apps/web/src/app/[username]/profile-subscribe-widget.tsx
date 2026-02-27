"use client";

import { useState, useRef } from "react";

interface ProfileSubscribeWidgetProps {
  username: string;
  newsletterName: string | null;
  newsletterDescription: string | null;
  subscriberCount: number;
  styles: {
    surface: Record<string, string | undefined>;
    muted: string;
    accent: string;
    border: string;
    foreground: string;
    borderRadius: string;
  };
  preview?: boolean;
}

export function ProfileSubscribeWidget({
  username,
  newsletterName,
  newsletterDescription,
  subscriberCount,
  styles,
  preview = false,
}: ProfileSubscribeWidgetProps) {
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
        setError(data.error || "Something went wrong.");
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  };

  return (
    <div className={`profile-widget-card ${styles.borderRadius} border p-3 sm:p-4`} style={styles.surface}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium uppercase tracking-widest" style={{ color: styles.muted }}>
          Newsletter
        </h3>
        {subscriberCount > 0 && (
          <span className="text-xs" style={{ color: styles.muted }}>
            {subscriberCount} {subscriberCount === 1 ? "subscriber" : "subscribers"}
          </span>
        )}
      </div>

      {newsletterName && (
        <p className="text-sm font-medium mb-1">{newsletterName}</p>
      )}
      {newsletterDescription && (
        <p className="text-xs mb-3" style={{ color: styles.muted }}>{newsletterDescription}</p>
      )}

      {preview ? (
        <div className="flex gap-1.5 opacity-60">
          <input
            type="email"
            disabled
            placeholder="your@email.com"
            className="flex-1 min-w-0 rounded-lg border px-2.5 py-1.5 text-xs"
            style={{
              borderColor: styles.border,
              background: "var(--background)",
              color: styles.foreground,
            }}
          />
          <button
            disabled
            className="rounded-lg px-3 py-1.5 text-xs font-medium shrink-0"
            style={{ background: styles.accent, color: "#fff" }}
          >
            Subscribe
          </button>
        </div>
      ) : success ? (
        <div className="text-sm py-2" style={{ color: styles.accent }}>
          Check your email to confirm!
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="relative">
          {error && (
            <p className="text-xs mb-2" style={{ color: "var(--danger)" }}>{error}</p>
          )}
          <div className="flex gap-1.5">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 min-w-0 rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1"
              style={{
                borderColor: styles.border,
                background: "var(--background)",
                color: styles.foreground,
                outlineColor: styles.accent,
              }}
            />
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-50 shrink-0"
              style={{ background: styles.accent, color: "#fff" }}
            >
              {submitting ? "..." : "Subscribe"}
            </button>
          </div>
          {/* Honeypot */}
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
        </form>
      )}
    </div>
  );
}
