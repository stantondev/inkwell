"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConversationPost } from "@/lib/gazette";
import { Ago } from "../../ago";

/**
 * Fediverse posts linking to the story, loaded after the page so a slow
 * Mastodon server never holds up the story itself.
 */
export function Conversation({ storyId }: { storyId: string }) {
  const [posts, setPosts] = useState<ConversationPost[] | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    setPosts(null);
    try {
      const res = await fetch(`/api/gazette/stories/${storyId}/conversation`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPosts(data.data ?? []);
      setSource(data.source ?? null);
    } catch {
      setFailed(true);
    }
  }, [storyId]);

  useEffect(() => {
    load();
  }, [load]);

  if (failed) {
    return (
      <p className="gz-convo-note">
        Couldn&rsquo;t reach the fediverse just now.{" "}
        <button type="button" className="gz-link-btn" onClick={load}>
          Try again
        </button>
      </p>
    );
  }

  if (posts === null) {
    return <p className="gz-convo-note">Gathering posts from the fediverse&hellip;</p>;
  }

  if (posts.length === 0) {
    return <p className="gz-convo-note">No public posts about this story yet.</p>;
  }

  const visible = showAll ? posts : posts.slice(0, 6);

  return (
    <>
      <ul className="gz-convo">
        {visible.map((p) => (
          <li key={p.url} className="gz-post">
            <div className="gz-post-head">
              {p.author.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.author.avatar_url} alt="" className="gz-post-avatar" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <span className="gz-post-avatar" aria-hidden />
              )}
              <div className="gz-post-who">
                <a href={p.author.profile_url ?? p.url} target="_blank" rel="noopener noreferrer nofollow" className="gz-post-name">
                  {p.author.display_name}
                </a>
                <span className="gz-post-acct">@{p.author.acct}</span>
              </div>
              <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="gz-post-time">
                <Ago iso={p.created_at} />
              </a>
            </div>
            <div className="gz-post-body" dangerouslySetInnerHTML={{ __html: p.content_html }} />
            {(p.boosts > 0 || p.likes > 0 || p.replies > 0) && (
              <div className="gz-post-stats">
                {p.replies > 0 && <span>{p.replies} {p.replies === 1 ? "reply" : "replies"}</span>}
                {p.boosts > 0 && <span>{p.boosts} {p.boosts === 1 ? "boost" : "boosts"}</span>}
                {p.likes > 0 && <span>{p.likes} {p.likes === 1 ? "favourite" : "favourites"}</span>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {posts.length > visible.length && (
        <button type="button" className="gz-btn gz-convo-more" onClick={() => setShowAll(true)}>
          Show {posts.length - visible.length} more
        </button>
      )}
      {source && <p className="gz-convo-source">Public posts linking to this story, as seen from {source}.</p>}
    </>
  );
}
