"use client";

import { useState, useEffect, useRef } from "react";
import { AvatarWithFrame } from "@/components/avatar-with-frame";

interface FediverseResult {
  id: string;
  username: string;
  domain: string;
  display_name: string;
  avatar_url: string | null;
  ap_id: string;
  profile_url: string;
  relationship_status?: "pending" | "accepted" | null;
}

function FediverseFollowButton({ remoteActorId, initialStatus }: { remoteActorId: string; initialStatus?: "pending" | "accepted" | null }) {
  const [state, setState] = useState<"idle" | "loading" | "pending" | "following" | "error">(() => {
    if (initialStatus === "accepted") return "following";
    if (initialStatus === "pending") return "pending";
    return "idle";
  });
  const pollRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    if (state !== "pending") return;
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 10) {
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      try {
        const res = await fetch(`/api/search/fediverse/follow`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remote_actor_id: remoteActorId }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.data?.status === "accepted") {
            setState("following");
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch { /* ignore polling errors */ }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state, remoteActorId]);

  async function handleFollow() {
    setState("loading");
    try {
      const res = await fetch(`/api/search/fediverse/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remote_actor_id: remoteActorId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.already_following && data.data?.status === "accepted") {
          setState("following");
        } else if (data.data?.status === "accepted") {
          setState("following");
        } else {
          setState("pending");
        }
      } else if (res.status === 401) {
        setState("error");
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  if (state === "following") {
    return <span className="catalog-follow-btn catalog-follow-btn--muted">Following</span>;
  }
  if (state === "pending") {
    return <span className="catalog-follow-btn catalog-follow-btn--muted">Requested</span>;
  }
  if (state === "error") {
    return <span className="catalog-follow-btn catalog-follow-btn--muted">Log in first</span>;
  }
  return (
    <button onClick={handleFollow} disabled={state === "loading"} className="catalog-follow-btn">
      {state === "loading" ? "..." : "Follow"}
    </button>
  );
}

interface FediverseResultsProps {
  result: FediverseResult | null;
  error: string | null;
  hasSearched: boolean;
  query: string;
}

export function FediverseResults({ result, error, hasSearched, query }: FediverseResultsProps) {
  if (result) {
    return (
      <div className="catalog-results">
        <div className="catalog-card catalog-card-fediverse">
          <div className="catalog-card-person">
            <a href={result.profile_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
              <AvatarWithFrame
                url={result.avatar_url}
                name={result.display_name || result.username}
                size={56}
              />
            </a>
            <div className="catalog-person-info">
              <a href={result.profile_url} target="_blank" rel="noopener noreferrer"
                className="catalog-person-name" style={{ textDecoration: "none" }}>
                {result.display_name || result.username}
              </a>
              <p className="catalog-person-handle">@{result.username}@{result.domain}</p>
              <span className="catalog-fediverse-domain">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                </svg>
                {result.domain}
              </span>
            </div>
            <div className="catalog-person-action">
              <FediverseFollowButton remoteActorId={result.id} initialStatus={result.relationship_status} />
            </div>
          </div>
          <a href={result.profile_url} target="_blank" rel="noopener noreferrer" className="catalog-fediverse-link">
            Visit on {result.domain}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </div>
    );
  }

  if (error && hasSearched) {
    return (
      <div className="catalog-no-results">
        <p className="catalog-no-results-title">{error}</p>
        <p className="catalog-no-results-text">
          Make sure the handle is correct (e.g. user@mastodon.social)
        </p>
      </div>
    );
  }

  return null;
}
