"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminSkeletonTable, AdminSkeletonCards } from "./admin-skeleton";

interface AdminEntry {
  id: string;
  title: string | null;
  privacy: string;
  slug: string;
  published_at: string | null;
  created_at: string;
  tags: string[];
  sensitive?: boolean;
  admin_sensitive?: boolean;
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AdminEntryList({ entries: initial }: { entries: AdminEntry[] }) {
  const [entries, setEntries] = useState(initial);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  async function handleToggleSensitive(entry: AdminEntry) {
    const isSensitive = entry.sensitive || entry.admin_sensitive;
    const endpoint = isSensitive ? "unmark-sensitive" : "mark-sensitive";
    setToggling(entry.id);
    try {
      const res = await fetch(`/api/admin/entries/${entry.id}/${endpoint}`, { method: "POST" });
      if (res.ok) {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id ? { ...e, admin_sensitive: !isSensitive } : e
          )
        );
      }
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(id: string, title: string | null) {
    const label = title ?? "this entry";
    if (!confirm(`Permanently delete "${label}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/entries/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  }

  function renderEntryActions(entry: AdminEntry) {
    return (
      <div className="admin-action-row">
        <button
          onClick={() => handleToggleSensitive(entry)}
          disabled={toggling === entry.id}
          className="admin-btn admin-btn--outline admin-btn--sm"
          title={(entry.sensitive || entry.admin_sensitive) ? "Unmark sensitive" : "Mark sensitive"}
        >
          {toggling === entry.id ? "…" : (entry.sensitive || entry.admin_sensitive) ? "Unmark" : "Sensitive"}
        </button>
        <button
          onClick={() => handleDelete(entry.id, entry.title)}
          disabled={deleting === entry.id}
          className="admin-btn admin-btn--danger admin-btn--sm"
        >
          {deleting === entry.id ? "…" : "Delete"}
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return <div className="admin-empty"><p>No entries found.</p></div>;
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Entry</th>
                <th className="hidden md:table-cell">Author</th>
                <th>Privacy</th>
                <th className="hidden lg:table-cell">Date</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="max-w-xs">
                    <div className="flex items-center gap-1.5">
                      {(entry.sensitive || entry.admin_sensitive) && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                          <title>Sensitive content</title>
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                      )}
                      <Link href={`/${entry.author.username}/${entry.slug}`}
                        className="font-medium hover:underline truncate block">
                        {entry.title ?? <em style={{ color: "var(--muted)" }}>Untitled</em>}
                      </Link>
                    </div>
                  </td>
                  <td className="hidden md:table-cell">
                    <Link href={`/${entry.author.username}`} className="text-xs hover:underline" style={{ color: "var(--muted)" }}>
                      @{entry.author.username}
                    </Link>
                  </td>
                  <td>
                    {entry.privacy === "public" ? (
                      <span className="admin-badge admin-badge--success">public</span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--muted)" }}>{entry.privacy}</span>
                    )}
                  </td>
                  <td className="hidden lg:table-cell">
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {timeAgo(entry.published_at ?? entry.created_at)}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {renderEntryActions(entry)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden">
        {entries.map((entry) => (
          <div key={entry.id} className="admin-mobile-card">
            <div className="admin-mobile-card-header">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                {(entry.sensitive || entry.admin_sensitive) && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                )}
                <Link href={`/${entry.author.username}/${entry.slug}`}
                  className="font-medium hover:underline truncate text-sm">
                  {entry.title ?? <em style={{ color: "var(--muted)" }}>Untitled</em>}
                </Link>
              </div>
            </div>
            <div className="admin-mobile-card-field">
              by <Link href={`/${entry.author.username}`} className="hover:underline">@{entry.author.username}</Link>
            </div>
            <div className="admin-mobile-card-meta">
              {entry.privacy === "public" ? (
                <span className="admin-badge admin-badge--success">public</span>
              ) : (
                <span className="text-xs" style={{ color: "var(--muted)" }}>{entry.privacy}</span>
              )}
              <span>{timeAgo(entry.published_at ?? entry.created_at)}</span>
            </div>
            <div className="admin-mobile-card-actions">
              {renderEntryActions(entry)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
