"use client";

import { useEffect, useRef, useState } from "react";

/**
 * An avatar picture that falls back to a little Inkwell ink pot when the
 * picture won't load (most often a fediverse account whose server deleted the
 * old file after they changed their picture).
 *
 * A picture can fail before React hydrates, when onError has already fired
 * with nobody listening, so the mount effect also checks for an image that
 * finished loading with nothing in it.
 */
export function AvatarImage({ url, name, size }: { url: string; name: string; size: number }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setFailed(false);
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [url]);

  if (failed) return <InkPotAvatar name={name} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={url}
      alt={name}
      className="w-full h-full object-cover"
      width={size}
      height={size}
      onError={() => setFailed(true)}
    />
  );
}

/** The ink pot with a quill, drawn in the page's own colours. */
export function InkPotAvatar({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className="w-full h-full block"
      role="img"
      aria-label={name}
      style={{ background: "var(--accent-light)" }}
    >
      {/* quill, tucked in behind the pot */}
      <path d="M20.5 17.5 L30.5 5.5" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" />
      <path
        d="M31 5 C 25 7, 21.5 11.5, 21.3 16.6 C 25.5 14.8, 29.4 10.6, 31 5 Z"
        fill="var(--surface, #fff)"
        stroke="var(--accent)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <path d="M23.4 13.4 L26 12 M24.6 11 L27.4 9.6" stroke="var(--accent)" strokeWidth="0.6" strokeLinecap="round" opacity="0.6" />
      {/* the pot */}
      <rect x="15" y="15.5" width="10" height="5" rx="1" fill="var(--accent)" />
      <rect x="13.5" y="14.5" width="13" height="2.4" rx="1.2" fill="var(--accent)" />
      <rect x="10.5" y="19.5" width="19" height="13" rx="5" fill="var(--accent)" />
      {/* a little face */}
      <circle cx="16.6" cy="25" r="1.1" fill="var(--accent-light)" />
      <circle cx="23.4" cy="25" r="1.1" fill="var(--accent-light)" />
      <path d="M18.3 27.6 Q20 29.2 21.7 27.6" stroke="var(--accent-light)" strokeWidth="1" fill="none" strokeLinecap="round" />
      <ellipse cx="14.4" cy="27.3" rx="1.2" ry="0.7" fill="var(--accent-light)" opacity="0.55" />
      <ellipse cx="25.6" cy="27.3" rx="1.2" ry="0.7" fill="var(--accent-light)" opacity="0.55" />
      {/* a drop of ink */}
      <path d="M9 9.5 C 9 9.5, 7 12, 7 13.2 A 2 2 0 0 0 11 13.2 C 11 12, 9 9.5, 9 9.5 Z" fill="var(--accent)" opacity="0.7" />
    </svg>
  );
}
