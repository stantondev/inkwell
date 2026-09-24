import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch, ApiError } from "@/lib/api";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { LocalDate, SHORT_DATE } from "@/components/local-date";
import type { Circle, CircleThread } from "../../../circle-types";
import ThreadAnswers from "./thread-answers";

const SITE = "https://inkwell.social";

const loadThread = cache(async (slug: string, entryId: string, token: string | undefined) => {
  const circle = (await apiFetch<{ data: Circle }>(`/api/circles/${encodeURIComponent(slug)}`, {}, token)).data;
  const thread = (
    await apiFetch<{ data: CircleThread }>(`/api/circles/${circle.id}/threads/${encodeURIComponent(entryId)}`, {}, token)
  ).data;
  return { circle, thread };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; entryId: string }>;
}): Promise<Metadata> {
  const { slug, entryId } = await params;
  const session = await getSession();
  try {
    const { circle, thread } = await loadThread(slug, entryId, session?.token);
    const title = thread.prompt.title || "A thread";
    return {
      title: `${title} · ${circle.name}`,
      description: thread.prompt.excerpt?.slice(0, 160) || `A thread in ${circle.name} on Inkwell.`,
      // The entries themselves are the canonical copies.
      robots: { index: false, follow: true },
    };
  } catch {
    return { title: "Thread" };
  }
}

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; entryId: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { slug, entryId } = await params;
  const sp = await searchParams;
  const session = await getSession();

  let data: Awaited<ReturnType<typeof loadThread>>;
  try {
    data = await loadThread(slug, entryId, session?.token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const { circle, thread } = data;
  const post = thread.prompt;
  const author = post.author;
  const isMember = thread.circle.is_member;
  const writeHref = `/editor?circle=${circle.id}&circle_prompt=${post.id}`;
  const postHref = author ? `/${author.username}/${post.slug}` : "#";

  return (
    <div className="circle-page">
      <div className="max-w-3xl mx-auto" style={{ padding: "1.5rem 1rem 3rem" }}>
        <Link href={`/circles/${circle.slug}`} className="circle-back-link">
          ← {circle.name}
        </Link>

        <article className="circle-thread-op">
          <div className="circle-thread-tags" style={{ marginBottom: "0.5rem" }}>
            {post.is_current && <span className="circle-entry-tag circle-entry-tag--prompt">Pinned prompt</span>}
            {post.privacy === "circle" && <span className="circle-entry-tag">Members only</span>}
          </div>
          <h1 className="circle-title">{post.title || "Untitled"}</h1>
          <div className="circle-thread-meta" style={{ marginTop: "0.625rem" }}>
            {author && (
              <Link href={`/${author.username}`} className="circle-thread-author">
                <AvatarWithFrame
                  url={author.avatar_url}
                  name={author.display_name || author.username}
                  size={24}
                  frame={author.avatar_frame}
                  subscriptionTier={author.subscription_tier}
                />
                {author.display_name || author.username}
              </Link>
            )}
            <LocalDate iso={post.published_at} options={SHORT_DATE} />
          </div>
          <div
            className="prose-entry circle-thread-body"
            dangerouslySetInnerHTML={{ __html: post.body_html || "" }}
          />
          <div className="circle-thread-meta">
            <Link href={`${postHref}#comments`}>
              {post.comment_count ? `${post.comment_count} comment${post.comment_count === 1 ? "" : "s"}` : "Comment"}
            </Link>
            <Link href={postHref}>Open as a journal entry</Link>
          </div>
        </article>

        <div className="circle-thread-cta">
          {isMember ? (
            <Link href={writeHref} className="circle-btn" style={{ textDecoration: "none" }}>
              Write your answer
            </Link>
          ) : session ? (
            <Link href={`/circles/${circle.slug}`} className="circle-btn" style={{ textDecoration: "none" }}>
              Join {circle.name} to answer
            </Link>
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(`/circles/${circle.slug}/t/${post.id}`)}`}
              className="circle-btn"
              style={{ textDecoration: "none" }}
            >
              Sign in to answer
            </Link>
          )}
          <span className="circle-empty">
            Your answer is a journal entry: it stays on your journal and appears here.
          </span>
        </div>

        <ThreadAnswers
          answers={thread.answers}
          total={thread.answer_count}
          highlightId={sp.answered ?? null}
        />
      </div>
    </div>
  );
}
