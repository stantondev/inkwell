"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function PostByEmailPage() {
  const [loading, setLoading] = useState(true);
  const [isPlus, setIsPlus] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [emailAddress, setEmailAddress] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const data = await res.json();
        const user = data.data;
        setIsPlus((user.subscription_tier || "free") === "plus");
        setEnabled(!!user.post_email_enabled);
        setEmailAddress(user.post_email_address || null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleEnable() {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/post-email/enable", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setEnabled(true);
        setEmailAddress(data.post_email_address);
      } else {
        setError(data.error || "Failed to enable");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDisable() {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/post-email/disable", { method: "POST" });
      if (res.ok) {
        setEnabled(false);
        setEmailAddress(null);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to disable");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRegenerate() {
    setActionLoading(true);
    setError(null);
    setShowRegenConfirm(false);
    try {
      const res = await fetch("/api/me/post-email/regenerate", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setEmailAddress(data.post_email_address);
      } else {
        setError(data.error || "Failed to regenerate");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setActionLoading(false);
    }
  }

  function handleCopy() {
    if (emailAddress) {
      navigator.clipboard.writeText(emailAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div>
        <h1 style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontSize: 22, marginBottom: 4 }}>
          Post by Email
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  if (!isPlus) {
    return (
      <div>
        <h1 style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontSize: 22, marginBottom: 8 }}>
          Post by Email
        </h1>
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 24,
            background: "var(--surface)",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 15, marginBottom: 12, color: "var(--foreground)" }}>
            Post by Email is a Plus feature. Send an email to your unique address and it becomes a published journal entry.
          </p>
          <Link
            href="/settings/billing"
            style={{
              display: "inline-block",
              padding: "8px 20px",
              background: "var(--accent)",
              color: "white",
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Upgrade to Plus
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontSize: 22, marginBottom: 4 }}>
        Post by Email
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20 }}>
        Send an email to your unique address and it becomes a published journal entry.
      </p>

      {error && (
        <div style={{ color: "var(--danger, #dc2626)", fontSize: 14, marginBottom: 16, padding: "8px 12px", background: "var(--danger-light, #fef2f2)", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {!enabled ? (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 24,
            background: "var(--surface)",
          }}
        >
          <p style={{ fontSize: 14, marginBottom: 16, color: "var(--foreground)" }}>
            Enable Post by Email to get a unique email address. Any email you send to it will be published as a journal entry on your profile.
          </p>
          <button
            onClick={handleEnable}
            disabled={actionLoading}
            style={{
              padding: "8px 20px",
              background: "var(--accent)",
              color: "white",
              border: "none",
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 500,
              cursor: actionLoading ? "wait" : "pointer",
              opacity: actionLoading ? 0.7 : 1,
            }}
          >
            {actionLoading ? "Enabling..." : "Enable Post by Email"}
          </button>
        </div>
      ) : (
        <>
          {/* Email address display */}
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 20,
              background: "var(--surface)",
              marginBottom: 20,
            }}
          >
            <label style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>
              Your email address
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 14,
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  color: "var(--foreground)",
                }}
              >
                {emailAddress}
              </code>
              <button
                onClick={handleCopy}
                style={{
                  padding: "10px 16px",
                  background: copied ? "var(--accent)" : "var(--background)",
                  color: copied ? "white" : "var(--foreground)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s",
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* How it works */}
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 20,
              background: "var(--surface)",
              marginBottom: 20,
            }}
          >
            <h3 style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontSize: 16, marginBottom: 12 }}>
              How it works
            </h3>
            <ul style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
              <li>Send an email to the address above from any email client</li>
              <li>The <strong style={{ color: "var(--foreground)" }}>subject</strong> becomes the entry title</li>
              <li>The <strong style={{ color: "var(--foreground)" }}>email body</strong> becomes the entry content</li>
              <li><strong style={{ color: "var(--foreground)" }}>Image attachments</strong> are included automatically (first image = cover)</li>
              <li>Entries are published as <strong style={{ color: "var(--foreground)" }}>public</strong> by default</li>
              <li>Email signatures and quoted replies are stripped automatically</li>
              <li>Maximum 20 email posts per day</li>
            </ul>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {!showRegenConfirm ? (
              <button
                onClick={() => setShowRegenConfirm(true)}
                style={{
                  padding: "8px 16px",
                  background: "var(--background)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                  borderRadius: 20,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Regenerate address
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>This will invalidate your current address.</span>
                <button
                  onClick={handleRegenerate}
                  disabled={actionLoading}
                  style={{
                    padding: "6px 14px",
                    background: "var(--accent)",
                    color: "white",
                    border: "none",
                    borderRadius: 16,
                    fontSize: 13,
                    cursor: actionLoading ? "wait" : "pointer",
                  }}
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowRegenConfirm(false)}
                  style={{
                    padding: "6px 14px",
                    background: "var(--background)",
                    color: "var(--muted)",
                    border: "1px solid var(--border)",
                    borderRadius: 16,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            <button
              onClick={handleDisable}
              disabled={actionLoading}
              style={{
                padding: "8px 16px",
                background: "transparent",
                color: "var(--danger, #dc2626)",
                border: "1px solid var(--danger, #dc2626)",
                borderRadius: 20,
                fontSize: 13,
                cursor: actionLoading ? "wait" : "pointer",
                opacity: actionLoading ? 0.7 : 1,
              }}
            >
              Disable Post by Email
            </button>
          </div>
        </>
      )}
    </div>
  );
}
