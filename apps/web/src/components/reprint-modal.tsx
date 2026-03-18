"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface QuotedEntry {
  id: string;
  title: string | null;
  excerpt: string | null;
  slug?: string | null;
  url?: string | null;
  cover_image_id?: string | null;
  published_at: string;
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    domain?: string;
  };
}

interface ReprintModalProps {
  entryId: string;
  isRemote: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ReprintModal({ entryId, isRemote, onClose, onSuccess }: ReprintModalProps) {
  const [quotedEntry, setQuotedEntry] = useState<QuotedEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [thoughts, setThoughts] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Fetch the quoted entry preview
  useEffect(() => {
    const previewPath = isRemote
      ? `/api/remote-entries/${entryId}/quote-preview`
      : `/api/entries/${entryId}/quote-preview`;

    fetch(previewPath, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        setQuotedEntry(json.data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load entry preview");
        setLoading(false);
      });
  }, [entryId, isRemote]);

  // Focus textarea when loaded
  useEffect(() => {
    if (!loading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [loading]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSubmit() {
    const stripped = thoughts.replace(/<[^>]+>/g, "").trim();
    if (!stripped) {
      setError("Please add your thoughts");
      return;
    }

    setSubmitting(true);
    setError(null);

    // Wrap plain text in paragraph tags
    const bodyHtml = thoughts
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => `<p>${escapeHtml(line.trim())}</p>`)
      .join("");

    const apiPath = isRemote
      ? `/api/remote-entries/${entryId}/reprint`
      : `/api/entries/${entryId}/reprint`;

    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_html: bodyHtml }),
        cache: "no-store",
      });

      if (res.ok) {
        await res.json();
        onSuccess?.();
        onClose();
        // Hard reload to the current page so the new reprint appears immediately
        window.location.reload();
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Failed to create reprint");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  const entryHref = quotedEntry
    ? isRemote
      ? quotedEntry.url || "#"
      : `/${quotedEntry.author.username}/${quotedEntry.slug}`
    : "#";

  return (
    <div className="reprint-modal-backdrop" onClick={onClose}>
      <div
        className="reprint-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Reprint with your thoughts"
      >
        <div className="reprint-modal-header">
          <h3>Reprint</h3>
          <button onClick={onClose} className="reprint-modal-close" aria-label="Close">
            &times;
          </button>
        </div>

        <div className="reprint-modal-body">
          {/* Text input for user's thoughts */}
          <textarea
            ref={textareaRef}
            value={thoughts}
            onChange={(e) => setThoughts(e.target.value)}
            placeholder="Add your thoughts..."
            className="reprint-modal-textarea"
            rows={4}
            maxLength={2000}
            disabled={submitting}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />

          {/* Preview of the entry being quoted */}
          {loading ? (
            <div className="reprint-modal-preview-loading">Loading preview...</div>
          ) : quotedEntry ? (
            <a href={entryHref} target={isRemote ? "_blank" : undefined} className="reprint-quote-card">
              <div className="reprint-quote-card-inner">
                {quotedEntry.cover_image_id && (
                  <img
                    src={`/api/images/${quotedEntry.cover_image_id}`}
                    alt=""
                    className="reprint-quote-cover"
                  />
                )}
                <div className="reprint-quote-content">
                  {quotedEntry.title && (
                    <div className="reprint-quote-title">{quotedEntry.title}</div>
                  )}
                  {quotedEntry.excerpt && (
                    <div className="reprint-quote-excerpt">{quotedEntry.excerpt}</div>
                  )}
                  <div className="reprint-quote-author">
                    {quotedEntry.author.avatar_url && (
                      <img
                        src={quotedEntry.author.avatar_url.startsWith("data:")
                          ? `/api/avatars/${quotedEntry.author.username}`
                          : quotedEntry.author.avatar_url}
                        alt=""
                        className="reprint-quote-avatar"
                      />
                    )}
                    <span>
                      {quotedEntry.author.display_name}
                      {quotedEntry.author.domain && (
                        <span className="reprint-quote-domain"> @{quotedEntry.author.domain}</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </a>
          ) : null}

          {error && <div className="reprint-modal-error">{error}</div>}
        </div>

        <div className="reprint-modal-footer">
          <span className="reprint-modal-hint">
            {thoughts.length}/2000
            {" · "}
            <kbd>{navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}</kbd>+<kbd>Enter</kbd> to submit
          </span>
          <div className="reprint-modal-actions">
            <button onClick={onClose} className="reprint-modal-btn-cancel" disabled={submitting}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="reprint-modal-btn-submit"
              disabled={submitting || !thoughts.trim()}
            >
              {submitting ? "Reprinting..." : "Reprint"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
