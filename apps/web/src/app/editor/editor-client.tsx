"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import CharacterCount from "@tiptap/extension-character-count";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import Typography from "@tiptap/extension-typography";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import type { Editor } from "@tiptap/react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { parseMusicUrl } from "@/lib/music";
import { resizeEntryImage } from "@/lib/image-utils";
import { CATEGORIES } from "@/lib/categories";
import { Spacing } from "@/lib/tiptap-spacing";
import { CircleEmbed, type CircleEmbedAttrs } from "@/lib/tiptap-circle-embed";

type Privacy = "public" | "friends_only" | "private" | "custom" | "paid";

interface FriendFilter {
  id: string;
  name: string;
  member_ids: string[];
}

interface SeriesOption {
  id: string;
  title: string;
  entry_count: number;
}

interface EditorState {
  title: string;
  mood: string;
  music: string;
  privacy: Privacy;
  customFilterId: string | null;
  tags: string;
  excerpt: string;
  category: string | null;
  seriesId: string | null;
  sensitive: boolean;
  contentWarning: string;
}

const PRIVACY_OPTIONS: { value: Privacy; label: string; icon: string }[] = [
  { value: "public",       label: "Public",        icon: "🌍" },
  { value: "friends_only", label: "Pen Pals only",   icon: "👥" },
  { value: "private",      label: "Private",        icon: "🔒" },
  { value: "custom",       label: "Custom filter",  icon: "⚙️" },
];

const PRESET_MOODS = [
  "happy 😊", "excited 🎉", "grateful 🙏", "hopeful 🌅",
  "peaceful 🌿", "content 🫶", "curious 🔍", "reflective 🌧",
  "nostalgic 📼", "anxious 😰", "sad 😢", "tired 😴",
  "angry 😤", "in love 💛",
];

const TEXT_COLORS = [
  { label: "Default", value: "" },
  { label: "Black", value: "#1c1917" },
  { label: "Gray", value: "#78716c" },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Blue", value: "#2563eb" },
  { label: "Green", value: "#16a34a" },
  { label: "Purple", value: "#7c3aed" },
  { label: "Pink", value: "#db2777" },
];

const HIGHLIGHT_COLORS = [
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Purple", value: "#e9d5ff" },
];

// ─── Toolbar components ───────────────────────────────────────────────────────

