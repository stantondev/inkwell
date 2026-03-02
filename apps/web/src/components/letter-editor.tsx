"use client";

import { useCallback, useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import CharacterCount from "@tiptap/extension-character-count";
import Underline from "@tiptap/extension-underline";
import Typography from "@tiptap/extension-typography";
import type { Editor } from "@tiptap/react";
import { resizeEntryImage } from "@/lib/image-utils";

interface LetterEditorProps {
  content: string;
  onChange: (html: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

export function LetterEditor({
  content,
  onChange,
  onSubmit,
  placeholder = "Dear friend...",
  maxLength = 10000,
  autoFocus = false,
  disabled = false,
  compact = false,
}: LetterEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Underline,
      Placeholder.configure({ placeholder }),
      CharacterCount.configure({ limit: maxLength }),
      Typography,
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: content || "",
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "letter-editor-tiptap",
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          onSubmitRef.current();
          return true;
        }
        return false;
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (autoFocus && editor) {
      setTimeout(() => editor.commands.focus("end"), 50);
    }
  }, [autoFocus, editor]);

  const handleImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editor) return;
      e.target.value = "";

      try {
        const dataUri = await resizeEntryImage(file);
        const blob = await fetch(dataUri).then((r) => r.blob());
        const formData = new FormData();
        formData.append("image", blob, file.name);

        const res = await fetch("/api/images", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Upload failed");
        const json = await res.json();
        editor.chain().focus().setImage({ src: `/api/images/${json.id}` }).run();
      } catch {
        // silently fail
      }
    },
    [editor]
  );

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

  return (
    <div className={compact ? "letter-edit-mode" : ""}>
      <LetterToolbar
        editor={editor}
        onAddLink={addLink}
        onAddImage={handleImageUpload}
      />
      <div className="letter-editor-content">
        <EditorContent editor={editor} />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
    </div>
  );
}

// Expose a way to get editor instance for external control (clear, get text length, etc.)
export function useLetterEditor() {
  return useEditor;
}

function LetterToolbar({
  editor,
  onAddLink,
  onAddImage,
}: {
  editor: Editor;
  onAddLink: () => void;
  onAddImage: () => void;
}) {
  return (
    <div className="letter-editor-toolbar">
      {/* Inline formatting */}
      <div className="letter-editor-toolbar-group">
        <ToolbarBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (Cmd+B)"
        >
          <strong>B</strong>
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (Cmd+I)"
        >
          <em>I</em>
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (Cmd+U)"
        >
          <span style={{ textDecoration: "underline" }}>U</span>
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <span style={{ textDecoration: "line-through" }}>S</span>
        </ToolbarBtn>
      </div>

      {/* Insert: link + image */}
      <div className="letter-editor-toolbar-group">
        <ToolbarBtn
          active={editor.isActive("link")}
          onClick={onAddLink}
          title="Add link"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn onClick={onAddImage} title="Add image">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </ToolbarBtn>
      </div>

      {/* Blocks: lists + blockquote */}
      <div className="letter-editor-toolbar-group">
        <ToolbarBtn
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
            <circle cx="3" cy="6" r="1" fill="currentColor" /><circle cx="3" cy="12" r="1" fill="currentColor" /><circle cx="3" cy="18" r="1" fill="currentColor" />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered list"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
            <text x="1" y="8" fontSize="7" fill="currentColor" stroke="none">1</text>
            <text x="1" y="14" fontSize="7" fill="currentColor" stroke="none">2</text>
            <text x="1" y="20" fontSize="7" fill="currentColor" stroke="none">3</text>
          </svg>
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Blockquote"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
          </svg>
        </ToolbarBtn>
      </div>
    </div>
  );
}

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`letter-editor-btn ${active ? "letter-editor-btn-active" : ""}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}
