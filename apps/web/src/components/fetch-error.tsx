"use client";

import { ErrorReportButton } from "@/components/error-report-button";

interface FetchErrorProps {
  message?: string;
  className?: string;
}

export function FetchError({
  message = "We couldn't load this right now.",
  className = "",
}: FetchErrorProps) {
  const url = typeof window !== "undefined"
    ? window.location.pathname + window.location.search
    : "";

  return (
    <div
      className={`rounded-xl border p-5 ${className}`}
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        maxWidth: "480px",
        margin: "2rem auto",
      }}
    >
      <div className="flex items-start gap-3">
        {/* Ink spill icon */}
        <div className="flex-shrink-0 mt-0.5" style={{ color: "var(--accent)" }}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold mb-1"
            style={{
              fontFamily: "var(--font-lora, Georgia, serif)",
              fontStyle: "italic",
              color: "var(--foreground)",
            }}
          >
            Something spilled
          </p>
          <p
            className="text-xs leading-relaxed mb-3"
            style={{ color: "var(--muted)" }}
          >
            {message} Try refreshing, or come back in a moment.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => window.location.reload()}
              className="inline-block rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer"
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
              }}
            >
              Try again
            </button>
            <ErrorReportButton
              errorMessage={`Fetch failed: ${message}`}
              url={url}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
