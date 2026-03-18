"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ReprintModal } from "@/components/reprint-modal";
import { FloatingPopup } from "@/components/floating-popup";

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
  /** Override API path for remote entry reprints */
  apiPath?: string;
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
  apiPath,
}: ReprintButtonProps) {
  const [reprinted, setReprinted] = useState(initialReprinted);
  const [count, setCount] = useState(initialCount);
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const loadingRef = useRef(false);
  const chevronRef = useRef<HTMLButtonElement>(null);
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

  const togglePath =
    apiPath ||
    (isRemote
      ? `/api/remote-entries/${entryId}/reprint/toggle`
      : `/api/entries/${entryId}/reprint/toggle`);

  async function handleSimpleToggle() {
    if (!isLoggedIn) {
      router.push("/get-started");
      return;
    }
    if (loadingRef.current) return;
    loadingRef.current = true;

    // Optimistic update
    const wasReprinted = reprinted;
    const prevCount = count;
    setReprinted(!wasReprinted);
    setCount(wasReprinted ? prevCount - 1 : prevCount + 1);

    try {
      const res = await fetch(togglePath, { method: "POST" });
      if (!res.ok) {
        // Revert on error
        setReprinted(wasReprinted);
        setCount(prevCount);
      } else {
        const json = await res.json();
        if (json.data) {
          setReprinted(json.data.reprinted);
          setCount(json.data.reprint_count);
        }
      }
    } catch {
      setReprinted(wasReprinted);
      setCount(prevCount);
    } finally {
      loadingRef.current = false;
    }
  }

  function handleQuoteClick() {
    if (!isLoggedIn) {
      router.push("/get-started");
      return;
    }
    setMenuOpen(false);
    setModalOpen(true);
  }

  function handleQuoteSuccess() {
    setReprinted(true);
    setCount((c) => c + 1);
  }

  return (
    <>
      <span className="flex items-center gap-1">
        {/* Main button: simple reprint toggle */}
        <button
          onClick={handleSimpleToggle}
          title={reprinted ? "Undo reprint" : "Reprint"}
          aria-label={reprinted ? "Undo reprint" : "Reprint"}
          className="flex items-center gap-1.5 text-sm transition-colors cursor-pointer hover:opacity-80"
          style={{
            color: reprinted ? "var(--accent)" : "var(--muted)",
            transition: "color 0.15s ease, transform 0.15s ease",
          }}
        >
          <ReprintIcon size={size} filled={reprinted} />
          {showCount && <span>{count}</span>}
        </button>

        {/* Chevron for quote reprint dropdown */}
        <button
          ref={chevronRef}
          onClick={() => setMenuOpen(!menuOpen)}
          title="More reprint options"
          aria-label="More reprint options"
          className="flex items-center cursor-pointer hover:opacity-80"
          style={{
            color: "var(--muted)",
            padding: "4px 2px",
          }}
        >
          <svg
            width={10}
            height={10}
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
          >
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </span>

      {/* Dropdown via FloatingPopup portal — escapes overflow:hidden */}
      <FloatingPopup
        anchorRef={chevronRef}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        placement="bottom"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "4px 0",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          minWidth: "220px",
        }}
      >
        <button
          onClick={handleQuoteClick}
          className="w-full text-left px-3 py-2 text-sm hover:opacity-80 cursor-pointer"
          style={{
            color: "var(--foreground)",
            background: "transparent",
            border: "none",
          }}
        >
          ↻ Reprint with your thoughts...
        </button>
      </FloatingPopup>

      {modalOpen && (
        <ReprintModal
          entryId={entryId}
          isRemote={isRemote}
          onClose={() => setModalOpen(false)}
          onSuccess={handleQuoteSuccess}
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
