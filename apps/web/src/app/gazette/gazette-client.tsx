"use client";

import { useState, useCallback } from "react";
import {
  GazetteEntryCard,
  GazetteLeadCard,
  GazetteDigestCard,
  type GazetteEntry,
} from "@/components/gazette-entry-card";
import { GazetteTopicPicker } from "@/components/gazette-topic-picker";
import { getTopicLabel } from "@/lib/gazette-topics";

interface GazetteClientProps {
  initialEntries: GazetteEntry[];
  initialTopics: string[];
  initialTotal: number;
  initialPage: number;
  needsTopicSelection: boolean;
  isLoggedIn: boolean;
  isPlus: boolean;
  aiCurated: boolean;
}

export function GazetteClient({
  initialEntries,
  initialTopics,
  initialTotal,
  initialPage,
  needsTopicSelection,
  isLoggedIn,
  isPlus,
  aiCurated: initialAiCurated,
}: GazetteClientProps) {
  const [entries, setEntries] = useState<GazetteEntry[]>(initialEntries);
  const [topics, setTopics] = useState<string[]>(initialTopics);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(needsTopicSelection);
  const [saving, setSaving] = useState(false);

  const perPage = 30;
  const totalPages = Math.ceil(total / perPage);

  const fetchEntries = useCallback(
    async (p: number, topic?: string | null) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p) });
        if (topic) params.set("topic", topic);
        const res = await fetch(`/api/gazette?${params}`);
        const data = await res.json();
        setEntries(data.data || []);
        setTotal(data.pagination?.total || 0);
        setPage(p);
      } catch (err) {
        console.error("Gazette fetch error:", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  async function handleSaveTopics(selectedTopics: string[]) {
    setSaving(true);
    try {
      await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { gazette_topics: selectedTopics } }),
      });
      setTopics(selectedTopics);
      setShowPicker(false);
      // Fetch entries for the newly saved topics
      await fetchEntries(1);
    } catch (err) {
      console.error("Save topics error:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleTopicFilter(topicId: string | null) {
    setActiveTopic(topicId);
    fetchEntries(1, topicId);
  }

  // Show topic picker if no topics selected
  if (showPicker) {
    return (
      <div className="gazette-picker-wrapper">
        <GazetteTopicPicker
          initialTopics={topics}
          onSave={handleSaveTopics}
          saving={saving}
        />
        {!isLoggedIn && (
          <p
            style={{
              textAlign: "center",
              color: "var(--muted)",
              fontSize: "0.85rem",
              marginTop: "1rem",
            }}
          >
            Sign in to save your topic preferences across sessions.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="gazette-content">
      {/* Topic filter chips */}
      <div className="gazette-topic-filters">
        <button
          className={`gazette-filter-chip ${activeTopic === null ? "gazette-filter-chip-active" : ""}`}
          onClick={() => handleTopicFilter(null)}
        >
          All Topics
        </button>
        {topics.map((topicId) => (
          <button
            key={topicId}
            className={`gazette-filter-chip ${activeTopic === topicId ? "gazette-filter-chip-active" : ""}`}
            onClick={() => handleTopicFilter(topicId)}
          >
            {getTopicLabel(topicId)}
          </button>
        ))}
        <button
          className="gazette-filter-chip gazette-filter-chip-edit"
          onClick={() => setShowPicker(true)}
          title="Edit topics"
        >
          +
        </button>
      </div>

      {/* AI curated indicator */}
      {isPlus && initialAiCurated && !loading && entries.length > 0 && (
        <div className="gazette-ai-badge">
          AI curated — noise filtered, relevance ranked
        </div>
      )}

      {/* Plus upsell */}
      {!isPlus && isLoggedIn && !loading && entries.length > 0 && (
        <div className="gazette-plus-upsell">
          <a href="/settings/billing">Upgrade to Plus</a> for AI-curated news: filter noise, get summaries, and see grouped coverage.
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)" }}>
          Loading...
        </div>
      )}

      {/* Entry list */}
      {!loading && entries.length === 0 && (
        <div className="gazette-empty">
          <p style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic", fontSize: "1.1rem" }}>
            No stories found for{" "}
            {activeTopic ? getTopicLabel(activeTopic) : "your topics"} right now.
          </p>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: "0.5rem" }}>
            Fediverse content is updated regularly via relay subscriptions.
            Check back soon, or try different topics.
          </p>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="gazette-paper">
          {/* Lead story — the top entry, above the fold */}
          {entries[0] && (
            <section className="gazette-frontpage">
              <GazetteLeadCard entry={entries[0]} />
            </section>
          )}

          {/* Secondary row — entries 2-4 in a 3-column grid with vertical rules */}
          {entries.length > 1 && (
            <>
              <div className="gazette-section-divider" role="presentation">
                <span className="gazette-section-divider-label">
                  Also Today
                </span>
              </div>
              <section className="gazette-secondary">
                {entries.slice(1, 4).map((entry) => (
                  <GazetteEntryCard key={entry.id} entry={entry} />
                ))}
              </section>
            </>
          )}

          {/* In Brief — remaining entries in a dense multi-column digest */}
          {entries.length > 4 && (
            <>
              <div className="gazette-section-divider" role="presentation">
                <span className="gazette-section-divider-label">In Brief</span>
              </div>
              <section className="gazette-digest-grid">
                {entries.slice(4).map((entry) => (
                  <GazetteDigestCard key={entry.id} entry={entry} />
                ))}
              </section>
            </>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="gazette-pagination">
          <button
            disabled={page <= 1}
            onClick={() => fetchEntries(page - 1, activeTopic)}
            className="gazette-page-btn"
          >
            Previous
          </button>
          <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => fetchEntries(page + 1, activeTopic)}
            className="gazette-page-btn"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
