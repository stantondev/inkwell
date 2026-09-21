"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import {
  type Notification,
  notificationText,
  getActorInfo,
  getNotificationHref,
  decodeEntities,
} from "@/lib/notification-format";
import { NotificationIcon } from "@/app/notifications/notification-list";
import {
  NOTIFICATIONS_ARRIVED_EVENT,
  LETTERS_ARRIVED_EVENT,
  type NotificationsArrivedDetail,
  type LettersArrivedDetail,
} from "./live-nav-counts";

// Pop-up cards for notifications and letters that arrive while you're on the
// site. Mounted once in AppShell; fed by the shared nav-count poll.

const TOAST_LIFETIME_MS = 8000;
const MAX_VISIBLE = 3;

type Toast =
  | { key: string; kind: "notification"; notification: Notification }
  | { key: string; kind: "letter"; count: number }
  | { key: string; kind: "more"; count: number };

function secondaryLine(n: Notification): string | null {
  if (n.type === "fediverse_mention" && n.data?.content_preview) {
    return `“${decodeEntities(String(n.data.content_preview))}”`;
  }
  if (n.entry?.title) return n.entry.title;
  if (n.entry?.excerpt) return n.entry.excerpt;
  if (typeof n.data?.post_title === "string") return n.data.post_title;
  if (typeof n.data?.circle_name === "string" && n.type !== "circle_new_member") {
    return n.data.circle_name;
  }
  return null;
}

function markRead(id: string) {
  fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [id] }),
  })
    .then(() => window.dispatchEvent(new Event("inkwell-nav-refresh")))
    .catch(() => {});
}

