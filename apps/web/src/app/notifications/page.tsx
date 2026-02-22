import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { NotificationList } from "./notification-list";

export const metadata: Metadata = { title: "Notifications · Inkwell" };

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
  remote_actor?: {
    username: string;
    domain: string;
    display_name: string;
    avatar_url: string | null;
    profile_url: string | null;
    ap_id: string | null;
  } | null;
  data?: Record<string, unknown>;
  entry?: {
    slug: string;
    title: string | null;
    user: { username: string };
  } | null;
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

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <NotificationList initialNotifications={notifications} />
      </div>
    </div>
  );
}
