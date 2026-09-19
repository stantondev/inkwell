"use client";

import { useEffect, useState } from "react";
import { ErrorReportButton } from "@/components/error-report-button";
import { API_UNAVAILABLE_DIGEST } from "@/lib/api";

// The API couldn't be reached while rendering (deploy restart, Fly 502/503,
// timeout). Poll until it answers, then reload. The guard stops a page that
// keeps failing with a healthy API from reloading forever.
const RECONNECT_KEY = "inkwell-reconnect";
const RECONNECT_MAX_RELOADS = 3;
const RECONNECT_WINDOW_MS = 3 * 60_000;
const RECONNECT_POLL_MS = 3000;
const RECONNECT_GIVE_UP_MS = 2 * 60_000;

function readReconnectAttempts(path: string): number {
  try {
    const raw = sessionStorage.getItem(RECONNECT_KEY);
    if (!raw) return 0;
    const saved = JSON.parse(raw) as { path: string; count: number; at: number };
    if (saved.path !== path || Date.now() - saved.at > RECONNECT_WINDOW_MS) return 0;
    return saved.count;
  } catch {
    return 0;
  }
}

function writeReconnectAttempts(path: string, count: number) {
  try {
    sessionStorage.setItem(RECONNECT_KEY, JSON.stringify({ path, count, at: Date.now() }));
  } catch {
    // ignore — worst case we give up sooner via the time limit
  }
}

// A chunk that 404s almost always means the user had the page open across a
// deploy: their HTML references hashed bundles that no longer exist on the
// server. Nothing is actually broken — a reload fetches the new manifest — but
// the user just sees a crash. This was reported from /login, i.e. it was
// blocking sign-ins.
//
// We reload once and mark it in sessionStorage, so a genuine, repeating chunk
// failure still surfaces the error screen instead of looping.
const CHUNK_RELOAD_KEY = "inkwell-chunk-reloaded";

function isChunkLoadError(error: Error): boolean {
  const name = error?.name ?? "";
  const message = error?.message ?? "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /Failed to load chunk/i.test(message) ||
    /Loading CSS chunk/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [url, setUrl] = useState("");
  const [recovering, setRecovering] = useState(false);
  const isOutage = error?.digest === API_UNAVAILABLE_DIGEST;
  const [reconnectGaveUp, setReconnectGaveUp] = useState(false);

  useEffect(() => {
    setUrl(window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    if (!isOutage) return;
    const path = window.location.pathname + window.location.search;
    const attempts = readReconnectAttempts(path);
    if (attempts >= RECONNECT_MAX_RELOADS) {
      setReconnectGaveUp(true);
      return;
    }

    let cancelled = false;
    const started = Date.now();
    (async () => {
      while (!cancelled && Date.now() - started < RECONNECT_GIVE_UP_MS) {
        try {
          const res = await fetch("/api/healthcheck/api", { cache: "no-store" });
          if (res.ok && !cancelled) {
            writeReconnectAttempts(path, attempts + 1);
            window.location.reload();
            return;
          }
        } catch {
          // web tier itself unreachable — keep waiting
        }
        await new Promise((r) => setTimeout(r, RECONNECT_POLL_MS));
      }
      if (!cancelled) setReconnectGaveUp(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOutage]);

  useEffect(() => {
    if (!isChunkLoadError(error)) return;

    let alreadyTried = false;
    try {
      alreadyTried = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
      sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    } catch {
      // sessionStorage unavailable (private mode) — fall through to the error UI
      // rather than risking a reload loop we can't detect.
      return;
    }

    if (alreadyTried) return;

    setRecovering(true);
    window.location.reload();
  }, [error]);

  // Clear the guard once a page renders successfully after recovery.
  useEffect(() => {
    if (isChunkLoadError(error)) return;
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {
      // ignore
    }
  }, [error]);

  if (recovering) {
    return (
      <div
        className="min-h-[60vh] flex items-center justify-center px-4"
        style={{ background: "var(--background)" }}
      >
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Updating to the latest version…
        </p>
      </div>
    );
  }

  if (isOutage) {
    return (
      <div
        className="min-h-[60vh] flex items-center justify-center px-4"
        style={{ background: "var(--background)" }}
        role="status"
        aria-live="polite"
      >
        <div className="w-full max-w-md text-center">
          <h1
            className="text-2xl font-semibold mb-2"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)", color: "var(--foreground)" }}
          >
            {reconnectGaveUp ? "Still can't reach Inkwell" : "Reconnecting to Inkwell…"}
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
            {reconnectGaveUp
              ? "Inkwell is taking longer than usual to come back. You haven't been signed out and nothing is lost. Try again in a minute."
              : "Inkwell is restarting or briefly out of reach. You haven't been signed out and nothing is lost. This page will reload by itself in a moment."}
          </p>
          {reconnectGaveUp && (
            <button
              onClick={() => window.location.reload()}
              className="rounded-full px-6 py-2 text-sm font-medium transition-colors"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  // Use the error message, falling back to digest if the message is generic
  const displayMessage = error.message && error.message !== "An error occurred in the Server Components render."
    ? error.message
    : error.digest
      ? `Error (digest: ${error.digest})`
      : "An unexpected error occurred";

  return (
    <div
      className="min-h-[60vh] flex items-center justify-center px-4"
      style={{ background: "var(--background)" }}
    >
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1
            className="text-2xl font-semibold mb-2"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)", color: "var(--foreground)" }}
          >
            A page got stuck
          </h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            This page ran into trouble loading. It might work if you try again.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <button
            onClick={reset}
            className="rounded-full px-6 py-2 text-sm font-medium transition-colors"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-full border px-6 py-2 text-sm font-medium transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            Go home
          </a>
        </div>

        {/* Bug report */}
        <div className="flex justify-center">
          <ErrorReportButton
            errorMessage={displayMessage}
            errorDigest={error.digest}
            stackTrace={error.stack}
            url={url}
          />
        </div>
      </div>
    </div>
  );
}
