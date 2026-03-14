import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { LetterThread } from "./letter-thread";

export const metadata: Metadata = { title: "Letters · Inkwell" };

export interface LetterMessage {
  id: string;
  body: string;
  body_html: string | null;
  edited_at: string | null;
  sender_username: string;
  sender_display_name: string;
  sender_avatar_url: string | null;
  is_mine: boolean;
  inserted_at: string;
}

export interface ThreadData {
  id: string;
  other_user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  messages: LetterMessage[];
  page: number;
  has_more: boolean;
  total: number;
}

export default async function LetterThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  let thread: ThreadData | null = null;
  try {
    const data = await apiFetch<{ data: ThreadData }>(
      `/api/conversations/${id}`,
      {},
      session.token
    );
    thread = data.data;
  } catch {
    notFound();
  }

  if (!thread) notFound();

  return (
    <div
      className="letter-page-wrapper"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <LetterThread
        initialThread={thread}
        conversationId={id}
        currentUsername={session.user.username}
      />
    </div>
  );
}
