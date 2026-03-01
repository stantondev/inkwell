"use client";

import { useState } from "react";
import Link from "next/link";

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
            e.id === entry.id
              ? { ...e, admin_sensitive: !isSensitive }
              : e
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

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border p-12 text-center"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>No entries found.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--border)" }}>
              <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>Entry</th>
              <th className="text-left px-4 py-3 font-medium hidden sm:table-cell" style={{ color: "var(--muted)" }}>Author</th>
              <th className="text-left px-4 py-3 font-medium hidden sm:table-cell" style={{ color: "var(--muted)" }}>Privacy</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell" style={{ color: "var(--muted)" }}>Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b last:border-0"
                style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-3 max-w-xs">
                  <div className="flex items-center gap-1.5">
                    {(entry.sensitive || entry.admin_sensitive) && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                        <title>Sensitive content</title>
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    )}
                    <Link href={`/${entry.author.username}/${entry.slug}`}
                      className="font-medium hover:underline truncate block"
                      style={{ color: "var(--foreground)" }}>
                      {entry.title ?? <em style={{ color: "var(--muted)" }}>Untitled</em>}
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <Link href={`/${entry.author.username}`} className="hover:underline"
                    style={{ color: "var(--muted)" }}>
                    @{entry.author.username}
                  </Link>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: entry.privacy === "public" ? "var(--success-light, #dcfce7)" : "var(--surface-hover)",
                      color: entry.privacy === "public" ? "var(--success, #16a34a)" : "var(--muted)",
                    }}>
                    {entry.privacy}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell" style={{ color: "var(--muted)" }}>
                  {timeAgo(entry.published_at ?? entry.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => handleToggleSensitive(entry)}
                      disabled={toggling === entry.id}
                      className="text-xs px-3 py-1 rounded-lg border font-medium transition-colors disabled:opacity-40"
                      style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                      title={(entry.sensitive || entry.admin_sensitive) ? "Unmark sensitive" : "Mark sensitive"}>
                      {toggling === entry.id ? "…" : (entry.sensitive || entry.admin_sensitive) ? "Unmark" : "Sensitive"}
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id, entry.title)}
                      disabled={deleting === entry.id}
                      className="text-xs px-3 py-1 rounded-lg border font-medium transition-colors disabled:opacity-40"
                      style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
                      {deleting === entry.id ? "…" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
