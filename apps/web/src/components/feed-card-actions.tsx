"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { StampPicker } from "@/components/stamp-picker";
import { BookmarkButton } from "@/components/bookmark-button";
import { InkButton } from "@/components/ink-button";
import { FloatingPopup } from "@/components/floating-popup";
import { ReportModal } from "@/components/report-modal";
import { ShareButton } from "@/components/share-button";
import { TranslateButton } from "@/components/translate-button";
import { CommentEditor } from "@/components/comment-editor";
import { CommentNode } from "@/app/[username]/[slug]/comment-node";
import { buildThreadTree, countThreadComments, timeAgo } from "@/lib/comment-utils";
import type { Comment, CommentThread } from "@/lib/comment-utils";

interface FeedComment {
  id: string;
  entry_id: string;
  user_id: string | null;
  body_html: string;
  created_at: string;
  edited_at: string | null;
  parent_comment_id: string | null;
  depth: number;
  author: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    avatar_frame?: string | null;
    subscription_tier?: string | null;
  } | null;
  remote_author?: {
    username: string;
    domain: string;
    display_name: string | null;
    avatar_url: string | null;
    profile_url: string | null;
    ap_id: string;
  } | null;
}

interface FeedCardActionsProps {
  entryId: string;
  entryHref: string;
  commentCount: number;
  stamps: string[];
  myStamp: string | null;
  bookmarked: boolean;
  inkCount?: number;
  myInk?: boolean;
  isOwnEntry: boolean;
  isLoggedIn: boolean;
  isPlus: boolean;
  /** Override API paths for remote entries */
  stampApiPath?: string;
  commentApiPath?: string;
  bookmarkApiPath?: string;
  /** External URL for "View on {domain}" link */
  externalUrl?: string;
  externalDomain?: string;
  /** Override API path for remote entry inks */
  inkApiPath?: string;
  /** Whether this is a federated/remote entry */
  isRemote?: boolean;
  /** Entry title for share text */
  entryTitle?: string | null;
  /** Entry author username for share text */
  entryAuthorUsername?: string;
  /** User's preferred translation language */
  preferredLanguage?: string | null;
  /** Session user info for comment interactions (reply/edit/delete) */
  sessionUser?: { id: string; username: string; is_admin?: boolean } | null;
  onStampsChange?: (stamps: string[]) => void;
  onBookmarkChange?: (bookmarked: boolean) => void;
  onTranslation?: (translation: { translated_title: string | null; translated_body: string; source_language: string } | null) => void;
}

