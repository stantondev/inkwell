"use client";

import { useEffect, useState } from "react";

export default function RedactionsPage() {
  const [words, setWords] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  // A failed load must not look like "no redactions": the next save would
  // replace the real list with just the new word.
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) {
          setLoadError(true);
          return;
        }
        const { data } = await res.json();
        setWords(data.settings?.redacted_words || []);
      } catch {
        setLoadError(true);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const save = async (updated: string[]) => {
    if (loadError) return;
    const previous = words;
    setWords(updated);
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { redacted_words: updated },
        }),
      });
      // fetch doesn't throw on HTTP errors, so a failed save used to leave the
      // list looking saved.
      if (!res.ok) {
        setWords(previous);
        setSaveError(true);
      }
    } catch {
      setWords(previous);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const addWords = () => {
    if (!input.trim()) return;
    // Split on commas or newlines, trim, lowercase, dedupe
    const newWords = input
      .split(/[,\n]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0 && w.length <= 100);

    const merged = [...new Set([...words, ...newWords])].slice(0, 100);
    setInput("");
    save(merged);
  };

  const removeWord = (word: string) => {
    save(words.filter((w) => w !== word));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addWords();
    }
  };

  if (!loaded) return null;

  if (loadError) {
    return (
      <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <p className="text-sm" style={{ color: "var(--danger, #dc2626)" }}>
          Couldn&apos;t load your redactions. Reload the page to try again. Nothing has been changed.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          Entries containing these words in their title, body, or tags will be
          hidden from your Feed, Explore, and profile pages. Your own entries
          are never redacted.
        </p>

        {saveError && (
          <p className="text-sm mb-3" style={{ color: "var(--danger, #dc2626)" }}>
            Couldn&apos;t save that change. Please try again.
          </p>
        )}

        {/* Word chips */}
        {words.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {words.map((word) => (
              <span
                key={word}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm"
                style={{
                  background: "var(--foreground)",
                  color: "var(--background)",
                }}
              >
                <span
                  style={{
                    textDecoration: "line-through",
                    textDecorationThickness: "2px",
                  }}
                >
                  {word}
                </span>
                <button
                  onClick={() => removeWord(word)}
                  className="ml-0.5 opacity-70 hover:opacity-100 transition-opacity"
                  style={{ fontSize: "12px", lineHeight: 1 }}
                  aria-label={`Remove "${word}"`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add words to redact (comma-separated)"
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
            }}
            disabled={saving || words.length >= 100}
          />
          <button
            onClick={addWords}
            disabled={saving || !input.trim() || words.length >= 100}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
            style={{
              background: "var(--foreground)",
              color: "var(--background)",
              opacity: saving || !input.trim() ? 0.5 : 1,
            }}
          >
            Redact
          </button>
        </div>

        {/* Counter */}
        <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
          {words.length} / 100 redactions
        </p>
      </div>
    </div>
  );
}
