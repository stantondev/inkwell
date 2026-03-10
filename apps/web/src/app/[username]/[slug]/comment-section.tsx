"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Comment, CommentThread } from "@/lib/comment-utils";
import { buildThreadTree, countThreadComments } from "@/lib/comment-utils";
import { CommentNode } from "./comment-node";
import { CommentEditor } from "@/components/comment-editor";

interface CommentSectionProps {
  comments: Comment[];
  entryId: string;
  session: {
    user: {
      id: string;
      username: string;
      is_admin?: boolean;
    };
  } | null;
}

export function CommentSection({ comments, entryId, session }: CommentSectionProps) {
  const router = useRouter();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const threads = buildThreadTree(comments);
  const totalCount = countThreadComments(threads);

  const toggleCollapse = useCallback((commentId: string) => {
    setCollapsedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  }, []);

  const handleReply = useCallback((commentId: string | null) => {
    setReplyingTo((prev) => (prev === commentId ? null : commentId));
  }, []);

  const handleSubmitComment = useCallback(
    async (html: string, parentCommentId?: string | null) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);

      try {
        const body: Record<string, string> = { body_html: html };
        if (parentCommentId) body.parent_comment_id = parentCommentId;

        const res = await fetch(`/api/entries/${entryId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          setReplyingTo(null);
          router.refresh();
        }
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [entryId, router],
  );

  const handleEdit = useCallback(
    async (commentId: string, html: string) => {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_html: html }),
      });
      if (res.ok) {
        router.refresh();
        return true;
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to save");
    },
    [router],
  );

  const handleDelete = useCallback(
    async (commentId: string) => {
      if (!confirm("Delete this comment?")) return;
      await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
      router.refresh();
    },
    [router],
  );

  return (
    <section id="comments" className="comment-section entry-wide px-4 sm:px-6 md:px-8 lg:px-12 pb-20">
      {/* Section header */}
      <div className="comment-section-header">
        <div className="comment-section-ornament" />
        <h2 className="comment-section-title">
          Marginalia
          {totalCount > 0 && (
            <span className="comment-section-count">{totalCount}</span>
          )}
        </h2>
      </div>

      {/* Thread list */}
      {threads.length > 0 && (
        <div className="comment-thread-list">
          {threads.map((thread) => (
            <CommentNode
              key={thread.comment.id}
              thread={thread}
              depth={0}
              session={session}
              replyingTo={replyingTo}
              collapsedThreads={collapsedThreads}
              onReply={handleReply}
              onToggleCollapse={toggleCollapse}
              onSubmitReply={(html, parentId) => handleSubmitComment(html, parentId)}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Root comment editor */}
      {session ? (
        <div className="comment-root-editor">
          <CommentEditor
            onSubmit={(html) => handleSubmitComment(html)}
            placeholder="Write in the margins…"
            disabled={submitting}
          />
        </div>
      ) : (
        <div className="comment-login-prompt">
          <a href="/get-started" style={{ color: "var(--accent)" }}>
            Join Inkwell
          </a>{" "}
          to leave a comment.
        </div>
      )}
    </section>
  );
}
