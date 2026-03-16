"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const lsid = searchParams.get("lsid");
  const [status, setStatus] = useState<"ready" | "verifying" | "success" | "error">("ready");
  const [error, setError] = useState<string | null>(null);

  // Auto-verify on mount — safe because this is a client page (prefetchers don't execute JS)
  useEffect(() => {
    if (token) {
      verify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setStatus("error");
        setError(data.error ?? "Verification failed. The link may have expired.");
        return;
      }

      setStatus("success");
      // Full page navigation to pick up the new cookie
      window.location.href = data.destination;
    } catch {
      setStatus("error");
      setError("Could not reach the server. Please try again.");
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
        style={{ background: "var(--background)", color: "var(--foreground)" }}>
        <div className="w-full max-w-sm rounded-2xl border shadow-sm p-8 text-center"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
            Invalid or missing sign-in link.
          </p>
          <Link href="/login" className="text-sm font-medium underline underline-offset-2"
            style={{ color: "var(--accent)" }}>
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="w-full max-w-sm rounded-2xl border shadow-sm p-8"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>

        <div className="flex justify-center mb-6">
          <Link href="/" className="flex items-center gap-2 group" aria-label="Inkwell home">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              className="transition-transform group-hover:-rotate-6"
              style={{ color: "var(--accent)" }} aria-hidden="true">
              <path d="M17.5 2.5L21.5 6.5L10 18H6V14L17.5 2.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 6L18 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              <path d="M6 18L2.5 21.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeOpacity="0.5"/>
            </svg>
            <span className="text-xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              inkwell
            </span>
          </Link>
        </div>

        {status === "ready" && (
          <div className="flex flex-col gap-4 text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--accent-light)" }} aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: "var(--accent)" }}>
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="M2 7l10 7 10-7"/>
              </svg>
            </div>
            <h1 className="text-xl font-semibold"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
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
            <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--accent-light)" }} aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className="animate-spin" style={{ animationDuration: "1.5s" }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
              Signing you in...
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col gap-4 text-center py-4">
            <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--accent-light)" }} aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: "var(--accent)" }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
              Signed in! Redirecting...
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col gap-4 text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--danger-light, #fef2f2)" }} aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: "var(--danger, #dc2626)" }}>
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <h2 className="text-xl font-semibold"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              Link expired
            </h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {error}
            </p>
            <button
              onClick={verify}
              className="rounded-xl py-2.5 text-sm font-medium border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--surface)" }}
            >
              Try again
            </button>
            <Link href="/login" className="text-sm transition-colors"
              style={{ color: "var(--muted)" }}>
              &larr; Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
