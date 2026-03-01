"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface InviteStats {
  sent: number;
  accepted: number;
  pending: number;
  today_count: number;
  daily_limit: number;
}

interface InvitationRecord {
  id: string;
  email: string;
  status: string;
  message: string | null;
  accepted_at: string | null;
  expires_at: string;
  inserted_at: string;
  accepted_by: { username: string; display_name: string; avatar_url: string | null } | null;
}

export default function InviteSettingsPage() {
  const [inviteUrl, setInviteUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<InviteStats | null>(null);
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);

  // Email invite form
  const [emails, setEmails] = useState([""]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Copy state
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [codeRes, statsRes, invRes] = await Promise.all([
        fetch("/api/invite-code"),
        fetch("/api/invitations/stats"),
        fetch("/api/invitations"),
      ]);

      if (codeRes.ok) {
        const codeData = await codeRes.json();
        setInviteUrl(codeData.url || "");
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (invRes.ok) {
        const invData = await invRes.json();
        setInvitations(invData.invitations || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the input
    }
  }

  async function handleShare() {
    if (!inviteUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join me on Inkwell",
          text: "I've been writing on Inkwell -- a social journal on the open web. Come join me!",
          url: inviteUrl,
        });
      } catch {
        // User cancelled
      }
    }
  }

  function handleShareX() {
    if (!inviteUrl) return;
    const text = encodeURIComponent(`I've been writing on @inkwellsocial -- a social journal with no algorithms and no ads. Join me: ${inviteUrl}`);
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
  }

  function handleShareBluesky() {
    if (!inviteUrl) return;
    const text = encodeURIComponent(`I've been writing on Inkwell — a social journal with no algorithms and no ads. Join me: ${inviteUrl}`);
    window.open(`https://bsky.app/intent/compose?text=${text}`, "_blank");
  }

  function handleShareMastodon() {
    if (!inviteUrl) return;
    const text = encodeURIComponent(`I've been writing on #Inkwell — a social journal on the open web, no algorithms and no ads. Join me: ${inviteUrl}`);
    window.open(`https://mastodonshare.com/?text=${text}`, "_blank");
  }

  function handleShareFacebook() {
    if (!inviteUrl) return;
    const url = encodeURIComponent(inviteUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank");
  }

  function handleShareLinkedIn() {
    if (!inviteUrl) return;
    const url = encodeURIComponent(inviteUrl);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank");
  }

  function addEmailField() {
    if (emails.length < 5) {
      setEmails([...emails, ""]);
    }
  }

  function updateEmail(index: number, value: string) {
    const updated = [...emails];
    updated[index] = value;
    setEmails(updated);
  }

  function removeEmail(index: number) {
    if (emails.length <= 1) return;
    setEmails(emails.filter((_, i) => i !== index));
  }

  async function handleSendInvites(e: React.FormEvent) {
    e.preventDefault();
    const validEmails = emails.filter((em) => em.trim() && em.includes("@"));
    if (validEmails.length === 0) return;

    setSending(true);
    setSendError(null);
    setSendSuccess(false);

    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: validEmails,
          message: message.trim() || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const errors = data.results?.filter((r: { status: string; error?: string }) => r.status === "error");
        if (errors?.length > 0) {
          setSendError(errors[0].error);
        } else {
          setSendSuccess(true);
          setEmails([""]);
          setMessage("");
          setTimeout(() => setSendSuccess(false), 3000);
          // Reload stats and history
          loadData();
        }
      } else {
        const data = await res.json();
        setSendError(data.error || "Failed to send invitations");
      }
    } catch {
      setSendError("Could not reach the server");
    } finally {
      setSending(false);
    }
  }

  const remaining = stats ? stats.daily_limit - stats.today_count : 0;

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Section 1: Your Invite Link */}
      <section className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h2 className="text-lg font-semibold mb-4"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic" }}>
          Your personal invite link
        </h2>

        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            readOnly
            value={inviteUrl}
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap"
            style={{ borderColor: "var(--border)", background: copied ? "var(--accent)" : "var(--surface)", color: copied ? "#fff" : "var(--foreground)" }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
            <button
              type="button"
              onClick={handleShare}
              className="rounded-full border px-4 py-1.5 text-xs font-medium transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                Share
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={handleShareBluesky}
            className="rounded-full border px-4 py-1.5 text-xs font-medium transition-colors"
            style={{ borderColor: "var(--border)" }}
          >
            Bluesky
          </button>
          <button
            type="button"
            onClick={handleShareMastodon}
            className="rounded-full border px-4 py-1.5 text-xs font-medium transition-colors"
            style={{ borderColor: "var(--border)" }}
          >
            Mastodon
          </button>
          <button
            type="button"
            onClick={handleShareX}
            className="rounded-full border px-4 py-1.5 text-xs font-medium transition-colors"
            style={{ borderColor: "var(--border)" }}
          >
            X
          </button>
          <button
            type="button"
            onClick={handleShareFacebook}
            className="rounded-full border px-4 py-1.5 text-xs font-medium transition-colors"
            style={{ borderColor: "var(--border)" }}
          >
            Facebook
          </button>
          <button
            type="button"
            onClick={handleShareLinkedIn}
            className="rounded-full border px-4 py-1.5 text-xs font-medium transition-colors"
            style={{ borderColor: "var(--border)" }}
          >
            LinkedIn
          </button>
        </div>

        <p className="text-xs mt-3 leading-relaxed" style={{ color: "var(--muted)" }}>
          Anyone who signs up through this link is connected to you. You&apos;ll get a notification when they join.
        </p>
      </section>

      {/* Section 2: Send a Sealed Letter */}
      <section className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h2 className="text-lg font-semibold mb-4"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic" }}>
          Send a sealed letter
        </h2>

        <form onSubmit={handleSendInvites} className="space-y-4">
          {emails.map((email, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => updateEmail(i, e.target.value)}
                placeholder="friend@example.com"
                className="flex-1 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
              />
              {emails.length > 1 && (
                <button type="button" onClick={() => removeEmail(i)}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{ color: "var(--muted)" }}>
                  Remove
                </button>
              )}
            </div>
          ))}

          {emails.length < 5 && (
            <button type="button" onClick={addEmailField}
              className="text-sm transition-colors"
              style={{ color: "var(--accent)" }}>
              + Add another
            </button>
          )}

          <div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 500))}
              placeholder="Add a personal note (optional)"
              rows={3}
              maxLength={500}
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
              style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
            />
            <div className="text-right text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {message.length}/500
            </div>
          </div>

          {sendError && (
            <p className="text-sm rounded-lg px-3 py-2" style={{ color: "var(--danger, #dc2626)" }}>
              {sendError}
            </p>
          )}

          {sendSuccess && (
            <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
              Invitations sent!
            </p>
          )}

          <div className="flex items-center justify-between">
            <button
              type="submit"
              disabled={sending || emails.every((e) => !e.trim()) || remaining <= 0}
              className="rounded-full px-6 py-2.5 text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {sending ? "Sending..." : "Seal & send invitations"}
            </button>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {remaining} of {stats?.daily_limit || 10} remaining today
            </span>
          </div>
        </form>
      </section>

      {/* Section 3: Invitation History */}
      <section className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h2 className="text-lg font-semibold mb-4"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic" }}>
          Sent invitations
        </h2>

        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: "Sent", value: stats.sent },
              { label: "Accepted", value: stats.accepted },
              { label: "Pending", value: stats.pending },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border p-3 text-center"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                <p className="text-xl font-semibold" style={{ color: "var(--accent)" }}>
                  {stat.value}
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Invitation list */}
        {invitations.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: "var(--muted)" }}>
            You haven&apos;t sent any invitations yet. Your friends are waiting!
          </p>
        ) : (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            {invitations.map((inv, i) => (
              <div key={inv.id}
                className={`flex items-center gap-3 px-4 py-3 ${i < invitations.length - 1 ? "border-b" : ""}`}
                style={{ borderColor: "var(--border)" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{inv.email}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {timeAgo(inv.inserted_at)}
                  </p>
                </div>

                {inv.status === "accepted" && inv.accepted_by ? (
                  <Link href={`/${inv.accepted_by.username}`}
                    className="flex items-center gap-2 text-xs font-medium"
                    style={{ color: "var(--accent)" }}>
                    <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0"
                      style={{ background: "var(--accent-light)" }}>
                      {inv.accepted_by.avatar_url ? (
                        <img src={inv.accepted_by.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="flex items-center justify-center w-full h-full text-[10px]"
                          style={{ color: "var(--accent)" }}>
                          {(inv.accepted_by.display_name || inv.accepted_by.username).charAt(0)}
                        </span>
                      )}
                    </div>
                    @{inv.accepted_by.username}
                  </Link>
                ) : null}

                <StatusBadge status={inv.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: "var(--background)", color: "var(--muted)", label: "Pending" },
    accepted: { bg: "var(--accent-light)", color: "var(--accent)", label: "Accepted" },
    expired: { bg: "var(--background)", color: "var(--muted)", label: "Expired" },
  };

  const s = styles[status] || styles.pending;

  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color, textDecoration: status === "expired" ? "line-through" : "none" }}>
      {s.label}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
