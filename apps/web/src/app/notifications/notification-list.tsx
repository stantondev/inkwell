"use client";

import { useState, useCallback } from "react";
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

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function notificationText(n: Notification): string {
  switch (n.type) {
    case "follow_request": return "wants to be your pen pal";
    case "follow_accepted": return "accepted your pen pal request";
    case "comment_added":
    case "comment": return "commented on your entry";
    case "like": return "liked your entry";
    case "stamp": {
      const stampType = n.data?.stamp_type as string | undefined;
      const stampInfo = stampType ? STAMP_CONFIG[stampType] : null;
      if (stampInfo) {
        return `stamped your entry — "${stampInfo.description}"`;
      }
      return "stamped your entry";
    }
    default: return "did something";
  }
}

function NotificationIcon({ type, data }: { type: string; data?: Record<string, unknown> }) {
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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ color: "var(--accent)" }} aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    );
  }
  if (type === "like") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
        style={{ color: "#e74c3c" }} aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    );
  }
  if (type === "comment" || type === "comment_added") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ color: "var(--accent)" }} aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    );
  }
  if (type === "follow_request" || type === "follow_accepted") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ color: "var(--accent)" }} aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="8.5" cy="7" r="4"/>
        <line x1="20" y1="8" x2="20" y2="14"/>
        <line x1="23" y1="11" x2="17" y2="11"/>
      </svg>
    );
  }
  return null;
}

function getEntryHref(n: Notification): string | null {
  if (n.entry) {
    return `/${n.entry.user.username}/${n.entry.slug}`;
  }
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
  return { displayName: "Someone", avatarUrl: null, href: null, isRemote: false, handle: null };
}

/** Get the primary navigation URL for a notification */
function getNotificationHref(n: Notification): string | null {
  // Entry-linked notifications → go to the entry
  const entryHref = getEntryHref(n);
  if (entryHref) return entryHref;

  // Follow notifications → go to the actor's profile
  if ((n.type === "follow_request" || n.type === "follow_accepted") && n.actor) {
    return `/${n.actor.username}`;
  }

  // Remote actor → their profile URL
  if (n.remote_actor?.profile_url) return n.remote_actor.profile_url;

  return null;
}

// ─── Mark-as-read helper (fire-and-forget) ─────────────────────
function markAsRead(ids: string[]) {
  if (ids.length === 0) return;
  fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  }).catch(() => {
    // Silent failure — notification will still appear unread on next visit
  });
}

// ─── Accept/Reject inline component ────────────────────────────
function AcceptRejectInline({
  username,
  notificationId,
  onAction,
}: {
  username: string;
  notificationId: string;
  onAction: (id: string) => void;
}) {
  const [state, setState] = useState<"idle" | "loading" | "accepted" | "declined">("idle");

  async function handleAccept(e: React.MouseEvent) {
    e.stopPropagation(); // Don't trigger row click
    setState("loading");
    try {
      const res = await fetch(`/api/follow/${username}/accept`, { method: "POST" });
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
      const res = await fetch(`/api/follow/${username}/reject`, { method: "DELETE" });
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
      <span className="text-xs font-medium px-3 py-1 rounded-full"
        style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
        Accepted
      </span>
    );
  }
  if (state === "declined") {
    return (
      <span className="text-xs px-3 py-1 rounded-full" style={{ color: "var(--muted)" }}>
        Declined
      </span>
    );
  }

  return (
    <div className="flex gap-2 mt-2">
      <button onClick={handleAccept} disabled={state === "loading"}
        className="text-xs px-3 py-1 rounded-full font-medium transition-opacity disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#fff" }}>
        {state === "loading" ? "..." : "Accept"}
      </button>
      <button onClick={handleDecline} disabled={state === "loading"}
        className="text-xs px-3 py-1 rounded-full font-medium border transition-colors disabled:opacity-50"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        Decline
      </button>
    </div>
  );
}

