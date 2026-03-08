"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import ResponseCard from "./response-card";
import CircleResponseForm from "./circle-response-form";

interface Discussion {
  id: string;
  title: string;
  body: string;
  is_prompt: boolean;
  is_pinned: boolean;
  is_locked: boolean;
  response_count: number;
  inserted_at: string;
  circle_id: string;
  circle?: { id: string; name: string; slug: string };
  author: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
}

interface Response {
  id: string;
  body: string;
  edited_at: string | null;
  inserted_at: string;
  discussion_id: string;
  author: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
}

export default function DiscussionDetailClient({
  discussion,
  circleSlug,
  currentUserId,
}: {
  discussion: Discussion;
  circleSlug: string;
  currentUserId: string;
}) {
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchResponses = useCallback(async () => {
    try {
      const res = await fetch(`/api/circles/discussions/${discussion.id}/responses`);
      if (res.ok) {
        const data = await res.json();
        setResponses(data.data || []);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [discussion.id]);

  useEffect(() => {
    fetchResponses();
  }, [fetchResponses]);

  const handleDelete = async (responseId: string) => {
    if (!confirm("Delete this response?")) return;
    try {
      const res = await fetch(`/api/circles/responses/${responseId}`, { method: "DELETE" });
      if (res.ok) {
        setResponses((prev) => prev.filter((r) => r.id !== responseId));
      }
    } catch {
      // ignore
    }
  };

  const d = discussion;
  const date = new Date(d.inserted_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <>
      {/* Back link */}
      <Link href={`/circles/${circleSlug}`} style={{ fontSize: "0.8125rem", color: "var(--accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.25rem", marginBottom: "1rem" }}>
        ← Back to Circle
      </Link>

      {/* Discussion header */}
      <div className={d.is_prompt ? "circle-prompt" : ""} style={{ marginBottom: "1.5rem", ...(!d.is_prompt ? {} : {}) }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
          {d.is_prompt && <span className="circle-prompt-label">Circle Prompt</span>}
          {d.is_pinned && <span style={{ fontSize: "0.6875rem", color: "var(--muted)" }}>📌 Pinned</span>}
          {d.is_locked && <span className="circle-locked-badge">🔒 Locked</span>}
        </div>

        <h1 style={{
          fontFamily: "var(--font-lora, Georgia, serif)",
          fontSize: "1.5rem",
          fontWeight: 600,
          color: "var(--foreground)",
          lineHeight: 1.3,
          margin: "0.25rem 0 0.75rem",
        }}>
          {d.title}
        </h1>

        {d.author && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            {d.author.avatar_url && (
              <img src={d.author.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
            )}
            <div>
              <Link href={`/${d.author.username}`} style={{ fontSize: "0.8125rem", color: "var(--foreground)", fontWeight: 500, textDecoration: "none" }}>
                {d.author.display_name || d.author.username}
              </Link>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)", marginLeft: "0.5rem" }}>{date}</span>
            </div>
          </div>
        )}

        <div className="prose-discussion" dangerouslySetInnerHTML={{ __html: d.body }} />
      </div>

      <div className="circle-divider" />

      {/* Responses */}
      <h2 className="circle-section-heading">
        {responses.length} Response{responses.length !== 1 ? "s" : ""}
      </h2>

      {loading ? (
        <p style={{ color: "var(--muted)", fontStyle: "italic", fontSize: "0.875rem" }}>Loading responses...</p>
      ) : responses.length === 0 ? (
        <p style={{ color: "var(--muted)", fontStyle: "italic", fontSize: "0.875rem", fontFamily: "var(--font-lora, Georgia, serif)" }}>
          {d.is_locked ? "This discussion is locked" : "Be the first to respond"}
        </p>
      ) : (
        <div>
          {responses.map((r) => (
            <ResponseCard
              key={r.id}
              response={r}
              currentUserId={currentUserId}
              onDelete={() => handleDelete(r.id)}
            />
          ))}
        </div>
      )}

      {/* Response form */}
      {d.is_locked ? (
        <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--muted)", fontSize: "0.875rem", fontStyle: "italic", marginTop: "1rem" }}>
          This discussion is locked — no new responses
        </div>
      ) : (
        <div style={{ marginTop: "1.5rem" }}>
          <CircleResponseForm
            discussionId={d.id}
            onSubmitted={fetchResponses}
          />
        </div>
      )}
    </>
  );
}
