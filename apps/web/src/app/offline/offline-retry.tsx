"use client";

export function OfflineRetry() {
  return (
    <button
      onClick={() => window.location.reload()}
      style={{
        background: "var(--accent, #2d4a8a)",
        color: "#fff",
        border: "none",
        borderRadius: 9999,
        padding: "0.75rem 2rem",
        fontSize: "0.95rem",
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontStyle: "italic",
        cursor: "pointer",
      }}
    >
      Try again
    </button>
  );
}
