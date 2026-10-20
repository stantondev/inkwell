"use client";

import Link from "next/link";
import { useState } from "react";
import { LocalDate } from "@/components/local-date";
import { StampArt } from "@/components/stamp-art";
import { StampImpression } from "@/components/stamp-impression";
import { SenderLink } from "@/components/stamp-popover";
import { stampInfo, type StampLetter, type StampSender } from "@/components/stamp-config";
import { decodeEntities } from "@/lib/decode-entities";

export interface AlbumStamp extends StampLetter {
  entry: { id: string; title: string | null; slug: string; username: string; kind?: string | null; excerpt?: string | null } | null;
  remote_entry: { id: string; title: string | null; url: string; author_handle?: string | null } | null;
  recipient: StampSender | null;
}

export interface AlbumPage {
  data: AlbumStamp[];
  meta: { page: number; per_page: number; total: number; total_pages: number; types: Record<string, number>; box: string };
}

const DAY: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };

export function entryLabel(s: AlbumStamp): { href: string; text: string; external?: boolean } | null {
  if (s.entry) {
    const text = s.entry.title ? decodeEntities(s.entry.title) : s.entry.kind === "sticky" ? "a sticky" : "an untitled entry";
    return { href: `/${s.entry.username}/${s.entry.slug || s.entry.id}`, text };
  }
  if (s.remote_entry) {
    const t = s.remote_entry.title ? decodeEntities(s.remote_entry.title) : `a post by ${s.remote_entry.author_handle ?? "someone on the fediverse"}`;
    return { href: `/fediverse/${s.remote_entry.id}`, text: t };
  }
  return null;
}

export function StampAlbum({ box, type, initial }: { box: "received" | "sent"; type: string | null; initial: AlbumPage }) {
  const [items, setItems] = useState<AlbumStamp[]>(initial.data ?? []);
  const [page, setPage] = useState(initial.meta?.page ?? 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const totalPages = initial.meta?.total_pages ?? 1;
  const types = initial.meta?.types ?? {};
  const typeKeys = Object.keys(types).filter((k) => types[k] > 0);
  const boxTotal = typeKeys.reduce((n, k) => n + types[k], 0);

  async function loadMore() {
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      const qs = new URLSearchParams({ box, page: String(page + 1), per_page: "30" });
      if (type) qs.set("type", type);
      const res = await fetch(`/api/me/stamps?${qs}`);
      if (!res.ok) throw new Error(String(res.status));
      const next: AlbumPage = await res.json();
      setItems((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        return [...prev, ...(next.data ?? []).filter((s) => !seen.has(s.id))];
      });
      setPage(next.meta?.page ?? page + 1);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  const base = box === "sent" ? "/stamp-album?box=sent" : "/stamp-album?view=list";
  const withType = (t: string | null) => (t ? `${base}&type=${t}` : base);

  return (
    <div className="stamp-album">
      <AlbumTabs current={box === "sent" ? "sent" : "received"} />

      {typeKeys.length > 1 && (
        <div className="stamp-album-filters" role="group" aria-label="Show one design">
          <Link href={withType(null)} className={`stamp-album-chip${!type ? " is-active" : ""}`}>
            All <span>{boxTotal}</span>
          </Link>
          {typeKeys.map((k) => (
            <Link key={k} href={withType(k)} className={`stamp-album-chip${type === k ? " is-active" : ""}`}>
              <StampArt type={k} width={16} />
              {stampInfo(k)?.label ?? k} <span>{types[k]}</span>
            </Link>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="stamp-album-empty">
          <StampArt type="felt" width={64} style={{ opacity: 0.55 }} />
          {type ? (
            <p>No stamps of this design here.</p>
          ) : box === "received" ? (
            <p>
              Nothing tucked in here yet. When a reader sends you a stamp, it&rsquo;s kept on these pages with the day it
              arrived and anything they wrote on the back.
            </p>
          ) : (
            <p>
              The stamps you send are kept here too: on any page that moves you, look for the stamp beside Ink and Reprint.
            </p>
          )}
        </div>
      ) : (
        <ol className="stamp-album-page">
          {items.map((s) => {
            const info = stampInfo(s.type);
            const link = entryLabel(s);
            const person = box === "sent" ? s.recipient : s.sender;
            return (
              <li key={s.id} className="stamp-album-row">
                <div className="stamp-album-pocket">
                  <StampImpression mark={s} width={76} postmark="full" straight />
                </div>
                <div className="stamp-album-detail">
                  <p className="stamp-album-kind">
                    {info?.label ?? "Stamp"}
                    <span> · {s.type === "abroad" && s.domain ? `from ${s.domain}` : info?.description}</span>
                  </p>
                  {person && (
                    <div className="stamp-album-person">
                      <span className="stamp-album-prep">{box === "sent" ? "To" : "From"}</span>
                      <SenderLink sender={person} size={22} />
                    </div>
                  )}
                  {s.note && <blockquote className="stamp-note">{s.note}</blockquote>}
                  <p className="stamp-album-where">
                    {link ? (
                      <>
                        On{" "}
                        <Link href={link.href} className="stamp-link">
                          {link.text}
                        </Link>
                        {" · "}
                      </>
                    ) : (
                      "On a page that's gone · "
                    )}
                    <LocalDate iso={s.stamped_at || s.stamped_on} options={DAY} />
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {page < totalPages && (
        <div className="stamp-album-more">
          <button type="button" onClick={loadMore} disabled={loading} className="stamp-send">
            {loading ? "Turning the page…" : "Load more"}
          </button>
          {error && <p className="stamp-postcard-error">Couldn&rsquo;t load more just now.</p>}
        </div>
      )}
    </div>
  );
}

/** Album (the book) · Received (every stamp with its note, newest first) · Sent. */
export function AlbumTabs({ current }: { current: "album" | "received" | "sent" }) {
  const tabs = [
    { id: "album", href: "/stamp-album", label: "Album" },
    { id: "received", href: "/stamp-album?view=list", label: "Received" },
    { id: "sent", href: "/stamp-album?box=sent", label: "Sent" },
  ] as const;
  return (
    <nav className="stamp-album-tabs" aria-label="Stamp album">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} className={current === t.id ? "is-active" : ""} aria-current={current === t.id ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
