"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { STAMP_CONFIG } from "@/components/stamp-config";

interface RemoteActor {
  username: string;
  domain: string;
  display_name: string;
  avatar_url: string | null;
  profile_url: string | null;
  ap_id: string | null;
}

interface Notification {
  id: string;
  type: string;
  read: boolean;
  inserted_at: string;
  target_type: string | null;
  target_id: string | null;
  actor: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  remote_actor?: RemoteActor | null;
  data?: Record<string, unknown>;
  entry?: {
    slug: string;
    title: string | null;
    user: { username: string };
  } | null;
}

// ─── Time formatting ───────────────────────────────────────────
function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ─── Date grouping ─────────────────────────────────────────────
function getDateGroup(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekAgo) return "This week";
  return "Earlier";
}

function groupByDate(
  notifications: Notification[]
): { label: string; items: Notification[] }[] {
  const groups: { label: string; items: Notification[] }[] = [];
  let currentLabel: string | null = null;

  for (const n of notifications) {
    const label = getDateGroup(n.inserted_at);
    if (label !== currentLabel) {
      groups.push({ label, items: [] });
      currentLabel = label;
    }
    groups[groups.length - 1].items.push(n);
  }

  return groups;
}

// ─── Notification text ─────────────────────────────────────────
function notificationText(n: Notification): string {
  switch (n.type) {
    case "follow_request":
      return n.read
        ? "requested to be your pen pal"
        : "wants to be your pen pal";
    case "follow_accepted":
      return "accepted your pen pal request";
    case "comment_added":
    case "comment":
      return "commented on your entry";
    case "mention":
      return "mentioned you in a comment";
    case "like":
      return "liked your entry";
    case "stamp": {
      const stampType = n.data?.stamp_type as string | undefined;
      const stampInfo = stampType ? STAMP_CONFIG[stampType] : null;
      if (stampInfo) {
        return `stamped your entry \u2014 \u201C${stampInfo.description}\u201D`;
      }
      return "stamped your entry";
    }
    case "feedback_status_change": {
      const status = n.data?.new_status as string | undefined;
      const labels: Record<string, string> = {
        under_review: "under review",
        planned: "planned",
        in_progress: "in progress",
        done: "shipped",
        declined: "declined",
      };
      const label = status ? labels[status] || status : "updated";
      return `marked your feedback as ${label}`;
    }
    case "feedback_comment":
      return "commented on your feedback post";
    case "feedback_vote":
      return "upvoted your feedback post";
    case "letter":
      return "sent you a letter";
    case "tip": {
      const amountCents = n.data?.amount_cents as number | undefined;
      const amt = amountCents ? `$${(amountCents / 100).toFixed(2)}` : "";
      const tipMsg = n.data?.message as string | undefined;
      return `sent you ${amt ? amt + " in " : ""}postage${tipMsg ? ` \u2014 "${tipMsg}"` : ""}`;
    }
    default:
      return "interacted with your content";
  }
}

// ─── Notification icons ────────────────────────────────────────
function NotificationIcon({
  type,
  data,
}: {
  type: string;
  data?: Record<string, unknown>;
}) {
  if (type === "stamp") {
    const stampType = data?.stamp_type as string | undefined;
    const stampInfo = stampType ? STAMP_CONFIG[stampType] : null;
    if (stampInfo) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stampInfo.icon}
          alt={stampInfo.label}
          width={16}
          height={16}
          style={{ opacity: 0.85 }}
        />
      );
    }
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--accent)" }}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    );
  }
  if (type === "like") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ color: "#e74c3c" }}
        aria-hidden="true"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    );
  }
  if (type === "comment" || type === "comment_added") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--accent)" }}
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  if (type === "mention") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--accent)" }}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
      </svg>
    );
  }
  if (type === "follow_request") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--accent)" }}
        aria-hidden="true"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <line x1="20" y1="8" x2="20" y2="14" />
        <line x1="23" y1="11" x2="17" y2="11" />
      </svg>
    );
  }
  if (type === "follow_accepted") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--accent)" }}
        aria-hidden="true"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <polyline points="17 11 19 13 23 9" />
      </svg>
    );
  }
  if (type === "letter") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--accent)" }}
        aria-hidden="true"
      >
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
      </svg>
    );
  }
  if (type === "tip") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--accent)" }}
        aria-hidden="true"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        <line x1="12" y1="10" x2="12" y2="16"/>
        <line x1="9" y1="13" x2="15" y2="13"/>
      </svg>
    );
  }
  if (
    type === "feedback_status_change" ||
    type === "feedback_comment" ||
    type === "feedback_vote"
  ) {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--accent)" }}
        aria-hidden="true"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    );
  }
  return null;
}

// ─── Helpers ───────────────────────────────────────────────────
function getEntryHref(n: Notification): string | null {
  if (n.entry) return `/${n.entry.user.username}/${n.entry.slug}`;
  return null;
}

