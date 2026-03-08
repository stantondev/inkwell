"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MemberStrip from "./member-strip";
import MembersSection from "./members-section";
import DiscussionCard from "./discussion-card";
import CreateDiscussionForm from "./create-discussion-form";

const CATEGORY_LABELS: Record<string, string> = {
  writing_craft: "Writing & Craft",
  reading_books: "Reading & Books",
  creative_arts: "Creative Arts",
  lifestyle_interests: "Lifestyle",
  tech_learning: "Tech & Learning",
  community: "Community",
};

interface Circle {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  member_count: number;
  discussion_count: number;
  is_starter: boolean;
  is_member: boolean;
  viewer_role: string | null;
  member_preview: { id: string; role: string; user: { id: string; username: string; display_name: string; avatar_url: string | null; avatar_frame: string | null } | null }[];
  owner: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  discussion_preview?: { id: string; title: string; is_prompt: boolean; response_count: number; inserted_at: string; author_name: string | null }[];
}

interface Discussion {
  id: string;
  title: string;
  body: string;
  is_prompt: boolean;
  is_pinned: boolean;
  is_locked: boolean;
  response_count: number;
  last_response_at: string | null;
  inserted_at: string;
  circle_id: string;
  author: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
}

export default function CircleDetailClient({
  circle,
  isLoggedIn,
  currentUserId,
}: {
  circle: Circle;
  isLoggedIn: boolean;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [isMember, setIsMember] = useState(circle.is_member);
  const [memberCount, setMemberCount] = useState(circle.member_count);
  const [joining, setJoining] = useState(false);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loadingDiscussions, setLoadingDiscussions] = useState(false);
  const [showNewDiscussion, setShowNewDiscussion] = useState(false);

  const fetchDiscussions = useCallback(async () => {
    if (!isMember) return;
    setLoadingDiscussions(true);
    try {
      const res = await fetch(`/api/circles/${circle.id}/discussions`);
      if (res.ok) {
        const data = await res.json();
        setDiscussions(data.data || []);
      }
    } catch {
      // ignore
    }
    setLoadingDiscussions(false);
  }, [circle.id, isMember]);

  useEffect(() => {
    fetchDiscussions();
  }, [fetchDiscussions]);

  const handleJoin = async () => {
    if (!isLoggedIn) {
      router.push("/get-started");
      return;
    }
    setJoining(true);
    try {
      const res = await fetch(`/api/circles/${circle.id}/join`, { method: "POST" });
      if (res.ok) {
        setIsMember(true);
        setMemberCount((c) => c + 1);
      }
    } catch {
      // ignore
    }
    setJoining(false);
  };

  const handleLeave = async () => {
    setJoining(true);
    try {
      const res = await fetch(`/api/circles/${circle.id}/leave`, { method: "DELETE" });
      if (res.ok) {
        setIsMember(false);
        setMemberCount((c) => Math.max(0, c - 1));
        setDiscussions([]);
      }
    } catch {
      // ignore
    }
    setJoining(false);
  };

  const isOwner = circle.viewer_role === "owner";
  const canModerate = circle.viewer_role === "owner" || circle.viewer_role === "moderator";

  return (
    <>
      {/* Back link */}
      <Link href="/circles" style={{ fontSize: "0.8125rem", color: "var(--accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.25rem", marginBottom: "1rem" }}>
        ← All Circles
      </Link>

      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontSize: "1.75rem", fontWeight: 600, color: "var(--foreground)", margin: 0, lineHeight: 1.3 }}>
              {circle.name}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
              <span className="circle-category-pill">
                {CATEGORY_LABELS[circle.category] || circle.category}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                {memberCount} member{memberCount !== 1 ? "s" : ""} · {circle.discussion_count} discussion{circle.discussion_count !== 1 ? "s" : ""}
              </span>
            </div>
            {circle.owner && (
              <div style={{ fontSize: "0.8125rem", color: "var(--muted)", marginTop: "0.375rem" }}>
                Founded by{" "}
                <Link href={`/${circle.owner.username}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                  @{circle.owner.username}
                </Link>
              </div>
            )}
          </div>

          <div>
            {isOwner ? (
              <span style={{ fontSize: "0.8125rem", color: "var(--accent)", fontWeight: 500, fontStyle: "italic" }}>Owner</span>
            ) : isMember ? (
              <button onClick={handleLeave} disabled={joining} className="circle-btn circle-btn--outline">
                {joining ? "..." : "Leave Circle"}
              </button>
            ) : (
              <button onClick={handleJoin} disabled={joining} className="circle-btn">
                {joining ? "Joining..." : "Join Circle"}
              </button>
            )}
          </div>
        </div>

        {circle.description && (
          <div
            className="prose-discussion"
            style={{ marginTop: "1rem" }}
            dangerouslySetInnerHTML={{ __html: circle.description }}
          />
        )}
      </div>

      {/* Member strip */}
      {circle.member_preview.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <MemberStrip members={circle.member_preview} totalCount={memberCount} circleId={circle.id} isMember={isMember} />
        </div>
      )}

      {/* Full member list (members only) */}
      {isMember && (
        <MembersSection
          circleId={circle.id}
          isOwner={isOwner}
          memberCount={memberCount}
          onMemberCountChange={setMemberCount}
        />
      )}

      <div className="circle-divider" />

      {/* Discussions */}
      {isMember ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 className="circle-section-heading" style={{ marginBottom: 0 }}>Discussions</h2>
            <button onClick={() => setShowNewDiscussion(!showNewDiscussion)} className="circle-btn" style={{ fontSize: "0.8125rem", padding: "0.3rem 0.875rem" }}>
              {showNewDiscussion ? "Cancel" : "+ New Discussion"}
            </button>
          </div>

          {showNewDiscussion && (
            <CreateDiscussionForm
              circleId={circle.id}
              circleSlug={circle.slug}
              canCreatePrompt={canModerate}
              onCreated={() => {
                setShowNewDiscussion(false);
                fetchDiscussions();
              }}
            />
          )}

          {loadingDiscussions ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic", fontSize: "0.875rem" }}>Loading discussions...</p>
          ) : discussions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
              <p style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontSize: "1.0625rem", fontStyle: "italic", color: "var(--foreground)", marginBottom: "0.5rem" }}>
                This circle is waiting for its first voice
              </p>
              <p style={{ fontSize: "0.8125rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
                {circle.category === "writing_craft" ? "Try: \"What are you working on right now?\"" :
                 circle.category === "reading_books" ? "Try: \"What are you reading this month?\"" :
                 circle.category === "creative_arts" ? "Try: \"Share something you created recently\"" :
                 "Try: \"Introduce yourself to the circle\""}
              </p>
              <button onClick={() => setShowNewDiscussion(true)} className="circle-btn" style={{ fontSize: "0.8125rem" }}>
                Start the First Discussion
              </button>
            </div>
          ) : (
            <div>
              {discussions.map((d) => (
                <DiscussionCard key={d.id} discussion={d} circleSlug={circle.slug} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: "1.5rem 0" }}>
          {circle.discussion_preview && circle.discussion_preview.length > 0 ? (
            <>
              <h2 className="circle-section-heading">Recent Discussions</h2>
              <div style={{ marginBottom: "1.5rem" }}>
                {circle.discussion_preview.map((d) => (
                  <div key={d.id} className="circle-preview-item">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap" }}>
                      {d.is_prompt && <span className="circle-prompt-label">Circle Prompt</span>}
                      <span style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontSize: "0.9375rem", fontWeight: 600, color: "var(--foreground)" }}>
                        {d.title}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                      {d.author_name && <span>{d.author_name} · </span>}
                      {d.response_count} response{d.response_count !== 1 ? "s" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "1rem 0", marginBottom: "1rem" }}>
              <p style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontSize: "1rem", fontStyle: "italic", color: "var(--muted)" }}>
                Be one of the first to start a conversation
              </p>
            </div>
          )}

          <div style={{ textAlign: "center", padding: "1rem 0", borderTop: "1px solid var(--border)" }}>
            <p style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontSize: "1.0625rem", fontStyle: "italic", color: "var(--foreground)", marginBottom: "0.375rem" }}>
              Join to discuss, share feedback, and connect with fellow writers
            </p>
            <p style={{ fontSize: "0.8125rem", color: "var(--muted)", marginBottom: "1rem" }}>
              All voices are equal — no upvotes, no karma, just conversation
            </p>
            {isLoggedIn ? (
              <button onClick={handleJoin} disabled={joining} className="circle-btn" style={{ fontSize: "0.9375rem", padding: "0.5rem 1.5rem" }}>
                {joining ? "Joining..." : "Join This Circle"}
              </button>
            ) : (
              <a href="/get-started" className="circle-btn" style={{ textDecoration: "none", display: "inline-flex", fontSize: "0.9375rem", padding: "0.5rem 1.5rem" }}>
                Join Inkwell to participate
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
