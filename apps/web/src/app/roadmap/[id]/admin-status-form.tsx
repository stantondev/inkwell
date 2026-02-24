"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AdminStatusFormProps {
  postId: string;
  currentStatus: string;
  currentResponse: string | null;
  currentReleaseNote: string | null;
  currentPriority: string | null;
  currentValueScore: number | null;
}

const priorities = [
  { value: "", label: "— None —" },
  { value: "low", label: "Low", color: "#6B7280" },
  { value: "medium", label: "Medium", color: "#D97706" },
  { value: "high", label: "High", color: "#EA580C" },
  { value: "critical", label: "Critical", color: "#DC2626" },
];

const statuses = [
  { value: "new", label: "New" },
  { value: "under_review", label: "Under Review" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "declined", label: "Declined" },
];

export function AdminStatusForm({ postId, currentStatus, currentResponse, currentReleaseNote, currentPriority, currentValueScore }: AdminStatusFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [adminResponse, setAdminResponse] = useState(currentResponse ?? "");
  const [releaseNote, setReleaseNote] = useState(currentReleaseNote ?? "");
  const [priority, setPriority] = useState(currentPriority ?? "");
  const [valueScore, setValueScore] = useState<string>(currentValueScore?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const payload = JSON.stringify({
      status,
      admin_response: adminResponse.trim() || null,
      release_note: releaseNote.trim() || null,
      priority: priority || null,
      value_score: valueScore ? parseInt(valueScore, 10) : null,
    });

    // Retry once after a delay to handle Fly.io DB cold starts
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`/api/feedback/${postId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });

        if (res.ok) {
          setMessage("Updated");
          router.refresh();
          setSaving(false);
          return;
        }

        // On 500, retry once (likely DB cold start)
        if (res.status >= 500 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }

        const data = await res.json();
        setMessage(data.error || "Failed to update");
        setSaving(false);
        return;
      } catch {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        setMessage("Failed to update");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
          Admin Controls
        </h3>
        <WeightedScoreDisplay priority={priority} valueScore={valueScore} />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
          Status
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
          style={{
            borderColor: "var(--border)",
            background: "var(--background)",
            color: "var(--foreground)",
          }}
        >
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Triage row: Priority + Value Score */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
            Priority
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{
              borderColor: "var(--border)",
              background: "var(--background)",
              color: priority ? (priorities.find(p => p.value === priority)?.color ?? "var(--foreground)") : "var(--muted)",
            }}
          >
            {priorities.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
            Value (1–5)
          </label>
          <select
            value={valueScore}
            onChange={(e) => setValueScore(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{
              borderColor: "var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
            }}
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
          Admin Response
        </label>
        <textarea
          value={adminResponse}
          onChange={(e) => setAdminResponse(e.target.value)}
          rows={3}
          maxLength={5000}
          placeholder="Optional response visible to all users..."
          className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2"
          style={{
            borderColor: "var(--border)",
            background: "var(--background)",
            color: "var(--foreground)",
          }}
        />
      </div>

      {/* Release note — shown when status is "done" */}
      {status === "done" && (
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "#047857" }}>
            Release Note
          </label>
          <textarea
            value={releaseNote}
            onChange={(e) => setReleaseNote(e.target.value)}
            rows={3}
            maxLength={5000}
            placeholder="Write a release note for users to see... This will be shown publicly in the Recently Shipped section and credit the original poster."
            className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2"
            style={{
              borderColor: "#6EE7B7",
              background: "#ECFDF5",
              color: "var(--foreground)",
            }}
          />
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            This note will appear in the Recently Shipped section and the original poster will be credited.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
          style={{ background: "var(--accent)", color: "#fff", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Saving..." : "Update"}
        </button>
        {message && (
          <span className="text-xs" style={{ color: message === "Updated" ? "#047857" : "#B91C1C" }}>
            {message}
          </span>
        )}
      </div>
    </form>
  );
}

function WeightedScoreDisplay({ priority, valueScore }: { priority: string; valueScore: string }) {
  const priorityNum =
    priority === "critical" ? 4
    : priority === "high" ? 3
    : priority === "medium" ? 2
    : priority === "low" ? 1
    : 0;

  const value = valueScore ? parseInt(valueScore, 10) : 0;

  if (priorityNum === 0 && value === 0) {
    return (
      <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
        Score: —
      </span>
    );
  }

  const score = Math.round((priorityNum / 4) * 40 + (value / 5) * 40);
  const color = score >= 56 ? "#047857" : score >= 40 ? "#B45309" : "#6B7280";

  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums"
      style={{ color }}
      title={`Priority: ${priorityNum}/4, Value: ${value}/5 (+ up to 20 from votes)`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
      Score: {score}
      <span style={{ color: "var(--muted)", fontWeight: 400 }}>/80 +votes</span>
    </span>
  );
}
