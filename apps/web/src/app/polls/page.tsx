import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import { PollWidget, type PollData } from "@/components/poll-widget";

export const metadata: Metadata = { title: "Community Voice · Inkwell" };

interface PollsResponse {
  data: PollData[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export default async function PollsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const session = await getSession();
  const token = session?.token;
  const page = parseInt(params.page || "1", 10) || 1;

  let polls: PollData[] = [];
  let pagination = { page: 1, per_page: 20, total: 0, total_pages: 1 };

  try {
    const data = await apiFetch<PollsResponse>(`/api/polls?page=${page}&per_page=10`, {}, token);
    polls = data.data;
    pagination = data.pagination;
  } catch {}

  return (
    <main className="mx-auto max-w-2xl lg:max-w-3xl px-4 py-8">
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <h1
          style={{
            fontFamily: "var(--font-lora, Georgia, serif)",
            fontSize: "28px",
            fontWeight: 700,
            margin: "0 0 8px 0",
            color: "var(--foreground)",
          }}
        >
          Community Voice
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "15px", margin: 0 }}>
          Have your say in shaping Inkwell
        </p>
      </div>

      {/* Polls */}
      {polls.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 20px",
            color: "var(--muted)",
            fontStyle: "italic",
          }}
        >
          No polls yet. Check back soon!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {polls.map((poll) => (
            <PollWidget key={poll.id} poll={poll} isLoggedIn={!!session} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <nav
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "8px",
            marginTop: "32px",
          }}
        >
          {Array.from({ length: pagination.total_pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/polls?page=${p}`}
              className={p === page ? "poll-page-active" : "poll-page-link"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: p === page ? 700 : 400,
                background: p === page ? "var(--accent)" : "transparent",
                color: p === page ? "white" : "var(--muted)",
                textDecoration: "none",
                border: p === page ? "none" : "1px solid var(--border)",
              }}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </main>
  );
}
