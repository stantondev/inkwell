import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Drafts — Inkwell" };

interface DraftEntry {
  id: string;
  title: string | null;
  body_html: string | null;
  mood: string | null;
  tags: string[];
  privacy: string;
  updated_at: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function DraftsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let drafts: DraftEntry[] = [];
  try {
    const data = await apiFetch<{ data: DraftEntry[] }>(
      "/api/drafts",
      {},
      session.token
    );
    drafts = data.data ?? [];
  } catch {
    // show empty
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              Drafts
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Your unpublished work
            </p>
          </div>
          <Link
            href="/editor"
            className="rounded-full px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            + New entry
          </Link>
        </div>

        {drafts.length === 0 ? (
          <div
            className="rounded-2xl border p-12 text-center"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <p style={{ color: "var(--muted)" }}>
              No drafts yet. Start writing and save as draft to see them here.
            </p>
            <Link
              href="/editor"
              className="inline-block mt-4 text-sm font-medium underline"
              style={{ color: "var(--accent)" }}
            >
              Start writing
            </Link>
          </div>
        ) : (
          <div className="flex flex-col">
            {drafts.map((draft) => {
              const preview = draft.title
                ? draft.title
                : draft.body_html
                  ? stripHtml(draft.body_html).slice(0, 80) || "Untitled draft"
                  : "Untitled draft";
              const hasTitle = !!draft.title;

              return (
                <Link
                  key={draft.id}
                  href={`/editor?edit=${draft.id}`}
                  className="flex items-start justify-between gap-4 py-4 px-4 rounded-xl -mx-4 transition-colors group border-b"
                  style={{
                    borderColor: "var(--border)",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="font-medium leading-snug group-hover:underline truncate"
                      style={{
                        fontFamily: hasTitle ? "var(--font-lora, Georgia, serif)" : undefined,
                        color: hasTitle ? "var(--foreground)" : "var(--muted)",
                        fontStyle: hasTitle ? undefined : "italic",
                      }}
                    >
                      {preview}
                    </p>
                    <div
                      className="flex items-center gap-2 mt-1 text-xs flex-wrap"
                      style={{ color: "var(--muted)" }}
                    >
                      {draft.mood && <span>feeling {draft.mood}</span>}
                      {draft.tags.slice(0, 3).map((t) => (
                        <span key={t}>#{t}</span>
                      ))}
                    </div>
                  </div>
                  <time
                    className="text-xs flex-shrink-0 mt-1"
                    style={{ color: "var(--muted)" }}
                  >
                    {timeAgo(draft.updated_at)}
                  </time>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
