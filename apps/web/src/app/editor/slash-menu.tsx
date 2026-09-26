"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import type { SlashState } from "@/lib/tiptap-editor-menus";

// The "/" menu: type "/" on a new line (or after a space) to add a heading,
// a list, a picture… Typing after the slash filters; arrows, Enter and Tab
// pick; Escape closes it until that slash is gone.

export type SlashItemId =
  | "text" | "h1" | "h2" | "h3"
  | "bullet" | "numbered" | "todo" | "quote"
  | "image" | "gallery" | "divider" | "table" | "code" | "linkPreview" | "circle";

export interface SlashItem {
  id: SlashItemId;
  label: string;
  hint: string;
  keywords: string[];
  group: "Text" | "Lists & quotes" | "Insert";
  icon: React.ReactNode;
}

const svg = (children: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const glyph = (text: string, weight = 700, size = 12) => (
  <span aria-hidden="true" style={{ fontWeight: weight, fontSize: size, letterSpacing: "-0.02em" }}>{text}</span>
);

export const SLASH_ITEMS: SlashItem[] = [
  { id: "text", label: "Text", hint: "Plain writing", keywords: ["paragraph", "body", "normal", "p"], group: "Text", icon: glyph("¶", 500, 15) },
  { id: "h1", label: "Big heading", hint: "Heading 1", keywords: ["heading", "h1", "title", "large"], group: "Text", icon: glyph("H1") },
  { id: "h2", label: "Heading", hint: "Heading 2", keywords: ["heading", "h2", "section", "medium"], group: "Text", icon: glyph("H2") },
  { id: "h3", label: "Small heading", hint: "Heading 3", keywords: ["heading", "h3", "subheading", "small"], group: "Text", icon: glyph("H3") },
  {
    id: "bullet", label: "Bulleted list", hint: "Start with - or *", keywords: ["bullet", "list", "unordered", "ul", "points"], group: "Lists & quotes",
    icon: svg(<><line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></>),
  },
  {
    id: "numbered", label: "Numbered list", hint: "Start with 1.", keywords: ["number", "ordered", "ol", "list", "steps"], group: "Lists & quotes",
    icon: svg(<><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><path d="M4 6h1v4M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></>),
  },
  {
    id: "todo", label: "Checklist", hint: "Start with [ ]", keywords: ["todo", "to-do", "task", "checkbox", "check", "list"], group: "Lists & quotes",
    icon: svg(<><rect x="3" y="4" width="7" height="7" rx="1.5" /><path d="M5 7.5l1.5 1.5L9 6" /><line x1="13" y1="7.5" x2="21" y2="7.5" /><rect x="3" y="13" width="7" height="7" rx="1.5" /><line x1="13" y1="16.5" x2="21" y2="16.5" /></>),
  },
  {
    id: "quote", label: "Quote", hint: "Start with >", keywords: ["quote", "blockquote", "citation", "pull"], group: "Lists & quotes",
    icon: svg(<><path d="M7 7h4v4c0 3-2 5-4 6" /><path d="M14 7h4v4c0 3-2 5-4 6" /></>),
  },
  {
    id: "image", label: "Picture", hint: "Upload from your device", keywords: ["image", "photo", "picture", "upload", "img"], group: "Insert",
    icon: svg(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>),
  },
  {
    id: "gallery", label: "Photo gallery", hint: "Several pictures together", keywords: ["gallery", "album", "photos", "carousel", "grid"], group: "Insert",
    icon: svg(<><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>),
  },
  {
    id: "divider", label: "Divider", hint: "Type --- on a new line", keywords: ["divider", "hr", "line", "separator", "break", "rule"], group: "Insert",
    icon: svg(<><line x1="3" y1="12" x2="21" y2="12" /></>),
  },
  {
    id: "linkPreview", label: "Link preview", hint: "A card for a web page", keywords: ["link", "embed", "card", "bookmark", "url", "preview"], group: "Insert",
    icon: svg(<><rect x="2" y="4" width="20" height="16" rx="2" /><line x1="7" y1="9" x2="17" y2="9" /><line x1="7" y1="13" x2="13" y2="13" /></>),
  },
  {
    id: "table", label: "Table", hint: "Rows and columns", keywords: ["table", "grid", "rows", "columns"], group: "Insert",
    icon: svg(<><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="12" y1="3" x2="12" y2="21" /></>),
  },
  {
    id: "code", label: "Code", hint: "Start with ```", keywords: ["code", "pre", "monospace", "snippet"], group: "Insert",
    icon: svg(<><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>),
  },
  {
    id: "circle", label: "Circle card", hint: "Invite readers to a circle", keywords: ["circle", "community", "group", "embed"], group: "Insert",
    icon: svg(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /></>),
  },
];

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  const starts: SlashItem[] = [];
  const contains: SlashItem[] = [];
  for (const item of SLASH_ITEMS) {
    const words = [item.label.toLowerCase(), ...item.keywords];
    if (words.some((w) => w.startsWith(q) || w.split(/\s+/).some((part) => part.startsWith(q)))) starts.push(item);
    else if (words.some((w) => w.includes(q))) contains.push(item);
  }
  return [...starts, ...contains];
}

export interface SlashActions {
  image: () => void;
  gallery: () => void;
  linkPreview: () => void;
  circle: () => void;
}

/** Removes the "/query" and does what the item says. */
export function runSlashItem(editor: Editor, item: SlashItem, range: SlashState, actions: SlashActions) {
  const chain = editor.chain().focus().deleteRange({ from: range.from, to: range.to });
  switch (item.id) {
    case "text": chain.setParagraph().run(); break;
    case "h1": chain.setHeading({ level: 1 }).run(); break;
    case "h2": chain.setHeading({ level: 2 }).run(); break;
    case "h3": chain.setHeading({ level: 3 }).run(); break;
    case "bullet": chain.toggleBulletList().run(); break;
    case "numbered": chain.toggleOrderedList().run(); break;
    case "todo": chain.toggleTaskList().run(); break;
    case "quote": chain.toggleBlockquote().run(); break;
    case "code": chain.toggleCodeBlock().run(); break;
    case "divider": chain.setHorizontalRule().run(); break;
    case "table": chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
    case "image": chain.run(); actions.image(); break;
    case "gallery": chain.run(); actions.gallery(); break;
    case "linkPreview": chain.run(); actions.linkPreview(); break;
    case "circle": chain.run(); actions.circle(); break;
  }
}

export function SlashMenu({
  editor,
  range,
  items,
  activeIndex,
  onPick,
  onHover,
}: {
  editor: Editor;
  range: SlashState;
  items: SlashItem[];
  activeIndex: number;
  onPick: (item: SlashItem) => void;
  onHover: (index: number) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  // Follow the "/" as the page scrolls or the window resizes.
  useLayoutEffect(() => {
    const place = () => {
      let coords: { left: number; top: number; bottom: number };
      try {
        coords = editor.view.coordsAtPos(range.from);
      } catch {
        return;
      }
      const menuHeight = menuRef.current?.offsetHeight ?? 320;
      const width = Math.min(300, window.innerWidth - 16);
      const left = Math.max(8, Math.min(coords.left - 4, window.innerWidth - width - 8));
      const below = window.innerHeight - coords.bottom - 12;
      const above = coords.top - 12;
      if (below >= Math.min(menuHeight, 240) || below >= above) {
        setPos({ top: coords.bottom + 6, left, maxHeight: Math.max(160, Math.min(340, below - 6)) });
      } else {
        const maxHeight = Math.max(160, Math.min(340, above - 6));
        setPos({ top: Math.max(8, coords.top - 6 - Math.min(menuHeight, maxHeight)), left, maxHeight });
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [editor, range.from, items.length]);

  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (typeof document === "undefined") return null;

  let lastGroup: string | null = null;
  return createPortal(
    <div
      ref={menuRef}
      className="slash-menu"
      role="listbox"
      aria-label="Add to your entry"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        maxHeight: pos?.maxHeight ?? 340,
        visibility: pos ? "visible" : "hidden",
      }}
      // Keep the cursor in the editor while choosing with the mouse.
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.length === 0 ? (
        <div className="slash-menu-empty">Nothing called “{range.query}”. Keep typing, or press Esc.</div>
      ) : (
        items.map((item, i) => {
          const header = item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          return (
            <div key={item.id}>
              {header && <div className="slash-menu-group">{header}</div>}
              <button
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                data-index={i}
                className="slash-menu-item"
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(item)}
              >
                <span className="slash-menu-icon">{item.icon}</span>
                <span className="slash-menu-text">
                  <span className="slash-menu-label">{item.label}</span>
                  <span className="slash-menu-hint">{item.hint}</span>
                </span>
              </button>
            </div>
          );
        })
      )}
    </div>,
    document.body,
  );
}
