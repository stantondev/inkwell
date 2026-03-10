"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import CharacterCount from "@tiptap/extension-character-count";
import Typography from "@tiptap/extension-typography";
import type { Editor } from "@tiptap/react";
import type { MentionUser } from "@/hooks/use-mention-autocomplete";
import { MentionDropdown } from "@/components/mention-dropdown";

interface CommentEditorProps {
  onSubmit: (html: string) => void;
  placeholder?: string;
  compact?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  initialContent?: string;
  disabled?: boolean;
  submitLabel?: string;
}

export function CommentEditor({
  onSubmit,
  placeholder = "Write in the margins…",
  compact = false,
  maxLength = 2000,
  autoFocus = false,
  initialContent = "",
  disabled = false,
  submitLabel = "Post",
}: CommentEditorProps) {
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const submittingRef = useRef(false);
  const editorWrapRef = useRef<HTMLDivElement>(null);

  // Mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = useCallback(() => {
    if (submittingRef.current) return;
    const editor = editorRef.current;
    if (!editor) return;
    const html = editor.getHTML();
    if (!html || html === "<p></p>") return;
    submittingRef.current = true;
    onSubmitRef.current(html);
    editor.commands.clearContent();
    submittingRef.current = false;
  }, []);

  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Placeholder.configure({ placeholder }),
      CharacterCount.configure({ limit: maxLength }),
      Typography,
    ],
    content: initialContent || "",
    editable: !disabled,
    onUpdate: ({ editor: e }) => {
      detectMentionInEditor(e);
    },
    editorProps: {
      attributes: {
        class: compact ? "comment-editor-tiptap comment-editor-compact-tiptap" : "comment-editor-tiptap",
      },
      handleKeyDown: (_view, event) => {
        // Handle mention keyboard navigation
        if (mentionQuery !== null && mentionUsers.length > 0) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setMentionIndex((prev) => Math.min(prev + 1, mentionUsers.length - 1));
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setMentionIndex((prev) => Math.max(prev - 1, 0));
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            insertMentionRef.current?.();
            return true;
          }
          if (event.key === "Escape") {
            setMentionQuery(null);
            setMentionUsers([]);
            return true;
          }
        }

        // Compact mode: Enter to submit, Shift+Enter for newline
        if (compact && event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          handleSubmit();
          return true;
        }

        // Cmd/Ctrl+Enter to submit
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          handleSubmit();
          return true;
        }
        return false;
      },
    },
    immediatelyRender: false,
  });

  editorRef.current = editor;

  useEffect(() => {
    if (autoFocus && editor) {
      setTimeout(() => editor.commands.focus("end"), 50);
    }
  }, [autoFocus, editor]);

  // Detect @mention in TipTap editor content
  const detectMentionInEditor = useCallback((e: Editor) => {
    const { state } = e;
    const { from } = state.selection;
    const text = state.doc.textBetween(
      Math.max(0, from - 50),
      from,
      "\n"
    );

    // Look backward for @ pattern
    let i = text.length - 1;
    while (i >= 0) {
      const ch = text[i];
      if (ch === "@") {
        if (i === 0 || /\s/.test(text[i - 1])) {
          const query = text.substring(i + 1);
          if (/^[a-zA-Z0-9_-]*$/.test(query) && query.length >= 1) {
            setMentionQuery(query);
            setMentionIndex(0);

            // Get cursor coordinates for dropdown positioning
            try {
              const coords = e.view.coordsAtPos(from);
              const wrapRect = editorWrapRef.current?.getBoundingClientRect();
              if (wrapRect) {
                setMentionPos({
                  top: coords.top - wrapRect.top,
                  left: coords.left - wrapRect.left,
                });
              }
            } catch {
              // coords may fail at edge positions
            }

            // Fetch users with debounce
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(async () => {
              try {
                const res = await fetch(
                  `/api/users/mention-search?q=${encodeURIComponent(query)}`
                );
                const data = await res.json();
                setMentionUsers(data.data || []);
              } catch {
                setMentionUsers([]);
              }
            }, 200);
            return;
          }
        }
        break;
      }
      if (/\s/.test(ch)) break;
      i--;
    }

    setMentionQuery(null);
    setMentionUsers([]);
  }, []);

  // Insert mention into TipTap
  const insertMention = useCallback(() => {
    if (!editor || mentionQuery === null || mentionUsers.length === 0) return;
    const user = mentionUsers[mentionIndex];
    if (!user) return;

    const { state } = editor;
    const { from } = state.selection;

    // Find the @ position by looking backward
    const textBefore = state.doc.textBetween(
      Math.max(0, from - mentionQuery.length - 1),
      from,
      "\n"
    );
    const atPos = from - mentionQuery.length - 1;

    // Delete @query and insert @username
    editor
      .chain()
      .focus()
      .deleteRange({ from: atPos, to: from })
      .insertContent(`@${user.username} `)
      .run();

    setMentionQuery(null);
    setMentionUsers([]);
  }, [editor, mentionQuery, mentionUsers, mentionIndex]);

  const insertMentionRef = useRef(insertMention);
  insertMentionRef.current = insertMention;

  const addLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  const charCount = editor.storage.characterCount?.characters() ?? 0;

  return (
    <div
      ref={editorWrapRef}
      className={`comment-editor-wrap ${compact ? "comment-editor-compact" : ""} ${isFocused ? "comment-editor-focused" : ""}`}
    >
      {/* Toolbar — hidden in compact mode */}
      {!compact && (
        <div className="comment-editor-toolbar" style={{ opacity: isFocused ? 1 : 0, height: isFocused ? undefined : 0, overflow: "hidden", transition: "opacity 0.15s" }}>
          <div className="comment-editor-toolbar-group">
            <button
              type="button"
              className={`comment-editor-btn ${editor.isActive("bold") ? "comment-editor-btn-active" : ""}`}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title="Bold (Cmd+B)"
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              className={`comment-editor-btn ${editor.isActive("italic") ? "comment-editor-btn-active" : ""}`}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              title="Italic (Cmd+I)"
            >
              <em>I</em>
            </button>
            <button
              type="button"
              className={`comment-editor-btn ${editor.isActive("link") ? "comment-editor-btn-active" : ""}`}
              onClick={addLink}
              title="Add link"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </button>
          </div>
          <span className="comment-editor-char-count" style={{ color: charCount > maxLength * 0.9 ? "var(--danger, #ef4444)" : "var(--muted)" }}>
            {charCount} / {maxLength}
          </span>
        </div>
      )}

      {/* Editor content */}
      <div
        className="comment-editor-content"
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          // Don't blur if clicking toolbar or mention dropdown
          if (editorWrapRef.current?.contains(e.relatedTarget as Node)) return;
          setIsFocused(false);
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Mention dropdown */}
      {mentionQuery !== null && mentionUsers.length > 0 && mentionPos && (
        <div
          style={{
            position: "absolute",
            top: mentionPos.top - 4,
            left: Math.min(mentionPos.left, 200),
            transform: "translateY(-100%)",
            zIndex: 50,
            width: "min(260px, calc(100% - 16px))",
          }}
        >
          <div
            className="mention-dropdown rounded-lg border shadow-lg overflow-hidden"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              maxHeight: "min(200px, 40dvh)",
              overflowY: "auto",
            }}
          >
            {mentionUsers.map((user, i) => (
              <button
                key={user.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setMentionIndex(i);
                  insertMentionRef.current?.();
                }}
                className="mention-dropdown-item w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors"
                style={{
                  background:
                    i === mentionIndex
                      ? "var(--accent-light, rgba(45, 74, 138, 0.1))"
                      : "transparent",
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
        </div>
      )}

      {/* Submit button — shown below editor when focused or has content */}
      {!compact && (isFocused || charCount > 0) && (
        <div className="comment-editor-footer">
          <button
            type="button"
            className="comment-editor-submit"
            onClick={handleSubmit}
            disabled={charCount === 0 || disabled}
          >
            {submitLabel}
          </button>
        </div>
      )}
    </div>
  );
}
