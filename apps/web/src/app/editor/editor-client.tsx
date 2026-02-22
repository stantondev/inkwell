"use client";

import { useCallback, useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import CharacterCount from "@tiptap/extension-character-count";
import type { Editor } from "@tiptap/react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { parseMusicUrl } from "@/lib/music";

type Privacy = "public" | "friends_only" | "private" | "custom";

interface FriendFilter {
  id: string;
  name: string;
  member_ids: string[];
}

interface EditorState {
  title: string;
  mood: string;
  music: string;
  privacy: Privacy;
  customFilterId: string | null;
  tags: string;
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

// ─── Toolbar ─────────────────────────────────────────────────────────────────

function Btn({
  onClick, active = false, disabled = false, title, children,
}: {
  onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className="w-8 h-8 flex items-center justify-center rounded transition-colors disabled:opacity-25"
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

function EditorToolbar({ editor, htmlMode, onToggleHtml }: { editor: Editor | null; htmlMode: boolean; onToggleHtml: () => void }) {
  const addLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("URL:");
    if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Image URL:");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5" role="toolbar" aria-label="Text formatting">
      {!htmlMode && (
        <>
          <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive("heading", { level: 1 })} title="Heading 1">
            <span style={{ fontWeight: 700, fontSize: 11 }}>H1</span>
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive("heading", { level: 2 })} title="Heading 2">
            <span style={{ fontWeight: 700, fontSize: 11 }}>H2</span>
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive("heading", { level: 3 })} title="Heading 3">
            <span style={{ fontWeight: 700, fontSize: 11 }}>H3</span>
          </Btn>
          <Sep />
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
          <Btn onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")} title="Strikethrough">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/><path d="M16 6a3 3 0 0 0-5.19 2.06C10.03 9.74 10.9 11.06 12 12c1.1.94 2 2.02 2 3.44A3 3 0 0 1 8.5 18"/>
            </svg>
          </Btn>
          <Sep />
          <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive("blockquote")} title="Blockquote">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
              <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
            </svg>
          </Btn>
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
          <Btn onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive("codeBlock")} title="Code block">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
            </svg>
          </Btn>
          <Sep />
          <Btn onClick={addLink} active={editor.isActive("link")} title="Add link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </Btn>
          <Btn onClick={addImage} title="Add image">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
          </Btn>
          <Sep />
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
    </div>
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

// ─── Main editor ──────────────────────────────────────────────────────────────

export function EditorClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  const [state, setState] = useState<EditorState>({
    title: "", mood: "", music: "", privacy: "public", customFilterId: null, tags: "",
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showSettings, setShowSettings] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [loading, setLoading] = useState(!!editId);
  const [entrySlug, setEntrySlug] = useState<string | null>(null);
  const [entryAuthor, setEntryAuthor] = useState<string | null>(null);
  const [htmlMode, setHtmlMode] = useState(false);
  const [htmlSource, setHtmlSource] = useState("");
  const [filters, setFilters] = useState<FriendFilter[]>([]);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false }),
      Placeholder.configure({ placeholder: "What's on your mind today?" }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Image.configure({ inline: false, allowBase64: false }),
      CharacterCount.configure({ limit: 100_000 }),
    ],
    editorProps: {
      attributes: { class: "prose-entry focus:outline-none min-h-[55vh] py-6" },
    },
    onUpdate: ({ editor }) => {
      setHasContent(!!editor.getText().trim());
      setWordCount(editor.storage.characterCount.words());
    },
  });

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
        });

        // Store slug + author for redirect after save
        setEntrySlug(entry.slug ?? null);
        setEntryAuthor(entry.author?.username ?? null);

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

  const update = (patch: Partial<EditorState>) => setState((s) => ({ ...s, ...patch }));

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

  const buildPayload = () => ({
    title: state.title || null,
    body_html: htmlMode ? htmlSource : (editor?.getHTML() ?? ""),
    body_raw: htmlMode ? null : (editor?.getJSON() ?? {}),
    mood: state.mood || null,
    music: state.music || null,
    privacy: state.privacy,
    custom_filter_id: state.privacy === "custom" ? state.customFilterId : null,
    tags: state.tags ? state.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
  });

  const apiSave = async (payload: object) => {
    // Use PATCH when editing, POST when creating
    const url = editId ? `/api/entries/${editId}` : "/api/entries";
    const method = editId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
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
      await apiSave(buildPayload());
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, state, editId, htmlMode, htmlSource]);

  const handlePublish = useCallback(async () => {
    if (!editor || isPublishing) return;
    setIsPublishing(true);
    try {
      const data = await apiSave(buildPayload());
      const entry = data.data;
      router.push(`/${entry.author?.username ?? entryAuthor ?? "me"}/${entry.slug ?? entrySlug ?? entry.id}`);
    } catch (err) {
      alert(`Could not ${editId ? "save" : "publish"}: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsPublishing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, isPublishing, state, router, editId, entryAuthor, entrySlug, htmlMode, htmlSource]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)", color: "var(--muted)" }}>
        <span className="text-sm">Loading entry...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>

      {/* ── Top bar ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <NextLink href="/feed" className="text-sm flex-shrink-0 hover:underline transition-colors"
              style={{ color: "var(--muted)" }}>← Feed</NextLink>
            <span style={{ color: "var(--border)" }} aria-hidden="true">│</span>
            <span className="text-sm truncate" style={{ color: "var(--muted)" }}>
              {editId ? (state.title || "Edit entry") : (state.title || "New entry")}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <SaveStatus status={saveStatus} />
            {!editId && (
              <button type="button" onClick={handleSaveDraft}
                className="text-sm px-3 py-1.5 rounded-lg border transition-colors hover:border-[var(--border-strong)]"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                Save draft
              </button>
            )}
            <button type="button" onClick={handlePublish}
              disabled={isPublishing || !hasContent}
              className="text-sm px-4 py-1.5 rounded-full font-medium transition-opacity disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#fff" }}>
              {isPublishing ? (editId ? "Saving…" : "Publishing…") : (editId ? "Save changes" : "Publish")}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-24">

        {/* ── Title ────────────────────────────────────────── */}
        <div className="pt-10 pb-2">
          <input
            type="text"
            value={state.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Title (optional)"
            className="w-full bg-transparent text-4xl font-bold focus:outline-none placeholder:opacity-25"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)", color: "var(--foreground)" }}
            aria-label="Entry title"
          />
        </div>

        {/* ── Mood + music strip ────────────────────────── */}
        <div className="flex flex-wrap items-center gap-4 py-3 mb-1 border-b"
          style={{ borderColor: "var(--border)" }}>
          <MoodInput value={state.mood} onChange={(v) => update({ mood: v })} />
          <span style={{ color: "var(--border)" }} aria-hidden="true">·</span>
          <MusicInput value={state.music} onChange={(v) => update({ music: v })} />
        </div>

        {/* ── Music embed preview ─────────────────────── */}
        {musicEmbed && (
          <div className="music-embed-container my-3">
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

        {/* ── Sticky formatting toolbar ─────────────────── */}
        <div className="sticky z-30 border-b -mx-4 px-2"
          style={{ top: 57, background: "var(--background)", borderColor: "var(--border)" }}>
          <EditorToolbar editor={editor} htmlMode={htmlMode} onToggleHtml={toggleHtmlMode} />
        </div>

        {/* ── Writing area ──────────────────────────────── */}
        {htmlMode ? (
          <>
            <div className="flex items-center gap-2 pt-4 pb-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                HTML mode
              </span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Use &lt;marquee&gt;, &lt;style&gt;, CSS animations, custom divs — go wild!
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

        <div className="text-right text-xs py-1" style={{ color: "var(--muted)" }}>
          {htmlMode ? `${htmlSource.length.toLocaleString()} chars` : `${wordCount.toLocaleString()} ${wordCount === 1 ? "word" : "words"}`}
        </div>

        {/* ── Settings (collapsible) ────────────────────── */}
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <button type="button" onClick={() => setShowSettings((v) => !v)}
            className="flex items-center gap-2 text-sm transition-colors mb-4"
            style={{ color: "var(--muted)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: showSettings ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            Entry settings
          </button>

          {showSettings && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  Privacy
                </label>
                <select value={state.privacy}
                  onChange={(e) => update({ privacy: e.target.value as Privacy, customFilterId: null })}
                  className="rounded-lg border px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}>
                  {PRIVACY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                  ))}
                </select>
              </div>
              {state.privacy === "custom" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                    Filter
                  </label>
                  {!filtersLoaded ? (
                    <span className="text-xs py-2" style={{ color: "var(--muted)" }}>Loading filters...</span>
                  ) : filters.length === 0 ? (
                    <div className="text-xs py-2" style={{ color: "var(--muted)" }}>
                      No filters yet.{" "}
                      <NextLink href="/settings/filters" className="underline" style={{ color: "var(--accent)" }}>
                        Create your first filter
                      </NextLink>
                    </div>
                  ) : (
                    <select
                      value={state.customFilterId ?? ""}
                      onChange={(e) => update({ customFilterId: e.target.value || null })}
                      className="rounded-lg border px-3 py-2 text-sm focus:outline-none"
                      style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
                    >
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
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  Tags
                </label>
                <input type="text" value={state.tags}
                  onChange={(e) => update({ tags: e.target.value })}
                  placeholder="coffee, 2026, writing (comma-separated)"
                  className="rounded-lg border px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }} />
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