// ─── Main list component ───────────────────────────────────────
export function NotificationList({ initialNotifications }: { initialNotifications: Notification[] }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Mark a single notification as read in local state
  const markOneRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  // Click handler for notification rows — marks as read + navigates
  function handleRowClick(n: Notification) {
    if (!n.read) {
      markOneRead(n.id);
      markAsRead([n.id]);
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

  // Accept/reject handler — marks notification as read
  function handleFollowAction(notificationId: string) {
    markOneRead(notificationId);
    markAsRead([notificationId]);
  }

  // Mark all read
  async function handleMarkAllRead() {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;

    setMarkingAll(true);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));

    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds }),
      });
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Notifications</h1>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} disabled={markingAll}
            className="text-xs font-medium hover:underline disabled:opacity-50"
            style={{ color: "var(--accent)" }}>
            {markingAll ? "Marking..." : "Mark all read"}
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-2xl border p-12 text-center"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="text-lg font-semibold mb-2"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            All quiet
          </p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No notifications yet. Follow some people to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          {notifications.map((n, i) => {
            const actor = getActorInfo(n);
            const entryHref = getEntryHref(n);
            const isClickable = !!getNotificationHref(n);
            const isFollowRequest = n.type === "follow_request" && n.actor;

            return (
              <div key={n.id}
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={() => {
                  // Don't navigate for follow requests — user needs to accept/decline first
                  if (!isFollowRequest) handleRowClick(n);
                }}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && !isFollowRequest) {
                    e.preventDefault();
                    handleRowClick(n);
                  }
                }}
                className={`flex items-start gap-3 px-5 py-4 transition-colors ${
                  i < notifications.length - 1 ? "border-b" : ""
                } ${isClickable && !isFollowRequest ? "cursor-pointer hover:brightness-95" : ""}`}
                style={{
                  borderColor: "var(--border)",
                  background: n.read ? undefined : "var(--accent-light)",
                }}>
                {/* Avatar */}
                {actor.href ? (
                  <a
                    href={actor.href}
                    className="flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    {...(actor.isRemote ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    <Avatar url={actor.avatarUrl} name={actor.displayName} size={36} />
                  </a>
                ) : (
                  <div className="w-9 h-9 rounded-full flex-shrink-0"
                    style={{ background: "var(--surface-hover)" }} />
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm flex items-center gap-1.5 flex-wrap">
                    <NotificationIcon type={n.type} data={n.data} />
                    {actor.href ? (
                      <a
                        href={actor.href}
                        className="font-medium hover:underline"
                        onClick={(e) => e.stopPropagation()}
                        {...(actor.isRemote ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      >
                        {actor.displayName}
                      </a>
                    ) : (
                      <span className="font-medium">{actor.displayName}</span>
                    )}
                    {actor.handle && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full border"
                        style={{ borderColor: "var(--border)", color: "var(--muted)", fontSize: "0.6rem" }}>
                        {actor.handle}
                      </span>
                    )}
                    <span style={{ color: "var(--muted)" }}>{notificationText(n)}</span>
                  </p>

                  {/* Entry link */}
                  {entryHref && n.entry && (
                    <a href={entryHref}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs mt-1 inline-block hover:underline truncate max-w-[300px]"
                      style={{ color: "var(--accent)" }}>
                      {n.entry.title || "Untitled entry"} →
                    </a>
                  )}

                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    {timeAgo(n.inserted_at)}
                  </p>

                  {/* Follow request actions */}
                  {isFollowRequest && (
                    <AcceptRejectInline
                      username={n.actor!.username}
                      notificationId={n.id}
                      onAction={handleFollowAction}
                    />
                  )}
                </div>

                {/* Unread dot / mark-read button */}
                {!n.read ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      markOneRead(n.id);
                      markAsRead([n.id]);
                    }}
                    className="mt-1 flex-shrink-0 group relative"
                    title="Mark as read"
                    aria-label="Mark as read"
                  >
                    <div className="w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-125"
                      style={{ background: "var(--accent)" }} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
