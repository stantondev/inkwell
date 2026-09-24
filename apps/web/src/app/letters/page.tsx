import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { Letterbox, type LetterboxFolder } from "./letterbox";
import { FetchError } from "@/components/fetch-error";

export const metadata: Metadata = { title: "Letterbox" };

export interface ConversationPreview {
  id: string;
  other_user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    remote?: boolean;
    handle?: string;
  };
  last_message: {
    body: string;
    inserted_at: string;
  } | null;
  unread_count: number;
  last_message_at: string | null;
  muted?: boolean;
  /** "incoming" | "outgoing" for a letter request, else null. */
  request?: string | null;
}

export interface LetterboxMeta {
  folder: LetterboxFolder;
  counts: { requests: number; requests_unread: number; archived: number };
  letters_from: "pen_pals" | "anyone";
}

const FOLDERS: LetterboxFolder[] = ["inbox", "requests", "archived"];

export default async function LettersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { tab } = await searchParams;
  const folder: LetterboxFolder = FOLDERS.includes(tab as LetterboxFolder) ? (tab as LetterboxFolder) : "inbox";

  let conversations: ConversationPreview[] = [];
  let meta: LetterboxMeta | null = null;
  let fetchFailed = false;
  try {
    const data = await apiFetch<{ data: ConversationPreview[]; meta?: LetterboxMeta }>(
      `/api/conversations?folder=${folder}`,
      {},
      session.token
    );
    conversations = data.data ?? [];
    meta = data.meta ?? null;
  } catch {
    fetchFailed = true;
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
        {fetchFailed ? (
          <FetchError message="We couldn't load your letterbox." />
        ) : (
          <Letterbox
            initialConversations={conversations}
            initialFolder={folder}
            initialMeta={
              meta ?? {
                folder,
                counts: { requests: 0, requests_unread: 0, archived: 0 },
                letters_from: "pen_pals",
              }
            }
          />
        )}
      </div>
    </div>
  );
}
