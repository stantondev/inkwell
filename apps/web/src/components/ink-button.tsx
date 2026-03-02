"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface InkButtonProps {
  entryId: string;
  initialInked: boolean;
  initialCount: number;
  isOwnEntry: boolean;
  isLoggedIn: boolean;
  /** Icon size in px (default 15) */
  size?: number;
  /** Show count (default true) */
  showCount?: boolean;
}

export function InkButton({
  entryId,
  initialInked,
  initialCount,
  isOwnEntry,
  isLoggedIn,
  size = 15,
  showCount = true,
}: InkButtonProps) {
  const [inked, setInked] = useState(initialInked);
  const [count, setCount] = useState(initialCount);
  const [animating, setAnimating] = useState(false);
  const router = useRouter();

  // For own entries, show read-only count if > 0
  if (isOwnEntry) {
    return showCount && count > 0 ? (
      <span
        className="flex items-center gap-1.5 text-sm"
        style={{ color: "var(--muted)" }}
        title={`${count} ${count === 1 ? "ink" : "inks"}`}
      >
        <InkDropIcon size={size} filled={false} />
        {count}
      </span>
    ) : null;
  }

  async function handleToggle() {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }

    const newInked = !inked;
    setInked(newInked);
    setCount((c) => c + (newInked ? 1 : -1));
    setAnimating(true);
    setTimeout(() => setAnimating(false), 200);

    try {
      const res = await fetch(`/api/entries/${entryId}/ink`, {
        method: "POST",
        cache: "no-store",
      });
      if (res.ok) {
        const { data } = await res.json();
        setInked(data.inked);
        setCount(data.ink_count);
      } else {
        // Revert on error
        setInked(!newInked);
        setCount((c) => c + (newInked ? -1 : 1));
      }
    } catch {
      setInked(!newInked);
      setCount((c) => c + (newInked ? -1 : 1));
    }
  }

  return (
    <button
      onClick={handleToggle}
      title={inked ? "Remove ink" : "Ink this entry"}
      aria-label={inked ? "Remove ink" : "Ink this entry"}
      className="flex items-center gap-1.5 text-sm transition-colors cursor-pointer hover:opacity-80"
      style={{
        color: inked ? "var(--accent)" : "var(--muted)",
        transform: animating ? "scale(1.15)" : "scale(1)",
        transition: "transform 0.15s ease, color 0.15s ease",
      }}
    >
      <InkDropIcon size={size} filled={inked} />
      {showCount && <span>{count}</span>}
    </button>
  );
}

function InkDropIcon({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 20"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 1C8 1 1 8.5 1 12.5a7 7 0 0 0 14 0C15 8.5 8 1 8 1Z" />
    </svg>
  );
}
