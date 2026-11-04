import type { Metadata } from "next";
import Link from "next/link";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import { Avatar } from "@/components/avatar";
import { ScoreBadge } from "../badges";
import { UpvoteButton } from "../upvote-button";
import { AdminStatusForm } from "./admin-status-form";
import { FeedbackCommentForm } from "./feedback-comment-form";
import { FeedbackCommentItem, type FeedbackComment } from "./feedback-comment-item";
import { EditPostForm } from "./edit-post-form";
import { PagerBar, PeekLink, SwipeSheet } from "./item-pager";
import { CategoryLabel, ProgressRail, StatusMark } from "../roadmap-card";
import { notFoundOrRethrow } from "@/lib/page-errors";
import s from "../roadmap.module.css";
import {
  CATEGORY_LABELS,
  excerpt,
  groupOf,
  itemHref,
  readContext,
  roadmapHref,
  shortDate,
  type FeedbackPost,
  type OutlineItem,
  type RoadmapContext,
  type RoadmapGroup,
} from "../roadmap-shared";

type Post = FeedbackPost & { comments: FeedbackComment[] };

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const RAIL_CAPTIONS: Record<string, string> = {
  new: "Received. It's waiting to be looked at.",
  under_review: "Being looked at, to see whether and how it fits.",
  planned: "Planned: it's on the list to build.",
  in_progress: "Being built right now.",
};

