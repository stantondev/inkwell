"use client";

import { useState } from "react";

/**
 * Fediverse login form — lets users sign in with their Mastodon/Pleroma/GoToSocial handle.
 *
 * Props:
 * - `disabled`: externally disable the submit button (e.g., terms not yet accepted)
 * - `onError`: optional callback when an error occurs
 */
export default function FediverseLogin({
  disabled = false,
  disabledReason,
  onError,
}: {
  disabled?: boolean;
  disabledReason?: string;
  onError?: (error: string) => void;
}) {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim() || disabled) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/fediverse/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.error ?? "Something went wrong";
        setError(msg);
        onError?.(msg);
        return;
      }

      // Redirect to remote instance's authorization page
      window.location.href = data.authorize_url;
    } catch {
      const msg = "Could not reach the server. Please try again.";
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="fediverse-handle"
          className="text-sm font-medium"
          style={{ color: "var(--foreground)" }}
        >
          Fediverse handle
        </label>
        <div className="relative">
          <div
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--muted)" }}
            aria-hidden="true"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <input
            id="fediverse-handle"
            type="text"
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value);
              if (error) setError(null);
            }}
            placeholder="@you@mastodon.social"
            autoComplete="off"
            className="w-full rounded-xl border pl-10 pr-4 py-3 text-base focus:outline-none focus:ring-2 transition-colors"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
            }}
          />
        </div>
      </div>

      {error && (
        <p
          className="text-sm rounded-lg px-3 py-2"
          style={{
            background: "var(--danger-light, #fef2f2)",
            color: "var(--danger, #dc2626)",
          }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !handle.trim() || disabled}
        className="rounded-xl py-3 text-base font-medium transition-opacity disabled:opacity-60 border flex items-center justify-center gap-2"
        style={{
          borderColor: "var(--accent)",
          color: "var(--accent)",
          background: "transparent",
        }}
      >
        {loading ? (
          "Connecting..."
        ) : (
          <>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            Sign in with Fediverse
          </>
        )}
      </button>

      {disabled && disabledReason && (
        <p
          className="text-xs text-center leading-relaxed"
          style={{ color: "var(--danger, #dc2626)" }}
        >
          {disabledReason}
        </p>
      )}

      <p
        className="text-xs text-center leading-relaxed"
        style={{ color: "var(--muted)" }}
      >
        Works with Mastodon, Pleroma, GoToSocial, Pixelfed, and other
        compatible instances.
      </p>
    </form>
  );
}
