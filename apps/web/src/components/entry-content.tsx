"use client";

import { useEffect, useMemo, useRef } from "react";
import { scopeEntryHtml } from "@/lib/scope-styles";

/**
 * Renders entry HTML with scoped styles and sanitized content.
 * Custom <style> tags are extracted, their selectors are prefixed
 * with the entry's unique ID so they don't leak to the rest of the page.
 *
 * IMPORTANT (marginalia support): uses useMemo to stabilize the
 * `dangerouslySetInnerHTML` object across renders, so React's reconciler
 * sees the same `__html` string value and skips re-setting innerHTML —
 * preserving any DOM mutations the Inline Marginalia feature makes on
 * top (e.g. `<ink-mark>` elements wrapping highlighted ranges).
 *
 * As a belt-and-braces safeguard, we also use `useEffect` with a
 * `lastSetRef` guard: if React ever does clobber our marks, the effect
 * re-runs on the next commit — but only if `bodyHtml` actually changed,
 * so the loop is bounded.
 */
export function EntryContent({
  html,
  entryId,
  className,
}: {
  html: string;
  entryId: string;
  className?: string;
}) {
  const scopeId = `entry-${entryId}`;
  const { bodyHtml, scopedStyles } = scopeEntryHtml(html, scopeId);
  const ref = useRef<HTMLDivElement>(null);
  const lastSetRef = useRef<string>(bodyHtml);

  // Stable reference so React's dangerouslySetInnerHTML diff sees the same
  // object identity across re-renders when `bodyHtml` hasn't changed.
  const htmlProp = useMemo(() => ({ __html: bodyHtml }), [bodyHtml]);

  // Fallback: if the DOM ever diverges from our tracked state (e.g. a
  // re-render wiped DOM mutations), only re-set innerHTML when bodyHtml
  // has genuinely changed since the last commit.
  useEffect(() => {
    if (!ref.current) return;
    if (lastSetRef.current !== bodyHtml) {
      ref.current.innerHTML = bodyHtml;
      lastSetRef.current = bodyHtml;
    }
  }, [bodyHtml]);

  return (
    <>
      {scopedStyles && (
        <style dangerouslySetInnerHTML={{ __html: scopedStyles }} />
      )}
      <div
        id={scopeId}
        className={className}
        ref={ref}
        suppressHydrationWarning
        dangerouslySetInnerHTML={htmlProp}
      />
    </>
  );
}
