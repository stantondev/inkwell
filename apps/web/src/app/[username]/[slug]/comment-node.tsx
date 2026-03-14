"use client";

import { useState } from "react";
import type { CommentThread, Comment } from "@/lib/comment-utils";
import { timeAgo, isWithinEditWindow } from "@/lib/comment-utils";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { CommentEditor } from "@/components/comment-editor";

interface CommentNodeProps {
  thread: CommentThread;
  depth: number;
  session: {
    user: {
      id: string;
      username: string;
      is_admin?: boolean;
    };
  } | null;
  replyingTo: string | null;
  collapsedThreads: Set<string>;
  onReply: (commentId: string | null) => void;
  onToggleCollapse: (commentId: string) => void;
  onSubmitReply: (html: string, parentCommentId: string) => void;
  onEdit: (commentId: string, html: string) => Promise<boolean>;
  onDelete: (commentId: string) => void;
}

const COLLAPSE_THRESHOLD = 5;
const INITIAL_SHOW = 3;

export function CommentNode({
  thread,
  depth,
  session,
  replyingTo,
  collapsedThreads,
  onReply,
  onToggleCollapse,
  onSubmitReply,
  onEdit,
  onDelete,
}: CommentNodeProps) {
  const { comment, replies } = thread;
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [showAllReplies, setShowAllReplies] = useState(false);

  const isLocal = !!comment.author;
  const isRemote = !isLocal && !!comment.remote_author;
  const displayName = isLocal
    ? comment.author!.display_name || comment.author!.username
    : isRemote
      ? comment.remote_author!.display_name || comment.remote_author!.username
      : "Anonymous";
  const avatarUrl = isLocal
    ? comment.author!.avatar_url
    : isRemote
      ? comment.remote_author!.avatar_url
      : null;
  const profileHref = isLocal
    ? `/${comment.author!.username}`
    : isRemote && comment.remote_author!.profile_url
      ? comment.remote_author!.profile_url
      : null;
  const avatarFrame = isLocal ? comment.author?.avatar_frame : null;
  const subscriptionTier = isLocal ? comment.author?.subscription_tier : undefined;

  const canEdit =
    !!session &&
    isLocal &&
    session.user.id === comment.author?.id &&
    isWithinEditWindow(comment.created_at);
  const canDelete =
    !!session &&
    (session.user.username === comment.author?.username || !!session.user.is_admin);
  const canReply = !!session && !isRemote;

  const isCollapsed = collapsedThreads.has(comment.id);
  const needsCollapse = replies.length >= COLLAPSE_THRESHOLD;
  const visibleReplies =
    needsCollapse && !showAllReplies && !isCollapsed
      ? replies.slice(0, INITIAL_SHOW)
      : replies;
  const hiddenCount = replies.length - INITIAL_SHOW;

  async function handleEditSave(html: string) {
    setEditError("");
    try {
      await onEdit(comment.id, html);
      setEditing(false);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <div
      className={`comment-thread ${depth > 0 ? "comment-thread-nested" : ""}`}
      data-depth={depth}
    >
      <div className="comment-node">
        {/* Thread connector line */}
        {replies.length > 0 && !isCollapsed && (
          <button
            className="comment-connector"
            onClick={() => onToggleCollapse(comment.id)}
            title="Collapse thread"
            aria-label="Collapse thread"
          />
        )}

        {/* Avatar */}
        <div className="comment-avatar">
          {profileHref ? (
            <a
              href={profileHref}
              {...(isRemote ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              <AvatarWithFrame
                url={avatarUrl}
                name={displayName}
                size={28}
                frame={avatarFrame}
                subscriptionTier={subscriptionTier || undefined}
              />
            </a>
          ) : (
            <AvatarWithFrame url={avatarUrl} name={displayName} size={28} />
          )}
        </div>

        {/* Content */}
        <div className="comment-body">
          {/* Meta: author + timestamp */}
          <div className="comment-meta">
            {profileHref ? (
              <a
                href={profileHref}
                className="comment-author-name"
                {...(isRemote ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {displayName}
              </a>
            ) : (
              <span className="comment-author-name comment-author-anonymous">
                {displayName}
              </span>
            )}
            {isRemote && comment.remote_author && (
              <span className="comment-fediverse-badge">
                @{comment.remote_author.username}@{comment.remote_author.domain}
              </span>
            )}
            <span className="comment-timestamp">{timeAgo(comment.created_at)}</span>
            {comment.edited_at && (
              <span
                className="comment-edited"
                title={`Edited ${new Date(comment.edited_at).toLocaleString()}`}
              >
                (edited)
              </span>
            )}
          </div>

          {/* Comment body or edit form */}
          {editing ? (
            <div className="comment-edit-form">
              <CommentEditor
                onSubmit={handleEditSave}
                initialContent={comment.body_html}
                compact
                autoFocus
                submitLabel="Save"
                maxLength={2000}
              />
              <div className="comment-edit-actions">
                <button
                  className="comment-action-link"
                  onClick={() => {
                    setEditing(false);
                    setEditError("");
                  }}
                >
                  Cancel
                </button>
                {editError && (
                  <span className="comment-edit-error">{editError}</span>
                )}
              </div>
            </div>
          ) : (
            <div
              className="prose-comment"
              dangerouslySetInnerHTML={{ __html: comment.body_html }}
            />
          )}

          {/* Actions row */}
          {!editing && (
            <div className="comment-actions">
              {canReply && (
                <button
                  className="comment-action-link"
                  onClick={() => onReply(comment.id)}
                >
                  Reply
                </button>
              )}
              {canEdit && (
                <button
                  className="comment-action-link"
                  onClick={() => setEditing(true)}
                >
                  Edit
                </button>
              )}
              {canDelete && (
                <button
                  className="comment-action-link comment-action-delete"
                  onClick={() => onDelete(comment.id)}
                >
                  Delete
                </button>
              )}
            </div>
          )}

          {/* Inline reply editor */}
          {replyingTo === comment.id && (
            <div className="comment-reply-form">
              <CommentEditor
                onSubmit={(html) => onSubmitReply(html, comment.id)}
                placeholder={`Reply to ${displayName}…`}
                compact
                autoFocus
                maxLength={2000}
              />
              <button
                className="comment-action-link"
                onClick={() => onReply(null)}
                style={{ marginTop: "4px" }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Collapsed indicator */}
      {isCollapsed && replies.length > 0 && (
        <button
          className="comment-show-more"
          onClick={() => onToggleCollapse(comment.id)}
        >
          Show {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </button>
      )}

      {/* Replies */}
      {!isCollapsed && visibleReplies.length > 0 && (
        <div className="comment-replies">
          {visibleReplies.map((reply) => (
            <CommentNode
              key={reply.comment.id}
              thread={reply}
              depth={depth + 1}
              session={session}
              replyingTo={replyingTo}
              collapsedThreads={collapsedThreads}
              onReply={onReply}
              onToggleCollapse={onToggleCollapse}
              onSubmitReply={onSubmitReply}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
          {needsCollapse && !showAllReplies && hiddenCount > 0 && (
            <button
              className="comment-show-more"
              onClick={() => setShowAllReplies(true)}
            >
              Show {hiddenCount} more {hiddenCount === 1 ? "reply" : "replies"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