/* Shared popup/sheet content for both desktop and mobile */
function CommentPopupContent({
  commentsLoaded,
  comments,
  isRemote,
  isLoggedIn,
  entryHref,
  entryId,
  commentsPath,
  submitting,
  sessionUser,
  onSubmit,
  onReloadComments,
  onClose,
}: {
  commentsLoaded: boolean;
  comments: FeedComment[];
  isRemote: boolean;
  isLoggedIn: boolean;
  entryHref: string;
  entryId: string;
  commentsPath: string;
  submitting: boolean;
  sessionUser?: { id: string; username: string; is_admin?: boolean } | null;
  onSubmit: (html: string, parentCommentId?: string) => void;
  onReloadComments: () => void;
  onClose: () => void;
}) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(new Set());

  const threads = buildThreadTree(comments as Comment[]);
  const totalCount = countThreadComments(threads);

  const session = sessionUser ? { user: { id: sessionUser.id, username: sessionUser.username, is_admin: sessionUser.is_admin } } : null;

  const handleReply = useCallback((commentId: string | null) => {
    setReplyingTo((prev) => (prev === commentId ? null : commentId));
  }, []);

  const toggleCollapse = useCallback((commentId: string) => {
    setCollapsedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  }, []);

  const handleEdit = useCallback(async (commentId: string, html: string) => {
    const res = await fetch(`/api/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body_html: html }),
    });
    if (res.ok) {
      onReloadComments();
      return true;
    }
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to save");
  }, [onReloadComments]);

  const handleDelete = useCallback(async (commentId: string) => {
    if (!confirm("Delete this comment?")) return;
    await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
    onReloadComments();
  }, [onReloadComments]);

  return (
    <>
      {/* Header */}
      <div
        className="comment-popup-header flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <span
          className="text-xs"
          style={{
            color: "var(--foreground)",
            fontFamily: "var(--font-lora, Georgia, serif)",
            fontStyle: "italic",
            fontWeight: 600,
          }}
        >
          Marginalia
          {isRemote && (
            <span
              className="ml-1.5 font-normal text-[10px]"
              style={{ color: "var(--muted)", fontStyle: "normal" }}
            >
              federated
            </span>
          )}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[10px]" style={{ color: "var(--muted)" }}>
            {totalCount} {totalCount === 1 ? "note" : "notes"}
          </span>
          {!isRemote && (
            <Link
              href={`${entryHref}#comments`}
              className="text-[11px] hover:underline"
              style={{
                color: "var(--accent)",
                fontFamily: "var(--font-lora, Georgia, serif)",
                fontStyle: "italic",
              }}
              onClick={onClose}
            >
              View all →
            </Link>
          )}
        </div>
      </div>

      {/* Comments list */}
      <div
        className="comment-popup-threads overflow-y-auto px-3 py-2.5"
        style={{ maxHeight: "min(320px, 50vh)" }}
      >
        {!commentsLoaded ? (
          <p
            className="text-xs py-6 text-center"
            style={{
              color: "var(--muted)",
              fontFamily: "var(--font-lora, Georgia, serif)",
              fontStyle: "italic",
            }}
          >
            Loading…
          </p>
        ) : threads.length === 0 ? (
          <p
            className="text-xs py-6 text-center"
            style={{
              color: "var(--muted)",
              fontFamily: "var(--font-lora, Georgia, serif)",
              fontStyle: "italic",
            }}
          >
            No marginalia yet. Be the first to annotate.
          </p>
        ) : (
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
                onSubmitReply={(html, parentId) => {
                  onSubmit(html, parentId);
                  setReplyingTo(null);
                }}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Root comment editor */}
      {isLoggedIn ? (
        <div className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
          <CommentEditor
            onSubmit={(html) => onSubmit(html)}
            placeholder="Write in the margins…"
            compact
            maxLength={2000}
            disabled={submitting}
          />
        </div>
      ) : (
        <div
          className="border-t px-4 py-3 text-center"
          style={{ borderColor: "var(--border)" }}
        >
          <a
            href="/get-started"
            className="text-xs hover:underline"
            style={{
              color: "var(--accent)",
              fontFamily: "var(--font-lora, Georgia, serif)",
              fontStyle: "italic",
            }}
          >
            Join Inkwell
          </a>{" "}
          <span
            className="text-xs"
            style={{
              color: "var(--muted)",
              fontFamily: "var(--font-lora, Georgia, serif)",
              fontStyle: "italic",
            }}
          >
            to leave a note.
          </span>
        </div>
      )}
    </>
  );
}

