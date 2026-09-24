"use client";

import { useEffect, useState } from "react";

function relative(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * "4h ago". The server and first client render print a UTC date so hydration
 * matches; the relative label appears straight after.
 */
export function Ago({ iso, className }: { iso: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  const text =
    now === null
      ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
      : relative(iso, now);

  return (
    <time className={className} dateTime={iso}>
      {text}
    </time>
  );
}
