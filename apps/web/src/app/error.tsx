"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ErrorReportButton } from "@/components/error-report-button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(window.location.pathname + window.location.search);
  }, []);

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
            Something went wrong
          </h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            An error occurred while loading this page.
          </p>
        </div>

        {/* Error details */}
        <div
          className="rounded-xl border p-4 mb-6 overflow-x-auto"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface-hover)",
          }}
        >
          <code
            className="text-xs break-all whitespace-pre-wrap"
            style={{ color: "var(--muted)", fontFamily: "var(--font-mono, monospace)" }}
          >
            {displayMessage}
          </code>
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
          <Link
            href="/"
            className="rounded-full border px-6 py-2 text-sm font-medium transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            Go home
          </Link>
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
