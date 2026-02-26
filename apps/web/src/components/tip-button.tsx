"use client";

import { useState } from "react";
import { TipModal } from "./tip-modal";

interface TipButtonProps {
  recipientId: string;
  recipientName: string;
  variant?: "default" | "compact";
}

export function TipButton({ recipientId, recipientName, variant = "default" }: TipButtonProps) {
  const [showModal, setShowModal] = useState(false);

  if (variant === "compact") {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
          title={`Tip ${recipientName}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          Tip
        </button>
        {showModal && (
          <TipModal
            recipientId={recipientId}
            recipientName={recipientName}
            onClose={() => setShowModal(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:opacity-80"
        style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        Send a tip
      </button>
      {showModal && (
        <TipModal
          recipientId={recipientId}
          recipientName={recipientName}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