function getActorInfo(n: Notification) {
  if (n.actor) {
    return {
      displayName: n.actor.display_name,
      avatarUrl: n.actor.avatar_url,
      href: `/${n.actor.username}`,
      isRemote: false,
      handle: null,
    };
  }
  if (n.remote_actor) {
    return {
      displayName: n.remote_actor.display_name || n.remote_actor.username,
      avatarUrl: n.remote_actor.avatar_url,
      href: n.remote_actor.profile_url,
      isRemote: true,
      handle: `@${n.remote_actor.username}@${n.remote_actor.domain}`,
    };
  }
  return {
    displayName: "Someone",
    avatarUrl: null,
    href: null,
    isRemote: false,
    handle: null,
  };
}

function getNotificationHref(n: Notification): string | null {
  // Postage notifications link to the postage history page
  if (n.type === "tip") {
    return "/settings/support/postage";
  }
  // Letter notifications link to the conversation thread
  if (n.type === "letter" && n.data?.conversation_id) {
    return `/letters/${n.data.conversation_id}`;
  }
  // Feedback notifications link to the roadmap post
  if (
    (n.type === "feedback_status_change" ||
      n.type === "feedback_comment" ||
      n.type === "feedback_vote") &&
    n.data?.post_id
  ) {
    return `/roadmap/${n.data.post_id}`;
  }
  const entryHref = getEntryHref(n);
  if (entryHref) return entryHref;
  if (
    (n.type === "follow_request" || n.type === "follow_accepted") &&
    n.actor
  ) {
    return `/${n.actor.username}`;
  }
  if (n.remote_actor?.profile_url) return n.remote_actor.profile_url;
  return null;
}

// ─── Server sync ───────────────────────────────────────────────
function markAsReadOnServer(ids: string[]): Promise<void> {
  if (ids.length === 0) return Promise.resolve();
  return fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
    .then(() => {})
    .catch(() => {});
}

