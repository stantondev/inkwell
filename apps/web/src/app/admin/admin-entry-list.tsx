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
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: "var(--border)" }}>
            <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>Entry</th>
            <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>Author</th>
            <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>Privacy</th>
            <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>Date</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b last:border-0"
              style={{ borderColor: "var(--border)" }}>
              <td className="px-4 py-3 max-w-xs">
                <Link href={`/${entry.author.username}/${entry.slug}`}
                  className="font-medium hover:underline truncate block"
                  style={{ color: "var(--foreground)" }}>
                  {entry.title ?? <em style={{ color: "var(--muted)" }}>Untitled</em>}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link href={`/${entry.author.username}`} className="hover:underline"
                  style={{ color: "var(--muted)" }}>
                  @{entry.author.username}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: entry.privacy === "public" ? "var(--success-light, #dcfce7)" : "var(--surface-hover)",
                    color: entry.privacy === "public" ? "var(--success, #16a34a)" : "var(--muted)",
                  }}>
                  {entry.privacy}
                </span>
              </td>
              <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                {timeAgo(entry.published_at ?? entry.created_at)}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => handleDelete(entry.id, entry.title)}
                  disabled={deleting === entry.id}
                  className="text-xs px-3 py-1 rounded-lg border font-medium transition-colors disabled:opacity-40"
                  style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
                  {deleting === entry.id ? "…" : "Delete"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
