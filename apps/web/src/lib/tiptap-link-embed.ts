import { Node, mergeAttributes } from "@tiptap/core";

export interface LinkEmbedAttrs {
  url: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  authorName: string | null;
  providerName: string | null;
  siteName: string | null;
  publishedAt: string | null;
  embedType: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    linkEmbed: {
      insertLinkEmbed: (attrs: LinkEmbedAttrs) => ReturnType;
    };
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export const LinkEmbed = Node.create({
  name: "linkEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url: { default: null },
      title: { default: null },
      description: { default: null },
      thumbnailUrl: { default: null },
      authorName: { default: null },
      providerName: { default: null },
      siteName: { default: null },
      publishedAt: { default: null },
      embedType: { default: "link" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-link-embed]",
        getAttrs: (el) => {
          const dom = el as HTMLElement;
          return {
            url: dom.getAttribute("data-link-url"),
            title: dom.getAttribute("data-link-title"),
            description: dom.getAttribute("data-link-description"),
            thumbnailUrl: dom.getAttribute("data-link-thumbnail"),
            authorName: dom.getAttribute("data-link-author"),
            providerName: dom.getAttribute("data-link-provider"),
            siteName: dom.getAttribute("data-link-site"),
            publishedAt: dom.getAttribute("data-link-published"),
            embedType: dom.getAttribute("data-link-type") || "link",
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const {
      url,
      title,
      description,
      thumbnailUrl,
      authorName,
      providerName,
      siteName,
      publishedAt,
      embedType,
    } = node.attrs;

    const domain = getDomain(url || "");
    const provider = providerName || siteName || domain;
    const date = formatDate(publishedAt);
    const byline = [authorName, date].filter(Boolean).join(" · ");
    const GARBAGE_DESCS = ["none", "null", "undefined", "n/a", "na", ""];
    const rawDesc = description?.trim() || "";
    const desc = GARBAGE_DESCS.includes(rawDesc.toLowerCase())
      ? ""
      : rawDesc.length > 160
        ? rawDesc.slice(0, 160) + "..."
        : rawDesc;

    // Build children array
    const children: Array<
      | string
      | [string, Record<string, string>, ...Array<string | [string, Record<string, string>, string]>]
    > = [];

    // Thumbnail (with inline style for background-image)
    if (thumbnailUrl) {
      children.push([
        "span",
        {
          class: "link-embed-thumbnail",
          style: `background-image: url(${thumbnailUrl})`,
        },
        "",
      ]);
    }

    // Content wrapper
    const contentChildren: Array<
      string | [string, Record<string, string>, string]
    > = [];

    // Provider masthead
    if (provider) {
      contentChildren.push([
        "span",
        { class: "link-embed-provider" },
        provider,
      ]);
    }

    // Title headline
    if (title) {
      contentChildren.push(["span", { class: "link-embed-title" }, title]);
    }

    // Description lede
    if (desc) {
      contentChildren.push([
        "span",
        { class: "link-embed-description" },
        desc,
      ]);
    }

    // Author + date byline
    if (byline) {
      contentChildren.push([
        "span",
        { class: "link-embed-byline" },
        byline,
      ]);
    }

    // Domain citation
    if (domain) {
      contentChildren.push([
        "span",
        { class: "link-embed-domain" },
        domain,
      ]);
    }

    children.push(["span", { class: "link-embed-content" }, ...contentChildren]);

    return [
      "div",
      mergeAttributes({
        "data-link-embed": "",
        "data-link-url": url || "",
        "data-link-title": title || "",
        "data-link-description": description || "",
        "data-link-thumbnail": thumbnailUrl || "",
        "data-link-author": authorName || "",
        "data-link-provider": providerName || "",
        "data-link-site": siteName || "",
        "data-link-published": publishedAt || "",
        "data-link-type": embedType || "link",
      }),
      [
        "a",
        {
          href: url || "#",
          class: "link-embed-card",
          target: "_blank",
          rel: "noopener noreferrer",
        },
        ...children,
      ],
    ];
  },

  addCommands() {
    return {
      insertLinkEmbed:
        (attrs: LinkEmbedAttrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
