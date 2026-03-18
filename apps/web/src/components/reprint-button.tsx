"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReprintModal } from "@/components/reprint-modal";

interface ReprintButtonProps {
  entryId: string;
  initialReprinted: boolean;
  initialCount: number;
  isOwnEntry: boolean;
  isLoggedIn: boolean;
  /** Icon size in px (default 15) */
  size?: number;
  /** Show count (default true) */
  showCount?: boolean;
  /** Whether this is a remote/fediverse entry */
  isRemote?: boolean;
}

export function ReprintButton({
  entryId,
  initialReprinted,
  initialCount,
  isOwnEntry,
  isLoggedIn,
  size = 15,
  showCount = true,
  isRemote = false,
}: ReprintButtonProps) {
  const [reprinted, setReprinted] = useState(initialReprinted);
  const [count, setCount] = useState(initialCount);
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();

  // For own entries, show read-only count if > 0
  if (isOwnEntry) {
    return showCount && count > 0 ? (
      <span
        className="flex items-center gap-1.5 text-sm"
        style={{ color: "var(--muted)" }}
        title={`${count} ${count === 1 ? "reprint" : "reprints"}`}
      >
        <ReprintIcon size={size} filled={false} />
        {count}
      </span>
    ) : null;
  }

  function handleClick() {
    if (!isLoggedIn) {
      router.push("/get-started");
      return;
    }
    setModalOpen(true);
  }

  function handleSuccess() {
    setReprinted(true);
    setCount((c) => c + 1);
  }

  return (
    <>
      <button
        onClick={handleClick}
        title={reprinted ? "Reprinted" : "Reprint with your thoughts"}
        aria-label={reprinted ? "Reprinted" : "Reprint with your thoughts"}
        className="flex items-center gap-1.5 text-sm transition-colors cursor-pointer hover:opacity-80"
        style={{
          color: reprinted ? "var(--accent)" : "var(--muted)",
          transition: "color 0.15s ease",
        }}
      >
        <ReprintIcon size={size} filled={reprinted} />
        {showCount && <span>{count}</span>}
      </button>

      {modalOpen && (
        <ReprintModal
          entryId={entryId}
          isRemote={isRemote}
          onClose={() => setModalOpen(false)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}

function ReprintIcon({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={filled ? "2.5" : "2"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ opacity: filled ? 1 : 0.7 }}
    >
      {/* Circular arrows — reprint/repost icon */}
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
