import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import { PollWidget, type PollData } from "@/components/poll-widget";

export const metadata: Metadata = {
  title: "Poll Archives",
  description: "Browse past community polls and their results.",
  openGraph: {
    title: "Poll Archives — Inkwell",
    description: "Past community polls on Inkwell.",
    url: "https://inkwell.social/polls/history",
  },
  alternates: { canonical: "https://inkwell.social/polls/history" },
};

interface HistoryResponse {
  data: PollData[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export default async function PollHistoryPage({ searchParams }: { searchParams: Promise<{ page?: string; type?: string }> }) {
  const params = await searchParams;
  const session = await getSession();
  const token = session?.token;
  const page = parseInt(params.page || "1", 10) || 1;
  const type = params.type || "";

  let polls: PollData[] = [];
  let pagination = { page: 1, per_page: 20, total: 0, total_pages: 1 };

  try {
    const typeParam = type ? `&type=${type}` : "";
    const data = await apiFetch<HistoryResponse>(`/api/polls/history?page=${page}&per_page=10${typeParam}`, {}, token);
    polls = data.data;
    pagination = data.pagination;
  } catch {}

  const buildHref = (p: number) => {
    const sp = new URLSearchParams();
    if (p > 1) sp.set("page", String(p));
    if (type) sp.set("type", type);
    const qs = sp.toString();
    return `/polls/history${qs ? `?${qs}` : ""}`;
  };

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
          Poll Archives
        </h1>
        <div className="poll-ornament" aria-hidden="true" style={{ margin: "12px 0" }}>
          <span>· · ·</span>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "15px", margin: 0, fontStyle: "italic" }}>
          The sealed results of community decisions past
        </p>
      </div>

      {/* Back link */}
      <div style={{ marginBottom: "20px" }}>
        <Link
          href="/polls"
          style={{
            fontSize: "13px",
            color: "var(--muted)",
            textDecoration: "none",
          }}
        >
          ← Back to Community Polls
        </Link>
      </div>

      {/* Type filter pills */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        {[
          { value: "", label: "All" },
          { value: "platform", label: "Platform" },
          { value: "entry", label: "Entry" },
        ].map((f) => {
          const active = type === f.value;
          const href = f.value ? `/polls/history?type=${f.value}` : "/polls/history";
          return (
            <Link
              key={f.value}
              href={href}
              className="poll-filter-pill"
              style={{
                padding: "4px 14px",
                borderRadius: "9999px",
                fontSize: "13px",
                fontWeight: active ? 700 : 400,
                background: active ? "var(--accent)" : "transparent",
                color: active ? "white" : "var(--muted)",
                border: active ? "none" : "1px solid var(--border)",
                textDecoration: "none",
              }}
            >
              {f.label}
            </Link>
          );
        })}
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
          No archived polls yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {polls.map((poll) => {
            const winner = poll.options.reduce(
              (max, opt) => (opt.vote_count > max.vote_count ? opt : max),
              poll.options[0]
            );

            return (
              <div
                key={poll.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  padding: "16px",
                  background: "var(--surface)",
                }}
              >
                {/* Sealed badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "var(--muted)",
                    }}
                  >
                    Sealed
                  </span>
                  {poll.closed_at && (
                    <span style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic" }}>
                      {new Date(poll.closed_at).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>

                {/* Question */}
                <h3
                  style={{
                    fontFamily: "var(--font-lora, Georgia, serif)",
                    fontSize: "17px",
                    fontWeight: 700,
                    margin: "0 0 12px 0",
                  }}
                >
                  {poll.question}
                </h3>

                {/* Result bars */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
                  {poll.options.map((opt) => {
                    const isWinner = winner && opt.id === winner.id && poll.total_votes > 0;
                    return (
                      <div key={opt.id}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "13px",
                            marginBottom: "2px",
                            color: isWinner ? "var(--accent)" : "var(--foreground)",
                            fontWeight: isWinner ? 700 : 400,
                          }}
                        >
                          <span>{opt.label}</span>
                          <span>{opt.percentage}%</span>
                        </div>
                        <div
                          style={{
                            height: "8px",
                            borderRadius: "4px",
                            background: "var(--border)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${opt.percentage}%`,
                              height: "100%",
                              borderRadius: "4px",
                              background: isWinner ? "var(--accent)" : "var(--muted)",
                              transition: "width 0.6s ease",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12px",
                    color: "var(--muted)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-lora, Georgia, serif)",
                      fontStyle: "italic",
                    }}
                  >
                    {poll.total_votes} vote{poll.total_votes !== 1 ? "s" : ""} cast
                  </span>
                  <Link
                    href={`/polls/${poll.id}`}
                    style={{ color: "var(--accent)", textDecoration: "none", fontSize: "12px" }}
                  >
                    View details →
                  </Link>
                </div>
              </div>
            );
          })}
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
              href={buildHref(p)}
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