export function NotificationToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((key: string) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  useEffect(() => {
    const onNotifications = (e: Event) => {
      const detail = (e as CustomEvent<NotificationsArrivedDetail>).detail;
      if (!detail?.showPopups) return;
      // The Notifications page shows them itself, live.
      if (pathnameRef.current.startsWith("/notifications")) return;

      setToasts((prev) => {
        const existing = new Set(
          prev.flatMap((t) => (t.kind === "notification" ? [t.notification.id] : []))
        );
        const incoming = detail.notifications.filter((n) => !existing.has(n.id));
        if (incoming.length === 0) return prev;

        const others = prev.filter((t) => t.kind !== "more");
        const previousMore = prev.find((t) => t.kind === "more");
        const all: Toast[] = [
          ...incoming.map(
            (n): Toast => ({ key: `n-${n.id}`, kind: "notification", notification: n })
          ),
          ...others,
        ];
        if (all.length <= MAX_VISIBLE) return all;

        // Too many at once: keep the newest and summarize the rest.
        const kept = all.slice(0, MAX_VISIBLE - 1);
        const overflow =
          all.length - kept.length + (previousMore?.kind === "more" ? previousMore.count : 0);
        return [...kept, { key: `more-${Date.now()}`, kind: "more", count: overflow }];
      });
    };

    const onLetters = (e: Event) => {
      const detail = (e as CustomEvent<LettersArrivedDetail>).detail;
      if (!detail?.showPopups) return;
      if (pathnameRef.current.startsWith("/letters")) return;
      setToasts((prev) => {
        const previous = prev.find((t) => t.kind === "letter");
        const count = detail.count + (previous?.kind === "letter" ? previous.count : 0);
        const rest = prev.filter((t) => t.kind !== "letter");
        return [{ key: `l-${Date.now()}`, kind: "letter" as const, count }, ...rest].slice(
          0,
          MAX_VISIBLE
        );
      });
    };

    window.addEventListener(NOTIFICATIONS_ARRIVED_EVENT, onNotifications);
    window.addEventListener(LETTERS_ARRIVED_EVENT, onLetters);
    return () => {
      window.removeEventListener(NOTIFICATIONS_ARRIVED_EVENT, onNotifications);
      window.removeEventListener(LETTERS_ARRIVED_EVENT, onLetters);
    };
  }, []);

  // Clear pop-ups the moment you open the page they point to.
  useEffect(() => {
    if (pathname.startsWith("/notifications")) {
      setToasts((prev) => prev.filter((t) => t.kind === "letter"));
    } else if (pathname.startsWith("/letters")) {
      setToasts((prev) => prev.filter((t) => t.kind !== "letter"));
    }
  }, [pathname]);

  if (!mounted) return null;

  return createPortal(
    <div className="ink-toast-region" role="region" aria-label="New notifications" aria-live="polite">
      {toasts.map((t) => (
        <ToastCard key={t.key} toast={t} onDismiss={() => dismiss(t.key)} />
      ))}
    </div>,
    document.body
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const hoveredRef = useRef(false);
  const remainingRef = useRef(TOAST_LIFETIME_MS);
  const [progressKey, setProgressKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // The parent passes a fresh onDismiss each render; keep `close` stable so the
  // timer effect below doesn't restart (and reset the countdown) every render.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);
  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => onDismissRef.current(), 220);
  }, []);

  // Auto-dismiss, paused while hovered or while the tab is in the background,
  // so a pop-up that arrives while you're away is still there when you return.
  useEffect(() => {
    let timer: number | null = null;
    let startedAt = 0;

    const start = () => {
      if (timer !== null || hoveredRef.current || document.hidden) return;
      startedAt = Date.now();
      setPaused(false);
      timer = window.setTimeout(close, remainingRef.current);
    };
    const pause = () => {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
      remainingRef.current = Math.max(1200, remainingRef.current - (Date.now() - startedAt));
      setPaused(true);
    };
    const onVisibility = () => (document.hidden ? pause() : start());

    start();
    if (document.hidden) setPaused(true);
    document.addEventListener("visibilitychange", onVisibility);
    const card = cardRef.current;
    const enter = () => {
      hoveredRef.current = true;
      pause();
    };
    const leave = () => {
      hoveredRef.current = false;
      start();
    };
    card?.addEventListener("mouseenter", enter);
    card?.addEventListener("mouseleave", leave);
    card?.addEventListener("focusin", enter);
    card?.addEventListener("focusout", leave);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      card?.removeEventListener("mouseenter", enter);
      card?.removeEventListener("mouseleave", leave);
      card?.removeEventListener("focusin", enter);
      card?.removeEventListener("focusout", leave);
    };
  }, [close]);

  // Restart the progress bar animation whenever it resumes.
  useEffect(() => {
    if (!paused) setProgressKey((k) => k + 1);
  }, [paused]);

  let avatar: React.ReactNode = null;
  let title: React.ReactNode;
  let body: string | null = null;
  let href: string | null = null;
  let icon: React.ReactNode = null;
  let onOpen: (() => void) | null = null;

  if (toast.kind === "notification") {
    const n = toast.notification;
    const actor = getActorInfo(n);
    avatar = <Avatar url={actor.avatarUrl} name={actor.displayName} size={40} />;
    title = (
      <>
        <strong className="ink-toast-actor">{actor.displayName}</strong>{" "}
        <span>{notificationText(n)}</span>
      </>
    );
    body = secondaryLine(n);
    href = getNotificationHref(n);
    icon = <NotificationIcon type={n.type} data={n.data} />;
    onOpen = () => markRead(n.id);
  } else if (toast.kind === "letter") {
    avatar = (
      <span className="ink-toast-glyph" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      </span>
    );
    title = (
      <strong className="ink-toast-actor">
        {toast.count === 1 ? "A new letter arrived" : `${toast.count} new letters arrived`}
      </strong>
    );
    body = "Open your Letterbox to read it.";
    href = "/letters";
  } else {
    avatar = (
      <span className="ink-toast-glyph" aria-hidden="true">
        +{toast.count}
      </span>
    );
    title = (
      <strong className="ink-toast-actor">
        {toast.count} more {toast.count === 1 ? "notification" : "notifications"}
      </strong>
    );
    body = "See them all on your Notifications page.";
    href = "/notifications";
  }

  const open = () => {
    onOpen?.();
    close();
    if (!href) return;
    if (/^https?:\/\//.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      router.push(href);
    }
  };

  return (
    <div
      ref={cardRef}
      className={`ink-toast${leaving ? " ink-toast-leaving" : ""}${toast.kind === "letter" ? " ink-toast-letter" : ""}`}
      role="status"
    >
      <button
        type="button"
        className="ink-toast-main"
        onClick={open}
        disabled={!href}
      >
        <span className="ink-toast-avatar">
          {avatar}
          {icon && <span className="ink-toast-badge">{icon}</span>}
        </span>
        <span className="ink-toast-text">
          <span className="ink-toast-title">{title}</span>
          {body && <span className="ink-toast-body">{body}</span>}
          <span className="ink-toast-meta">just now</span>
        </span>
      </button>
      <button
        type="button"
        className="ink-toast-close"
        onClick={close}
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      <span
        key={progressKey}
        className="ink-toast-progress"
        style={{
          animationDuration: `${remainingRef.current}ms`,
          ["--ink-toast-start" as string]: String(remainingRef.current / TOAST_LIFETIME_MS),
          animationPlayState: paused ? "paused" : "running",
        }}
        aria-hidden="true"
      />
    </div>
  );
}
