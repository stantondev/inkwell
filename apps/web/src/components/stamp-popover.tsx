"use client";

/**
 * StampLetters — the writer's view of the stamps on their own post: every
 * stamp with who sent it, when, and the line they wrote on the back.
 * Only the writer gets this list (GET /api/entries/:id/stamps → letters).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { AvatarWithFrame } from "./avatar-with-frame";
import { StampImpression } from "./stamp-impression";
import { formatStampDay, stampInfo, type StampLetter, type StampSender } from "./stamp-config";

export function SenderLink({ sender, size = 22 }: { sender: StampSender; size?: number }) {
  const name = sender.display_name || sender.username;
  const inner = (
    <>
      <AvatarWithFrame url={sender.avatar_url} name={name} size={size} />
      <span className="stamp-sender-name">{name}</span>
      {sender.remote && sender.handle && <span className="stamp-sender-handle">{sender.handle}</span>}
    </>
  );
  if (sender.remote) {
    return sender.profile_url ? (
      <a href={sender.profile_url} target="_blank" rel="noopener noreferrer" className="stamp-sender">
        {inner}
      </a>
    ) : (
      <span className="stamp-sender">{inner}</span>
    );
  }
  return (
    <Link href={`/${sender.username}`} className="stamp-sender">
      {inner}
    </Link>
  );
}

export function StampLetters({ entryId, refreshKey = 0 }: { entryId: string; refreshKey?: number }) {
  const [letters, setLetters] = useState<StampLetter[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/entries/${entryId}/stamps`);
        if (!res.ok) throw new Error(String(res.status));
        const { data } = await res.json();
        if (live) setLetters(data?.letters ?? []);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [entryId, refreshKey]);

  return (
    <div className="stamp-letters">
      <p className="stamp-letters-title">Your stamps</p>
      {failed ? (
        <p className="stamp-letters-empty">Couldn&rsquo;t open your stamps just now.</p>
      ) : letters === null ? (
        <p className="stamp-letters-empty">Opening the envelope…</p>
      ) : letters.length === 0 ? (
        <p className="stamp-letters-empty">No stamps on this page yet.</p>
      ) : (
        <ul className="stamp-letters-list">
          {letters.map((l) => (
            <li key={l.id} className="stamp-letter">
              <StampImpression mark={l} width={44} postmark="lines" straight />
              <div className="stamp-letter-body">
                <div className="stamp-letter-meta">
                  <SenderLink sender={l.sender} />
                  <span className="stamp-letter-date">{formatStampDay(l.stamped_on)}</span>
                </div>
                <p className="stamp-letter-kind">{stampInfo(l.type)?.label ?? "Stamp"}</p>
                {l.note && <blockquote className="stamp-note">{l.note}</blockquote>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Link href="/stamp-album" className="stamp-link stamp-letters-album">
        Open your stamp album →
      </Link>
    </div>
  );
}
