"use client";

import { useState } from "react";
import { GAZETTE_TOPICS } from "@/lib/gazette-topics";

interface GazetteTopicPickerProps {
  initialTopics: string[];
  onSave: (topics: string[]) => void;
  saving?: boolean;
  mode?: "full" | "compact";
}

export function GazetteTopicPicker({
  initialTopics,
  onSave,
  saving = false,
  mode = "full",
}: GazetteTopicPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialTopics)
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSave() {
    onSave(Array.from(selected));
  }

  return (
    <div className={`gazette-topic-picker ${mode === "compact" ? "gazette-topic-picker-compact" : ""}`}>
      {mode === "full" && (
        <div className="gazette-topic-picker-header">
          <h2
            style={{
              fontFamily: "var(--font-lora, Georgia, serif)",
              fontStyle: "italic",
              fontSize: "1.5rem",
              marginBottom: "0.25rem",
            }}
          >
            Choose Your Topics
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            Select the topics you want to follow in your Gazette. You can change
            these anytime.
          </p>
        </div>
      )}

      <div className="gazette-topic-grid">
        {GAZETTE_TOPICS.map((topic) => (
          <button
            key={topic.id}
            className={`gazette-topic-chip ${selected.has(topic.id) ? "gazette-topic-chip-selected" : ""}`}
            onClick={() => toggle(topic.id)}
            type="button"
          >
            <span className="gazette-topic-chip-icon">{topic.icon}</span>
            <span className="gazette-topic-chip-label">{topic.label}</span>
          </button>
        ))}
      </div>

      <div className="gazette-topic-picker-actions">
        <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
          {selected.size} topic{selected.size !== 1 ? "s" : ""} selected
        </span>
        <button
          onClick={handleSave}
          disabled={saving || selected.size === 0}
          className="gazette-topic-save-btn"
        >
          {saving ? "Saving..." : "Save & View Gazette"}
        </button>
      </div>
    </div>
  );
}
