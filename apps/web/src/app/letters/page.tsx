import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { Letterbox } from "./letterbox";

export const metadata: Metadata = { title: "Letterbox · Inkwell" };

export interface ConversationPreview {
  id: string;
  other_user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  last_message: {
    body: string;
    inserted_at: string;
  } | null;
  unread_count: number;
  last_message_at: string | null;
}

export default async function LettersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let conversations: ConversationPreview[] = [];
  try {
    const data = await apiFetch<{ data: ConversationPreview[] }>(
      "/api/conversations",
      {},
      session.token
    );
    conversations = data.data ?? [];
  } catch {
    // show empty state
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1
            className="text-3xl font-bold mb-1"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)", color: "var(--foreground)" }}
          >
            Letterbox
          </h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Your private correspondence with pen pals
          </p>
        </div>
        <Letterbox initialConversations={conversations} />
      </div>
    </div>
  );
}