function Btn({
  onClick, active = false, disabled = false, title, children, className = "",
}: {
  onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`w-7 h-7 flex items-center justify-center rounded transition-colors disabled:opacity-25 ${className}`}
      style={{
        background: active ? "var(--accent-light)" : "transparent",
        color: active ? "var(--accent)" : "var(--muted)",
      }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-5 mx-0.5 self-center" style={{ background: "var(--border)" }} aria-hidden="true" />;
}

// Dropdown wrapper for toolbar menus
function ToolbarDropdown({ label, active, renderContent, title }: {
  label: React.ReactNode; active?: boolean; renderContent: (close: () => void) => React.ReactNode; title: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  // Clamp dropdown to viewport on mobile — flip to right-aligned if overflowing
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      menuRef.current.style.left = "auto";
      menuRef.current.style.right = "0";
    }
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Btn onClick={() => setOpen((v) => !v)} active={active || open} title={title}>
        {label}
      </Btn>
      {open && (
        <div ref={menuRef} className="absolute top-full left-0 mt-1 z-[50] rounded-lg border shadow-lg py-1 min-w-[140px]"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {renderContent(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function DropdownItem({ onClick, active, children }: {
  onClick: () => void; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors"
      style={{
        background: active ? "var(--accent-light)" : "transparent",
        color: active ? "var(--accent)" : "var(--foreground)",
      }}>
      {children}
    </button>
  );
}

// ─── Main Toolbar ─────────────────────────────────────────────────────────────

function EditorToolbar({ editor, htmlMode, onToggleHtml, onUploadImage, isUploading, focusMode, onToggleFocus, onInsertCircle }: {
  editor: Editor | null; htmlMode: boolean; onToggleHtml: () => void;
  onUploadImage: (file: File) => void; isUploading: boolean;
  focusMode: boolean; onToggleFocus: () => void;
  onInsertCircle: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showImageMenu, setShowImageMenu] = useState(false);

  const addLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href ?? "";
    const url = window.prompt("URL:", prev);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  const addImageUrl = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Image URL:");
    if (url) editor.chain().focus().setImage({ src: url }).run();
    setShowImageMenu(false);
  }, [editor]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadImage(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowImageMenu(false);
  }, [onUploadImage]);

  if (!editor) return null;

  // Determine current block type label
  const blockLabel = editor.isActive("heading", { level: 1 }) ? "H1"
    : editor.isActive("heading", { level: 2 }) ? "H2"
    : editor.isActive("heading", { level: 3 }) ? "H3"
    : "P";

  return (
    <div className="editor-toolbar-wrap flex flex-wrap items-center gap-0.5 px-1 py-1" role="toolbar" aria-label="Text formatting">
      {!htmlMode && (
        <>
          {/* ── Block type dropdown ── */}
          <ToolbarDropdown
            label={<span style={{ fontWeight: 700, fontSize: 11, minWidth: 16, textAlign: "center" }}>{blockLabel}</span>}
            active={editor.isActive("heading")}
            title="Block type"
            renderContent={(close) => (
              <>
                <DropdownItem onClick={() => { editor.chain().focus().setParagraph().run(); close(); }}
                  active={!editor.isActive("heading")}>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>P</span> Paragraph
                </DropdownItem>
                <DropdownItem onClick={() => { editor.chain().focus().toggleHeading({ level: 1 }).run(); close(); }}
                  active={editor.isActive("heading", { level: 1 })}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>H1</span> Heading 1
                </DropdownItem>
                <DropdownItem onClick={() => { editor.chain().focus().toggleHeading({ level: 2 }).run(); close(); }}
                  active={editor.isActive("heading", { level: 2 })}>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>H2</span> Heading 2
                </DropdownItem>
                <DropdownItem onClick={() => { editor.chain().focus().toggleHeading({ level: 3 }).run(); close(); }}
                  active={editor.isActive("heading", { level: 3 })}>
                  <span style={{ fontWeight: 600, fontSize: 11 }}>H3</span> Heading 3
                </DropdownItem>
              </>
            )}
          />
          <Sep />

          {/* ── Inline formatting ── */}
          <Btn onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")} title="Bold (⌘B)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
            </svg>
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")} title="Italic (⌘I)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>
            </svg>
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive("underline")} title="Underline (⌘U)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/>
            </svg>
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")} title="Strikethrough">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/><path d="M16 6a3 3 0 0 0-5.19 2.06C10.03 9.74 10.9 11.06 12 12c1.1.94 2 2.02 2 3.44A3 3 0 0 1 8.5 18"/>
            </svg>
          </Btn>
          <Sep />

          {/* ── Rich text dropdown (highlight, color, sub, sup) ── */}
          <ToolbarDropdown
            label={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h16"/><path d="m6 16 6-12 6 12"/><path d="M8 12h8"/>
              </svg>
            }
            active={editor.isActive("highlight") || editor.isActive("textStyle")}
            title="Text style"
            renderContent={(close) => (
              <div className="p-2 w-[200px]">
                {/* Highlight colors */}
                <div className="text-[10px] uppercase tracking-wider mb-1.5 px-1" style={{ color: "var(--muted)" }}>Highlight</div>
                <div className="flex gap-1 mb-2 px-1">
                  <button type="button" onClick={() => { editor.chain().focus().unsetHighlight().run(); close(); }}
                    className="w-6 h-6 rounded border flex items-center justify-center text-xs"
                    style={{ borderColor: "var(--border)" }} title="Remove highlight">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                  {HIGHLIGHT_COLORS.map((c) => (
                    <button key={c.value} type="button"
                      onClick={() => { editor.chain().focus().toggleHighlight({ color: c.value }).run(); close(); }}
                      className="w-6 h-6 rounded border"
                      style={{ background: c.value, borderColor: editor.isActive("highlight", { color: c.value }) ? "var(--accent)" : "transparent" }}
                      title={c.label} />
                  ))}
                </div>
                {/* Text colors */}
                <div className="text-[10px] uppercase tracking-wider mb-1.5 px-1" style={{ color: "var(--muted)" }}>Text Color</div>
                <div className="flex flex-wrap gap-1 mb-2 px-1">
                  {TEXT_COLORS.map((c) => (
                    <button key={c.label} type="button"
                      onClick={() => {
                        if (c.value === "") { editor.chain().focus().unsetColor().run(); }
                        else { editor.chain().focus().setColor(c.value).run(); }
                        close();
                      }}
                      className="w-6 h-6 rounded border flex items-center justify-center"
                      style={{
                        background: c.value || "var(--background)",
                        borderColor: (c.value && editor.getAttributes("textStyle").color === c.value) ? "var(--accent)" : "var(--border)",
                      }}
                      title={c.label}>
                      {c.value === "" && <span className="text-[9px]" style={{ color: "var(--muted)" }}>Aa</span>}
                    </button>
                  ))}
                </div>
                {/* Sub/Sup */}
                <div className="border-t pt-1.5 mt-1 flex gap-1" style={{ borderColor: "var(--border)" }}>
                  <button type="button" onClick={() => { editor.chain().focus().toggleSubscript().run(); close(); }}
                    className="flex-1 px-2 py-1 rounded text-xs transition-colors"
                    style={{
                      background: editor.isActive("subscript") ? "var(--accent-light)" : "transparent",
                      color: editor.isActive("subscript") ? "var(--accent)" : "var(--muted)",
                    }}>
                    X<sub>2</sub>
                  </button>
                  <button type="button" onClick={() => { editor.chain().focus().toggleSuperscript().run(); close(); }}
                    className="flex-1 px-2 py-1 rounded text-xs transition-colors"
                    style={{
                      background: editor.isActive("superscript") ? "var(--accent-light)" : "transparent",
                      color: editor.isActive("superscript") ? "var(--accent)" : "var(--muted)",
                    }}>
                    X<sup>2</sup>
                  </button>
                </div>
              </div>
            )}
          />
          <Sep />

          {/* ── Alignment ── */}
          <Btn onClick={() => editor.chain().focus().setTextAlign("left").run()}
            active={editor.isActive({ textAlign: "left" })} title="Align left">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
            </svg>
          </Btn>
          <Btn onClick={() => editor.chain().focus().setTextAlign("center").run()}
            active={editor.isActive({ textAlign: "center" })} title="Align center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
            </svg>
          </Btn>
          <Btn onClick={() => editor.chain().focus().setTextAlign("right").run()}
            active={editor.isActive({ textAlign: "right" })} title="Align right">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/>
            </svg>
          </Btn>
          <Sep />

          {/* ── Lists & blocks ── */}
          <Btn onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")} title="Bullet list">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
              <circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none"/>
              <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none"/>
              <circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none"/>
            </svg>
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")} title="Numbered list">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
              <path d="M4 6h1v4M4 10h2" fill="none"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" fill="none"/>
            </svg>
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleTaskList().run()}
            active={editor.isActive("taskList")} title="Task list">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="6" height="6" rx="1"/><path d="M5 8l1.5 1.5L9 7"/>
              <line x1="13" y1="8" x2="21" y2="8"/>
              <rect x="3" y="14" width="6" height="6" rx="1"/>
              <line x1="13" y1="17" x2="21" y2="17"/>
            </svg>
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive("blockquote")} title="Blockquote">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
              <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
            </svg>
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive("codeBlock")} title="Code block">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
            </svg>
          </Btn>
          <Sep />

          {/* ── Spacing ── */}
          <ToolbarDropdown
            label={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                <path d="M21 3v3M21 21v-3M21 9v1.5M21 13.5V15" strokeWidth="1.5" strokeDasharray="1 1"/>
              </svg>
            }
            active={editor.getAttributes("paragraph").spacing != null || editor.getAttributes("bulletList").spacing != null || editor.getAttributes("orderedList").spacing != null}
            title="Spacing"
            renderContent={(close) => (
              <>
                <DropdownItem onClick={() => { editor.chain().focus().setSpacing("tight").run(); close(); }}
                  active={editor.getAttributes("paragraph").spacing === "tight" || editor.getAttributes("bulletList").spacing === "tight"}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="16" x2="21" y2="16"/>
                  </svg>
                  Tight
                </DropdownItem>
                <DropdownItem onClick={() => { editor.chain().focus().setSpacing("normal").run(); close(); }}
                  active={editor.getAttributes("paragraph").spacing == null && editor.getAttributes("bulletList").spacing == null}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                  </svg>
                  Normal
                </DropdownItem>
                <DropdownItem onClick={() => { editor.chain().focus().setSpacing("loose").run(); close(); }}
                  active={editor.getAttributes("paragraph").spacing === "loose" || editor.getAttributes("bulletList").spacing === "loose"}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="3" y1="4" x2="21" y2="4"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="20" x2="21" y2="20"/>
                  </svg>
                  Loose
                </DropdownItem>
              </>
            )}
          />
          <Sep />

          {/* ── Insert: link, image, hr, table ── */}
          <Btn onClick={addLink} active={editor.isActive("link")} title="Add link (⌘K)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </Btn>
          <div className="relative">
            <Btn onClick={() => setShowImageMenu((v) => !v)} disabled={isUploading}
              title={isUploading ? "Uploading..." : "Add image"}>
              {isUploading ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className="animate-spin">
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
              )}
            </Btn>
            {showImageMenu && (
              <>
                <div className="fixed inset-0 z-[45]" onClick={() => setShowImageMenu(false)} />
                <div className="absolute top-full left-0 mt-1 z-[50] rounded-lg border shadow-lg py-1 min-w-[160px]"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  <button type="button"
                    onClick={() => { fileInputRef.current?.click(); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent-light)] transition-colors flex items-center gap-2"
                    style={{ color: "var(--foreground)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Upload from computer
                  </button>
                  <button type="button"
                    onClick={addImageUrl}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent-light)] transition-colors flex items-center gap-2"
                    style={{ color: "var(--foreground)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                    Paste image URL
                  </button>
                </div>
              </>
            )}
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden" onChange={handleFileSelect} />
          </div>
          <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="12" x2="21" y2="12"/>
              <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/>
              <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
              <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/>
            </svg>
          </Btn>
          <Btn onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            title="Insert table">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
              <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
          </Btn>
          <Btn onClick={onInsertCircle} title="Embed circle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>
            </svg>
          </Btn>
          <Sep />

          {/* ── Undo / Redo ── */}
          <Btn onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()} title="Undo (⌘Z)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
            </svg>
          </Btn>
          <Btn onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()} title="Redo (⌘⇧Z)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
            </svg>
          </Btn>
          <Sep />
        </>
      )}
      <Btn onClick={onToggleHtml} active={htmlMode} title={htmlMode ? "Switch to Visual editor" : "Switch to HTML source"}>
        <span style={{ fontWeight: 600, fontSize: 10, letterSpacing: "-0.02em" }}>&lt;/&gt;</span>
      </Btn>
      <Sep />
      <Btn onClick={onToggleFocus} active={focusMode} title={focusMode ? "Exit focus mode (Esc)" : "Focus mode"}>
        {focusMode ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        )}
      </Btn>
    </div>
  );
}

// ─── Bubble Menu (appears on text selection) ─────────────────────────────────