const GROUP_WORDS: Record<RoadmapGroup, string> = {
  open: "open",
  shipped: "shipped",
  declined: "declined",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const data = await apiFetch<{ data: FeedbackPost }>(`/api/feedback/${id}`);
    const post = data.data;
    const description = excerpt(post.status === "done" && post.release_note ? post.release_note : post.body, 160);
    return {
      title: `${post.title} · Roadmap`,
      description,
      alternates: { canonical: `/roadmap/${post.id}` },
      openGraph: { title: `${post.title} · Inkwell Roadmap`, description, url: `/roadmap/${post.id}` },
    };
  } catch {
    return { title: "Roadmap" };
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

async function loadOutline(group: RoadmapGroup, ctx: RoadmapContext, token?: string) {
  const p = new URLSearchParams({ group });
  if (ctx.category) p.set("category", ctx.category);
  if (ctx.sort) p.set("sort", ctx.sort);
  if (ctx.q) p.set("q", ctx.q);
  try {
    const res = await apiFetch<{ data: OutlineItem[] }>(`/api/feedback/outline?${p}`, {}, token);
    return res.data ?? [];
  } catch {
    return null;
  }
}

export default async function RoadmapDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await getSession();
  const isLoggedIn = !!session;
  const isAdmin = session?.user.is_admin ?? false;
  const asked = readContext(sp);

  // The list we flip through: the one the reader came from, else the item's own group.
  const [postResult, askedOutline] = await Promise.all([
    apiFetch<{ data: Post }>(`/api/feedback/${id}`, {}, session?.token).then(
      (r) => ({ ok: true as const, post: r.data }),
      (err) => ({ ok: false as const, err }),
    ),
    asked.group ? loadOutline(asked.group, asked, session?.token) : Promise.resolve(null),
  ]);
  if (!postResult.ok) notFoundOrRethrow(postResult.err);
  const post = postResult.post;

  let ctx: RoadmapContext = asked;
  let list = askedOutline;
  if (!asked.group || !list || !list.some((o) => o.id === post.id)) {
    // Arrived without a list, or the filters no longer include this card.
    ctx = { group: groupOf(post.status) };
    list = await loadOutline(ctx.group!, ctx, session?.token);
  }
  const items = list ?? [];
  const at = items.findIndex((o) => o.id === post.id);
  const prev = at > 0 ? items[at - 1] : null;
  const next = at >= 0 && at < items.length - 1 ? items[at + 1] : null;
  const prevHref = prev ? itemHref(prev.id, ctx) : null;
  const nextHref = next ? itemHref(next.id, ctx) : null;

  const groupWord = GROUP_WORDS[ctx.group ?? "open"];
  const filterWord = ctx.category ? ` ${CATEGORY_LABELS[ctx.category].toLowerCase()}s` : "";
  const position = at >= 0 ? `${at + 1} of ${items.length} ${groupWord}${filterWord}` : null;
  const backLabel = ctx.group === "shipped" ? "Shipped" : ctx.group === "declined" ? "Declined" : "The Roadmap";

  const isAuthor = !!session && post.author.id === session.user.id;
  const deleted = post.author.username === "[deleted]";
  const shipped = post.status === "done";
  const open = !shipped && post.status !== "declined";

  const author = deleted ? (
    <span>@{post.author.username}</span>
  ) : (
    <Link href={`/${post.author.username}`}>@{post.author.username}</Link>
  );

  return (
    <div className={s.root} style={{ background: "var(--background)", minHeight: "100vh" }}>
      <div className={s.itemWrap}>
        <PagerBar
          backHref={roadmapHref(ctx)}
          backLabel={backLabel}
          position={position}
          prevHref={prevHref}
          nextHref={nextHref}
          prevTitle={prev?.title ?? null}
          nextTitle={next?.title ?? null}
        />

        <SwipeSheet key={post.id} prevHref={prevHref} nextHref={nextHref}>
          <div className={s.sheetHead}>
            <CategoryLabel category={post.category} />
            <span className={s.num}>
              {post.number ? `No. ${post.number} · ` : ""}filed {shortDate(post.created_at)}
            </span>
          </div>

          <div className={s.sheetTop}>
            <div className={s.sheetMain}>
              <h1 className={s.sheetTitle}>{post.title}</h1>
              <div className={s.sheetMeta}>
                {!deleted && <Avatar url={post.author.avatar_url} name={post.author.display_name} size={22} />}
                <span>{shipped ? "Asked for by " : "From "}{author}</span>
                {shipped && post.completed_at && <span>· shipped {shortDate(post.completed_at)}</span>}
                {isAuthor && (
                  <>
                    <span>·</span>
                    <EditPostForm
                      postId={post.id}
                      initialTitle={post.title}
                      initialBody={post.body}
                      initialCategory={post.category}
                    />
                  </>
                )}
              </div>
            </div>
            <div className={s.sheetMark}>
              <StatusMark status={post.status} completedAt={post.completed_at} big />
            </div>
          </div>

          {open && (
            <div className={s.railBox}>
              <ProgressRail status={post.status} />
              <p className={s.railCaption}>{RAIL_CAPTIONS[post.status]}</p>
            </div>
          )}

          <div className={s.sheetBody}>{post.body}</div>

          {post.attachment_ids && post.attachment_ids.length > 0 && (
            <div className={s.attachments}>
              {post.attachment_ids.map((imageId) => (
                <a key={imageId} href={`/api/images/${imageId}`} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/images/${imageId}`} alt="Screenshot attached to this post" />
                </a>
              ))}
            </div>
          )}

          <div className={s.actions}>
            <UpvoteButton
              postId={post.id}
              initialVoted={post.voted}
              initialCount={post.vote_count}
              isLoggedIn={isLoggedIn}
              variant="pill"
            />
            <span style={{ fontSize: 13, color: "var(--rm-ink-soft)" }}>
              {open ? "Vote if you'd use this" : post.vote_count === 1 ? "vote" : "votes"}
            </span>
            {isAdmin && <ScoreBadge score={post.weighted_score} priority={post.priority} />}
            <a href="#comments" className={s.sectionLink} style={{ marginLeft: "auto", fontSize: 13 }}>
              {post.comments?.length ?? 0} {(post.comments?.length ?? 0) === 1 ? "comment" : "comments"}
            </a>
          </div>
        </SwipeSheet>

        {shipped && post.release_note && (
          <div className={s.note}>
            <div className={s.noteLabel}>What shipped</div>
            <div className={s.noteText}>{post.release_note}</div>
            <div className={s.noteFoot}>
              <span>Thanks to</span>
              {!deleted && <Avatar url={post.author.avatar_url} name={post.author.display_name} size={16} />}
              {author}
              <span>for asking.</span>
            </div>
          </div>
        )}

        {post.admin_response && (
          <div className={s.note} data-kind="reply">
            <div className={s.noteLabel}>From Inkwell</div>
            <div className={s.noteText}>{post.admin_response}</div>
          </div>
        )}

        {isAdmin && (
          <div className={s.admin}>
            <AdminStatusForm
              postId={post.id}
              currentStatus={post.status}
              currentResponse={post.admin_response}
              currentReleaseNote={post.release_note}
              currentPriority={post.priority}
              currentValueScore={post.value_score}
            />
          </div>
        )}

        {(prevHref || nextHref) && (
          <div className={s.peeks}>
            <PeekLink href={prevHref} dir="prev" label="Previous" title={prev?.title ?? null} />
            <PeekLink href={nextHref} dir="next" label="Next" title={next?.title ?? null} />
          </div>
        )}

        <section className={s.comments} id="comments">
          <h2 className={s.commentsTitle}>
            Comments <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 15 }}>({post.comments?.length ?? 0})</span>
          </h2>

          {post.comments && post.comments.length > 0 ? (
            <div className="flex flex-col gap-3 mb-6">
              {post.comments.map((comment) => (
                <FeedbackCommentItem
                  key={comment.id}
                  comment={comment}
                  when={timeAgo(comment.created_at)}
                  canEdit={!!session && comment.author.id === session.user.id}
                  canDelete={!!session && (comment.author.id === session.user.id || isAdmin)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
              No comments yet.
            </p>
          )}

          {isLoggedIn ? (
            <FeedbackCommentForm postId={post.id} />
          ) : (
            <div
              className="rounded-xl border p-4 text-center"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                <Link
                  href={`/login?next=${encodeURIComponent(`/roadmap/${post.id}`)}`}
                  className="font-medium hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  Sign in
                </Link>{" "}
                to leave a comment.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
