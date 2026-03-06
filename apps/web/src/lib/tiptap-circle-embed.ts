import { Node, mergeAttributes } from "@tiptap/core";

export interface CircleEmbedAttrs {
  slug: string;
  name: string;
  description: string | null;
  category: string;
  memberCount: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    circleEmbed: {
      insertCircleEmbed: (attrs: CircleEmbedAttrs) => ReturnType;
    };
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  writing_craft: "Writing & Craft",
  reading_books: "Reading & Books",
  creative_arts: "Creative Arts",
  lifestyle_interests: "Lifestyle",
  tech_learning: "Tech & Learning",
  community: "Community",
};

export const CircleEmbed = Node.create({
  name: "circleEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      slug: { default: null },
      name: { default: null },
      description: { default: null },
      category: { default: null },
      memberCount: { default: 0 },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-circle-embed]",
        getAttrs: (el) => {
          const dom = el as HTMLElement;
          return {
            slug: dom.getAttribute("data-circle-slug"),
            name: dom.getAttribute("data-circle-name"),
            description: dom.getAttribute("data-circle-description"),
            category: dom.getAttribute("data-circle-category"),
            memberCount: parseInt(dom.getAttribute("data-circle-members") || "0", 10),
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { slug, name, description, category, memberCount } = node.attrs;
    const categoryLabel = CATEGORY_LABELS[category] || category || "";
    const desc = description
      ? description.length > 120
        ? description.slice(0, 120) + "..."
        : description
      : "";
    const memberText = `${memberCount} ${memberCount === 1 ? "member" : "members"}`;

    // Build inner HTML as a static card structure
    // The outer div has data attributes for roundtrip parsing
    // Inner content is purely presentational (rendered via CSS)
    return [
      "div",
      mergeAttributes({
        "data-circle-embed": "",
        "data-circle-slug": slug,
        "data-circle-name": name,
        "data-circle-description": description || "",
        "data-circle-category": category,
        "data-circle-members": String(memberCount),
      }),
      [
        "a",
        {
          href: `/circles/${slug}`,
          class: "circle-embed-link",
          "data-circle-embed-inner": "",
        },
        [
          "span",
          { class: "circle-embed-icon", "aria-hidden": "true" },
          // Concentric circles SVG as text (rendered by CSS ::before)
          "",
        ],
        ["span", { class: "circle-embed-name" }, name || ""],
        ...(desc ? [["span", { class: "circle-embed-desc" }, desc]] : []),
        [
          "span",
          { class: "circle-embed-meta" },
          [
            "span",
            { class: "circle-embed-category" },
            categoryLabel,
          ],
          ["span", { class: "circle-embed-members" }, memberText],
        ],
        ["span", { class: "circle-embed-cta" }, "Visit Circle →"],
      ],
    ];
  },

  addCommands() {
    return {
      insertCircleEmbed:
        (attrs: CircleEmbedAttrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
