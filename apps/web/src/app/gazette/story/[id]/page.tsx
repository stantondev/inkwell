import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { getSession } from "@/lib/session";
import { notFoundOrRethrow } from "@/lib/page-errors";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import {
  type GazetteResponse,
  type GazetteSection,
  type GazetteStory,
  publisherOf,
  responseHref,
  sectionLabel,
  sharedLine,
  writeAboutHref,
} from "@/lib/gazette";
import { Ago } from "../../ago";
import { StoryImage } from "../../story-image";
import { Conversation } from "./conversation";

interface StoryResponse {
  data: GazetteStory & { provider_url: string | null };
  responses: GazetteResponse[];
  sections: GazetteSection[];
}

async function loadStory(id: string, token?: string | null): Promise<StoryResponse> {
  return apiFetch<StoryResponse>(`/api/gazette/stories/${encodeURIComponent(id)}`, {}, token);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const { data } = await loadStory(id);
    return {
      title: `${data.title} — The Gazette`,
      description: data.description ?? undefined,
      // The article belongs to its publisher; this page is our conversation about it.
      robots: { index: false, follow: true },
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { title: "Story not found" };
    return { title: "The Gazette" };
  }
}

export default async function GazetteStoryPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);

  let res: StoryResponse;
  try {
    res = await loadStory(id, session?.token);
  } catch (err) {
    notFoundOrRethrow(err);
  }

  const { data: story, responses, sections } = res;
  const kicker = [story.opinion ? "Opinion" : null, ...story.topics.map((t) => sectionLabel(sections, t))]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="gz gz-story">
      <p className="gz-back">
        <Link href="/gazette">&larr; The Gazette</Link>
      </p>

      <article className="gz-story-head">
        {kicker && <div className={`gz-kicker ${story.opinion ? "gz-kicker--opinion" : ""}`}>{kicker}</div>}
        <h1 className="gz-story-headline">{story.title}</h1>
        {story.description && <p className="gz-lead-deck">{story.description}</p>}
        <div className="gz-byline">
          {story.author_name && <span className="gz-byline-author">By {story.author_name}</span>}
          <span className="gz-byline-publisher">{publisherOf(story)}</span>
          {story.article_published_at && <Ago iso={story.article_published_at} />}
          <span className="gz-byline-shared">{sharedLine(story)}</span>
        </div>
        {story.image_url && (
          <StoryImage src={story.image_url} alt={story.image_description ?? ""} className="gz-story-figure" eager />
        )}
        <div className="gz-actions">
          <a href={story.url} target="_blank" rel="noopener noreferrer nofollow" className="gz-btn gz-btn--primary">
            Read the article at {publisherOf(story)} &#8599;
          </a>
          <Link href={writeAboutHref(story.id)} className="gz-btn">
            &#9998; Write about this
          </Link>
        </div>
        <p className="gz-story-trending">
          Trending on {story.trending_on.join(", ")}.
        </p>
      </article>

      <div className="gz-story-cols">
        <section className="gz-story-col">
          <div className="gz-rule">
            <h2 className="gz-rule-label">What people are saying</h2>
          </div>
          <Conversation storyId={story.id} />
        </section>

        <section className="gz-story-col gz-story-col--inkwell">
          <div className="gz-rule">
            <h2 className="gz-rule-label">On Inkwell</h2>
          </div>
          {responses.length > 0 ? (
            <ul className="gz-story-responses">
              {responses.map((r) => (
                <li key={r.id}>
                  <Link href={responseHref(r)} className="gz-response">
                    <div className="gz-response-author">
                      <AvatarWithFrame url={r.author.avatar_url} name={r.author.display_name} size={28} frame={r.author.avatar_frame} />
                      <span>{r.author.display_name}</span>
                    </div>
                    <div className="gz-response-title">{r.title || r.excerpt || "Untitled"}</div>
                    {r.title && r.excerpt && <div className="gz-response-excerpt">{r.excerpt}</div>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="gz-convo-note">No one on Inkwell has written about this yet.</p>
          )}
          <div className="gz-write-card">
            <p>
              What do you make of it? Write a journal entry. The story is linked at the top, and your entry
              appears here for other readers.
            </p>
            <Link href={writeAboutHref(story.id)} className="gz-btn gz-btn--primary">
              &#9998; Write about this
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
