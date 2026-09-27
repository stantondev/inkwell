"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import type { JournalEntry } from "@/components/journal-entry-card";

const WAITING_HREF = "/explore?sort=waiting";

function plain(text: string | null | undefined, max = 140) {
  if (!text) return "";
  const t = text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, "")}…` : t;
}

/**
 * Shown to the writer right after they publish (the editor sends them here
 * with ?published=1): a confirmation, and three people whose recent entries
 * nobody has written back to yet. The moment you've asked for readers is a
 * good moment to be one. No counts, no obligation.
 */
export function JustPublished() {
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [waiting, setWaiting] = useState<JournalEntry[] | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("published") !== "1") return;
    setShow(true);
    // Drop the flag so a reload or a shared link doesn't show this again.
    router.replace(pathname, { scroll: false });

    fetch("/api/explore?source=inkwell&sort=waiting&per_page=12")
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json: { data?: JournalEntry[] }) => {
        const seen = new Set<string>();
        const picks: JournalEntry[] = [];
        for (const e of json.data ?? []) {
          if (seen.has(e.author.username)) continue;
          seen.add(e.author.username);
          picks.push(e);
          if (picks.length === 3) break;
        }
        setWaiting(picks);
      })
      .catch(() => setWaiting([]));
    // Runs once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!show) return null;

  return (
    <aside className="just-published" aria-label="Published">
      <button type="button" className="just-published-close" onClick={() => setShow(false)} aria-label="Close">
        ×
      </button>
      <p className="just-published-title">Your entry is out in the world.</p>
      {waiting === null ? (
        <p className="just-published-text">&nbsp;</p>
      ) : waiting.length === 0 ? (
        <p className="just-published-text">Replies and footnotes will show up in your notifications.</p>
      ) : (
        <>
          <p className="just-published-text">
            While it finds its readers, these writers are still waiting for someone to write back:
          </p>
          <ul className="just-published-list">
            {waiting.map((e) => (
              <li key={e.id}>
                <Link href={`/${e.author.username}/${e.slug ?? e.id}`} className="just-published-item">
                  <AvatarWithFrame
                    url={e.author.avatar_url}
                    name={e.author.display_name || e.author.username}
                    size={32}
                    frame={e.author.avatar_frame}
                    subscriptionTier={e.author.subscription_tier}
                  />
                  <span className="just-published-item-text">
                    <span className="just-published-item-head">
                      <span className="just-published-item-title">{plain(e.title, 80) || "Untitled"}</span>
                      {e.first_entry && <span className="feed-first-tag">First entry</span>}
                    </span>
                    <span className="just-published-item-by">
                      {e.author.display_name || e.author.username}
                      {e.excerpt ? ` · ${plain(e.excerpt)}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={WAITING_HREF} className="just-published-more">
            Everyone waiting for a reply →
          </Link>
        </>
      )}
    </aside>
  );
}
