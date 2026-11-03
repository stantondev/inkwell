"use client";

import { useEffect, useState } from "react";

/**
 * "Sign in with Bluesky" for /login and /get-started. Shows only while
 * Bluesky sign-in is switched on (GET /api/auth/bluesky/status). The handle
 * is optional: left empty, Bluesky asks which account to use.
 */
export default function BlueskyLogin({
  disabled = false,
  disabledReason,
  next,
}: {
  disabled?: boolean;
  disabledReason?: string;
  next?: string | null;
}) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/bluesky/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setAvailable(!!d?.sign_in);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available) return null;

  const go = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (disabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/bluesky/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim(), redirect_after: next || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.authorize_url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      window.location.href = data.authorize_url;
    } catch {
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 mt-3">
      {open && (
        <form onSubmit={go} className="flex flex-col gap-1.5">
          <label htmlFor="bluesky-handle" className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
            Bluesky handle <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="bluesky-handle"
            type="text"
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value);
              if (error) setError(null);
            }}
            placeholder="you.bsky.social"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            className="w-full rounded-xl border px-4 py-3 text-base focus:outline-none focus:ring-2"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
          />
        </form>
      )}

      {error && (
        <p className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--danger-light, #fef2f2)", color: "var(--danger, #dc2626)" }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => (open ? go() : setOpen(true))}
        disabled={loading || disabled}
        className="rounded-xl py-3 text-base font-medium transition-opacity disabled:opacity-60 border flex items-center justify-center gap-2"
        style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "transparent" }}
      >
        {loading ? (
          "Opening Bluesky…"
        ) : (
          <>
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6.3 3.9C8.6 5.6 11 9 12 10.9c1-1.9 3.4-5.3 5.7-7 1.7-1.2 4.3-2.1 4.3.8 0 .6-.3 4.9-.5 5.6-.7 2.4-3.2 3-5.4 2.7 3.9.7 4.9 2.9 2.8 5.1-4 4.1-5.8-1-6.2-2.3l-.2-.6-.2.6c-.4 1.3-2.2 6.4-6.2 2.3-2.1-2.2-1.1-4.4 2.8-5.1-2.2.3-4.7-.3-5.4-2.7C2.3 9.6 2 5.3 2 4.7c0-2.9 2.6-2 4.3-.8Z"
              />
            </svg>
            {open ? "Continue on Bluesky" : "Sign in with Bluesky"}
          </>
        )}
      </button>

      {disabled && disabledReason && (
        <p className="text-xs text-center leading-relaxed" style={{ color: "var(--danger, #dc2626)" }}>
          {disabledReason}
        </p>
      )}
    </div>
  );
}
