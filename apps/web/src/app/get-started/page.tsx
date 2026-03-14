"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import FediverseLogin from "@/components/fediverse-login";
import { useSessionPoll, useIsPwa } from "@/hooks/use-session-poll";

type Step = "enter_email" | "check_email";

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

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const VALUE_PROPS = [
  "No algorithms, no ads — ever",
  "Your data is always yours",
  "Customize your page like it's 2004",
  "Connected to the open social web",
];

export default function GetStartedPage() {
  // Persist plan intent (free/plus) from landing page through magic link flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const plan = params.get("plan");
    if (plan === "plus" || plan === "free") {
      document.cookie = `inkwell_plan=${plan}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
    }
  }, []);

  const [step, setStep] = useState<Step>("enter_email");
  const [email, setEmail] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot — invisible to real users
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | undefined>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (!ageConfirmed) {
      setError("You must confirm you are 16 years of age or older to continue.");
      return;
    }
    if (!termsAccepted) {
      setError("You must accept the Terms of Service and Privacy Policy to continue.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Read invite cookie if present
      const inviteParams: Record<string, string> = {};
      try {
        const cookieStr = document.cookie
          .split("; ")
          .find((c) => c.startsWith("inkwell_invite="));
        if (cookieStr) {
          const parsed = JSON.parse(decodeURIComponent(cookieStr.split("=")[1]));
          if (parsed.type === "code") inviteParams.invite_code = parsed.value;
          if (parsed.type === "token") inviteParams.invite_token = parsed.value;
        }
      } catch {
        // Ignore malformed cookie
      }

      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          terms_accepted: true,
          ...(website ? { website } : {}),
          ...inviteParams,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMessage =
          data.error ??
          data.errors?.detail ??
          "Something went wrong. Please try again.";
        setError(errorMessage);
        console.error("Signup error:", res.status, data);
        return;
      }

      setDevLink(data.dev_magic_link);
      setStep("check_email");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), terms_accepted: true }),
      });
    } catch {
      // silently fail on resend
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="w-full max-w-lg rounded-2xl border shadow-sm p-8"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex justify-center mb-8">
          <InkwellLogo />
        </div>

        {step === "enter_email" && (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-semibold mb-1"
                style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                Start your journal
              </h1>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Write freely. Customize wildly. Connect openly.
              </p>
            </div>

            <div className="flex flex-col gap-2 mb-6 rounded-xl p-4"
              style={{ background: "var(--background)" }}>
              {VALUE_PROPS.map((prop) => (
                <div key={prop} className="flex items-center gap-2.5">
                  <CheckIcon />
                  <span className="text-sm" style={{ color: "var(--muted)" }}>{prop}</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4 relative" noValidate>
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

              {/* Honeypot field — hidden from real users, bots fill it out */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px", height: 0, overflow: "hidden" }}>
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  name="website"
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(e) => {
                    setAgeConfirmed(e.target.checked);
                    if (e.target.checked && error?.includes("16")) setError(null);
                  }}
                  className="mt-0.5 rounded"
                  style={{ accentColor: "var(--accent)" }}
                />
                <span className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                  I am 16 years of age or older
                </span>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => {
                    setTermsAccepted(e.target.checked);
                    if (e.target.checked && error?.includes("Terms")) setError(null);
                  }}
                  className="mt-0.5 rounded"
                  style={{ accentColor: "var(--accent)" }}
                />
                <span className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                  I agree to the{" "}
                  <Link href="/terms" target="_blank" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                    Privacy Policy
                  </Link>
                </span>
              </label>

              {error && (
                <p className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--danger-light, #fef2f2)", color: "var(--danger, #dc2626)" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim() || !ageConfirmed || !termsAccepted}
                className="rounded-xl py-3 text-base font-medium transition-opacity disabled:opacity-60"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {loading ? "Sending..." : "Create your account"}
              </button>

              <p className="text-xs text-center leading-relaxed" style={{ color: "var(--muted)" }}>
                We&apos;ll send a magic link to your email — no password needed.
              </p>
            </form>

            {/* Fediverse sign-in option */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              <span className="text-xs" style={{ color: "var(--muted)" }}>or</span>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            </div>

            <FediverseLogin
              disabled={!ageConfirmed || !termsAccepted}
              disabledReason={
                !ageConfirmed && !termsAccepted
                  ? "Please confirm your age and accept the terms above to continue."
                  : !ageConfirmed
                    ? "Please confirm you are 16 years of age or older."
                    : !termsAccepted
                      ? "Please accept the Terms of Service and Privacy Policy."
                      : undefined
              }
            />
          </>
        )}

        {step === "check_email" && (
          <CheckEmailStep
            email={email}
            devLink={devLink}
            onResend={handleResend}
            onReset={() => setStep("enter_email")}
          />
        )}
      </div>

      <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>
        Already have an account?{" "}
        <Link href="/login" className="font-medium underline underline-offset-2" style={{ color: "var(--accent)" }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}

function CheckEmailStep({
  email,
  devLink,
  onResend,
  onReset,
}: {
  email: string;
  devLink?: string;
  onResend: () => void;
  onReset: () => void;
}) {
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const [manualCheckFailed, setManualCheckFailed] = useState(false);
  const isPwa = useIsPwa();
  const { status, destination, manualCheck } = useSessionPoll(true);

  // Auto-redirect when session is detected (cookie shared from browser/other tab)
  useEffect(() => {
    if (status === "found") {
      window.location.href = destination;
    }
  }, [status, destination]);

  const handleResend = async () => {
    setResending(true);
    try {
      onResend();
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    } finally {
      setResending(false);
    }
  };

  const handleManualCheck = async () => {
    setManualCheckFailed(false);
    const found = await manualCheck();
    if (!found) {
      setManualCheckFailed(true);
      setTimeout(() => setManualCheckFailed(false), 4000);
    }
  };

  if (status === "found") {
    return (
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
    );
  }

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
        {isPwa && (
          <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--accent)" }}>
            After clicking the link in your email, return here — you&apos;ll be signed in automatically.
          </p>
        )}
      </div>

      {status === "polling" && (
        <p className="text-xs flex items-center justify-center gap-1.5" style={{ color: "var(--muted)" }}>
          <span className="inline-flex gap-0.5">
            <span className="animate-pulse">.</span>
            <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>.</span>
            <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>.</span>
          </span>
          Waiting for sign-in
        </p>
      )}

      {devLink && (
        <div className="rounded-xl border p-4 text-left"
          style={{ borderColor: "var(--accent)", background: "var(--accent-light)" }}>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--accent)" }}>
            Dev mode — click to sign in instantly:
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

      <button
        type="button"
        onClick={handleManualCheck}
        className="rounded-xl py-2.5 text-sm font-medium border transition-colors"
        style={{
          borderColor: manualCheckFailed ? "var(--danger, #dc2626)" : "var(--border)",
          color: manualCheckFailed ? "var(--danger, #dc2626)" : "var(--foreground)",
          background: "var(--surface)",
        }}
      >
        {manualCheckFailed ? "Not signed in yet \u2014 try again after clicking the link" : "I\u2019ve clicked the link"}
      </button>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Didn&apos;t get it? Check your spam folder, or{" "}
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="underline underline-offset-2 transition-colors"
          style={{ color: resent ? "var(--success)" : "var(--accent)" }}
        >
          {resending ? "Sending..." : resent ? "Sent!" : "resend the link"}
        </button>
        .
      </p>

      <button type="button" onClick={onReset} className="text-sm transition-colors"
        style={{ color: "var(--muted)" }}>
        &larr; Use a different email
      </button>
    </div>
  );
}
