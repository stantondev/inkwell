"use client";

import { useEffect, useRef, useState } from "react";
import { Node } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

// Pictures in an entry: a <figure> with the picture, an optional caption
// typed straight under it, alt text, and a size (small, column, wide).
//
// It keeps the node name "image" so entries saved with TipTap's Image node
// (and bare <img> HTML from imports and pastes) open as pictures here, and
// stores the size as a class because the server's HTML sanitizer keeps
// classes on <figure> but not data attributes.
//
// Published HTML: <figure class="entry-figure [entry-figure-small|-wide]">
//   <img src alt><figcaption>…</figcaption></figure>

export type FigureSize = "small" | "normal" | "wide";

const SIZES: { value: FigureSize; label: string; title: string }[] = [
  { value: "small", label: "Small", title: "Small, centred" },
  { value: "normal", label: "Column", title: "As wide as the writing" },
  { value: "wide", label: "Wide", title: "Wider than the writing, on the entry's page" },
];

function sizeFromClass(className: string | null | undefined): FigureSize {
  if (!className) return "normal";
  if (/\bentry-figure-wide\b/.test(className)) return "wide";
  if (/\bentry-figure-small\b/.test(className)) return "small";
  return "normal";
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    picture: {
      /** Adds a picture at the cursor. */
      insertPicture: (attrs: { src: string; alt?: string | null }) => ReturnType;
    };
  }
}

function FigureView({ node, updateAttributes, deleteNode, selected, editor, getPos }: NodeViewProps) {
  const { src, alt, size } = node.attrs as { src: string; alt: string | null; size: FigureSize };
  const [altOpen, setAltOpen] = useState(false);
  const [altDraft, setAltDraft] = useState(alt ?? "");
  const altRef = useRef<HTMLInputElement>(null);
  const editable = editor.isEditable;

  useEffect(() => {
    if (altOpen) altRef.current?.focus();
  }, [altOpen]);

  const select = () => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof pos === "number") editor.chain().setNodeSelection(pos).run();
  };

  const saveAlt = () => {
    updateAttributes({ alt: altDraft.trim() || null });
    setAltOpen(false);
  };

  const sizeClass = size === "normal" ? "" : ` entry-figure-${size}`;

  return (
    <NodeViewWrapper as="figure" className={`entry-figure${sizeClass}${selected ? " is-selected" : ""}`}>
      <div className="entry-figure-frame" contentEditable={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt ?? ""} draggable={false} data-drag-handle="" onClick={select} />
        {editable && (
          <div className="entry-figure-tools" role="toolbar" aria-label="Picture">
            {SIZES.map((s) => (
              <button key={s.value} type="button" title={s.title} aria-pressed={size === s.value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateAttributes({ size: s.value })}>
                {s.label}
              </button>
            ))}
            <span className="entry-figure-tools-sep" aria-hidden="true" />
            <button type="button" aria-pressed={altOpen}
              title="Alt text: describes the picture for people who can't see it"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setAltDraft(alt ?? ""); setAltOpen((v) => !v); }}>
              Alt text
            </button>
            <button type="button" title="Remove the picture" aria-label="Remove the picture"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => deleteNode()}>
              ✕
            </button>
          </div>
        )}
        {editable && !alt && !altOpen && (
          <button type="button" className="entry-figure-alt-missing"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setAltDraft(""); setAltOpen(true); }}
            title="Add a short description for people who can't see the picture">
            + Alt text
          </button>
        )}
      </div>
      {editable && altOpen && (
        <div className="entry-figure-alt" contentEditable={false}>
          <input
            ref={altRef}
            value={altDraft}
            onChange={(e) => setAltDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); saveAlt(); editor.commands.focus(); }
              if (e.key === "Escape") { e.preventDefault(); setAltOpen(false); editor.commands.focus(); }
            }}
            onBlur={saveAlt}
            maxLength={1000}
            placeholder="Describe the picture, e.g. “My dog asleep on the porch in the sun”"
            aria-label="Alt text"
          />
          <span className="entry-figure-alt-hint">Read aloud by screen readers, here and on the fediverse.</span>
        </div>
      )}
      <NodeViewContent<"figcaption"> as="figcaption" className="entry-figure-caption" />
      {editable && node.content.size === 0 && (
        <span className="entry-figure-caption-placeholder" contentEditable={false} aria-hidden="true">
          Add a caption (optional)
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const Picture = Node.create({
  name: "image",
  group: "block",
  content: "inline*",
  draggable: true,
  isolating: true,
  defining: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      size: { default: "normal" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure",
        getAttrs: (el) => {
          const figure = el as HTMLElement;
          // Gallery photos belong to their gallery.
          if (figure.hasAttribute("data-gallery-photo") || figure.closest("[data-photo-gallery]")) return false;
          const img = figure.querySelector("img");
          const src = img?.getAttribute("src");
          if (!img || !src) return false;
          return { src, alt: img.getAttribute("alt") || null, title: img.getAttribute("title"), size: sizeFromClass(figure.getAttribute("class")) };
        },
        contentElement: (el) =>
          (el as HTMLElement).querySelector("figcaption") ?? (el as HTMLElement).ownerDocument.createElement("figcaption"),
      },
      {
        tag: "img[src]",
        getAttrs: (el) => {
          const img = el as HTMLElement;
          if (img.closest("[data-photo-gallery], [data-link-embed], [data-circle-embed]")) return false;
          return { src: img.getAttribute("src"), alt: img.getAttribute("alt") || null, title: img.getAttribute("title"), size: sizeFromClass(img.getAttribute("class")) };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src, alt, title, size } = node.attrs as { src: string; alt: string | null; title: string | null; size: FigureSize };
    return [
      "figure",
      { class: `entry-figure${size && size !== "normal" ? ` entry-figure-${size}` : ""}` },
      ["img", { src, alt: alt || null, title: title || null }],
      ["figcaption", 0],
    ];
  },

  addCommands() {
    return {
      insertPicture:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { src: attrs.src, alt: attrs.alt ?? null } }),
    };
  },

  addKeyboardShortcuts() {
    const inCaption = () => {
      const { $from, empty } = this.editor.state.selection;
      return empty && $from.parent.type.name === this.name;
    };
    return {
      // Enter at the end of a caption starts a new paragraph under the picture.
      Enter: () => {
        if (!inCaption()) return false;
        const { $from } = this.editor.state.selection;
        const after = $from.after();
        return this.editor.chain().insertContentAt(after, { type: "paragraph" }).setTextSelection(after + 1).run();
      },
      // Backspace in an empty caption selects the picture (a second removes it).
      Backspace: () => {
        if (!inCaption()) return false;
        const { $from } = this.editor.state.selection;
        if ($from.parentOffset !== 0) return false;
        return this.editor.chain().setNodeSelection($from.before()).run();
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureView);
  },
});
