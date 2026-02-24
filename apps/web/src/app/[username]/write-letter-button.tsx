"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  username: string;
}

export function WriteLetterButton({ username }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const json = await res.json();
      if (res.ok && json.data?.id) {
        router.push(`/letters/${json.data.id}`);
      }
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 14px",
        borderRadius: "9999px",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--foreground)",
        fontSize: "13px",
        fontWeight: "500",
        cursor: loading ? "default" : "pointer",
        opacity: loading ? 0.7 : 1,
        transition: "opacity 0.2s",
      }}
      title="Write a private letter"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
      {loading ? "Opening..." : "Write a Letter"}
    </button>
  );
}
