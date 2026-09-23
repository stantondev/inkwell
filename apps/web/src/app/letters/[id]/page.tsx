import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { LetterThread } from "./letter-thread";
import { notFoundOrRethrow } from "@/lib/page-errors";

export const metadata: Metadata = { title: "Letters" };

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
  has_more: boolean;
  /** False when you're no longer pen pals or one of you blocked the other. */
  can_write?: boolean;
  muted?: boolean;
  archived?: boolean;
  /** "incoming" | "outgoing" for a letter request, else null. */
  request?: string | null;
  /** You sent a request and it hasn't been accepted yet. */
  request_waiting?: boolean;
}

export default async function LetterThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ letter?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const { letter } = await searchParams;

  let thread: ThreadData | null = null;
  try {
    const data = await apiFetch<{ data: ThreadData }>(
      `/api/conversations/${id}`,
      {},
      session.token
    );
    thread = data.data;
  } catch (err) {
    notFoundOrRethrow(err);
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
        focusLetterId={typeof letter === "string" ? letter : null}
      />
    </div>
  );
}
