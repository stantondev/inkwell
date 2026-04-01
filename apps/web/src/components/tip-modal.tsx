"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TipModalProps {
  recipientId: string;
  recipientName: string;
  entryId?: string;
  onClose: () => void;
}

export function TipModal({ recipientId, recipientName, entryId, onClose }: TipModalProps) {
  const [mounted, setMounted] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll while modal is open (iOS-safe)
  useEffect(() => {
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        document.body.style.overflow = "";
        window.scrollTo(0, scrollY);
      };
    } else {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  if (!mounted) return null;

  const modalContent = (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "rgba(0, 0, 0, 0.5)",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "28rem",
          borderRadius: "1rem",
          border: "1px solid var(--border)",
          padding: "1.5rem",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,.1), 0 8px 10px -6px rgba(0,0,0,.1)",
          background: "var(--background)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            padding: "4px",
            borderRadius: "9999px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--foreground)",
          }}
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="flex items-center gap-2 mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            Postage
          </h2>
        </div>

        <div className="rounded-lg border p-4 mb-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="flex items-center gap-2 mb-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning, #f59e0b)"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span className="text-sm font-medium" style={{ color: "var(--warning, #f59e0b)" }}>
              Temporarily Unavailable
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Postage is temporarily unavailable while we switch payment processors. It will return soon.
          </p>
        </div>

        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          In the meantime, you can support {recipientName} through their external payment link on their profile page.
        </p>

        <button
          onClick={onClose}
          className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          Close
        </button>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
