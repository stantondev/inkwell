import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { Avatar } from "@/components/avatar";
import { STAMP_CONFIG } from "@/components/stamp-config";
import { MarkAllReadButton } from "./mark-all-read-button";
import { AcceptRejectButtons } from "./accept-reject-buttons";

export const metadata: Metadata = { title: "Notifications · Inkwell" };

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

/** Icon for the notification type */
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
    // Fallback stamp icon (seal)
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

/** Build link to the entry if the notification references one */
function getEntryHref(n: Notification): string | null {
  if (n.entry) {
    return `/${n.entry.user.username}/${n.entry.slug}`;
  }
  return null;
}

/** Get display name for notification actor (local or remote) */
function getActorInfo(n: Notification): {
  displayName: string;
  avatarUrl: string | null;
  href: string | null;
  isRemote: boolean;
  handle: string | null;
} {
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

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let notifications: Notification[] = [];
  try {
    const data = await apiFetch<{ data: Notification[] }>("/api/notifications", {}, session.token);
    notifications = data.data ?? [];
  } catch {
    // show empty state
  }

  const unreadIds = notifications.filter(n => !n.read).map(n => n.id);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold">Notifications</h1>
          {unreadIds.length > 0 && (
            <MarkAllReadButton unreadIds={unreadIds} />
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

              return (
                <div key={n.id}
                  className={`flex items-start gap-3 px-5 py-4 ${i < notifications.length - 1 ? "border-b" : ""}`}
                  style={{
                    borderColor: "var(--border)",
                    background: n.read ? undefined : "var(--accent-light)",
                  }}>
                  {/* Avatar */}
                  {actor.href ? (
                    <a
                      href={actor.href}
                      className="flex-shrink-0"
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
                      <Link href={entryHref}
                        className="text-xs mt-1 inline-block hover:underline truncate max-w-[300px]"
                        style={{ color: "var(--accent)" }}>
                        {n.entry.title || "Untitled entry"} →
                      </Link>
                    )}

                    <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                      {timeAgo(n.inserted_at)}
                    </p>
                    {n.type === "follow_request" && n.actor && (
                      <AcceptRejectButtons username={n.actor.username} />
                    )}
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: "var(--accent)" }} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
