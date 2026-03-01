import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import { PollWidget, type PollData } from "@/components/poll-widget";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Poll · Inkwell" };

export default async function PollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const token = session?.token;

  let poll: PollData | null = null;
  try {
    const data = await apiFetch<{ data: PollData }>(`/api/polls/${id}`, {}, token);
    poll = data.data;
  } catch {
    notFound();
  }

  if (!poll) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/polls"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          color: "var(--muted)",
          fontSize: "13px",
          textDecoration: "none",
          marginBottom: "20px",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
        Back to Community Voice
      </Link>

      <PollWidget poll={poll} isLoggedIn={!!session} />

      {/* Meta info */}
      <div style={{ marginTop: "16px", fontSize: "12px", color: "var(--muted)" }}>
        {poll.type === "platform" && poll.creator && (
          <span>
            Created by{" "}
            <Link href={`/${poll.creator.username}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
              @{poll.creator.username}
            </Link>
            {" · "}
          </span>
        )}
        <span>{new Date(poll.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
      </div>
    </main>
  );
}
