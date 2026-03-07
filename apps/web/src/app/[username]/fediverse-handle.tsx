"use client";

import { useState } from "react";

export function FediverseHandle({
  username,
  mutedColor,
  accentColor,
}: {
  username: string;
  mutedColor: string;
  accentColor: string;
}) {
  const [copied, setCopied] = useState(false);
  const handle = `@${username}@inkwell.social`;

  const copyHandle = async () => {
    try {
      await navigator.clipboard.writeText(handle);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <button
      onClick={copyHandle}
      className="inline-flex items-center gap-1 text-xs mt-0.5 transition-opacity hover:opacity-80"
      style={{ color: mutedColor }}
      title={copied ? "Copied!" : "Copy fediverse handle — use this to follow from Mastodon"}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
      <span>{handle}</span>
      {copied ? (
        <span style={{ color: accentColor }} className="font-medium">Copied!</span>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      )}
    </button>
  );
}
