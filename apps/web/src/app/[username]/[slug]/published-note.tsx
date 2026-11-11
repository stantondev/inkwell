"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./entry-page.module.css";

/**
 * After publishing, the editor lands here with ?published=1. Say so once,
 * quietly, with who can read it and a way to copy the link, then drop the
 * parameter so a reload or a shared link doesn't repeat it.
 */
export function PublishedNote({ show, sentence, url, firstEntry = false }: {
  show: boolean;
  sentence: string;
  url: string;
  /** The writer's first entry: the place to mention inviting people (onboarding no longer asks). */
  firstEntry?: boolean;
}) {
  const router = useRouter();
  // Captured once: the server re-renders without the parameter after the
  // replace below, and the note should stay until it's dismissed.
  const [visible, setVisible] = useState(show);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  useEffect(() => {
    const here = new URL(window.location.href);
    if (!here.searchParams.has("published")) return;
    here.searchParams.delete("published");
    router.replace(`${here.pathname}${here.search}${here.hash}`, { scroll: false });
  }, [router]);

  if (!visible) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div className={styles.publishedNote} role="status">
      <p className={styles.publishedText}>
        <strong>{firstEntry ? "Your first entry is out." : "Published."}</strong> <span>{sentence}</span>
        {firstEntry && (
          <span> Know someone who&rsquo;d like to read it? <Link href="/settings/invite" className="underline">Invite them</Link>.</span>
        )}
        {copied === "failed" && <span> Couldn&rsquo;t copy &mdash; the link is {url}</span>}
      </p>
      <button type="button" className={styles.ownerButton} onClick={copy}>
        {copied === "yes" ? "Copied" : "Copy link"}
      </button>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        title="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