function EditorBubbleMenu({ editor }: { editor: Editor }) {
  const [showColors, setShowColors] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);

  return (
    <BubbleMenu editor={editor} style={{ zIndex: 50 }}>
      <div className="editor-bubble-menu">
        <Btn onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")} title="Bold">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
          </svg>
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")} title="Italic">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>
          </svg>
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")} title="Underline">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/>
          </svg>
        </Btn>
        <Btn onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")} title="Strikethrough">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><path d="M16 6a3 3 0 0 0-5.19 2.06C10.03 9.74 10.9 11.06 12 12c1.1.94 2 2.02 2 3.44A3 3 0 0 1 8.5 18"/>
          </svg>
        </Btn>
        <Sep />
        {/* Highlight with color sub-menu */}
        <div className="relative">
          <Btn onClick={() => { setShowHighlights((v) => !v); setShowColors(false); }}
            active={editor.isActive("highlight")} title="Highlight">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>
            </svg>
          </Btn>
          {showHighlights && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-[55] rounded-lg border shadow-lg p-2 flex gap-1"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <button type="button" onClick={() => { editor.chain().focus().unsetHighlight().run(); setShowHighlights(false); }}
                className="w-6 h-6 rounded border flex items-center justify-center"
                style={{ borderColor: "var(--border)" }} title="Remove">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              {HIGHLIGHT_COLORS.map((c) => (
                <button key={c.value} type="button"
                  onClick={() => { editor.chain().focus().toggleHighlight({ color: c.value }).run(); setShowHighlights(false); }}
                  className="w-6 h-6 rounded border"
                  style={{ background: c.value, borderColor: editor.isActive("highlight", { color: c.value }) ? "var(--accent)" : "transparent" }}
                  title={c.label} />
              ))}
            </div>
          )}
        </div>
        {/* Text color */}
        <div className="relative">
          <Btn onClick={() => { setShowColors((v) => !v); setShowHighlights(false); }}
            active={!!editor.getAttributes("textStyle").color} title="Text color">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h16"/><path d="m6 16 6-12 6 12"/><path d="M8 12h8"/>
            </svg>
          </Btn>
          {showColors && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-[55] rounded-lg border shadow-lg p-2 flex flex-wrap gap-1 w-[180px]"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              {TEXT_COLORS.map((c) => (
                <button key={c.label} type="button"
                  onClick={() => {
                    if (c.value === "") { editor.chain().focus().unsetColor().run(); }
                    else { editor.chain().focus().setColor(c.value).run(); }
                    setShowColors(false);
                  }}
                  className="w-6 h-6 rounded border flex items-center justify-center"
                  style={{
                    background: c.value || "var(--background)",
                    borderColor: (c.value && editor.getAttributes("textStyle").color === c.value) ? "var(--accent)" : "var(--border)",
                  }}
                  title={c.label}>
                  {c.value === "" && <span className="text-[9px]" style={{ color: "var(--muted)" }}>Aa</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <Sep />
        <Btn onClick={() => {
          const prev = editor.getAttributes("link").href ?? "";
          const url = window.prompt("URL:", prev);
          if (url === null) return;
          if (url === "") { editor.chain().focus().extendMarkRange("link").unsetLink().run(); }
          else { editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run(); }
        }} active={editor.isActive("link")} title="Link">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
        </Btn>
      </div>
    </BubbleMenu>
  );
}

// ─── Floating Menu (appears on empty lines) ──────────────────────────────────

function EditorFloatingMenu({ editor, onUploadImage, onInsertCircle }: { editor: Editor; onUploadImage: () => void; onInsertCircle: () => void }) {
  const floatingFileRef = useRef<HTMLInputElement>(null);

  return (
    <FloatingMenu editor={editor} style={{ zIndex: 50 }}
      shouldShow={({ editor: e }) => {
        // Don't show on the initial empty editor (only one empty paragraph)
        if (e.isEmpty) return false;
        // Show only on empty text blocks (paragraphs, headings)
        const { $from } = e.state.selection;
        const node = $from.parent;
        return node.isTextblock && node.content.size === 0;
      }}>
      <div className="editor-floating-menu">
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className="editor-floating-menu-item">
          <span style={{ fontWeight: 700, fontSize: 13, minWidth: 20 }}>H1</span>
          <span>Heading 1</span>
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className="editor-floating-menu-item">
          <span style={{ fontWeight: 700, fontSize: 12, minWidth: 20 }}>H2</span>
          <span>Heading 2</span>
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
          className="editor-floating-menu-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ minWidth: 14 }}>
            <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
            <circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none"/>
          </svg>
          <span>Bullet list</span>
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className="editor-floating-menu-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ minWidth: 14 }}>
            <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
            <path d="M4 6h1v4M4 10h2" fill="none"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" fill="none"/>
          </svg>
          <span>Numbered list</span>
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleTaskList().run()}
          className="editor-floating-menu-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ minWidth: 14 }}>
            <rect x="3" y="5" width="6" height="6" rx="1"/><path d="M5 8l1.5 1.5L9 7"/>
            <line x1="13" y1="8" x2="21" y2="8"/>
            <rect x="3" y="14" width="6" height="6" rx="1"/>
            <line x1="13" y1="17" x2="21" y2="17"/>
          </svg>
          <span>Task list</span>
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className="editor-floating-menu-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ minWidth: 14 }}>
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
          </svg>
          <span>Blockquote</span>
        </button>
        <button type="button" onClick={onUploadImage}
          className="editor-floating-menu-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ minWidth: 14 }}>
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>Image</span>
        </button>
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className="editor-floating-menu-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ minWidth: 14 }}>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
            <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/>
          </svg>
          <span>Divider</span>
        </button>
        <button type="button" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          className="editor-floating-menu-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ minWidth: 14 }}>
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
            <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
          <span>Table</span>
        </button>
        <button type="button" onClick={onInsertCircle}
          className="editor-floating-menu-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ minWidth: 14 }}>
            <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>
          </svg>
          <span>Circle embed</span>
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className="editor-floating-menu-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ minWidth: 14 }}>
            <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
          </svg>
          <span>Code block</span>
        </button>
      </div>
      <input ref={floatingFileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" />
    </FloatingMenu>
  );
}

// ─── Mood input with preset picker ───────────────────────────────────────────

function MoodInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>feeling</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="your mood…"
          className="bg-transparent focus:outline-none text-sm min-w-0 w-32"
          style={{ color: "var(--foreground)" }}
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            className="text-xs opacity-40 hover:opacity-80 transition flex-shrink-0"
            aria-label="Clear mood"
          >×</button>
        )}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-[45]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 z-[50] rounded-xl border p-3 shadow-xl"
            style={{ background: "var(--surface)", borderColor: "var(--border)", minWidth: 280 }}>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_MOODS.map((m) => (
                <button key={m} type="button"
                  onClick={() => { onChange(m); setOpen(false); }}
                  className="text-xs px-2.5 py-1 rounded-full border transition-colors hover:border-[var(--accent)]"
                  style={{
                    borderColor: value === m ? "var(--accent)" : "var(--border)",
                    background: value === m ? "var(--accent-light)" : "transparent",
                    color: value === m ? "var(--accent)" : "var(--muted)",
                  }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Music input with Spotify / YouTube / Apple Music detection ──────────────

function SpotifyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ color: "#1DB954" }}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  );
}

function YouTubeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ color: "#FF0000" }}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

function AppleMusicIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ color: "#FA243C" }}>
      <path d="M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0 0 19.2.04a9.224 9.224 0 0 0-1.755-.045C17.178 0 16.91 0 16.643 0h-9.48c-.11 0-.22.005-.33.01a9.413 9.413 0 0 0-1.988.17A5.149 5.149 0 0 0 2.72 1.475c-.657.66-1.07 1.438-1.321 2.33a8.46 8.46 0 0 0-.26 1.83l-.005.29v12.15l.005.305c.024.65.098 1.29.26 1.92.254.88.667 1.66 1.32 2.32a5.065 5.065 0 0 0 2.45 1.4c.58.14 1.17.21 1.77.24.18.01.36.01.54.02h9.29c.2 0 .4 0 .59-.01.7-.03 1.39-.1 2.05-.33a4.882 4.882 0 0 0 2.06-1.31 5.06 5.06 0 0 0 1.06-1.78c.21-.57.34-1.17.39-1.78.02-.2.03-.41.03-.61V7.36c0-.12 0-.24-.01-.36l-.02-.87zM17.42 17.45c-.18.56-.52.98-1.01 1.29-.37.23-.79.35-1.23.37-.31.01-.62-.02-.92-.1a13.68 13.68 0 0 1-2.43-.91c-.56-.27-1.09-.58-1.58-.97a5.267 5.267 0 0 1-1.3-1.55c-.3-.55-.47-1.15-.5-1.78a3.168 3.168 0 0 1 .32-1.59c.23-.45.56-.82.96-1.11.37-.27.78-.46 1.24-.53.28-.04.57-.04.86-.01.38.05.74.16 1.09.31.18.08.36.17.53.27V6.46c0-.08.01-.16.03-.24.04-.16.14-.24.3-.22.13.02.26.05.39.09.23.07.45.16.66.27.05.03.1.06.14.1.07.06.1.14.1.24V14.56c0 .31-.02.63-.07.94-.07.46-.21.9-.43 1.3-.2.35-.44.66-.74.93-.2.18-.42.33-.66.46-.12.06-.24.12-.37.17-.08.03-.16.06-.24.09z"/>
    </svg>
  );
}

function MusicNoteIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" className="flex-shrink-0"
      style={{ color: "var(--muted)" }} aria-hidden="true">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  );
}

function MusicInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const embed = parseMusicUrl(value);

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        {embed ? (
          embed.service === "spotify" ? <SpotifyIcon size={14} /> :
          embed.service === "youtube" ? <YouTubeIcon size={14} /> :
          <AppleMusicIcon size={14} />
        ) : (
          <MusicNoteIcon />
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="listening to… paste a Spotify or YouTube link"
          className="bg-transparent focus:outline-none text-sm min-w-0 flex-1"
          style={{ color: "var(--foreground)" }}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs opacity-40 hover:opacity-80 transition flex-shrink-0"
            aria-label="Clear music"
          >×</button>
        )}
      </div>
    </div>
  );
}

// ─── Save status ──────────────────────────────────────────────────────────────

function SaveStatus({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "idle") return null;
  const map = {
    saving: { text: "Saving…",     color: "var(--muted)" },
    saved:  { text: "Saved ✓",     color: "var(--success)" },
    error:  { text: "Save failed", color: "var(--danger)" },
  } as const;
  const s = map[status];
  return <span className="text-xs" style={{ color: s.color }}>{s.text}</span>;
}

// ─── Circle Picker Modal ──────────────────────────────────────────────────────

interface CircleData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  member_count: number;
}

const CIRCLE_CATEGORY_LABELS: Record<string, string> = {
  writing_craft: "Writing & Craft",
  reading_books: "Reading & Books",
  creative_arts: "Creative Arts",
  lifestyle_interests: "Lifestyle",
  tech_learning: "Tech & Learning",
  community: "Community",
};

function CirclePickerModal({ onSelect, onClose }: {
  onSelect: (attrs: CircleEmbedAttrs) => void;
  onClose: () => void;
}) {
  const [circles, setCircles] = useState<CircleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/my-circles")
      .then((r) => r.json())
      .then((res) => {
        setCircles(res.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = circles.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="circle-picker-overlay" onClick={onClose}>
      <div className="circle-picker" onClick={(e) => e.stopPropagation()}>
        <div className="circle-picker-header">
          <h3 style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontWeight: 600, fontSize: 16 }}>Embed a Circle</h3>
          <button type="button" onClick={onClose} className="circle-picker-close" aria-label="Close">×</button>
        </div>
        {circles.length > 3 && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your circles…"
            className="circle-picker-search"
            autoFocus
          />
        )}
        <div className="circle-picker-list">
          {loading ? (
            <div className="circle-picker-empty">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="circle-picker-empty">
              {circles.length === 0
                ? "You haven't joined any circles yet."
                : "No circles match your search."}
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className="circle-picker-item"
                onClick={() => onSelect({
                  slug: c.slug,
                  name: c.name,
                  description: c.description,
                  category: c.category,
                  memberCount: c.member_count,
                })}
              >
                <span className="circle-picker-item-name">{c.name}</span>
                <span className="circle-picker-item-meta">
                  <span className="circle-picker-item-category">{CIRCLE_CATEGORY_LABELS[c.category] || c.category}</span>
                  <span style={{ color: "var(--muted)" }}>·</span>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>{c.member_count} {c.member_count === 1 ? "member" : "members"}</span>
                </span>
              </button>
            ))
          )}
        </div>
        <button type="button" onClick={onClose} className="circle-picker-cancel">Cancel</button>
      </div>
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

const WELCOME_PROMPTS = [
  {
    title: "Hello, Inkwell",
    body: "<p>This is your first entry — introduce yourself! What brings you here? What do you hope to write about?</p>",
  },
  {
    title: "What I\u2019m reading right now",
    body: "<p>Share what\u2019s on your nightstand, your screen, or stuck in your head. What are you reading, and why does it matter to you?</p>",
  },
  {
    title: "A letter to my future self",
    body: "<p>Write to the person you\u2019ll be in a year. What do you want to remember about today? What do you hope will be different?</p>",
  },
  {
    title: "The story behind my username",
    body: "<p>Every name has a story. What made you pick yours? Is there a memory, an inside joke, or a meaning behind it?</p>",
  },
];

