"use client";

import { useEffect, useState } from "react";
import { ErrorReportButton } from "@/components/error-report-button";

export default function GlobalError({
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

  const displayMessage = error.message && error.message !== "An error occurred in the Server Components render."
    ? error.message
    : error.digest
      ? `Error (digest: ${error.digest})`
      : "An unexpected error occurred";

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#fafaf9",
          color: "#1c1917",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <div style={{ width: "100%", maxWidth: 480 }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <h1
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 24,
                fontWeight: 600,
                marginBottom: 8,
                color: "#1c1917",
              }}
            >
              Something went wrong
            </h1>
            <p style={{ color: "#78716c", fontSize: 14, margin: 0 }}>
              An error occurred while loading this page.
            </p>
          </div>

          {/* Error details */}
          <div
            style={{
              border: "1px solid #e7e5e4",
              borderRadius: 12,
              padding: 16,
              marginBottom: 24,
              background: "#f5f5f4",
              overflowX: "auto",
            }}
          >
            <code
              style={{
                fontSize: 12,
                color: "#78716c",
                fontFamily: "ui-monospace, monospace",
                wordBreak: "break-all",
                whiteSpace: "pre-wrap",
              }}
            >
              {displayMessage}
            </code>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 24 }}>
            <button
              onClick={reset}
              style={{
                background: "#2d4a8a",
                color: "#fff",
                border: "none",
                borderRadius: 9999,
                padding: "8px 24px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                border: "1px solid #e7e5e4",
                borderRadius: 9999,
                padding: "8px 24px",
                fontSize: 14,
                fontWeight: 500,
                color: "#78716c",
                textDecoration: "none",
              }}
            >
              Go home
            </a>
          </div>

          {/* Bug report */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <ErrorReportButton
              errorMessage={displayMessage}
              errorDigest={error.digest}
              stackTrace={error.stack}
              url={url}
              inlineStyles
            />
          </div>
        </div>
      </body>
    </html>
  );
}
