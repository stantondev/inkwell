"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { signedInDestination, takeReturnTo } from "@/lib/return-to";

type Status = "ready" | "verifying" | "success" | "handoff" | "already" | "error";

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const lsid = searchParams.get("lsid");
  const [status, setStatus] = useState<Status>("ready");
  const [error, setError] = useState<string | null>(null);
  // A 503 means Inkwell is briefly down and the link is still good; a 401
  // means the link itself is spent. Only the first is worth retrying, and the
  // old screen offered "Try again" for both — on a spent link it could never
  // do anything but fail again.
  const [retryable, setRetryable] = useState(false);
  const [destination, setDestination] = useState("/feed");
  const [code, setCode] = useState("");
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [handoffState, setHandoffState] = useState<"idle" | "sending" | "done">("idle");
  const [handoffError, setHandoffError] = useState<string | null>(null);

  // Guards the auto-verify against running twice. `status` cannot do this job:
  // both calls are made before React re-renders, so both closures still see
  // "ready". When the effect fired twice (StrictMode in dev, or any remount)
  // the first POST signed the person in and the second got a 401 for a token
  // that had just been spent — so a successful sign-in ended on
  // "This link has already been used."
  const verifyStartedRef = useRef(false);

  // Auto-verify on mount — safe because this is a client page (prefetchers don't execute JS)
  useEffect(() => {
    if (token && !verifyStartedRef.current) {
      verifyStartedRef.current = true;
      verify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Where this browser's existing session should land, or null if signed out. */
  async function currentSessionDestination(): Promise<string | null> {
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.data?.id) return null;
      return signedInDestination(data.data.settings?.onboarded, takeReturnTo());
    } catch {
      return null;
    }
  }

  async function verify() {
    if (!token || status === "verifying" || status === "success") return;
    setStatus("verifying");
    setError(null);

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, lsid }),
      });

      const data = await res.json();

      if (!res.ok) {
        // A spent link is the ordinary result of opening the email twice, or
        // of coming back to this tab later. If this browser already holds a
        // session, telling someone their link is invalid is both alarming and
        // untrue — they are signed in.
        if (res.status === 401) {
          const existing = await currentSessionDestination();
          if (existing) {
            setDestination(existing);
            setStatus("already");
            return;
          }
        }

        setStatus("error");
        setRetryable(!!data.retryable);
        setError(data.error ?? "That sign-in link is no longer valid.");
        return;
      }

      // The link was requested on another screen (the installed app or a
      // different browser). This browser is signed in either way — that is the
      // important part, and it leads. Signing the other screen in as well is
      // an extra, gated by the code it shows.
      if (data.handoff && lsid) {
        setDestination(data.destination);
        setStatus("handoff");
        return;
      }

      setStatus("success");
      // Full page navigation to pick up the new cookie
      window.location.href = data.destination;
    } catch {
      setStatus("error");
      setRetryable(true);
      setError("Could not reach the server. Please try again.");
    }
  }

  async function completeHandoff(e: React.FormEvent) {
    e.preventDefault();
    if (!lsid || handoffState === "sending") return;
    setHandoffState("sending");
    setHandoffError(null);
    try {
      const res = await fetch("/api/auth/complete-handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lsid, code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setHandoffState("done");
      } else {
        setHandoffState("idle");
        setHandoffError(data.error ?? "That didn't work. Try again.");
      }
    } catch {
      setHandoffState("idle");
      setHandoffError("Could not reach the server. Please try again.");
    }
  }

  if (!token) {
    return (
      <Shell>
        <div className="flex flex-col gap-4 text-center">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            This sign-in link is missing its token. It may have been cut short by your email app.
          </p>
          <Link
            href="/login"
            className="rounded-xl py-3 text-base font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Get a fresh link
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {status === "ready" && (
        <div className="flex flex-col gap-4 text-center">
          <EnvelopeIcon />
          <h1
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Complete sign in
          </h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Tap the button below to finish signing in to Inkwell.
          </p>
          <button
            onClick={verify}
            className="rounded-xl py-3 text-base font-medium transition-opacity"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Sign in to Inkwell
          </button>
        </div>
      )}

      {status === "verifying" && (
        <div className="flex flex-col gap-4 text-center py-4">
          <div
            className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: "var(--accent-light)" }}
            aria-hidden="true"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-spin"
              style={{ animationDuration: "1.5s" }}
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            Signing you in...
          </p>
        </div>
      )}

      {status === "success" && (
        <div className="flex flex-col gap-4 text-center py-4">
          <CheckIcon />
          <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            Signed in! Redirecting...
          </p>
        </div>
      )}

      {status === "handoff" && (
        <div className="flex flex-col gap-4 text-center">
          <CheckIcon />
          <h1
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            You&apos;re signed in
          </h1>

          {handoffState === "done" ? (
            <>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Your other screen will sign in within a few seconds.
              </p>
              <a
                href={destination}
                className="rounded-xl py-3 text-base font-medium"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Continue to Inkwell
              </a>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                You can carry on right here — nothing else is needed.
              </p>

              {/* The primary path. Before, this was a small text link under a
                  code box, so people who asked for the link in a browser they
                  no longer had open were left staring at a code they couldn't
                  see anywhere. */}
              <a
                href={destination}
                className="rounded-xl py-3 text-base font-medium"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Continue to Inkwell
              </a>

              {!showCodeEntry ? (
                <button
                  type="button"
                  onClick={() => setShowCodeEntry(true)}
                  className="text-sm underline underline-offset-2"
                  style={{ color: "var(--muted)" }}
                >
                  Asked for this link somewhere else? Sign that in too
                </button>
              ) : (
                <div className="flex flex-col gap-3 pt-1">
                  <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                    Enter the 4-digit code shown on the screen where you asked for the link.
                  </p>
                  <form onSubmit={completeHandoff} className="flex flex-col gap-3">
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      placeholder="0000"
                      aria-label="Code from your other screen"
                      className="rounded-xl border px-4 py-3 text-center text-2xl font-semibold focus:outline-none focus:ring-2"
                      style={{
                        letterSpacing: "0.3em",
                        borderColor: "var(--border)",
                        background: "var(--surface)",
                        color: "var(--foreground)",
                      }}
                    />
                    <button
                      type="submit"
                      disabled={code.length !== 4 || handoffState === "sending"}
                      className="rounded-xl py-2.5 text-sm font-medium border transition-opacity disabled:opacity-50"
                      style={{
                        borderColor: "var(--border)",
                        color: "var(--foreground)",
                        background: "var(--surface)",
                      }}
                    >
                      {handoffState === "sending" ? "Signing in…" : "Sign in there too"}
                    </button>
                  </form>
                  {handoffError && (
                    <p className="text-sm" style={{ color: "var(--danger, #dc2626)" }}>
                      {handoffError}
                    </p>
                  )}
                  <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                    Never enter a code someone sends you. A real code only ever appears on a
                    screen where you yourself asked to sign in.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {status === "already" && (
        <div className="flex flex-col gap-4 text-center">
          <CheckIcon />
          <h1
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            You&apos;re already signed in
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            That link had already been used — most likely by this browser a moment ago.
            Nothing is wrong; carry on.
          </p>
          <a
            href={destination}
            className="rounded-xl py-3 text-base font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Continue to Inkwell
          </a>
        </div>
      )}

      {status === "error" && <ExpiredLink message={error} retryable={retryable} onRetry={verify} />}
    </Shell>
  );
}

/**
 * A spent or expired link used to be a dead end: a "Try again" button that
 * re-sent the same dead token, and a link back to /login to retype your
 * address. Now you can ask for a fresh link without leaving the page.
 */
function ExpiredLink({
  message,
  retryable,
  onRetry,
}: {
  message: string | null;
  retryable: boolean;
  onRetry: () => void;
}) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function sendFresh(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setSent(true);
      } else if (res.status === 429) {
        setSendError("Please wait a moment before requesting another link.");
      } else if (res.status === 422) {
        setSendError("No account found for that email.");
      } else {
        let msg = "We couldn't send that. Please try again.";
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          // keep the generic message
        }
        setSendError(msg);
      }
    } catch {
      setSendError("Could not reach the server. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <EnvelopeIcon />
        <h2
          className="text-xl font-semibold"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Check your inbox
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          A fresh sign-in link is on its way to{" "}
          <strong style={{ color: "var(--foreground)" }}>{email}</strong>. It&apos;s good for 30
          minutes — open it in this browser and you&apos;ll go straight in.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-center">
      <div
        className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "var(--danger-light, #fef2f2)" }}
        aria-hidden="true"
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--danger, #dc2626)" }}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2
        className="text-xl font-semibold"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        {retryable ? "Inkwell is briefly unavailable" : "This link has already been used"}
      </h2>
      <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        {message}
        {!retryable && " Sign-in links work once, and expire after 30 minutes."}
      </p>

      {retryable ? (
        <button
          onClick={onRetry}
          className="rounded-xl py-3 text-base font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Try again
        </button>
      ) : (
        <form onSubmit={sendFresh} className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            aria-label="Your email address"
            required
            className="rounded-xl border px-4 py-3 text-base focus:outline-none focus:ring-2"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
            }}
          />
          <button
            type="submit"
            disabled={sending || !email.trim()}
            className="rounded-xl py-3 text-base font-medium transition-opacity disabled:opacity-60"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {sending ? "Sending..." : "Send me a fresh link"}
          </button>
        </form>
      )}

      {sendError && (
        <p className="text-sm" style={{ color: "var(--danger, #dc2626)" }}>
          {sendError}
        </p>
      )}

      <Link href="/login" className="text-sm transition-colors" style={{ color: "var(--muted)" }}>
        &larr; Back to sign in
      </Link>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border shadow-sm p-8"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex justify-center mb-6">
          <Link href="/" className="flex items-center gap-2 group" aria-label="Inkwell home">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              className="transition-transform group-hover:-rotate-6"
              style={{ color: "var(--accent)" }}
              aria-hidden="true"
            >
              <path
                d="M17.5 2.5L21.5 6.5L10 18H6V14L17.5 2.5Z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M14 6L18 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path
                d="M6 18L2.5 21.5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeOpacity="0.5"
              />
            </svg>
            <span
              className="text-xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              inkwell
            </span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}

function EnvelopeIcon() {
  return (
    <div
      className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
      style={{ background: "var(--accent-light)" }}
      aria-hidden="true"
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--accent)" }}
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M2 7l10 7 10-7" />
      </svg>
    </div>
  );
}

function CheckIcon() {
  return (
    <div
      className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
      style={{ background: "var(--accent-light)" }}
      aria-hidden="true"
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--accent)" }}
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  );
}
