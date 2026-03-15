"use client";

import { useState, useRef, useEffect } from "react";
import { FloatingPopup } from "@/components/floating-popup";

interface ShareButtonProps {
  url: string;
  title: string;
  description?: string;
  size?: number;
}

export function ShareButton({ url, title, description, size = 15 }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: silent fail
    }
  }

  async function handleNativeShare() {
    try {
      await navigator.share({ title, text: description, url });
    } catch {
      // user cancelled or not supported
    }
    setOpen(false);
  }

  const shareText = description ? `${description} ${url}` : `${title} ${url}`;
  const encoded = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(url);

  const socialLinks = [
    {
      label: "Bluesky",
      href: `https://bsky.app/intent/compose?text=${encoded}`,
      icon: <path d="M12 2C6.5 5.5 3.5 10 4.5 14c.3 1.3 1.5 2 3 2-.5 1-2 1.5-3.5 1.5 2 1.5 4.5 2 7 1 6-2.5 8-9 5.5-14C14.5 3 13 2 12 2Z" />,
      fill: true,
    },
    {
      label: "Mastodon",
      href: `https://mastodonshare.com/?text=${encoded}`,
      icon: <path d="M21.3 13.1c-.3 1.6-2.9 3.3-5.8 3.7-1.5.2-3 .3-4.6.3-2.6-.1-4.6-.6-4.6-.6v.7c.3 2.5 2.5 2.6 4.6 2.7 2.1 0 3.9-.5 3.9-.5l.1 1.8s-1.5.8-4 .9c-1.4.1-3.2-.1-5.2-.6C1.7 20.3.5 16.2.2 12.1c-.1-1.2-.1-2.3-.1-3.2C.1 4.3 3 2.8 3 2.8 4.5 2.1 7 1.5 9.6 1.5h.1c2.6 0 5 .6 6.6 1.3 0 0 2.9 1.5 2.9 6.1 0 0 0 3.5-.3 4.2ZM18 8.9c0-1.2-.3-2.2-.9-2.9-.6-.7-1.4-1.1-2.4-1.1-1.2 0-2.1.5-2.6 1.4l-.6 1-.6-1c-.6-.9-1.4-1.4-2.6-1.4-1 0-1.8.4-2.4 1.1-.6.7-.9 1.7-.9 2.9v6h2.4V9.1c0-1.3.5-1.9 1.5-1.9 1.1 0 1.7.7 1.7 2.2v3.2h2.4V9.4c0-1.5.6-2.2 1.7-2.2 1 0 1.5.6 1.5 1.9V15H18V8.9Z" />,
      fill: true,
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      icon: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
      fill: true,
    },
    {
      label: "X",
      href: `https://x.com/intent/tweet?text=${encodeURIComponent(description || title)}&url=${encodedUrl}`,
      icon: <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />,
      fill: true,
    },
  ];

  return (
    <div>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="flex items-center transition-opacity hover:opacity-80 cursor-pointer"
        style={{ color: "var(--muted)" }}
        title="Share"
        aria-label="Share"
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </button>

      <FloatingPopup
        anchorRef={btnRef}
        open={open}
        onClose={() => setOpen(false)}
        placement="bottom"
        className="rounded-xl border shadow-lg overflow-hidden"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          width: "min(220px, calc(100vw - 32px))",
        }}
      >
        <div className="py-1">
          {/* Copy link */}
          <button onClick={handleCopy} className="share-popup-option">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>{copied ? "Copied!" : "Copy link"}</span>
          </button>

          {/* Native share */}
          {canNativeShare && (
            <button onClick={handleNativeShare} className="share-popup-option">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              <span>Share...</span>
            </button>
          )}

          <div className="share-popup-divider" />

          {/* Social share links — using <a> tags instead of window.open() so mobile
              deep linking works correctly (no leftover blank tab/window) */}
          {socialLinks.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="share-popup-option"
            >
              <svg width="14" height="14" viewBox="0 0 24 24"
                fill={s.fill ? "currentColor" : "none"}
                stroke={s.fill ? "none" : "currentColor"}
                strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                {s.icon}
              </svg>
              <span>{s.label}</span>
            </a>
          ))}
        </div>
      </FloatingPopup>
    </div>
  );
}
