"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the page once, a few seconds after it loads. Used while the
 * post's replies are being fetched from its home server, so they appear
 * without a reload. Once per visit: the component isn't remounted by
 * router.refresh(), so the effect never runs again.
 */
export function RefreshOnce({ delayMs = 3500 }: { delayMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.refresh(), delayMs);
    return () => clearTimeout(t);
  }, [router, delayMs]);

  return null;
}
