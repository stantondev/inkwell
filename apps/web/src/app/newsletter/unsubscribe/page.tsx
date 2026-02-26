"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function UnsubscribePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`);
        if (res.ok) {
          setStatus("success");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16" style={{ background: "var(--background)" }}>
      <div className="w-full max-w-md text-center">
        <div className="rounded-2xl border p-8" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          {status === "loading" && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>Processing your request...</p>
          )}

          {status === "success" && (
            <>
              <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h1 className="text-xl font-semibold mb-2" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                You&apos;ve been unsubscribed
              </h1>
              <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
                You won&apos;t receive any more newsletter emails. You can always re-subscribe later.
              </p>
              <Link
                href="/"
                className="inline-block rounded-full border px-5 py-2 text-sm font-medium"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                Go to Inkwell
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: "color-mix(in srgb, var(--danger) 15%, transparent)", color: "var(--danger)" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              </div>
              <h1 className="text-xl font-semibold mb-2" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                Something went wrong
              </h1>
              <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
                This unsubscribe link may be invalid. If you continue receiving emails, contact the writer directly.
              </p>
              <Link
                href="/"
                className="inline-block rounded-full border px-5 py-2 text-sm font-medium"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                Go to Inkwell
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
