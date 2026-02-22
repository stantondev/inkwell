"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AdminStatusFormProps {
  postId: string;
  currentStatus: string;
  currentResponse: string | null;
  currentReleaseNote: string | null;
}

const statuses = [
  { value: "new", label: "New" },
  { value: "under_review", label: "Under Review" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "declined", label: "Declined" },
];

export function AdminStatusForm({ postId, currentStatus, currentResponse, currentReleaseNote }: AdminStatusFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [adminResponse, setAdminResponse] = useState(currentResponse ?? "");
  const [releaseNote, setReleaseNote] = useState(currentReleaseNote ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch(`/api/feedback/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          admin_response: adminResponse.trim() || null,
          release_note: releaseNote.trim() || null,
        }),
      });

      if (res.ok) {
        setMessage("Updated");
        router.refresh();
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to update");
      }
    } catch {
      setMessage("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
        Admin Controls
      </h3>

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