export function FeedCardActions({
  entryId,
  entryHref,
  commentCount: initialCommentCount,
  stamps: initialStamps,
  myStamp: initialMyStamp,
  bookmarked,
  isOwnEntry,
  isLoggedIn,
  isPlus,
  inkCount = 0,
  myInk = false,
  stampApiPath,
  commentApiPath,
  bookmarkApiPath,
  externalUrl,
  externalDomain,
  inkApiPath,
  isRemote = false,
  entryTitle,
  entryAuthorUsername,
  preferredLanguage,
  sessionUser,
  onStampsChange,
  onBookmarkChange,
  onTranslation,
}: FeedCardActionsProps) {
  const [commentPopupOpen, setCommentPopupOpen] = useState(false);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [stamps, setStamps] = useState(initialStamps);
  const [reportOpen, setReportOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const commentBtnRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);

  const commentsPath = commentApiPath ?? `/api/entries/${entryId}/comments`;

  // Detect mobile for bottom sheet
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(commentsPath);
      if (res.ok) {
        const { data } = await res.json();
        setComments(data ?? []);
        setCommentsLoaded(true);
      }
    } catch {
      // silent fail
    }
  }, [commentsPath]);

  function handleCommentToggle() {
    if (!commentPopupOpen) {
      if (!commentsLoaded) loadComments();
    }
    setCommentPopupOpen(!commentPopupOpen);
  }

  async function handleSubmitComment(html: string, parentCommentId?: string) {
    if (submittingRef.current || !isLoggedIn) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const body: Record<string, string> = { body_html: html };
      if (parentCommentId) body.parent_comment_id = parentCommentId;

      const res = await fetch(commentsPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setCommentCount((c) => c + 1);
        await loadComments();
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleStampChange(newStamps: string[], _newMyStamp: string | null) {
    setStamps(newStamps);
    onStampsChange?.(newStamps);
  }

  return (
    <div
      className="flex items-center justify-between px-4 sm:px-5 lg:px-6 py-2.5 border-t relative"
      style={{ borderColor: "var(--border)" }}
    >
      {/* Left: view on original instance (remote only) or spacer */}
      {externalUrl ? (
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium transition-colors hover:underline"
          style={{ color: "var(--accent)" }}
        >
          {externalDomain ? `View on ${externalDomain}` : "View original"} &rarr;
        </a>
      ) : (
        <span />
      )}

      {/* Right: Comment + Stamp actions */}
      <div className="flex items-center gap-4">
        {/* Comment button + popup */}
        <div>
          <button
            ref={commentBtnRef}
            onClick={handleCommentToggle}
            className="flex items-center gap-1.5 text-sm transition-colors cursor-pointer hover:opacity-80"
            style={{ color: "var(--muted)" }}
            title="Comments"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>{commentCount}</span>
          </button>

          {/* Comment popup/sheet — Marginalia design */}
          {commentPopupOpen && isMobile
            ? /* Mobile: bottom sheet via portal */
              createPortal(
                <>
                  {/* Backdrop */}
                  <div
                    className="comment-sheet-backdrop"
                    onClick={() => setCommentPopupOpen(false)}
                  />
                  {/* Sheet */}
                  <div className="comment-sheet">
                    {/* Drag handle */}
                    <div className="comment-sheet-handle">
                      <div className="comment-sheet-handle-bar" />
                    </div>
                    <CommentPopupContent
                      commentsLoaded={commentsLoaded}
                      comments={comments}
                      isRemote={isRemote}
                      isLoggedIn={isLoggedIn}
                      entryHref={entryHref}
                      entryId={entryId}
                      commentsPath={commentsPath}
                      submitting={submitting}
                      sessionUser={sessionUser}
                      onSubmit={handleSubmitComment}
                      onReloadComments={loadComments}
                      onClose={() => setCommentPopupOpen(false)}
                    />
                  </div>
                </>,
                document.body
              )
            : /* Desktop: FloatingPopup */
              <FloatingPopup
                anchorRef={commentBtnRef}
                open={commentPopupOpen}
                onClose={() => setCommentPopupOpen(false)}
                placement="top"
                className="comment-popup rounded-xl border shadow-lg overflow-hidden"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  width: "min(360px, calc(100vw - 24px))",
                  maxHeight: 480,
                }}
              >
                <CommentPopupContent
                  commentsLoaded={commentsLoaded}
                  comments={comments}
                  isRemote={isRemote}
                  isLoggedIn={isLoggedIn}
                  entryHref={entryHref}
                  entryId={entryId}
                  commentsPath={commentsPath}
                  submitting={submitting}
                  sessionUser={sessionUser}
                  onSubmit={handleSubmitComment}
                  onReloadComments={loadComments}
                  onClose={() => setCommentPopupOpen(false)}
                />
              </FloatingPopup>
          }
        </div>

        {/* Ink button */}
        <InkButton
          entryId={entryId}
          initialInked={myInk}
          initialCount={inkCount}
          isOwnEntry={isOwnEntry}
          isLoggedIn={isLoggedIn}
          apiPath={inkApiPath}
        />

        {/* Stamp button */}
        <StampPicker
          entryId={entryId}
          currentStamp={initialMyStamp}
          isOwnEntry={isOwnEntry}
          isLoggedIn={isLoggedIn}
          isPlus={isPlus}
          compact
          stampApiPath={stampApiPath}
          onStampChange={handleStampChange}
        />

        {/* Bookmark button — not available for federated entries */}
        {!isRemote && (
          <BookmarkButton
            entryId={entryId}
            initialBookmarked={bookmarked}
            isLoggedIn={isLoggedIn}
            bookmarkApiPath={bookmarkApiPath}
            onBookmarkChange={onBookmarkChange}
          />
        )}

        {/* Translate button */}
        {isLoggedIn && (
          <TranslateButton
            type={isRemote ? "remote_entry" : "entry"}
            id={entryId}
            preferredLanguage={preferredLanguage}
            onTranslation={onTranslation}
            size={14}
          />
        )}

        {/* Share button */}
        <ShareButton
          url={externalUrl || `https://inkwell.social${entryHref}`}
          title={entryTitle || "Entry"}
          description={entryTitle ? `"${entryTitle}" on Inkwell` : "A journal entry on Inkwell"}
        />

        {/* Report button — only for other users' non-remote entries */}
        {!isOwnEntry && !isRemote && isLoggedIn && (
          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center transition-opacity hover:opacity-80 cursor-pointer"
            style={{ color: "var(--muted)" }}
            title="Report"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
          </button>
        )}
      </div>

      {/* Report modal */}
      {reportOpen && (
        <ReportModal entryId={entryId} onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}
