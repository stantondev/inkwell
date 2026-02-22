import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import { Avatar } from "@/components/avatar";
import { StatusBadge, CategoryBadge } from "../badges";
import { UpvoteButton } from "../upvote-button";
import { AdminStatusForm } from "./admin-status-form";
import { FeedbackCommentForm } from "./feedback-comment-form";
import { DeleteCommentButtonClient } from "./delete-comment-button";

interface FeedbackPost {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  admin_response: string | null;
  release_note: string | null;
  completed_at: string | null;
  vote_count: number;
  comment_count: number;
  voted: boolean;
  author: {
    id: string | null;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  created_at: string;
  updated_at: string;
  comments: FeedbackComment[];
}

interface FeedbackComment {
  id: string;
  body: string;
  author: {
    id: string | null;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  created_at: string;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const data = await apiFetch<{ data: FeedbackPost }>(`/api/feedback/${id}`);
    return { title: `${data.data.title} · Roadmap · Inkwell` };
  } catch {
    return { title: "Roadmap · Inkwell" };
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RoadmapDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getSession();
  const isLoggedIn = !!session;
  const isAdmin = session?.user.is_admin ?? false;

  let post: FeedbackPost;
  try {
    const data = await apiFetch<{ data: FeedbackPost }>(
      `/api/feedback/${id}`,
      {},
      session?.token
    );
    post = data.data;
  } catch {
    notFound();
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Back link */}
        <Link
          href="/roadmap"
          className="inline-flex items-center gap-1 text-sm mb-6 transition-colors hover:underline"
          style={{ color: "var(--muted)" }}
        >
          ← Back to Roadmap
        </Link>

        {/* Post header */}
        <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="flex items-start gap-4">
            {/* Upvote */}
            <UpvoteButton
              postId={post.id}
              initialVoted={post.voted}
              initialCount={post.vote_count}
              isLoggedIn={isLoggedIn}
            />

            <div className="flex-1 min-w-0">
              {/* Title */}
              <h1
                className="text-xl font-semibold mb-2 leading-snug"
                style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
              >
                {post.title}
              </h1>

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <CategoryBadge category={post.category} />
                <StatusBadge status={post.status} />
              </div>

              {/* Body */}
              <div className="text-sm leading-relaxed whitespace-pre-wrap mb-4">
                {post.body}
              </div>

              {/* Author + time */}
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                {post.author.avatar_url || post.author.display_name ? (
                  <Avatar
                    url={post.author.avatar_url}
                    name={post.author.display_name}
                    size={20}
                  />
                ) : null}
                {post.author.username !== "[deleted]" ? (
                  <Link href={`/${post.author.username}`} className="hover:underline">
                    @{post.author.username}
                  </Link>
                ) : (
                  <span>@{post.author.username}</span>
                )}
                <span>·</span>
                <span>{formatDate(post.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Shipped attribution card */}
          {post.status === "done" && post.release_note && (
            <div
              className="mt-4 rounded-lg border-l-4 p-4"
              style={{
                borderLeftColor: "#6EE7B7",
                background: "#ECFDF5",
              }}
            >
              <p className="text-xs font-semibold mb-1 flex items-center gap-1.5" style={{ color: "#047857" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5"/>
                </svg>
                Shipped
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap mb-3">
                {post.release_note}
              </p>
              <div className="flex items-center gap-2 text-xs" style={{ color: "#047857" }}>
                <span>Suggested by</span>
                {post.author.avatar_url || post.author.display_name ? (
                  <Avatar
                    url={post.author.avatar_url}
                    name={post.author.display_name}
                    size={16}
                  />
                ) : null}
                {post.author.username !== "[deleted]" ? (
                  <Link href={`/${post.author.username}`} className="font-medium hover:underline">
                    @{post.author.username}
                  </Link>
                ) : (
                  <span>@{post.author.username}</span>
                )}
                {post.completed_at && (
                  <>
                    <span>·</span>
                    <span>{formatDate(post.completed_at)}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Admin response */}
          {post.admin_response && (
            <div
              className="mt-4 rounded-lg border-l-4 p-4"
              style={{
                borderColor: "var(--accent)",
                background: "var(--accent-light)",
              }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--accent)" }}>
                Admin Response
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {post.admin_response}
              </p>
            </div>
          )}
        </div>

        {/* Admin controls */}
        {isAdmin && (
          <div className="mt-4">
            <AdminStatusForm
              postId={post.id}
              currentStatus={post.status}
              currentResponse={post.admin_response}
              currentReleaseNote={post.release_note}
            />
          </div>
        )}

        {/* Comments section */}
        <div className="mt-8" id="comments">
          <h2 className="text-sm font-semibold mb-4">
            Comments ({post.comments?.length ?? 0})
          </h2>

          {/* Comment form */}
          {isLoggedIn ? (
            <div className="mb-6">
              <FeedbackCommentForm postId={post.id} />
            </div>
          ) : (
            <div
              className="rounded-xl border p-4 mb-6 text-center"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                <Link href="/login" className="font-medium hover:underline" style={{ color: "var(--accent)" }}>
                  Sign in
                </Link>{" "}
                to leave a comment.
              </p>
            </div>
          )}

          {/* Comments list */}
          {post.comments && post.comments.length > 0 ? (
            <div className="flex flex-col gap-3">
              {post.comments.map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-xl border p-4"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar
                      url={comment.author.avatar_url}
                      name={comment.author.display_name}
                      size={24}
                    />
                    <span className="text-xs font-medium">
                      {comment.author.username !== "[deleted]" ? (
                        <Link href={`/${comment.author.username}`} className="hover:underline">
                          @{comment.author.username}
                        </Link>
                      ) : (
                        <span>@{comment.author.username}</span>
                      )}
                    </span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {timeAgo(comment.created_at)}
                    </span>
                    {/* Delete button for own comments or admin */}
                    {(comment.author.id === session?.user.id || isAdmin) && (
                      <DeleteCommentButtonClient commentId={comment.id} />
                    )}
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {comment.body}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No comments yet. Be the first to share your thoughts.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
