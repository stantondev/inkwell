"use client";

import { useCallback, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import CharacterCount from "@tiptap/extension-character-count";
import type { Editor } from "@tiptap/react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { CLIENT_API } from "@/lib/api";

type Privacy = "public" | "friends_only" | "private" | "custom";

interface EditorState {
  title: string;
  mood: string;
  music: string;
  privacy: Privacy;
  tags: string;
  iconKeyword: string;
}

const PRIVACY_OPTIONS: { value: Privacy; label: string; description: string }[] = [
  { value: "public",       label: "Public",        description: "Anyone can read this entry" },
  { value: "friends_only", label: "Friends only",   description: "Only people you follow back" },
  { value: "custom",       label: "Custom filter",  description: "Choose a specific friend filter" },
  { value: "private",      label: "Private",        description: "Only you can see this" },
];

async function getToken(): Promise<string | null> {
  // Read the token from the cookie; must use document.cookie in client components
  const match = document.cookie.match(/(?:^|;\s*)inkwell_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------
function ToolbarButton({ onClick, active = false, disabled = false, title, children }: {
  onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className="w-8 h-8 flex items-center justify-center rounded text-sm transition-colors disabled:opacity-30"
      style={{ background: active ? "var(--accent-light)" : "transparent", color: active ? "var(--accent)" : "var(--muted)" }}
      aria-pressed={active}>
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 mx-1 self-center" style={{ background: "var(--border)" }} aria-hidden="true" />;
}

function EditorToolbar({ editor }: { editor: Editor | null }) {
  const addLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Enter URL:");
    if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Enter image URL:");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b"
      style={{ borderColor: "var(--border)" }} role="toolbar" aria-label="Text formatting">
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })} title="Heading 1">H1</ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })} title="Heading 2">H2</ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })} title="Heading 3">H3</ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")} title="Bold (⌘B)"><strong>B</strong></ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")} title="Italic (⌘I)"><em>i</em></ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")} title="Strikethrough">
        <span style={{ textDecoration: "line-through" }}>S</span>
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")} title="Blockquote">❝</ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")} title="Bullet list">•</ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")} title="Numbered list">1.</ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")} title="Code block">{"{}"}</ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton onClick={addLink} active={editor.isActive("link")} title="Add link">🔗</ToolbarButton>
      <ToolbarButton onClick={addImage} title="Add image">🖼</ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()} title="Undo (⌘Z)">↩</ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()} title="Redo (⌘⇧Z)">↪</ToolbarButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mood picker
// ---------------------------------------------------------------------------
const PRESET_MOODS = [
  "happy 😊", "sad 😢", "anxious 😰", "grateful 🙏",
  "excited 🎉", "reflective 🌧", "tired 😴", "curious 🔍",
  "angry 😤", "peaceful 🌿", "nostalgic 📼", "hopeful 🌅",
];

function MoodPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [showPresets, setShowPresets] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2 items-center">
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="mood (optional)"
          className="flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }} />
        <button type="button" onClick={() => setShowPresets((v) => !v)}
          className="text-xs px-2 py-1 rounded border transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--muted)", background: showPresets ? "var(--surface-hover)" : "transparent" }}>
          pick
        </button>
      </div>
      {showPresets && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {PRESET_MOODS.map((m) => (
            <button key={m} type="button" onClick={() => { onChange(m); setShowPresets(false); }}
              className="text-xs px-2 py-1 rounded-full border transition-colors hover:border-accent"
              style={{ borderColor: value === m ? "var(--accent)" : "var(--border)", background: value === m ? "var(--accent-light)" : "var(--surface)", color: value === m ? "var(--accent)" : "var(--muted)" }}>
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save status
// ---------------------------------------------------------------------------
function SaveStatus({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "idle") return null;
  const map = { saving: { text: "Saving…", color: "var(--muted)" }, saved: { text: "Saved ✓", color: "var(--success)" }, error: { text: "Error saving", color: "var(--danger)" } } as const;
  const s = map[status];
  return <span className="text-xs" style={{ color: s.color }}>{s.text}</span>;
}

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------
export function EditorClient() {
  const router = useRouter();
  const [state, setState] = useState<EditorState>({
    title: "", mood: "", music: "", privacy: "friends_only", tags: "", iconKeyword: "",
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showMeta, setShowMeta] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedEntryId, setPublishedEntryId] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "What's on your mind today?" }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Image.configure({ inline: false, allowBase64: false }),
      CharacterCount.configure({ limit: 100_000 }),
    ],
    editorProps: { attributes: { class: "prose-entry focus:outline-none min-h-[320px] px-6 py-5" } },
  });

  const wordCount = editor ? editor.storage.characterCount.words() : 0;
  const update = (patch: Partial<EditorState>) => setState((s) => ({ ...s, ...patch }));

  const buildPayload = (isDraft: boolean) => ({
    title: state.title || null,
    body_html: editor?.getHTML() ?? "",
    body_raw: editor?.getJSON() ?? {},
    mood: state.mood || null,
    music: state.music || null,
    privacy: state.privacy,
    tags: state.tags ? state.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    is_draft: isDraft,
  });

  const apiPost = async (payload: object) => {
    const token = await getToken();
    const res = await fetch(`${CLIENT_API}/api/entries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? "Request failed");
    }
    return res.json();
  };

  const handleSaveDraft = useCallback(async () => {
    if (!editor) return;
    setSaveStatus("saving");
    try {
      await apiPost(buildPayload(true));
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, state]);

  const handlePublish = useCallback(async () => {
    if (!editor || isPublishing) return;
    setIsPublishing(true);
    try {
      const data = await apiPost(buildPayload(false));
      const entry = data.data;
      setPublishedEntryId(entry.id);
      // Navigate to the new entry
      router.push(`/${entry.author?.username ?? "me"}/${entry.slug ?? entry.id}`);
    } catch (err) {
      alert(`Could not publish: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsPublishing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, isPublishing, state, router]);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <NextLink href="/feed" className="text-sm transition-colors flex-shrink-0"
              style={{ color: "var(--muted)" }}>← Feed</NextLink>
            <span style={{ color: "var(--border)" }} aria-hidden="true">│</span>
            <span className="text-sm font-medium truncate" style={{ color: "var(--muted)" }}>
              {state.title || "New entry"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <SaveStatus status={saveStatus} />
            <button type="button" onClick={handleSaveDraft}
              className="text-sm px-3 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              Save draft
            </button>
            <button type="button" onClick={handlePublish}
              disabled={isPublishing || !editor?.getText().trim()}
              className="text-sm px-4 py-1.5 rounded-full font-medium transition-opacity disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}>
              {isPublishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-24">
        {/* Title */}
        <div className="pt-10 pb-4">
          <input type="text" value={state.title} onChange={(e) => update({ title: e.target.value })}
            placeholder="Title (optional)"
            className="w-full bg-transparent text-4xl font-semibold focus:outline-none placeholder:opacity-30"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)", color: "var(--foreground)" }}
            aria-label="Entry title" />
        </div>

        {/* Mood / music strip */}
        <div className="flex flex-wrap gap-4 items-center py-3 mb-4 border-y text-sm"
          style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <span style={{ color: "var(--muted)" }} className="flex-shrink-0">mood:</span>
            <input type="text" value={state.mood} onChange={(e) => update({ mood: e.target.value })}
              placeholder="e.g. happy 😊" className="bg-transparent focus:outline-none w-36"
              style={{ color: "var(--foreground)" }} />
          </div>
          <span style={{ color: "var(--border)" }} aria-hidden="true">·</span>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span style={{ color: "var(--muted)" }} className="flex-shrink-0">listening to:</span>
            <input type="text" value={state.music} onChange={(e) => update({ music: e.target.value })}
              placeholder="Artist — Track" className="bg-transparent focus:outline-none min-w-0 flex-1"
              style={{ color: "var(--foreground)" }} />
          </div>
        </div>

        {/* Rich text */}
        <div className="rounded-xl border overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <EditorToolbar editor={editor} />
          <EditorContent editor={editor} />
          <div className="flex justify-end px-4 py-2 text-xs border-t"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
          </div>
        </div>

        {/* Settings panel */}
        <div className="mt-6">
          <button type="button" onClick={() => setShowMeta((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium transition-colors mb-4"
            style={{ color: "var(--muted)" }}>
            <span className="inline-block transition-transform"
              style={{ transform: showMeta ? "rotate(90deg)" : "none" }} aria-hidden="true">▶</span>
            Entry settings
          </button>

          {showMeta && (
            <div className="rounded-xl border p-5 grid gap-5 sm:grid-cols-2"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>Privacy</label>
                <select value={state.privacy} onChange={(e) => update({ privacy: e.target.value as Privacy })}
                  className="rounded-lg border px-3 py-1.5 text-sm focus:outline-none"
                  style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}>
                  {PRIVACY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>Mood</label>
                <MoodPicker value={state.mood} onChange={(v) => update({ mood: v })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>Tags</label>
                <input type="text" value={state.tags} onChange={(e) => update({ tags: e.target.value })}
                  placeholder="writing, coffee, 2026 (comma-separated)"
                  className="rounded-lg border px-3 py-1.5 text-sm focus:outline-none"
                  style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }} />
              </div>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="fixed bottom-0 left-0 right-0 border-t py-3 px-4"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="mx-auto max-w-4xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: "var(--muted)" }}>Privacy:</span>
              <select value={state.privacy} onChange={(e) => update({ privacy: e.target.value as Privacy })}
                className="text-xs rounded border px-2 py-1 focus:outline-none"
                style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}>
                {PRIVACY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <SaveStatus status={saveStatus} />
              <button type="button" onClick={handleSaveDraft}
                className="text-sm px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                Save draft
              </button>
              <button type="button" onClick={handlePublish}
                disabled={isPublishing || !editor?.getText().trim()}
                className="text-sm px-5 py-1.5 rounded-full font-medium transition-opacity disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#fff" }}>
                {isPublishing ? "Publishing…" : "Publish entry"}
              </button>
            </div>
          </div>
        </div>
      </main>
      {publishedEntryId && <></>}
    </div>
  );
}
