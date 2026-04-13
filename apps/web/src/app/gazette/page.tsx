import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { GazetteClient } from "./gazette-client";
import type { GazetteEntry } from "@/components/gazette-entry-card";

export const metadata: Metadata = {
  title: "The Gazette — Fediverse News",
  description:
    "Browse current events and news from across the fediverse. Topic-based discovery without algorithms or propaganda.",
  openGraph: {
    title: "The Gazette — Inkwell",
    description:
      "Fediverse news discovery. Browse current events from decentralized sources.",
    url: "https://inkwell.social/gazette",
  },
  alternates: { canonical: "https://inkwell.social/gazette" },
};

interface GazetteResponse {
  data: GazetteEntry[];
  topics: string[];
  needs_topic_selection: boolean;
  ai_curated?: boolean;
  pagination: {
    page: number;
    per_page: number;
    total: number;
  };
}

export default async function GazettePage() {
  const session = await getSession();

  let entries: GazetteEntry[] = [];
  let topics: string[] = [];
  let needsTopicSelection = true;
  let aiCurated = false;
  let total = 0;
  let fetchError = false;

  try {
    const data = await apiFetch<GazetteResponse>(
      "/api/gazette",
      {},
      session?.token
    );
    entries = data.data || [];
    topics = data.topics || [];
    needsTopicSelection = data.needs_topic_selection ?? true;
    aiCurated = data.ai_curated ?? false;
    total = data.pagination?.total || 0;
  } catch {
    fetchError = true;
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="gazette-page">
      {/* Newspaper masthead */}
      <header className="gazette-masthead">
        <div className="gazette-masthead-rule" />
        <h1 className="gazette-masthead-title">The Inkwell Gazette</h1>
        <p className="gazette-masthead-subtitle">
          News from the open web — no algorithms, no propaganda
        </p>
        <p className="gazette-masthead-date">{today}</p>
        <div className="gazette-masthead-rule" />
      </header>

      {fetchError && (
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            color: "var(--muted)",
          }}
        >
          <p>Unable to load the Gazette right now. Please try again later.</p>
        </div>
      )}

      {!fetchError && (
        <GazetteClient
          initialEntries={entries}
          initialTopics={topics}
          initialTotal={total}
          initialPage={1}
          needsTopicSelection={needsTopicSelection}
          isLoggedIn={!!session?.user}
          isPlus={session?.user?.subscription_tier === "plus"}
          aiCurated={aiCurated}
        />
      )}
    </div>
  );
}