// ─── Accept/Reject inline ──────────────────────────────────────
function AcceptRejectInline({
  username,
  notificationId,
  onAction,
}: {
  username: string;
  notificationId: string;
  onAction: (id: string) => void;
}) {
  const [state, setState] = useState<
    "idle" | "loading" | "accepted" | "declined"
  >("idle");

  async function handleAccept(e: React.MouseEvent) {
    e.stopPropagation();
    setState("loading");
    try {
      const res = await fetch(`/api/follow/${username}/accept`, {
        method: "POST",
      });
      if (res.ok) {
        setState("accepted");
        onAction(notificationId);
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  async function handleDecline(e: React.MouseEvent) {
    e.stopPropagation();
    setState("loading");
    try {
      const res = await fetch(`/api/follow/${username}/reject`, {
        method: "DELETE",
      });
      if (res.ok) {
        setState("declined");
        onAction(notificationId);
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  if (state === "accepted") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium mt-2 px-3 py-1 rounded-full"
        style={{ background: "var(--accent-light)", color: "var(--accent)" }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Accepted
      </span>
    );
  }
  if (state === "declined") {
    return (
      <span
        className="text-xs mt-2 inline-block"
        style={{ color: "var(--muted)" }}
      >
        Declined
      </span>
    );
  }

  return (
    <div className="flex gap-2 mt-2">
      <button
        onClick={handleAccept}
        disabled={state === "loading"}
        className="text-xs px-4 py-1.5 rounded-full font-medium transition-opacity disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        {state === "loading" ? "..." : "Accept"}
      </button>
      <button
        onClick={handleDecline}
        disabled={state === "loading"}
        className="text-xs px-4 py-1.5 rounded-full font-medium border transition-colors disabled:opacity-50"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        Decline
      </button>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────
export function NotificationList({
  initialNotifications,
}: {
  initialNotifications: Notification[];
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const groups = useMemo(() => groupByDate(notifications), [notifications]);

  const markOneRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  function handleRowClick(n: Notification) {
    if (!n.read) {
      markOneRead(n.id);
      markAsReadOnServer([n.id]).then(() => router.refresh());
    }
    const href = getNotificationHref(n);
    if (href) {
      if (n.remote_actor && !n.actor) {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        router.push(href);
      }
    }
  }

  function handleFollowAction(notificationId: string) {
    markOneRead(notificationId);
    markAsReadOnServer([notificationId]).then(() => router.refresh());
  }

  async function handleMarkAllRead() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setMarkingAll(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds }),
      });
      router.refresh();
    } finally {
      setMarkingAll(false);
    }
  }

  function handleMarkOneReadOnly(id: string) {
    markOneRead(id);
    markAsReadOnServer([id]).then(() => router.refresh());
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Notifications
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              {unreadCount} unread
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="text-xs font-medium hover:underline disabled:opacity-50 pb-0.5"
            style={{ color: "var(--accent)" }}
          >
            {markingAll ? "Marking..." : "Mark all read"}
          </button>
        )}
      </div>

      {/* Empty state */}
      {notifications.length === 0 ? (
        <div
          className="rounded-2xl border p-16 text-center"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto mb-4"
            style={{ color: "var(--muted)", opacity: 0.4 }}
            aria-hidden="true"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <p
            className="text-lg font-semibold mb-2"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Nothing here yet
          </p>
          <p
            className="text-sm max-w-xs mx-auto"
            style={{ color: "var(--muted)" }}
          >
            When pen pals interact with your journal, updates will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <h2
                className="text-xs font-semibold uppercase tracking-wider mb-3 px-1"
                style={{ color: "var(--muted)" }}
              >
                {group.label}
              </h2>
              <div
                className="rounded-2xl border overflow-hidden"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                }}
              >
                {group.items.map((n, i) => {
                  const actor = getActorInfo(n);
                  const entryHref = getEntryHref(n);
                  const isClickable = !!getNotificationHref(n);
                  // Only show accept/reject for UNREAD follow requests
                  const isPendingFollowRequest =
                    n.type === "follow_request" && !!n.actor && !n.read;

                  return (
                    <div
                      key={n.id}
                      role={isClickable ? "button" : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                      onClick={() => {
                        if (!isPendingFollowRequest) handleRowClick(n);
                      }}
                      onKeyDown={(e) => {
                        if (
                          (e.key === "Enter" || e.key === " ") &&
                          !isPendingFollowRequest
                        ) {
                          e.preventDefault();
                          handleRowClick(n);
                        }
                      }}
                      className={`flex items-start gap-2 sm:gap-3 px-3 sm:px-5 py-3 sm:py-4 transition-colors ${
                        i < group.items.length - 1 ? "border-b" : ""
                      } ${isClickable && !isPendingFollowRequest ? "cursor-pointer hover:brightness-95" : ""}`}
                      style={{
                        borderColor: "var(--border)",
                        background: n.read ? undefined : "var(--accent-light)",
                      }}
                    >
                      {/* Avatar */}
                      {actor.href ? (
                        <a
                          href={actor.href}
                          className="flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                          {...(actor.isRemote
                            ? { target: "_blank", rel: "noopener noreferrer" }
                            : {})}
                        >
                          <Avatar
                            url={actor.avatarUrl}
                            name={actor.displayName}
                            size={36}
                          />
                        </a>
                      ) : (
                        <div
                          className="w-9 h-9 rounded-full flex-shrink-0"
                          style={{ background: "var(--surface-hover)" }}
                        />
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm flex items-center gap-1.5 flex-wrap">
                          <NotificationIcon type={n.type} data={n.data} />
                          {actor.href ? (
                            <a
                              href={actor.href}
                              className="font-medium hover:underline"
                              onClick={(e) => e.stopPropagation()}
                              {...(actor.isRemote
                                ? {
                                    target: "_blank",
                                    rel: "noopener noreferrer",
                                  }
                                : {})}
                            >
                              {actor.displayName}
                            </a>
                          ) : (
                            <span className="font-medium">
                              {actor.displayName}
                            </span>
                          )}
                          {actor.handle && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded-full border"
                              style={{
                                borderColor: "var(--border)",
                                color: "var(--muted)",
                                fontSize: "0.6rem",
                              }}
                            >
                              {actor.handle}
                            </span>
                          )}
                          <span style={{ color: "var(--muted)" }}>
                            {notificationText(n)}
                          </span>
                        </p>

                        {/* Entry link */}
                        {entryHref && n.entry && (
                          <a
                            href={entryHref}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs mt-1 inline-block hover:underline truncate max-w-[200px] sm:max-w-[300px]"
                            style={{ color: "var(--accent)" }}
                          >
                            {n.entry.title || "Untitled entry"} {"\u2192"}
                          </a>
                        )}
                        {/* Feedback post link */}
                        {!!n.data?.post_title &&
                          (n.type === "feedback_status_change" ||
                            n.type === "feedback_comment" ||
                            n.type === "feedback_vote") && (
                            <a
                              href={`/roadmap/${n.data.post_id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs mt-1 inline-block hover:underline truncate max-w-[200px] sm:max-w-[300px]"
                              style={{ color: "var(--accent)" }}
                            >
                              {String(n.data.post_title)} {"\u2192"}
                            </a>
                          )}

                        <p
                          className="text-xs mt-0.5"
                          style={{ color: "var(--muted)" }}
                        >
                          {timeAgo(n.inserted_at)}
                        </p>

                        {/* Follow request actions — only for unread requests */}
                        {isPendingFollowRequest && (
                          <AcceptRejectInline
                            username={n.actor!.username}
                            notificationId={n.id}
                            onAction={handleFollowAction}
                          />
                        )}
                      </div>

                      {/* Unread dot */}
                      {!n.read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkOneReadOnly(n.id);
                          }}
                          className="mt-1 flex-shrink-0 group relative"
                          title="Mark as read"
                          aria-label="Mark as read"
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-125"
                            style={{ background: "var(--accent)" }}
                          />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
