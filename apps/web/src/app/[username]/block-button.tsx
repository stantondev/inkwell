"use client";

import { useState, useRef, useEffect } from "react";

interface BlockButtonProps {
  targetUsername: string;
  initialBlocked: boolean;
  onBlockChange?: (blocked: boolean) => void;
}

export function BlockButton({ targetUsername, initialBlocked, onBlockChange }: BlockButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  async function handleBlock() {
    setLoading(true);
    try {
      const res = await fetch(`/api/block/${targetUsername}`, { method: "POST" });
      if (res.ok) {
        setBlocked(true);
        onBlockChange?.(true);
      }
    } catch { /* ignore */ }
    setLoading(false);
    setConfirmOpen(false);
    setMenuOpen(false);
  }

  async function handleUnblock() {
    setLoading(true);
    try {
      const res = await fetch(`/api/block/${targetUsername}`, { method: "DELETE" });
      if (res.ok) {
        setBlocked(false);
        onBlockChange?.(false);
      }
    } catch { /* ignore */ }
    setLoading(false);
    setMenuOpen(false);
  }

  if (blocked) {
    return (
      <button
        onClick={handleUnblock}
        disabled={loading}
        className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        {loading ? "..." : "Unblock"}
      </button>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="rounded-full border p-1.5 transition-colors"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        aria-label="More options"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {menuOpen && !confirmOpen && (
        <div
          className="absolute right-0 top-full mt-1 rounded-lg border shadow-md py-1 z-50 min-w-[160px]"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <button
            onClick={() => setConfirmOpen(true)}
            className="w-full text-left px-4 py-2 text-sm transition-colors hover:opacity-80"
            style={{ color: "var(--danger, #dc2626)" }}
          >
            Block @{targetUsername}
          </button>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setConfirmOpen(false); setMenuOpen(false); }}>
          <div
            className="rounded-xl border p-6 max-w-sm mx-4 shadow-lg"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--foreground)" }}>
              Block @{targetUsername}?
            </h3>
            <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
              They won&apos;t be able to see your entries, send you messages, or interact with your content. You won&apos;t see theirs either.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setConfirmOpen(false); setMenuOpen(false); }}
                className="rounded-full border px-4 py-1.5 text-sm font-medium"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleBlock}
                disabled={loading}
                className="rounded-full px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "var(--danger, #dc2626)" }}
              >
                {loading ? "Blocking..." : "Block"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