export function EditorClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const promptParam = searchParams.get("prompt");

  const [state, setState] = useState<EditorState>({
    title: "", mood: "", music: "", privacy: "public", customFilterId: null, tags: "", excerpt: "", category: null, seriesId: null, sensitive: false, contentWarning: "",
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showSettings, setShowSettings] = useState(false);
  const settingsInitialized = useRef(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [loading, setLoading] = useState(!!editId);
  const [entrySlug, setEntrySlug] = useState<string | null>(null);
  const [entryAuthor, setEntryAuthor] = useState<string | null>(null);
  const [htmlMode, setHtmlMode] = useState(false);
  const [htmlSource, setHtmlSource] = useState("");
  const [filters, setFilters] = useState<FriendFilter[]>([]);
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([]);
  const [seriesLoaded, setSeriesLoaded] = useState(false);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [coverImageId, setCoverImageId] = useState<string | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  // Newsletter state
  const [newsletterEnabled, setNewsletterEnabled] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [sendNewsletter, setSendNewsletter] = useState(false);
  const [newsletterSubject, setNewsletterSubject] = useState("");
  const [alreadySent, setAlreadySent] = useState(false);
  const [isPlus, setIsPlus] = useState(false);
  const [hasWriterPlan, setHasWriterPlan] = useState(false);
  const [hasStripeConnect, setHasStripeConnect] = useState(false);
  const [scheduleSend, setScheduleSend] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [sendsThisMonth, setSendsThisMonth] = useState(0);
  const [sendLimit, setSendLimit] = useState(2);

  // Draft tracking
  const [isDraft, setIsDraft] = useState(!editId); // new entries start as drafts
  const [savedEntryId, setSavedEntryId] = useState<string | null>(editId);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Poll state (Plus-only)
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollClosesAt, setPollClosesAt] = useState("");
  const [existingPollId, setExistingPollId] = useState<string | null>(null);
  const [pollLocked, setPollLocked] = useState(false); // locked after votes received

  // Cross-post state
  interface FediverseAccountForCrosspost {
    id: string;
    domain: string;
    remote_username: string;
    remote_acct: string;
    remote_display_name: string | null;
    remote_avatar_url: string | null;
    token_scope: string | null;
  }
  const [fediverseAccounts, setFediverseAccounts] = useState<FediverseAccountForCrosspost[]>([]);
  const [crosspostTo, setCrosspostTo] = useState<Set<string>>(new Set());

  // Circle embed picker
  const [circlePickerOpen, setCirclePickerOpen] = useState(false);

  const coverFileRef = useRef<HTMLInputElement>(null);
  const floatingImageRef = useRef<HTMLInputElement>(null);

  // Desktop: open settings panel by default (persisted in localStorage)
  useEffect(() => {
    if (settingsInitialized.current) return;
    settingsInitialized.current = true;
    if (window.innerWidth >= 768) {
      const stored = localStorage.getItem("inkwell-editor-panel");
      // Default to open on desktop unless explicitly collapsed
      if (stored !== "collapsed") {
        setShowSettings(true);
      }
    }
  }, []);

  // Upload an image file: resize, upload to API, insert into editor
  const uploadImage = useCallback(async (file: File, ed: Editor | null) => {
    if (!ed) return;
    setIsUploadingImage(true);
    try {
      const dataUri = await resizeEntryImage(file);
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUri }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const code = (err as { error?: string }).error;
        if (code === "storage_limit_exceeded") {
          throw new Error("You've reached the 100 MB image storage limit on the free plan. Upgrade to Inkwell Plus for 1 GB of storage.");
        }
        throw new Error(code ?? "Upload failed");
      }
      const { data } = await res.json();
      // Insert using the API URL (served from Phoenix backend)
      const imageUrl = `${window.location.origin}${data.url}`;
      ed.chain().focus().setImage({ src: imageUrl }).run();
    } catch (err) {
      alert(`Image upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsUploadingImage(false);
    }
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false }),
      Placeholder.configure({ placeholder: "What's on your mind today?" }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Image.configure({ inline: false, allowBase64: true }),
      CharacterCount.configure({ limit: 100_000 }),
      // New extensions
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Typography,
      Subscript,
      Superscript,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Spacing,
      CircleEmbed,
    ],
    editorProps: {
      attributes: { class: "prose-entry focus:outline-none min-h-[65vh] py-6" },
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !event.dataTransfer?.files?.length) return false;
        const file = event.dataTransfer.files[0];
        if (!file.type.startsWith("image/")) return false;
        event.preventDefault();
        const customEvent = new CustomEvent("inkwell-image-drop", { detail: { file } });
        document.dispatchEvent(customEvent);
        return true;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              const customEvent = new CustomEvent("inkwell-image-drop", { detail: { file } });
              document.dispatchEvent(customEvent);
            }
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      setHasContent(!!editor.getText().trim());
      setWordCount(editor.storage.characterCount.words());
    },
  });

  // Upload a cover image: resize, upload to API, store ID
  const uploadCoverImage = useCallback(async (file: File) => {
    setIsUploadingCover(true);
    try {
      const dataUri = await resizeEntryImage(file);
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUri }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const code = (err as { error?: string }).error;
        if (code === "storage_limit_exceeded") {
          throw new Error("You've reached the image storage limit. Upgrade to Inkwell Plus for more storage.");
        }
        throw new Error(code ?? "Upload failed");
      }
      const { data } = await res.json();
      setCoverImageId(data.id);
    } catch (err) {
      alert(`Cover upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsUploadingCover(false);
    }
  }, []);

  // Listen for custom image drop/paste events
  useEffect(() => {
    const handler = (e: Event) => {
      const file = (e as CustomEvent).detail?.file;
      if (file && editor) uploadImage(file, editor);
    };
    document.addEventListener("inkwell-image-drop", handler);
    return () => document.removeEventListener("inkwell-image-drop", handler);
  }, [editor, uploadImage]);

  // Focus mode: add body class for CSS Nav hiding + Esc to exit
  useEffect(() => {
    if (focusMode) {
      document.body.setAttribute("data-focus-mode", "true");
    } else {
      document.body.removeAttribute("data-focus-mode");
    }
    return () => { document.body.removeAttribute("data-focus-mode"); };
  }, [focusMode]);

  useEffect(() => {
    if (!focusMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusMode(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focusMode]);

  // Fetch filters when privacy is set to "custom"
  useEffect(() => {
    if (state.privacy !== "custom" || filtersLoaded) return;
    (async () => {
      try {
        const res = await fetch("/api/filters");
        if (res.ok) {
          const { data } = await res.json();
          setFilters(data ?? []);
        }
      } catch {
        // ignore
      } finally {
        setFiltersLoaded(true);
      }
    })();
  }, [state.privacy, filtersLoaded]);

  // Fetch newsletter + user info eagerly on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const { data } = await res.json();
          setNewsletterEnabled(!!data?.newsletter_enabled);
          setSubscriberCount(data?.subscriber_count ?? 0);
          setIsPlus((data?.subscription_tier ?? "free") === "plus");
          setHasWriterPlan(!!data?.has_writer_plan);
          setHasStripeConnect(!!data?.stripe_connect_enabled);
          setSendsThisMonth(data?.sends_this_month ?? 0);
          setSendLimit(data?.send_limit ?? 2);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Fetch linked fediverse accounts for cross-posting
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/fediverse/accounts");
        if (res.ok) {
          const { data } = await res.json();
          setFediverseAccounts(data ?? []);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Fetch series options eagerly on mount
  useEffect(() => {
    if (seriesLoaded) return;
    (async () => {
      try {
        const res = await fetch("/api/series");
        if (res.ok) {
          const { data } = await res.json();
          setSeriesOptions((data ?? []).map((s: SeriesOption) => ({ id: s.id, title: s.title, entry_count: s.entry_count })));
        }
      } catch {
        // ignore
      } finally {
        setSeriesLoaded(true);
      }
    })();
  }, [seriesLoaded]);

  // Load existing entry when editing
  useEffect(() => {
    if (!editId || !editor) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/entries/${editId}`);
        if (!res.ok) throw new Error("Failed to load entry");
        const { data: entry } = await res.json();
        if (cancelled) return;

        // Populate form state
        setState({
          title: entry.title ?? "",
          mood: entry.mood ?? "",
          music: entry.music ?? "",
          privacy: entry.privacy ?? "public",
          customFilterId: entry.custom_filter_id ?? null,
          tags: Array.isArray(entry.tags) ? entry.tags.join(", ") : (entry.tags ?? ""),
          excerpt: entry.excerpt ?? "",
          category: entry.category ?? null,
          seriesId: entry.series_id ?? null,
          sensitive: entry.sensitive ?? false,
          contentWarning: entry.content_warning ?? "",
        });
        setCoverImageId(entry.cover_image_id ?? null);
        setAlreadySent(!!entry.newsletter_sent_at);

        // Load existing poll data
        if (entry.poll) {
          setPollEnabled(true);
          setExistingPollId(entry.poll.id);
          setPollQuestion(entry.poll.question);
          setPollOptions(entry.poll.options.map((o: { label: string }) => o.label));
          setPollClosesAt(entry.poll.closes_at ? entry.poll.closes_at.slice(0, 16) : "");
          setPollLocked(entry.poll.total_votes > 0);
        }

        // Store slug + author for redirect after save
        setEntrySlug(entry.slug ?? null);
        setEntryAuthor(entry.author?.username ?? null);

        // Track draft status
        setIsDraft(entry.status === "draft");
        setSavedEntryId(entry.id);

        // Populate editor: prefer body_raw (Tiptap JSON) over body_html
        // If body_raw is null, this was saved in HTML mode — start in HTML mode
        if (entry.body_raw && typeof entry.body_raw === "object" && entry.body_raw.type) {
          editor.commands.setContent(entry.body_raw);
          setHasContent(!!editor.getText().trim());
          setWordCount(editor.storage.characterCount.words());
        } else if (entry.body_html) {
          // No body_raw means this was written in HTML mode
          setHtmlMode(true);
          setHtmlSource(entry.body_html);
          setHasContent(!!entry.body_html.trim());
        }
      } catch (err) {
        console.error("Failed to load entry for editing:", err);
        setSaveStatus("error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [editId, editor]);

  // Apply writing prompt for first-time users from onboarding
  const promptApplied = useRef(false);
  useEffect(() => {
    if (promptParam !== "welcome" || editId || !editor || promptApplied.current) return;
    promptApplied.current = true;
    const prompt = WELCOME_PROMPTS[Math.floor(Math.random() * WELCOME_PROMPTS.length)];
    setState((s) => ({ ...s, title: prompt.title }));
    editor.commands.setContent(prompt.body);
  }, [promptParam, editId, editor]);

  const update = (patch: Partial<EditorState>) => setState((s) => ({ ...s, ...patch }));

  // Toggle settings panel + persist on desktop
  const toggleSettings = useCallback(() => {
    setShowSettings((prev) => {
      const next = !prev;
      if (typeof window !== "undefined" && window.innerWidth >= 768) {
        localStorage.setItem("inkwell-editor-panel", next ? "open" : "collapsed");
      }
      return next;
    });
  }, []);

  const musicEmbed = parseMusicUrl(state.music);

  // Toggle between visual (Tiptap) and HTML source editing
  const toggleHtmlMode = useCallback(() => {
    if (!editor) return;
    if (!htmlMode) {
      // Switching TO HTML mode: grab current Tiptap HTML
      setHtmlSource(editor.getHTML());
      setHtmlMode(true);
    } else {
      // Switching FROM HTML mode: load HTML back into Tiptap
      // Warning: Tiptap will strip unsupported elements (marquee, style, etc.)
      const keep = window.confirm(
        "Switching to Visual mode may strip custom HTML elements like <marquee>, <style>, and CSS animations.\n\nSwitch anyway?"
      );
      if (!keep) return;
      editor.commands.setContent(htmlSource);
      setHasContent(!!editor.getText().trim());
      setWordCount(editor.storage.characterCount.words());
      setHtmlMode(false);
    }
  }, [editor, htmlMode, htmlSource]);

  const buildPayload = useCallback(() => {
    const payload: Record<string, unknown> = {
      title: state.title || null,
      body_html: htmlMode ? htmlSource : (editor?.getHTML() ?? ""),
      body_raw: htmlMode ? null : (editor?.getJSON() ?? {}),
      mood: state.mood || null,
      music: state.music || null,
      privacy: state.privacy,
      custom_filter_id: state.privacy === "custom" ? state.customFilterId : null,
      tags: state.tags ? state.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      excerpt: state.excerpt || null,
      cover_image_id: coverImageId || null,
      category: state.category || null,
      series_id: state.seriesId || null,
      sensitive: state.sensitive,
      content_warning: state.sensitive ? (state.contentWarning || null) : null,
    };
    // Newsletter fields — only include when sending
    if (sendNewsletter && state.privacy === "public" && newsletterEnabled && !alreadySent) {
      payload.send_newsletter = true;
      payload.newsletter_subject = newsletterSubject || state.title || "New entry";
      if (isPlus && scheduleSend && scheduledAt) {
        payload.newsletter_scheduled_at = scheduledAt;
      }
    }
    // Cross-post fields — only include when accounts are selected
    if (crosspostTo.size > 0 && state.privacy === "public") {
      payload.crosspost_to = Array.from(crosspostTo);
    }
    return payload;
  }, [state, htmlMode, htmlSource, editor, coverImageId, sendNewsletter, newsletterEnabled, alreadySent, newsletterSubject, isPlus, scheduleSend, scheduledAt, crosspostTo]);

  // Save as draft (no redirect)
  const handleSaveDraft = useCallback(async () => {
    if (!editor) return;
    setSaveStatus("saving");
    try {
      const payload = { ...buildPayload(), status: "draft" };

      if (savedEntryId) {
        // Update existing draft
        const res = await fetch(`/api/entries/${savedEntryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Save failed");
      } else {
        // Create new draft
        const res = await fetch("/api/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const code = (err as { error?: string }).error;
          if (code === "draft_limit_reached") {
            throw new Error("You've reached the 10 draft limit on the free plan. Upgrade to Inkwell Plus for unlimited drafts.");
          }
          throw new Error("Save failed");
        }
        const data = await res.json();
        if (data.data?.id) {
          setSavedEntryId(data.data.id);
          setEntryAuthor(data.data.author?.username ?? null);
          // Update URL so subsequent saves are PATCHes
          window.history.replaceState(null, "", `/editor?edit=${data.data.id}`);
        }
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg && msg !== "Save failed") alert(msg);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [editor, buildPayload, savedEntryId]);

  // Publish (or save changes to published entry)
  const handlePublish = useCallback(async () => {
    if (!editor || isPublishing) return;
    setIsPublishing(true);
    try {
      let data;

      if (savedEntryId && isDraft) {
        // Publishing a draft: POST /api/entries/:id/publish
        const res = await fetch(`/api/entries/${savedEntryId}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "Publish failed");
        }
        data = await res.json();
      } else if (savedEntryId) {
        // Updating a published entry: PATCH /api/entries/:id
        const res = await fetch(`/api/entries/${savedEntryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "Save failed");
        }
        data = await res.json();
      } else {
        // New entry, publish directly: POST /api/entries (no status = defaults to published)
        const res = await fetch("/api/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "Publish failed");
        }
        data = await res.json();
      }

      const entry = data.data;
      const entryId = entry.id;

      // Create or update entry poll after publish
      if (pollEnabled && isPlus && pollQuestion.trim() && pollOptions.filter(o => o.trim()).length >= 2) {
        const validOptions = pollOptions.filter(o => o.trim());
        if (!existingPollId) {
          // Create new poll
          try {
            await fetch(`/api/entries/${entryId}/poll`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                question: pollQuestion,
                options: validOptions,
                closes_at: pollClosesAt || null,
              }),
            });
          } catch {
            // Poll creation failed but entry was saved — don't block navigation
          }
        } else if (!pollLocked) {
          // Update existing poll (only if no votes yet)
          try {
            await fetch(`/api/polls/${existingPollId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                question: pollQuestion,
                options: validOptions,
                closes_at: pollClosesAt || null,
              }),
            });
          } catch {
            // Poll update failed — don't block navigation
          }
        }
      }

      router.push(`/${entry.author?.username ?? entryAuthor ?? "me"}/${entry.slug ?? entrySlug ?? entry.id}`);
    } catch (err) {
      alert(`Could not ${isDraft ? "publish" : "save"}: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsPublishing(false);
    }
  }, [editor, isPublishing, isDraft, savedEntryId, buildPayload, router, entryAuthor, entrySlug, pollEnabled, isPlus, pollQuestion, pollOptions, pollClosesAt, existingPollId, pollLocked]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)", color: "var(--muted)" }}>
        <span className="text-sm">Loading entry...</span>
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div className="editor-shell">

      {/* ── Top bar — minimal, elegant ────────────────────────── */}
      <header className="editor-topbar">
        <div className="editor-topbar-inner">
          <div className="flex items-center gap-3 min-w-0">
            <NextLink href="/feed" className="editor-back-link" aria-label="Back to Feed">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
            </NextLink>
            {isDraft && savedEntryId && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                draft
              </span>
            )}
            <SaveStatus status={saveStatus} />
          </div>
          <div className="flex items-center gap-2">
            {/* Settings panel toggle */}
            <button type="button" onClick={toggleSettings}
              className="editor-settings-toggle"
              title={showSettings ? "Hide settings" : "Show settings"}
              aria-pressed={showSettings}>
              {showSettings ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="13 17 18 12 13 7"/>
                  <polyline points="6 17 11 12 6 7"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="11 17 6 12 11 7"/>
                  <polyline points="18 17 13 12 18 7"/>
                </svg>
              )}
            </button>
            {!isDraft && savedEntryId && (
              <NextLink
                href={`/editor/history?entry=${savedEntryId}`}
                className="editor-history-link"
                title="Version history"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <span className="hidden sm:inline">History</span>
              </NextLink>
            )}
            {isDraft && (
              <button type="button" onClick={handleSaveDraft}
                className="editor-save-draft-btn">
                Save draft
              </button>
            )}
            <button type="button" onClick={handlePublish}
              disabled={isPublishing || !hasContent}
              className="editor-publish-btn">
              {isPublishing
                ? (isDraft ? "Publishing…" : "Saving…")
                : (isDraft ? "Publish" : "Save changes")}
            </button>
          </div>
        </div>
      </header>

      {/* ── Editor body with optional settings panel ───────── */}
      <div className="editor-body-wrapper">

        {/* Main writing area */}
        <main className="editor-main">

          {/* ── Paper container ───────────────────────── */}
          <div className="editor-paper">

            {/* Date line */}
            <div className={`editor-dateline${focusMode ? " hidden" : ""}`}>
              <span>{today}</span>
            </div>

            {/* ── Cover image ──────────────────────────── */}
            <div className={focusMode ? "hidden" : ""}>
              {coverImageId ? (
                <div className="relative group rounded-xl overflow-hidden border mb-6"
                  style={{ borderColor: "var(--border)", maxHeight: 280 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/images/${coverImageId}`}
                    alt="Cover"
                    className="w-full object-cover"
                    style={{ maxHeight: 280 }}
                  />
                  <button
                    type="button"
                    onClick={() => setCoverImageId(null)}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
                    aria-label="Remove cover image"
                  >×</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => coverFileRef.current?.click()}
                  disabled={isUploadingCover}
                  className="editor-add-cover-btn"
                >
                  {isUploadingCover ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                  )}
                  Add cover image
                </button>
              )}
              <input
                ref={coverFileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadCoverImage(file);
                  if (e.target) e.target.value = "";
                }}
              />
            </div>

            {/* ── Title ────────────────────────────────── */}
            <input
              type="text"
              value={state.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Untitled"
              className="editor-title-input"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)", color: "var(--foreground)" }}
              aria-label="Entry title"
            />

            {/* ── Inline category picker ─────────────── */}
            {!focusMode && (
              <div className="editor-inline-category">
                <select
                  value={state.category ?? ""}
                  onChange={(e) => update({ category: e.target.value || null })}
                  className="editor-inline-category-select"
                  aria-label="Category"
                >
                  <option value="">+ Add category</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* ── Mood + music strip ──────────────────── */}
            <div className={`editor-meta-strip${focusMode ? " hidden" : ""}`}>
              <MoodInput value={state.mood} onChange={(v) => update({ mood: v })} />
              <span style={{ color: "var(--border)" }} aria-hidden="true">·</span>
              <MusicInput value={state.music} onChange={(v) => update({ music: v })} />
            </div>

            {/* ── Music embed preview ─────────────────── */}
            {musicEmbed && !focusMode && (
              <div className="music-embed-container mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  {musicEmbed.service === "spotify" ? <SpotifyIcon size={12} /> :
                   musicEmbed.service === "youtube" ? <YouTubeIcon size={12} /> :
                   <AppleMusicIcon size={12} />}
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {musicEmbed.label} preview
                  </span>
                </div>
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                  <iframe
                    src={musicEmbed.embedUrl}
                    width="100%"
                    height={Math.min(musicEmbed.height, 152)}
                    frameBorder="0"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    title={`${musicEmbed.label} embed`}
                    className="block"
                  />
                </div>
              </div>
            )}

            {/* ── Formatting toolbar ─────────────────── */}
            <div className="editor-toolbar-container">
              <EditorToolbar editor={editor} htmlMode={htmlMode} onToggleHtml={toggleHtmlMode}
                onUploadImage={(file) => uploadImage(file, editor)} isUploading={isUploadingImage}
                focusMode={focusMode} onToggleFocus={() => setFocusMode((v) => !v)}
                onInsertCircle={() => setCirclePickerOpen(true)} />
            </div>

            {/* ── Bubble menu (appears on text selection) ── */}
            {editor && !htmlMode && (
              <EditorBubbleMenu editor={editor} />
            )}

            {/* ── Floating menu (appears on empty lines) ── */}
            {editor && !htmlMode && (
              <EditorFloatingMenu editor={editor} onUploadImage={() => floatingImageRef.current?.click()} onInsertCircle={() => setCirclePickerOpen(true)} />
            )}
            <input ref={floatingImageRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && editor) uploadImage(file, editor);
                if (e.target) e.target.value = "";
              }} />

            {/* ── Focus mode hint ───────────────────── */}
            {focusMode && (
              <div className="flex items-center justify-center py-1.5">
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  Focus mode · Press <kbd className="px-1 py-0.5 rounded text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>Esc</kbd> to exit
                </span>
              </div>
            )}

            {/* ── Writing area ──────────────────────── */}
            <div className="editor-writing-area">
              {htmlMode ? (
                <>
                  <div className="flex items-center gap-2 pb-3">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                      HTML mode
                    </span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      Use &lt;marquee&gt;, &lt;style&gt;, CSS animations — go wild!
                    </span>
                  </div>
                  <textarea
                    value={htmlSource}
                    onChange={(e) => {
                      setHtmlSource(e.target.value);
                      setHasContent(!!e.target.value.trim());
                    }}
                    className="w-full min-h-[55vh] py-4 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    style={{
                      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
                      fontSize: "13px",
                      lineHeight: "1.6",
                      borderColor: "var(--border)",
                      background: "var(--surface)",
                      color: "var(--foreground)",
                      resize: "vertical",
                      tabSize: 2,
                    }}
                    placeholder={`<!-- Write your HTML + CSS here! Examples:\n\n<style>\n  .glow {\n    color: #ff0;\n    text-shadow: 0 0 10px #ff0, 0 0 20px #ff0;\n    animation: pulse 2s infinite;\n  }\n  @keyframes pulse {\n    0%, 100% { opacity: 1; }\n    50% { opacity: 0.5; }\n  }\n</style>\n\n<marquee>This scrolls across the page!</marquee>\n<div class="glow">Glowing text!</div>\n-->`}
                    spellCheck={false}
                  />
                </>
              ) : (
                <EditorContent editor={editor} />
              )}
            </div>

            {/* Word count footer */}
            <div className="editor-word-count">
              {htmlMode ? `${htmlSource.length.toLocaleString()} chars` : `${wordCount.toLocaleString()} ${wordCount === 1 ? "word" : "words"}`}
            </div>

          </div>{/* end .editor-paper */}
        </main>

        {/* ── Settings panel — "The Margins" ──────────────── */}
        {showSettings && (
          <aside className="editor-settings-panel">
            <div className="editor-settings-header">
              <span className="editor-settings-heading">Entry Settings</span>
              <button type="button" onClick={toggleSettings}
                className="editor-settings-close" aria-label="Close settings">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="13 17 18 12 13 7"/>
                </svg>
              </button>
            </div>
            <div className="editor-settings-body">

              {/* Privacy */}
              <div className="editor-settings-section">
                <div className="editor-settings-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Privacy
                </div>
                <select value={state.privacy}
                  onChange={(e) => update({ privacy: e.target.value as Privacy, customFilterId: null })}
                  className="editor-settings-select">
                  {PRIVACY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                  ))}
                  {isPlus && hasStripeConnect && hasWriterPlan && (
                    <option value="paid">💰 Paid subscribers only</option>
                  )}
                </select>
                {state.privacy === "paid" && (
                  <div className="editor-settings-hint" style={{ marginTop: 8 }}>
                    Only your paid subscribers can read this entry.
                  </div>
                )}
                {state.privacy === "custom" && (
                  <div style={{ marginTop: 8 }}>
                    {!filtersLoaded ? (
                      <span className="editor-settings-hint">Loading filters...</span>
                    ) : filters.length === 0 ? (
                      <div className="editor-settings-hint">
                        No filters yet.{" "}
                        <NextLink href="/settings/filters" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                          Create one
                        </NextLink>
                      </div>
                    ) : (
                      <select
                        value={state.customFilterId ?? ""}
                        onChange={(e) => update({ customFilterId: e.target.value || null })}
                        className="editor-settings-select">
                        <option value="">Select a filter...</option>
                        {filters.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name} ({f.member_ids.length} {f.member_ids.length === 1 ? "member" : "members"})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Content Warning */}
              <div className="editor-settings-section">
                <div className="editor-settings-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  Content Warning
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={state.sensitive}
                    onChange={(e) => update({ sensitive: e.target.checked })} />
                  This entry contains sensitive content
                </label>
                {state.sensitive && (
                  <div style={{ marginTop: 8 }}>
                    <input type="text" value={state.contentWarning}
                      onChange={(e) => update({ contentWarning: e.target.value })}
                      placeholder="Describe the content (optional)"
                      maxLength={200}
                      className="editor-settings-input" />
                    <span className="editor-settings-hint">
                      Sensitive entries are hidden from Explore by default. Readers can opt in.
                    </span>
                  </div>
                )}
              </div>

              {/* Category */}
              <div className="editor-settings-section">
                <div className="editor-settings-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                  Category
                </div>
                <select
                  value={state.category ?? ""}
                  onChange={(e) => update({ category: e.target.value || null })}
                  className="editor-settings-select">
                  <option value="">No category</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              {/* Series */}
              <div className="editor-settings-section">
                <div className="editor-settings-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  Series
                </div>
                {!seriesLoaded ? (
                  <span className="editor-settings-hint">Loading series...</span>
                ) : seriesOptions.length === 0 ? (
                  <div className="editor-settings-hint">
                    No series yet.{" "}
                    <NextLink href="/settings/series" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                      Create one
                    </NextLink>
                  </div>
                ) : (
                  <select
                    value={state.seriesId ?? ""}
                    onChange={(e) => update({ seriesId: e.target.value || null })}
                    className="editor-settings-select">
                    <option value="">No series</option>
                    {seriesOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} ({s.entry_count} {s.entry_count === 1 ? "entry" : "entries"})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Tags */}
              <div className="editor-settings-section">
                <div className="editor-settings-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
                  </svg>
                  Tags
                </div>
                <input type="text" value={state.tags}
                  onChange={(e) => update({ tags: e.target.value })}
                  placeholder="coffee, 2026, writing"
                  className="editor-settings-input" />
              </div>

              {/* Excerpt */}
              <div className="editor-settings-section">
                <div className="editor-settings-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>
                  </svg>
                  Excerpt
                </div>
                <textarea
                  value={state.excerpt}
                  onChange={(e) => update({ excerpt: e.target.value })}
                  placeholder="A short summary…"
                  maxLength={300}
                  rows={2}
                  className="editor-settings-textarea"
                />
                <div className="editor-settings-hint" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Auto-filled if blank</span>
                  <span>{state.excerpt.length}/300</span>
                </div>
              </div>

              {/* Poll (Plus-only) */}
              {isPlus && (
                <div className="editor-settings-section">
                  <div className="editor-settings-label">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="14" width="4" height="6" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="16" rx="1"/>
                    </svg>
                    Poll
                  </div>
                  {pollLocked ? (
                    <div className="text-xs p-3 rounded-lg" style={{ background: "var(--background)", color: "var(--muted)" }}>
                      Poll is locked after receiving votes. It cannot be edited.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <label className="flex items-center gap-2.5 cursor-pointer text-[13px]" style={{ color: "var(--foreground)" }}>
                        <input
                          type="checkbox"
                          checked={pollEnabled}
                          onChange={(e) => setPollEnabled(e.target.checked)}
                          className="rounded"
                        />
                        Add a poll to this entry
                      </label>
                      {pollEnabled && (
                        <>
                          <input
                            type="text"
                            value={pollQuestion}
                            onChange={(e) => setPollQuestion(e.target.value)}
                            placeholder="Ask a question..."
                            maxLength={500}
                            className="editor-settings-input"
                          />
                          {pollOptions.map((opt, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => {
                                  const next = [...pollOptions];
                                  next[i] = e.target.value;
                                  setPollOptions(next);
                                }}
                                placeholder={`Option ${i + 1}`}
                                maxLength={200}
                                className="editor-settings-input flex-1"
                                style={{ marginBottom: 0 }}
                              />
                              {pollOptions.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                                  className="text-xs px-1.5 py-1 rounded transition-colors"
                                  style={{ color: "var(--muted)" }}
                                  title="Remove option"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                  </svg>
                                </button>
                              )}
                            </div>
                          ))}
                          {pollOptions.length < 10 && (
                            <button
                              type="button"
                              onClick={() => setPollOptions([...pollOptions, ""])}
                              className="text-xs font-medium transition-colors"
                              style={{ color: "var(--accent)" }}
                            >
                              + Add option
                            </button>
                          )}
                          <div>
                            <span className="editor-settings-hint">Close date (optional)</span>
                            <input
                              type="datetime-local"
                              value={pollClosesAt}
                              onChange={(e) => setPollClosesAt(e.target.value)}
                              min={new Date().toISOString().slice(0, 16)}
                              className="editor-settings-input"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Cross-post section — shown when user has fediverse accounts with write scope */}
              {(() => {
                const writeAccounts = fediverseAccounts.filter(a => {
                  const scope = a.token_scope || "";
                  return scope.includes("write:statuses") || scope.includes("write");
                });
                const readOnlyAccounts = fediverseAccounts.filter(a => {
                  const scope = a.token_scope || "";
                  return !(scope.includes("write:statuses") || scope.includes("write"));
                });
                if (fediverseAccounts.length === 0) return null;
                return (
                  <div className="editor-settings-section">
                    <div className="editor-settings-label">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                      Cross-post
                    </div>
                    {state.privacy !== "public" ? (
                      <div className="text-xs p-3 rounded-lg" style={{ background: "var(--background)", color: "var(--muted)" }}>
                        Cross-posting is only available for public entries.
                      </div>
                    ) : writeAccounts.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {writeAccounts.map(account => (
                          <label key={account.id} className="flex items-center gap-2.5 cursor-pointer text-[13px]" style={{ color: "var(--foreground)" }}>
                            <input
                              type="checkbox"
                              checked={crosspostTo.has(account.id)}
                              onChange={(e) => {
                                const next = new Set(crosspostTo);
                                if (e.target.checked) next.add(account.id);
                                else next.delete(account.id);
                                setCrosspostTo(next);
                              }}
                              className="rounded"
                            />
                            <span className="flex items-center gap-1.5 min-w-0">
                              {account.remote_avatar_url && (
                                <img src={account.remote_avatar_url} alt="" className="w-4 h-4 rounded-full flex-shrink-0" />
                              )}
                              <span className="truncate">@{account.remote_acct}</span>
                            </span>
                          </label>
                        ))}
                        <div className="editor-settings-hint">
                          A preview with link will be posted to your Mastodon timeline
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="text-xs p-3 rounded-lg" style={{ background: "var(--background)", color: "var(--muted)" }}>
                          Your linked accounts need upgraded permissions for cross-posting.
                        </div>
                        {readOnlyAccounts.length > 0 && (
                          <NextLink
                            href="/settings/fediverse"
                            className="text-xs font-medium"
                            style={{ color: "var(--accent)" }}
                          >
                            Upgrade permissions &rarr;
                          </NextLink>
                        )}
                      </div>
                    )}
                    {fediverseAccounts.length === 0 && (
                      <NextLink
                        href="/settings/fediverse"
                        className="text-xs font-medium"
                        style={{ color: "var(--accent)" }}
                      >
                        Link a Mastodon account &rarr;
                      </NextLink>
                    )}
                  </div>
                );
              })()}

              {/* Newsletter section — only when enabled + public */}
              {newsletterEnabled && state.privacy === "public" && (
                <div className="editor-settings-section">
                  <div className="editor-settings-label">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                    </svg>
                    Newsletter
                  </div>
                  {alreadySent ? (
                    <div className="text-xs p-3 rounded-lg" style={{ background: "var(--background)", color: "var(--muted)" }}>
                      This entry was already sent as a newsletter.
                    </div>
                  ) : sendsThisMonth >= sendLimit ? (
                    <div className="text-xs p-3 rounded-lg" style={{ background: "var(--background)", color: "var(--muted)" }}>
                      You&apos;ve used all {sendLimit} newsletter sends this month.{" "}
                      {!isPlus ? (
                        <NextLink href="/settings/billing" className="font-medium" style={{ color: "var(--accent)" }}>Upgrade to Plus</NextLink>
                      ) : (
                        <span>Resets next month.</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <label className="flex items-center gap-2.5 cursor-pointer text-[13px]" style={{ color: "var(--foreground)" }}>
                        <input
                          type="checkbox"
                          checked={sendNewsletter}
                          onChange={(e) => setSendNewsletter(e.target.checked)}
                          className="rounded"
                        />
                        Send to email subscribers
                      </label>
                      {sendNewsletter && (
                        <>
                          <div className="editor-settings-hint">
                            {subscriberCount} {subscriberCount === 1 ? "subscriber" : "subscribers"} will receive this
                            <span className="ml-1">({sendLimit - sendsThisMonth} {sendLimit - sendsThisMonth === 1 ? "send" : "sends"} remaining this month)</span>
                          </div>
                          <input
                            type="text"
                            value={newsletterSubject}
                            onChange={(e) => setNewsletterSubject(e.target.value)}
                            placeholder={state.title || "Email subject line"}
                            maxLength={200}
                            className="editor-settings-input"
                          />
                          <div className="editor-settings-hint">Subject line (defaults to entry title)</div>
                          {isPlus && (
                            <div className="flex flex-col gap-2">
                              <label className="flex items-center gap-2.5 cursor-pointer text-[13px]" style={{ color: "var(--foreground)" }}>
                                <input
                                  type="checkbox"
                                  checked={scheduleSend}
                                  onChange={(e) => setScheduleSend(e.target.checked)}
                                  className="rounded"
                                />
                                Schedule for later
                              </label>
                              {scheduleSend && (
                                <input
                                  type="datetime-local"
                                  value={scheduledAt}
                                  onChange={(e) => setScheduledAt(e.target.value)}
                                  min={new Date().toISOString().slice(0, 16)}
                                  className="editor-settings-input"
                                />
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          </aside>
        )}
      </div>

      {/* Circle embed picker modal */}
      {circlePickerOpen && (
        <CirclePickerModal
          onSelect={(attrs) => {
            editor?.commands.insertCircleEmbed(attrs);
            setCirclePickerOpen(false);
          }}
          onClose={() => setCirclePickerOpen(false)}
        />
      )}
    </div>
  );
}
