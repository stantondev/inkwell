"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
  is_following_back?: boolean;
}

interface Notification {
  id: string;
  type: string;
  read: boolean;
  inserted_at: string;
  target_type: string | null;
  target_id: string | null;
  follow_accepted?: boolean;
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
      return "sent you a pen pal request";
    case "follow_accepted":
      return "is now your pen pal!";
    case "comment_added":
    case "comment":
      return "commented on your entry";
    case "reply":
      return "replied to your comment";
    case "mention":
      return "mentioned you in a comment";
    case "like":
      return "inked your entry from the fediverse";
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
    case "feedback_mention":
      return "mentioned you in a feedback comment";
    case "poll_comment":
      return "commented on your poll";
    case "poll_mention":
      return "mentioned you in a poll comment";
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
    case "ink":
      return "inked your entry";
    case "invite_accepted":
      return "joined Inkwell from your invitation";
    case "fediverse_follow":
      return "followed you from the fediverse";
    case "fediverse_mention":
      return "mentioned you from the fediverse";
    case "guestbook":
      return "signed your guestbook from the fediverse";
    case "circle_response": {
      const circleName = n.data?.circle_name as string | undefined;
      return circleName ? `responded to your discussion in ${circleName}` : "responded to your discussion";
    }
    case "circle_mention": {
      const circleName2 = n.data?.circle_name as string | undefined;
      return circleName2 ? `mentioned you in ${circleName2}` : "mentioned you in a circle";
    }
    case "circle_new_member": {
      const circleName3 = n.data?.circle_name as string | undefined;
      return circleName3 ? `joined ${circleName3}` : "joined your circle";
    }
    case "writer_plan_subscribe": {
      const subAmountCents = n.data?.amount_cents as number | undefined;
      const subAmt = subAmountCents ? `$${(subAmountCents / 100).toFixed(2)}/mo` : "";
      return `subscribed to your plan${subAmt ? ` (${subAmt})` : ""}`;
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
        viewBox="0 0 16 20"
        fill="currentColor"
        style={{ color: "var(--accent)" }}
        aria-hidden="true"
      >
        <path d="M8 1C8 1 1 8.5 1 12.5a7 7 0 0 0 14 0C15 8.5 8 1 8 1Z" />
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
  if (type === "reply") {
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
        <polyline points="9 17 4 12 9 7" />
        <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
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
  if (type === "ink") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 20"
        fill="currentColor"
        style={{ color: "var(--accent)" }}
        aria-hidden="true"
      >
        <path d="M8 1C8 1 1 8.5 1 12.5a7 7 0 0 0 14 0C15 8.5 8 1 8 1Z" />
      </svg>
    );
  }
  if (type === "invite_accepted") {
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
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    );
  }
  if (type === "fediverse_mention") {
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
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    );
  }
  if (type === "guestbook") {
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
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <line x1="12" y1="6" x2="12" y2="14" />
        <line x1="8" y1="10" x2="16" y2="10" />
      </svg>
    );
  }
  if (type === "fediverse_follow") {
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
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    );
  }
  if (type === "circle_response" || type === "circle_mention" || type === "circle_new_member") {
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
        style={{ color: "#b8860b" }}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    );
  }
  if (type === "poll_comment" || type === "poll_mention") {
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
        <rect x="4" y="14" width="4" height="6" rx="1" />
        <rect x="10" y="8" width="4" height="12" rx="1" />
        <rect x="16" y="4" width="4" height="16" rx="1" />
      </svg>
    );
  }
  if (type === "writer_plan_subscribe") {
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
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  if (
    type === "feedback_status_change" ||
    type === "feedback_comment" ||
    type === "feedback_vote" ||
    type === "feedback_mention"
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
  // Invite accepted notifications link to the new user's profile
  if (n.type === "invite_accepted" && n.actor) {
    return `/${n.actor.username}`;
  }
  // Postage notifications link to the postage history page
  if (n.type === "tip") {
    return "/settings/support/postage";
  }
  // Letter notifications link to the conversation thread
  if (n.type === "letter" && n.data?.conversation_id) {
    return `/letters/${n.data.conversation_id}`;
  }
  // Writer plan subscribe notifications link to the subscriptions settings
  if (n.type === "writer_plan_subscribe") {
    return "/settings/subscriptions";
  }
  // Circle notifications link to the circle or discussion
  if ((n.type === "circle_response" || n.type === "circle_mention") && n.data?.circle_slug && n.data?.discussion_id) {
    return `/circles/${n.data.circle_slug}/${n.data.discussion_id}`;
  }
  if (n.type === "circle_new_member" && n.data?.circle_slug) {
    return `/circles/${n.data.circle_slug}`;
  }
  // Reply notifications link to entry comments
  if (n.type === "reply") {
    const entryHref = getEntryHref(n);
    if (entryHref) return `${entryHref}#comments`;
  }
  // Poll notifications link to the poll
  if ((n.type === "poll_comment" || n.type === "poll_mention") && n.target_id) {
    return `/polls/${n.target_id}`;
  }
  // Fediverse mention — open remote post URL in new tab (handled by isRemote)
  if (n.type === "fediverse_mention" && n.data?.post_url) {
    return n.data.post_url as string;
  }
  // Guestbook notification — link to the profile's guestbook section
  if (n.type === "guestbook" && n.data?.profile_username) {
    return `/${n.data.profile_username}#guestbook`;
  }
  // Feedback notifications link to the roadmap post
  if (
    (n.type === "feedback_status_change" ||
      n.type === "feedback_comment" ||
      n.type === "feedback_vote" ||
      n.type === "feedback_mention") &&
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
    "idle" | "loading" | "accepted" | "declined" | "expired"
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
      } else if (res.status === 404) {
        // Follow request was cancelled by the sender
        setState("expired");
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
      } else if (res.status === 404) {
        // Follow request was already cancelled
        setState("expired");
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
  if (state === "expired") {
    return (
      <span
        className="text-xs mt-2 inline-block italic"
        style={{ color: "var(--muted)" }}
      >
        This request is no longer active
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

// ─── Fediverse Follow Back ─────────────────────────────────────
function FediverseFollowBackButton({
  apId,
  isFollowingBack,
}: {
  apId: string;
  isFollowingBack?: boolean;
}) {
  const [state, setState] = useState<
    "idle" | "loading" | "pending" | "following" | "error"
  >(isFollowingBack ? "following" : "idle");

  async function handleFollow(e: React.MouseEvent) {
    e.stopPropagation();
    setState("loading");
    try {
      const res = await fetch("/api/fediverse/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ap_id: apId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.already_following) {
          setState("following");
        } else {
          setState(
            data.data?.status === "accepted" ? "following" : "pending"
          );
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
        Following
      </span>
    );
  }
  if (state === "pending") {
    return (
      <span
        className="text-xs mt-2 inline-block px-3 py-1 rounded-full border"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        Requested
      </span>
    );
  }
  if (state === "error") {
    return (
      <span
        className="text-xs mt-2 inline-block"
        style={{ color: "var(--muted)" }}
      >
        Could not follow
      </span>
    );
  }

  return (
    <button
      onClick={handleFollow}
      disabled={state === "loading"}
      className="text-xs mt-2 px-4 py-1.5 rounded-full font-medium border transition-colors disabled:opacity-50"
      style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
    >
      {state === "loading" ? "..." : "Follow Back"}
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────
export function NotificationList({
  initialNotifications,
  autoMarkRead = false,
}: {
  initialNotifications: Notification[];
  autoMarkRead?: boolean;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [markingAll, setMarkingAll] = useState(false);
  const autoMarkDoneRef = useRef(false);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const groups = useMemo(() => groupByDate(notifications), [notifications]);

  // Auto-mark all notifications as read on mount when setting is enabled
  useEffect(() => {
    if (!autoMarkRead || autoMarkDoneRef.current) return;
    const unreadIds = initialNotifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    autoMarkDoneRef.current = true;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unreadIds }),
    })
      .then(() => {
        window.dispatchEvent(new Event("inkwell-nav-refresh"));
      })
      .catch(() => {});
  }, [autoMarkRead, initialNotifications]);

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
                  // Show accept/reject for follow requests that haven't been accepted yet
                  // (even if read — auto-mark-read setting shouldn't hide action buttons)
                  const isPendingFollowRequest =
                    n.type === "follow_request" && !!n.actor && !n.follow_accepted;

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
                        {/* Circle discussion link */}
                        {!!n.data?.circle_name &&
                          (n.type === "circle_response" ||
                            n.type === "circle_mention" ||
                            n.type === "circle_new_member") && (
                            <a
                              href={
                                n.data?.discussion_id
                                  ? `/circles/${String(n.data?.circle_slug)}/${String(n.data.discussion_id)}`
                                  : `/circles/${String(n.data?.circle_slug)}`
                              }
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs mt-1 inline-block hover:underline truncate max-w-[200px] sm:max-w-[300px]"
                              style={{ color: "#b8860b" }}
                            >
                              {String(n.data?.circle_name)} {"\u2192"}
                            </a>
                          )}
                        {/* Feedback post link */}
                        {!!n.data?.post_title &&
                          (n.type === "feedback_status_change" ||
                            n.type === "feedback_comment" ||
                            n.type === "feedback_vote" ||
                            n.type === "feedback_mention") && (
                            <a
                              href={`/roadmap/${n.data.post_id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs mt-1 inline-block hover:underline truncate max-w-[200px] sm:max-w-[300px]"
                              style={{ color: "var(--accent)" }}
                            >
                              {String(n.data.post_title)} {"\u2192"}
                            </a>
                          )}

                        {/* Fediverse mention content preview */}
                        {n.type === "fediverse_mention" &&
                          !!n.data?.content_preview && (
                            <p
                              className="text-xs mt-1 italic truncate max-w-[200px] sm:max-w-[300px]"
                              style={{ color: "var(--muted)" }}
                            >
                              {"\u201C"}{String(n.data.content_preview).slice(0, 100)}{String(n.data.content_preview).length > 100 ? "\u2026" : ""}{"\u201D"}
                            </p>
                          )}

                        <p
                          className="text-xs mt-0.5"
                          style={{ color: "var(--muted)" }}
                        >
                          {timeAgo(n.inserted_at)}
                        </p>

                        {/* Follow request actions — pending requests only */}
                        {isPendingFollowRequest && (
                          <AcceptRejectInline
                            username={n.actor!.username}
                            notificationId={n.id}
                            onAction={handleFollowAction}
                          />
                        )}
                        {/* Already-accepted follow request */}
                        {n.type === "follow_request" && n.follow_accepted && (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-medium mt-2 px-3 py-1 rounded-full"
                            style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                            Pen pals
                          </span>
                        )}

                        {/* Fediverse follow-back button */}
                        {n.type === "fediverse_follow" &&
                          n.remote_actor?.ap_id && (
                            <FediverseFollowBackButton
                              apId={n.remote_actor.ap_id}
                              isFollowingBack={n.remote_actor.is_following_back}
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
