"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMentionAutocomplete } from "@/hooks/use-mention-autocomplete";
import { MentionDropdown } from "@/components/mention-dropdown";
import { OPEN_JOT_EVENT, STICKY_COLORS, STICKY_MAX_CHARS, type StickyColor } from "@/lib/stickies";

/** Sent with OPEN_JOT_EVENT to edit an existing sticky instead of writing a new one. */
export interface JotEditDetail {
  id: string;
  body_html: string;
  sticky_color?: string | null;
  privacy?: string;
}

/** Window event fired after a sticky is posted or edited; detail is the API entry. */
export const STICKY_SAVED_EVENT = "inkwell-sticky-saved";

const PRIVACY_OPTIONS = [
  { id: "public", label: "Everyone" },
  { id: "friends_only", label: "Pen pals" },
  { id: "private", label: "Only me" },
];

/**
 * Turn a sticky's HTML back into the text its writer typed: paragraphs and
 * line breaks back to newlines, links back to their full URL (the page shows
 * a shortened one), hashtags and mentions back to #tag / @name.
 */
function htmlToText(html: string): string {
  if (typeof window === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  doc.querySelectorAll("a").forEach((a) => {
    const cls = a.getAttribute("class") || "";
    const text = cls.includes("hashtag") || cls.includes("mention") ? a.textContent || "" : a.getAttribute("href") || a.textContent || "";
    a.replaceWith(text);
  });
  const paragraphs = Array.from(doc.querySelectorAll("p")).map((p) => p.textContent || "");
  return (paragraphs.length ? paragraphs.join("\n\n") : doc.body.textContent || "").trim();
}

/**
 * The Jot composer: a sticky note that opens over any page for writing a
 * short post. Mounted once in the app shell; opened with `openJot()` or by
 * dispatching OPEN_JOT_EVENT with a JotEditDetail to edit.
 */
export function JotComposer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [color, setColor] = useState<StickyColor>("yellow");
  const [privacy, setPrivacy] = useState("public");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState<{ href: string; edited: boolean } | null>(null);
  const [mounted, setMounted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const {
    mentionUsers,
    mentionIndex,
    showDropdown,
    handleMentionChange,
    handleMentionKeyDown,
    insertMention,
  } = useMentionAutocomplete({ textareaRef, text, setText });

  // Open (new or edit) from anywhere
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<JotEditDetail | undefined>).detail;
      setError("");
      setPosted(null);
      if (detail?.id) {
        setEditing(detail.id);
        setText(htmlToText(detail.body_html));
        setColor((STICKY_COLORS.find((c) => c.id === detail.sticky_color)?.id ?? "yellow") as StickyColor);
        setPrivacy(detail.privacy && PRIVACY_OPTIONS.some((p) => p.id === detail.privacy) ? detail.privacy : "public");
      } else if (editing) {
        // Leaving an edit: start a fresh sticky rather than reusing the old text
        setEditing(null);
        setText("");
      }
      setOpen(true);
    }
    window.addEventListener(OPEN_JOT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_JOT_EVENT, onOpen);
  }, [editing]);

  // Focus the textarea, lock page scroll while open
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 30);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Grow the note with the text (up to half the screen, then scroll)
  useEffect(() => {
    const el = textareaRef.current;
    if (!open || !el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.5))}px`;
  }, [text, open]);

  // Hide the "posted" note after a few seconds
  useEffect(() => {
    if (!posted) return;
    const t = setTimeout(() => setPosted(null), 6000);
    return () => clearTimeout(t);
  }, [posted]);

  const close = useCallback(() => {
    setOpen(false);
    setError("");
  }, []);

  const length = text.trim().length;
  const over = length > STICKY_MAX_CHARS;
  const canPost = length > 0 && !over && !saving;

  async function submit() {
    if (!canPost) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(editing ? `/api/stickies/${editing}` : "/api/stickies", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, color, privacy }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't save your sticky. Try again.");
        return;
      }
      const entry = data.data;
      window.dispatchEvent(new CustomEvent(STICKY_SAVED_EVENT, { detail: { entry, edited: !!editing } }));
      setPosted({ href: `/${entry.author.username}/${entry.slug}`, edited: !!editing });
      setText("");
      setEditing(null);
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't reach Inkwell. Your sticky is still here; try again.");
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (handleMentionKeyDown(e)) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  // Esc closes; Tab stays inside the note
  function onDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && !showDropdown) {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "Tab" && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'textarea, select, button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  if (!mounted) return null;

  return createPortal(
    <>
      {open && (
        <>
          <div className="jot-backdrop" onClick={close} aria-hidden="true" />
          <div className="jot-wrap">
            <div
              ref={dialogRef}
              className="jot-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={editing ? "Edit sticky" : "Jot a sticky"}
              onKeyDown={onDialogKeyDown}
            >
              <div className={`sticky-note sticky-note--${color}`}>
                <span className="sticky-note-tape" aria-hidden="true" />
                <div className="sticky-note-inner">
                  <div className="relative">
                    <textarea
                      ref={textareaRef}
                      className="jot-textarea"
                      value={text}
                      onChange={handleMentionChange}
                      onKeyDown={onKeyDown}
                      placeholder="What's on your mind?"
                      aria-label="Sticky text"
                      maxLength={STICKY_MAX_CHARS + 200}
                    />
                    {showDropdown && (
                      <MentionDropdown users={mentionUsers} activeIndex={mentionIndex} onSelect={insertMention} position="below" />
                    )}
                  </div>

                  <div className="jot-toolbar">
                    <div className="jot-swatches" role="radiogroup" aria-label="Paper color">
                      {STICKY_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          role="radio"
                          aria-checked={color === c.id}
                          aria-label={c.label}
                          title={c.label}
                          className="jot-swatch"
                          style={{ background: `var(--sticky-${c.id})` }}
                          onClick={() => setColor(c.id)}
                        />
                      ))}
                    </div>
                    <label className="flex items-center gap-1.5">
                      <span className="sr-only">Who can see this</span>
                      <select className="jot-select" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
                        {PRIVACY_OPTIONS.map((p) => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                      </select>
                    </label>
                    <span className={`jot-count${over ? " jot-count--over" : ""}`} aria-live="polite">
                      {STICKY_MAX_CHARS - length}
                    </span>
                  </div>

                  {error && <p className="jot-error" role="alert">{error}</p>}

                  <div className="jot-footer">
                    <span className="jot-hint">
                      {privacy === "public" ? "Shows in Feed, Explore and the fediverse" : privacy === "friends_only" ? "Only your pen pals see this" : "Only you see this"}
                    </span>
                    <span className="flex items-center">
                      <button type="button" className="jot-cancel" onClick={close}>Cancel</button>
                      <button type="button" className="jot-post" onClick={submit} disabled={!canPost}>
                        {saving ? "Sticking…" : editing ? "Save" : "Stick it"}
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {posted && !open && (
        <div className="jot-toast" role="status">
          {posted.edited ? "Sticky updated." : "Stuck to your journal."}{" "}
          <Link href={posted.href} onClick={() => setPosted(null)}>View</Link>
        </div>
      )}
    </>,
    document.body
  );
}
