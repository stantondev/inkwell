"use client";

import { useState } from "react";
import Link from "next/link";

type LoginStep = "enter_email" | "check_email";

function InkwellLogo() {
  return (
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
  );
}

function EnterEmailStep({
  onSubmit,
}: {
  onSubmit: (email: string, devLink?: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/auth/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      // In dev mode, Phoenix returns the clickable magic link directly
      onSubmit(email.trim(), data.dev_magic_link);
    } catch {
      setError("Could not reach the server. Is the API running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium"
          style={{ color: "var(--foreground)" }}>
          Email address
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
          autoComplete="email"
          className="rounded-xl border px-4 py-3 text-base focus:outline-none focus:ring-2 transition-colors"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
        />
      </div>

      {error && (
        <p className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--danger-light, #fef2f2)", color: "var(--danger, #dc2626)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !email.trim()}
        className="rounded-xl py-3 text-base font-medium transition-opacity disabled:opacity-60"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        {loading ? "Sending…" : "Send magic link"}
      </button>

      <p className="text-xs text-center leading-relaxed" style={{ color: "var(--muted)" }}>
        We&apos;ll send a one-click sign-in link to your email — no password needed.
        <br />
        New to Inkwell? Your account will be created automatically.
      </p>
    </form>
  );
}

function CheckEmailStep({
  email,
  devLink,
  onReset,
}: {
  email: string;
  devLink?: string;
  onReset: () => void;
}) {
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await fetch(`/api/auth/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 text-center">
      <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "var(--accent-light)" }} aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ color: "var(--accent)" }}>
          <rect x="2" y="4" width="20" height="16" rx="2"/>
          <path d="M2 7l10 7 10-7"/>
        </svg>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-1"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
          Check your inbox
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          We sent a magic link to{" "}
          <strong style={{ color: "var(--foreground)" }}>{email}</strong>.
          <br />Click the link in the email to sign in.
        </p>
      </div>

      {/* Dev mode: show clickable magic link directly */}
      {devLink && (
        <div className="rounded-xl border p-4 text-left"
          style={{ borderColor: "var(--accent)", background: "var(--accent-light)" }}>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--accent)" }}>
            🛠 Dev mode — click to sign in instantly:
          </p>
          <a
            href={devLink}
            className="text-xs break-all underline"
            style={{ color: "var(--accent)" }}
          >
            {devLink}
          </a>
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Didn&apos;t get it? Check your spam folder, or{" "}
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="underline underline-offset-2 transition-colors"
          style={{ color: resent ? "var(--success)" : "var(--accent)" }}
        >
          {resending ? "Sending…" : resent ? "Sent ✓" : "resend the link"}
        </button>
        .
      </p>

      <button type="button" onClick={onReset} className="text-sm transition-colors"
        style={{ color: "var(--muted)" }}>
        ← Use a different email
      </button>
    </div>
  );
}

export default function LoginPage() {
  const [step, setStep] = useState<LoginStep>("enter_email");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [devLink, setDevLink] = useState<string | undefined>();

  const handleEmailSubmit = (email: string, link?: string) => {
    setSubmittedEmail(email);
    setDevLink(link);
    setStep("check_email");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="w-full max-w-sm rounded-2xl border shadow-sm p-8"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex justify-center mb-8">
          <InkwellLogo />
        </div>

        {step === "enter_email" && (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-semibold mb-1"
                style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                Welcome back
              </h1>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Sign in or create your Inkwell account.
              </p>
            </div>
            <EnterEmailStep onSubmit={handleEmailSubmit} />
          </>
        )}

        {step === "check_email" && (
          <CheckEmailStep
            email={submittedEmail}
            devLink={devLink}
            onReset={() => setStep("enter_email")}
          />
        )}
      </div>

      <p className="mt-8 text-xs text-center" style={{ color: "var(--muted)" }}>
        By signing in you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-2">Terms of Service</Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
        <br />Inkwell will never sell your data or show you ads.
      </p>
    </div>
  );
}
