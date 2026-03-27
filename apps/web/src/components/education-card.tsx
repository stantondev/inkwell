"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface EducationCardProps {
  storageKey: string;
  heading: string;
  children: React.ReactNode;
  learnMoreHref?: string;
  serverDismissed?: boolean;
}

export function EducationCard({
  storageKey,
  heading,
  children,
  learnMoreHref,
  serverDismissed,
}: EducationCardProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (serverDismissed || localStorage.getItem(storageKey) === "true") return;
    setVisible(true);
  }, [storageKey, serverDismissed]);

  if (!visible) return null;

  function dismiss() {
    setExiting(true);
    setTimeout(() => {
      localStorage.setItem(storageKey, "true");
      // Persist to DB — append storageKey to dismissed_education_cards array
      fetch("/api/me")
        .then((r) => r.ok ? r.json() : null)
        .then((me) => {
          const existing: string[] = me?.data?.settings?.dismissed_education_cards ?? [];
          if (!existing.includes(storageKey)) {
            fetch("/api/me", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                settings: { dismissed_education_cards: [...existing, storageKey] },
              }),
            }).catch(() => {});
          }
        })
        .catch(() => {});
      setVisible(false);
    }, 300);
  }

  return (
    <div
      className={`education-card rounded-xl border p-4 mb-4 ${exiting ? "education-card-exit" : ""}`}
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
      }}
    >
      <div className="relative z-[1]">
        <div className="flex items-start gap-3">
          {/* Book icon */}
          <div
            className="flex-shrink-0 mt-0.5"
            style={{ color: "var(--accent)" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-semibold mb-1"
              style={{
                fontFamily: "var(--font-lora, Georgia, serif)",
                fontStyle: "italic",
              }}
            >
              {heading}
            </p>
            <div
              className="text-xs leading-relaxed"
              style={{ color: "var(--foreground)", opacity: 0.85 }}
            >
              {children}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={dismiss}
                className="rounded-full px-3 py-1 text-xs font-medium border transition-colors education-card-dismiss"
                style={{
                  borderColor: "var(--accent)",
                  color: "var(--accent)",
                }}
              >
                Got it
              </button>
              {learnMoreHref && (
                <Link
                  href={learnMoreHref}
                  className="text-xs hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  Learn more
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
