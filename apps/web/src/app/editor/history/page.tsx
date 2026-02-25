import { redirect } from "next/navigation";
import { getSession, getToken } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { HistoryClient } from "./history-client";

interface HistoryPageProps {
  searchParams: Promise<{ entry?: string }>;
}

interface VersionSummary {
  id: string;
  entry_id: string;
  version_number: number;
  title: string | null;
  word_count: number;
  created_at: string;
}

interface EntryData {
  id: string;
  title: string | null;
  body_html: string;
  body_raw: unknown;
  word_count: number;
  excerpt: string | null;
  mood: string | null;
  tags: string[];
  category: string | null;
  cover_image_id: string | null;
  slug: string;
  status: string;
  author: {
    username: string;
  };
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { entry: entryId } = await searchParams;
  if (!entryId) redirect("/feed");

  const token = await getToken();

  let entry: EntryData;
  try {
    const data = await apiFetch<{ data: EntryData }>(
      `/api/entries/${entryId}`, {}, token
    );
    entry = data.data;
  } catch {
    redirect("/feed");
  }

  let versions: VersionSummary[] = [];
  let totalVersions = 0;
  try {
    const data = await apiFetch<{ data: VersionSummary[]; pagination: { total: number } }>(
      `/api/entries/${entryId}/versions`, {}, token
    );
    versions = data.data ?? [];
    totalVersions = data.pagination?.total ?? 0;
  } catch {
    // no versions yet
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <HistoryClient
        entry={entry}
        versions={versions}
        totalVersions={totalVersions}
      />
    </div>
  );
}
