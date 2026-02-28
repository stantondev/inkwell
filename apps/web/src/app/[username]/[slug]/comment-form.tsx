"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface MentionUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function CommentForm({ entryId, isLoggedIn }: { entryId: string; isLoggedIn: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border p-4 text-sm text-center"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        <Link href="/login" className="font-medium hover:underline"
          style={{ color: "var(--accent)" }}>
          Sign in
        </Link>{" "}
        to leave a comment.
      </div>
    );
  }

  function detectMention(value: string, cursorPos: number): { query: string; start: number } | null {
    // Walk backwards from cursor to find @ trigger
    let i = cursorPos - 1;
    while (i >= 0) {
      const ch = value[i];
      if (ch === "@") {
        // Found @, check it's at start or preceded by whitespace
        if (i === 0 || /\s/.test(value[i - 1])) {
          const query = value.substring(i + 1, cursorPos);
          // Only trigger if query is purely alphanumeric/underscore/hyphen
          if (/^[a-zA-Z0-9_-]*$/.test(query)) {
            return { query, start: i };
          }
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
      i--;
    }
    return null;
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setText(value);

    const cursorPos = e.target.selectionStart;
    const mention = detectMention(value, cursorPos);

    if (mention && mention.query.length >= 1) {
      setMentionStart(mention.start);
      setMentionQuery(mention.query);
      setMentionIndex(0);

      // Debounced search
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/users/mention-search?q=${encodeURIComponent(mention.query)}`);
          const data = await res.json();
          setMentionUsers(data.data || []);
        } catch {
          setMentionUsers([]);
        }
      }, 200);
    } else {
      setMentionQuery(null);
      setMentionUsers([]);
    }
  }

  function insertMention(user: MentionUser) {
    const before = text.substring(0, mentionStart);
    const after = text.substring(textareaRef.current?.selectionStart ?? text.length);
    const newText = `${before}@${user.username} ${after}`;
    setText(newText);
    setMentionQuery(null);
    setMentionUsers([]);

    // Refocus textarea and place cursor after mention
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const pos = mentionStart + user.username.length + 2; // @username + space
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionUsers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => Math.min(prev + 1, mentionUsers.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionUsers[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        setMentionUsers([]);
        return;
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/entries/${entryId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_html: `<p>${text.replace(/\n/g, "<br>")}</p>` }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to post comment");
      } else {
        setText("");
        router.refresh();
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const showDropdown = mentionQuery !== null && mentionUsers.length > 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder="Write a comment… (type @ to mention someone)"
          className="w-full rounded-xl border px-4 py-3 text-sm bg-transparent outline-none focus:ring-2 focus:ring-[var(--accent)] transition resize-none"
          style={{ borderColor: "var(--border)" }}
        />
        {showDropdown && (
          <div
            className="absolute left-0 right-0 z-50 rounded-lg border shadow-lg overflow-hidden"
            style={{ background: "var(--surface)", borderColor: "var(--border)", bottom: "100%", marginBottom: "4px" }}
          >
            {mentionUsers.map((user, i) => (
              <button
                key={user.id}
                type="button"
                onClick={() => insertMention(user)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors"
                style={{
                  background: i === mentionIndex ? "var(--accent-light, rgba(45, 74, 138, 0.1))" : "transparent",
                }}
              >
                <div
                  className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-medium"
                  style={{
                    background: user.avatar_url ? undefined : "var(--accent)",
                    color: user.avatar_url ? undefined : "#fff",
                    backgroundImage: user.avatar_url ? `url(${user.avatar_url})` : undefined,
                    backgroundSize: "cover",
                  }}
                >
                  {!user.avatar_url && (user.display_name?.[0] || user.username[0]).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <span className="font-medium">{user.display_name || user.username}</span>
                  <span className="ml-1.5" style={{ color: "var(--muted)" }}>@{user.username}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={submitting || !text.trim()}
          className="rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50 transition"
          style={{ background: "var(--accent)", color: "#fff" }}>
          {submitting ? "Posting…" : "Post comment"}
        </button>
        {error && <span className="text-sm" style={{ color: "var(--danger)" }}>{error}</span>}
      </div>
    </form>
  );
}
