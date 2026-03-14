"use client";

import { useState } from "react";
import Link from "next/link";
import { AvatarWithFrame } from "@/components/avatar-with-frame";

interface SearchUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame?: string | null;
  subscription_tier?: string;
  bio: string | null;
}

function FollowButton({ username }: { username: string }) {
  const [state, setState] = useState<"idle" | "loading" | "pending" | "following">("idle");

  async function handleFollow() {
    setState("loading");
    try {
      const res = await fetch(`/api/follow/${username}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setState(data.data?.status === "accepted" ? "following" : "pending");
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  if (state === "following") {
    return <span className="catalog-follow-btn catalog-follow-btn--muted">Pen Pal</span>;
  }
  if (state === "pending") {
    return <span className="catalog-follow-btn catalog-follow-btn--muted">Requested</span>;
  }
  return (
    <button onClick={handleFollow} disabled={state === "loading"} className="catalog-follow-btn">
      {state === "loading" ? "..." : "Send Request"}
    </button>
  );
}

interface PeopleResultsProps {
  users: SearchUser[];
  query: string;
  hasSearched: boolean;
  onTabChange: (tab: "fediverse") => void;
}

export function PeopleResults({ users, query, hasSearched, onTabChange }: PeopleResultsProps) {
  if (users.length === 0 && hasSearched && query.trim()) {
    return (
      <div className="catalog-no-results">
        <p className="catalog-no-results-title">
          No cards filed under &ldquo;{query}&rdquo;
        </p>
        <p className="catalog-no-results-text">
          Try a different name or spelling.
        </p>
        <button className="catalog-no-results-link" onClick={() => onTabChange("fediverse")}>
          Or search the fediverse
        </button>
      </div>
    );
  }

  if (users.length === 0) return null;

  return (
    <div className="catalog-results">
      {users.map((user) => (
        <div key={user.id} className="catalog-card catalog-card-person">
          <Link href={`/${user.username}`} className="flex-shrink-0">
            <AvatarWithFrame
              url={user.avatar_url}
              name={user.display_name}
              size={48}
              frame={user.avatar_frame}
              subscriptionTier={user.subscription_tier}
            />
          </Link>
          <div className="catalog-person-info">
            <Link href={`/${user.username}`} className="catalog-person-name">
              {user.display_name}
            </Link>
            <p className="catalog-person-handle">@{user.username}</p>
            {user.bio && <p className="catalog-person-bio">{user.bio}</p>}
          </div>
          <div className="catalog-person-action">
            <FollowButton username={user.username} />
          </div>
        </div>
      ))}
    </div>
  );
}
