import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import { Avatar } from "@/components/avatar";
import s from "../roadmap.module.css";
import { CategoryLabel, StatusMark } from "../roadmap-card";
import { EMPTY_SUMMARY, RoadmapLedger } from "../roadmap-ledger";
import { UpvoteButton } from "../upvote-button";
import {
  itemHref,
  monthKey,
  monthLabel,
  shortDate,
  tiltOf,
  type FeedbackPost,
  type OutlineItem,
  type RoadmapSummary,
} from "../roadmap-shared";

export const metadata: Metadata = {
  title: "Release Notes",
  description:
    "Everything that's shipped on Inkwell because a member asked for it, newest first, in the words it went out with.",
  openGraph: {
    title: "Release Notes · Inkwell",
    description: "Everything that's shipped on Inkwell because a member asked for it.",
    url: "/roadmap/releases",
  },
  alternates: { canonical: "/roadmap/releases" },
};

const PER_PAGE = 20;
const SHIPPED_CTX = { group: "shipped" as const };

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function ReleasesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const session = await getSession();
  const token = session?.token;

  const [releasesR, outlineR] = await Promise.allSettled([
    apiFetch<{ data: FeedbackPost[]; pagination: { total: number } }>(
      `/api/feedback/releases?page=${page}&per_page=${PER_PAGE}`,
      {},
      token,
    ),
    apiFetch<{ data: OutlineItem[]; meta: RoadmapSummary }>(`/api/feedback/outline?group=shipped`, {}, token),
  ]);

  const releases = releasesR.status === "fulfilled" ? releasesR.value.data ?? [] : [];
  const total = releasesR.status === "fulfilled" ? releasesR.value.pagination?.total ?? 0 : 0;
  const summary = outlineR.status === "fulfilled" ? outlineR.value.meta ?? EMPTY_SUMMARY : EMPTY_SUMMARY;
  const numbers = new Map(
    (outlineR.status === "fulfilled" ? outlineR.value.data ?? [] : []).map((o) => [o.id, o.number]),
  );
  const monthCounts = new Map(summary.shipped_by_month.map((m) => [m.month, m.count]));
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const groups: { key: string; items: FeedbackPost[] }[] = [];
  for (const item of releases) {
    const key = item.completed_at ? monthKey(item.completed_at) : "earlier";
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }

  const pageHref = (n: number) => (n <= 1 ? "/roadmap/releases" : `/roadmap/releases?page=${n}`);

  return (
    <div className={s.root} style={{ background: "var(--background)", minHeight: "100vh" }}>
      <div className={s.wrap}>
        <header className={s.masthead}>
          <div>
            <p className={s.eyebrow}>Built in the open</p>
            <h1 className={s.title}>
              Release <em>notes</em>
            </h1>
            <p className={s.lede}>
              Everything that&rsquo;s shipped because someone asked for it, newest first, in the words it went out
              with. Open a card to read the conversation behind it and flip on to the next.
            </p>
            <div className={s.mastActions}>
              <Link href="/roadmap" className={s.btnGhost}>
                ← The Roadmap
              </Link>
              <Link href="/roadmap/new" className={s.btnPrimary}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Suggest something
              </Link>
            </div>
          </div>
          <RoadmapLedger summary={summary} />
        </header>

        <div className={s.releases}>
          {releasesR.status === "rejected" ? (
            <p className={s.empty} role="status">
              The release notes didn&rsquo;t load. Try again in a moment.
            </p>
          ) : releases.length === 0 ? (
            <p className={s.empty}>
              Nothing here yet. <Link href="/roadmap">See what&rsquo;s on the roadmap</Link>
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.key} aria-label={group.key === "earlier" ? "Earlier" : monthLabel(group.key, true)}>
                <h2 className={s.monthHead}>
                  {group.key === "earlier" ? "Earlier" : monthLabel(group.key, true)}
                  {monthCounts.get(group.key) ? <b>{monthCounts.get(group.key)} shipped</b> : null}
                </h2>
                {group.items.map((item) => {
                  const deleted = item.author.username === "[deleted]";
                  const number = numbers.get(item.id);
                  return (
                    <article
                      key={item.id}
                      className={s.release}
                      style={{ ["--tilt" as string]: `${tiltOf(item.id, 0.45)}deg` }}
                    >
                      <div className={s.cardHead}>
                        <CategoryLabel category={item.category} />
                        {number ? <span className={s.num}>No. {number}</span> : null}
                        {item.completed_at && (
                          <time className={s.releaseDate} dateTime={item.completed_at}>
                            {shortDate(item.completed_at)}
                          </time>
                        )}
                      </div>
                      <StatusMark status="done" completedAt={item.completed_at} />

                      <h3 className={s.releaseTitle}>
                        <Link href={itemHref(item.id, SHIPPED_CTX)}>{item.title}</Link>
                      </h3>

                      <p className={s.releaseNote}>{item.release_note}</p>

                      <div className={s.releaseFoot}>
                        {deleted ? (
                          <span>A member&rsquo;s suggestion</span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            Asked for by
                            <Avatar url={item.author.avatar_url} name={item.author.display_name} size={18} />
                            <Link href={`/${item.author.username}`}>@{item.author.username}</Link>
                          </span>
                        )}
                        <UpvoteButton
                          postId={item.id}
                          initialVoted={item.voted}
                          initialCount={item.vote_count}
                          isLoggedIn={!!session}
                          variant="pill"
                        />
                        {item.comment_count > 0 && (
                          <span>
                            {item.comment_count} {item.comment_count === 1 ? "comment" : "comments"}
                          </span>
                        )}
                        <Link href={itemHref(item.id, SHIPPED_CTX)} className={s.releaseOpen}>
                          Open the card →
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </section>
            ))
          )}

          {totalPages > 1 && (
            <nav className={s.pager} aria-label="Pages">
              {page > 1 ? <Link href={pageHref(page - 1)}>← Newer</Link> : <span />}
              <span>
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? <Link href={pageHref(page + 1)}>Older →</Link> : <span />}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
