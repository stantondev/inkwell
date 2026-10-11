"use client";

import { useState } from "react";

const ENTRY_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "unlabeled_sensitive", label: "Unlabeled sensitive content" },
  { value: "csam_illegal", label: "CSAM / Illegal content" },
  { value: "other", label: "Other" },
];

const ACCOUNT_REASONS = [
  { value: "spam", label: "Spam or advertising" },
  { value: "harassment", label: "Harassment" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "impersonation", label: "Pretending to be someone else" },
  { value: "csam_illegal", label: "CSAM / Illegal content" },
  { value: "other", label: "Other" },
];

// Report an entry (`entryId`) or a whole account (`username`).
type ReportModalProps =
  | { entryId: string; username?: undefined; onClose: () => void }
  | { username: string; entryId?: undefined; onClose: () => void };

export function ReportModal({ entryId, username, onClose }: ReportModalProps) {
  const isAccount = !entryId;
  const REASONS = isAccount ? ACCOUNT_REASONS : ENTRY_REASONS;
  const endpoint = isAccount
    ? `/api/users/${encodeURIComponent(username ?? "")}/report`
    : `/api/entries/${entryId}/report`;
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details: details || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to submit report");
      }
      setSuccess(true);
      setTimeout(onClose, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md rounded-xl border p-6"
        style={{ background: "var(--surface)", borderColor: "var(--border)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {success ? (
          <div className="text-center py-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p className="text-sm font-medium">Report submitted. Thank you.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3
              className="text-lg font-semibold mb-4"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              {isAccount ? `Report @${username}` : "Report Entry"}
            </h3>
            {isAccount && (
              <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
                For the account as a whole: its profile, pen pal requests or letters. Inkwell&apos;s moderators read
                every report; @{username} isn&apos;t told who sent it.
              </p>
            )}

            <label className="block text-sm font-medium mb-1.5">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm mb-4"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}
              required
            >
              <option value="">Select a reason...</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            <label className="block text-sm font-medium mb-1.5">
              Details <span style={{ color: "var(--muted)" }}>(optional)</span>
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm mb-4 resize-none"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}
              placeholder={isAccount ? "What did they do? Links help." : "Additional context..."}
            />

            {error && (
              <p className="text-sm mb-3" style={{ color: "var(--danger, #dc2626)" }}>{error}</p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-full text-sm border"
                style={{ borderColor: "var(--border)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!reason || submitting}
                className="px-4 py-2 rounded-full text-sm font-medium text-white"
                style={{ background: "var(--accent)", opacity: (!reason || submitting) ? 0.5 : 1 }}
              >
                {submitting ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
