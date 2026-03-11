"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import CharacterCount from "@tiptap/extension-character-count";
import Typography from "@tiptap/extension-typography";
import type { Editor } from "@tiptap/react";
import type { MentionUser } from "@/hooks/use-mention-autocomplete";

interface CircleEditorProps {
  onSubmit?: (html: string) => void;
  onChange?: (html: string) => void;
  placeholder?: string;
  compact?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  initialContent?: string;
  submitLabel?: string;
  disabled?: boolean;
}

export function CircleEditor({
  onSubmit,
  onChange,
  placeholder = "Share your thoughts…",
  compact = false,
  maxLength = 6000,
  autoFocus = false,
  initialContent = "",
  submitLabel = "Post",
  disabled = false,
}: CircleEditorProps) {
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const submittingRef = useRef(false);
  const editorWrapRef = useRef<HTMLDivElement>(null);

  // Mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmit = useCallback(() => {
    if (submittingRef.current) return;
    const editor = editorRef.current;
    if (!editor) return;
    const html = editor.getHTML();
    if (!html || html === "<p></p>") return;
    submittingRef.current = true;
    onSubmitRef.current?.(html);
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
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Underline,
      Placeholder.configure({ placeholder }),
      CharacterCount.configure({ limit: maxLength }),
      Typography,
    ],
    content: initialContent || "",
    editable: !disabled,
    onUpdate: ({ editor: e }) => {
      detectMentionInEditor(e);
      onChangeRef.current?.(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: compact
          ? "circle-editor-tiptap circle-editor-compact-tiptap"
          : "circle-editor-tiptap",
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

        // Compact mode: Cmd/Ctrl+Enter to submit
        if (compact && (event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          handleSubmit();
          return true;
        }

        // Non-compact: Cmd/Ctrl+Enter to submit
        if (!compact && (event.metaKey || event.ctrlKey) && event.key === "Enter") {
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

  // Detect @mention in TipTap editor
  const detectMentionInEditor = useCallback((e: Editor) => {
    const { state } = e;
    const { from } = state.selection;
    const text = state.doc.textBetween(Math.max(0, from - 50), from, "\n");

    let i = text.length - 1;
    while (i >= 0) {
      const ch = text[i];
      if (ch === "@") {
        if (i === 0 || /\s/.test(text[i - 1])) {
          const query = text.substring(i + 1);
          if (/^[a-zA-Z0-9_-]*$/.test(query) && query.length >= 1) {
            setMentionQuery(query);
            setMentionIndex(0);

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

            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(async () => {
              try {
                const res = await fetch(`/api/users/mention-search?q=${encodeURIComponent(query)}`);
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
    const atPos = from - mentionQuery.length - 1;

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
    <div ref={editorWrapRef} className={`circle-editor-wrap ${compact ? "circle-editor-compact" : ""}`} style={{ position: "relative" }}>
      {/* Toolbar */}
      {!compact && (
        <div className="circle-editor-toolbar">
          <div className="circle-editor-toolbar-group">
            <button
              type="button"
              className={`circle-editor-btn ${editor.isActive("bold") ? "circle-editor-btn-active" : ""}`}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title="Bold (Cmd+B)"
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              className={`circle-editor-btn ${editor.isActive("italic") ? "circle-editor-btn-active" : ""}`}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              title="Italic (Cmd+I)"
            >
              <em>I</em>
            </button>
            <button
              type="button"
              className={`circle-editor-btn ${editor.isActive("underline") ? "circle-editor-btn-active" : ""}`}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              title="Underline (Cmd+U)"
            >
              <u>U</u>
            </button>
            <button
              type="button"
              className={`circle-editor-btn ${editor.isActive("strike") ? "circle-editor-btn-active" : ""}`}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              title="Strikethrough"
            >
              <s>S</s>
            </button>
          </div>
          <div className="circle-editor-toolbar-divider" />
          <div className="circle-editor-toolbar-group">
            <button
              type="button"
              className={`circle-editor-btn ${editor.isActive("bulletList") ? "circle-editor-btn-active" : ""}`}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              title="Bullet list"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3.5" cy="6" r="1.5" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="3.5" cy="18" r="1.5" fill="currentColor" stroke="none" /></svg>
            </button>
            <button
              type="button"
              className={`circle-editor-btn ${editor.isActive("orderedList") ? "circle-editor-btn-active" : ""}`}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              title="Ordered list"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="serif">1</text><text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="serif">2</text><text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="serif">3</text></svg>
            </button>
            <button
              type="button"
              className={`circle-editor-btn ${editor.isActive("blockquote") ? "circle-editor-btn-active" : ""}`}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              title="Blockquote"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21" /><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3" /></svg>
            </button>
          </div>
          <div className="circle-editor-toolbar-divider" />
          <div className="circle-editor-toolbar-group">
            <button
              type="button"
              className={`circle-editor-btn ${editor.isActive("link") ? "circle-editor-btn-active" : ""}`}
              onClick={addLink}
              title="Add link"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </button>
          </div>
          <span className="circle-editor-char-count" style={{ marginLeft: "auto", color: charCount > maxLength * 0.9 ? "var(--danger, #ef4444)" : "var(--muted)" }}>
            {charCount > 0 ? `${charCount}/${maxLength}` : ""}
          </span>
        </div>
      )}

      {/* Editor content */}
      <EditorContent editor={editor} />

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
        </div>
      )}

      {/* Footer — compact mode shows char count + submit inline */}
      {compact && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            {charCount > 0 ? `${charCount}/${maxLength}` : ""}
          </span>
          {onSubmit && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={charCount === 0 || disabled}
              className="circle-btn"
              style={{ fontSize: "0.8125rem" }}
            >
              {submitLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
