"use client";

import { useState, useRef, useCallback } from "react";

export interface MentionUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface UseMentionAutocompleteOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  text: string;
  setText: (value: string) => void;
}

export function useMentionAutocomplete({
  textareaRef,
  text,
  setText,
}: UseMentionAutocompleteOptions) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function detectMention(
    value: string,
    cursorPos: number
  ): { query: string; start: number } | null {
    let i = cursorPos - 1;
    while (i >= 0) {
      const ch = value[i];
      if (ch === "@") {
        if (i === 0 || /\s/.test(value[i - 1])) {
          const query = value.substring(i + 1, cursorPos);
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

  const handleMentionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setText(value);

      const cursorPos = e.target.selectionStart;
      const mention = detectMention(value, cursorPos);

      if (mention && mention.query.length >= 1) {
        setMentionStart(mention.start);
        setMentionQuery(mention.query);
        setMentionIndex(0);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
          try {
            const res = await fetch(
              `/api/users/mention-search?q=${encodeURIComponent(mention.query)}`
            );
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
    },
    [setText]
  );

  const insertMention = useCallback(
    (user: MentionUser) => {
      const before = text.substring(0, mentionStart);
      const after = text.substring(
        textareaRef.current?.selectionStart ?? text.length
      );
      const newText = `${before}@${user.username} ${after}`;
      setText(newText);
      setMentionQuery(null);
      setMentionUsers([]);

      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          const pos = mentionStart + user.username.length + 2;
          ta.focus();
          ta.setSelectionRange(pos, pos);
        }
      });
    },
    [text, mentionStart, textareaRef, setText]
  );

  const handleMentionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionQuery !== null && mentionUsers.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((prev) =>
            Math.min(prev + 1, mentionUsers.length - 1)
          );
          return true;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((prev) => Math.max(prev - 1, 0));
          return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertMention(mentionUsers[mentionIndex]);
          return true;
        }
        if (e.key === "Escape") {
          setMentionQuery(null);
          setMentionUsers([]);
          return true;
        }
      }
      return false;
    },
    [mentionQuery, mentionUsers, mentionIndex, insertMention]
  );

  const showDropdown = mentionQuery !== null && mentionUsers.length > 0;

  return {
    mentionUsers,
    mentionIndex,
    showDropdown,
    handleMentionChange,
    handleMentionKeyDown,
    insertMention,
  };
}
