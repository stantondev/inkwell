import type { Metadata } from "next";
import { OfflineRetry } from "./offline-retry";

export const metadata: Metadata = {
  title: "Offline",
};

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background, #faf8f5)",
        padding: "2rem",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        {/* Pen nib icon inline SVG — no external fetch needed */}
        <svg
          width="64"
          height="64"
          viewBox="0 0 100 100"
          fill="none"
          style={{ margin: "0 auto 1.5rem", opacity: 0.4 }}
        >
          <path
            d="M50 10 L60 50 L50 90 L40 50 Z"
            fill="currentColor"
            opacity="0.3"
          />
          <path
            d="M50 60 L50 95"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>

        <h1
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "1.75rem",
            fontWeight: 400,
            fontStyle: "italic",
            color: "var(--foreground, #1a1a2e)",
            margin: "0 0 1rem",
          }}
        >
          You&apos;re offline
        </h1>

        <p
          style={{
            color: "var(--muted, #6b7280)",
            fontSize: "1rem",
            lineHeight: 1.6,
            margin: "0 0 2rem",
          }}
        >
          It looks like you&apos;ve lost your connection. Your journal will be
          here when you&apos;re back.
        </p>

        <OfflineRetry />
      </div>
    </div>
  );
}
