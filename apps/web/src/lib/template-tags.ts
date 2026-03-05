/**
 * Template tag processing for full-page custom HTML profiles.
 *
 * Parses {{tag}} tokens in user-authored HTML and replaces them with:
 * - Text tags: inline HTML (display_name, username, bio, stats)
 * - Static widgets: pre-rendered HTML (tags, series, pinned, rss, top_pals, avatar)
 * - Interactive widgets: placeholder <div> elements hydrated client-side via React portals
 */

// All recognized template tag names
export const TEMPLATE_TAGS = [
  "about",
  "entries",
  "guestbook",
  "newsletter",
  "music",
  "support",
  "follow_button",
  "top_pals",
  "tags",
  "series",
  "pinned",
  "rss",
  "display_name",
  "username",
  "bio",
  "stats",
  "avatar",
  "visitor_count",
] as const;

export type TemplateTags = (typeof TEMPLATE_TAGS)[number];

// Tags that need client-side React hydration (interactive)
export const INTERACTIVE_TAGS = new Set<string>([
  "about",
  "entries",
  "guestbook",
  "newsletter",
  "music",
  "support",
  "follow_button",
]);

// Tags rendered as plain HTML server-side (no hydration needed)
export const STATIC_TAGS = new Set<string>([
  "top_pals",
  "tags",
  "series",
  "pinned",
  "rss",
  "avatar",
]);

// Tags replaced with simple text/HTML inline
export const TEXT_TAGS = new Set<string>([
  "display_name",
  "username",
  "bio",
  "stats",
  "visitor_count",
]);

export interface WidgetSlot {
  id: string;
  type: string;
}

export interface TemplateContext {
  profile: {
    id: string;
    username: string;
    display_name: string;
    bio: string | null;
    bio_html: string | null;
    pronouns: string | null;
    avatar_url: string | null;
    avatar_frame?: string | null;
    subscription_tier?: string;
    created_at: string;
    profile_music?: string | null;
    profile_status?: string | null;
    profile_banner_url?: string | null;
    newsletter_enabled?: boolean;
    newsletter_name?: string | null;
    newsletter_description?: string | null;
    subscriber_count?: number;
    support_url?: string | null;
    support_label?: string | null;
    stripe_connect_enabled?: boolean;
    ink_donor_status?: string | null;
    ink_donor_amount_cents?: number | null;
    social_links?: Record<string, string> | null;
    pinned_entry_ids?: string[];
  };
  topFriends: Array<{
    position: number;
    user: {
      username: string;
      display_name: string;
      avatar_url: string | null;
      avatar_frame?: string | null;
    };
  }>;
  seriesList: Array<{
    id: string;
    title: string;
    slug: string;
    status: "ongoing" | "completed";
    entry_count: number;
  }>;
  entryTags: Array<{ tag: string; count: number }>;
  entryCount: number;
  penPalCount: number;
  readerCount: number;
  pinnedEntries: Array<{
    id: string;
    slug: string;
    title: string | null;
    excerpt?: string | null;
    cover_image_id?: string | null;
  }>;
  visitorCount: number;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
  relationshipStatus: string | null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render a text tag as inline HTML
 */
function renderTextTag(tag: string, ctx: TemplateContext): string {
  switch (tag) {
    case "display_name":
      return escapeHtml(ctx.profile.display_name);
    case "username":
      return `@${escapeHtml(ctx.profile.username)}`;
    case "bio":
      if (ctx.profile.bio_html) return ctx.profile.bio_html;
      if (ctx.profile.bio) return `<p>${escapeHtml(ctx.profile.bio)}</p>`;
      return "";
    case "stats": {
      const parts: string[] = [];
      parts.push(`<strong>${ctx.entryCount}</strong> entries`);
      if (ctx.penPalCount > 0) parts.push(`<strong>${ctx.penPalCount}</strong> pen pals`);
      if (ctx.readerCount > 0) parts.push(`<strong>${ctx.readerCount}</strong> readers`);
      const joinDate = new Date(ctx.profile.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      parts.push(`Joined ${joinDate}`);
      return `<span class="inkwell-stats">${parts.join(" &middot; ")}</span>`;
    }
    case "visitor_count":
      return ctx.visitorCount.toString();
    default:
      return "";
  }
}

/**
 * Render a static widget as HTML string (no React hydration needed)
 */
function renderStaticTag(tag: string, ctx: TemplateContext): string {
  switch (tag) {
    case "avatar": {
      const size = 80;
      const name = escapeHtml(ctx.profile.display_name);
      const url = ctx.profile.avatar_url;
      if (url) {
        return `<img src="${escapeHtml(url)}" alt="${name}" width="${size}" height="${size}" class="inkwell-avatar" style="border-radius: 50%; object-fit: cover;" />`;
      }
      // Fallback: initials circle
      const initials = ctx.profile.display_name.charAt(0).toUpperCase();
      return `<div class="inkwell-avatar" style="width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${size / 2.5}px;font-weight:600;background:var(--accent,#2d4a8a);color:#fff;">${initials}</div>`;
    }

    case "top_pals": {
      if (ctx.topFriends.length === 0 && !ctx.isOwnProfile) return "";
      if (ctx.topFriends.length === 0) return "";
      const items = ctx.topFriends
        .map((f) => {
          const avatar = f.user.avatar_url
            ? `<img src="${escapeHtml(f.user.avatar_url)}" alt="${escapeHtml(f.user.display_name)}" width="36" height="36" style="border-radius:50%;object-fit:cover;" />`
            : `<div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;background:var(--accent,#2d4a8a);color:#fff;">${f.user.display_name.charAt(0).toUpperCase()}</div>`;
          return `<a href="/${escapeHtml(f.user.username)}" class="inkwell-top-pal" style="display:flex;flex-direction:column;align-items:center;gap:4px;text-decoration:none;">${avatar}<span style="font-size:11px;color:var(--muted,#888);text-align:center;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.user.display_name)}</span></a>`;
        })
        .join("");
      return `<div class="inkwell-top-pals" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">${items}</div>`;
    }

    case "tags": {
      if (ctx.entryTags.length === 0) return "";
      const maxCount = Math.max(...ctx.entryTags.map((t) => t.count));
      const tags = ctx.entryTags
        .slice(0, 20)
        .map((t) => {
          const scale = maxCount > 1 ? t.count / maxCount : 1;
          const size = 11 + Math.round(scale * 5);
          const opacity = 0.5 + scale * 0.5;
          return `<a href="/tag/${escapeHtml(t.tag)}" style="font-size:${size}px;opacity:${opacity.toFixed(2)};color:var(--accent,#2d4a8a);text-decoration:none;" class="inkwell-tag">#${escapeHtml(t.tag)}</a>`;
        })
        .join(" ");
      return `<div class="inkwell-tags" style="display:flex;flex-wrap:wrap;gap:6px 10px;">${tags}</div>`;
    }

    case "series": {
      if (ctx.seriesList.length === 0) return "";
      const items = ctx.seriesList
        .map((s) => {
          const badge = s.status === "completed" ? ` <span style="font-size:10px;padding:1px 6px;border-radius:9999px;background:var(--accent-light,#e8edf5);color:var(--accent,#2d4a8a);">Done</span>` : "";
          return `<a href="/${escapeHtml(ctx.profile.username)}/series/${escapeHtml(s.slug)}" class="inkwell-series-item" style="display:flex;align-items:center;justify-content:space-between;text-decoration:none;color:var(--foreground,inherit);font-size:14px;"><span>${escapeHtml(s.title)}${badge}</span><span style="color:var(--muted,#888);font-size:12px;">${s.entry_count}</span></a>`;
        })
        .join("");
      return `<div class="inkwell-series" style="display:flex;flex-direction:column;gap:8px;">${items}</div>`;
    }

    case "pinned": {
      if (ctx.pinnedEntries.length === 0) return "";
      const cards = ctx.pinnedEntries
        .map((e) => {
          const coverHtml = e.cover_image_id
            ? `<img src="/api/images/${e.cover_image_id}" alt="" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px 8px 0 0;" />`
            : "";
          const title = e.title ? escapeHtml(e.title) : "Untitled";
          const excerpt = e.excerpt ? `<p style="font-size:13px;color:var(--muted,#888);margin:4px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(e.excerpt)}</p>` : "";
          return `<a href="/${escapeHtml(ctx.profile.username)}/${escapeHtml(e.slug)}" class="inkwell-pinned-entry" style="text-decoration:none;color:var(--foreground,inherit);border:1px solid var(--border,#e5e5e5);border-radius:8px;overflow:hidden;display:block;">${coverHtml}<div style="padding:8px 12px;"><p style="font-weight:600;font-size:14px;margin:0;">${title}</p>${excerpt}</div></a>`;
        })
        .join("");
      return `<div class="inkwell-pinned" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">${cards}</div>`;
    }

    case "rss":
      return `<a href="/api/users/${escapeHtml(ctx.profile.username)}/feed.xml" target="_blank" rel="noopener noreferrer" class="inkwell-rss" style="display:inline-flex;align-items:center;gap:6px;font-size:14px;color:var(--accent,#2d4a8a);text-decoration:none;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>RSS feed</a>`;

    default:
      return "";
  }
}

/**
 * Process template HTML: parse {{tag}} tokens and replace them.
 *
 * - Text tags → inline HTML
 * - Static tags → pre-rendered HTML
 * - Interactive tags → <div data-inkwell-widget="type" data-inkwell-id="unique"> placeholder
 *
 * Returns processed HTML body, scoped styles, and widget slot info for hydration.
 */
export function processTemplateHtml(
  html: string,
  ctx: TemplateContext,
  scopeId: string
): { bodyHtml: string; widgetSlots: WidgetSlot[] } {
  const widgetSlots: WidgetSlot[] = [];
  const seenTags = new Set<string>();
  let slotCounter = 0;

  // Replace {{tag}} patterns
  const processed = html.replace(/\{\{(\w+)\}\}/g, (_match, tagName: string) => {
    const tag = tagName.toLowerCase();

    // Unknown tag — leave as-is (validation will catch it in the editor)
    if (!TEMPLATE_TAGS.includes(tag as TemplateTags)) {
      return _match;
    }

    // Duplicate tag — only render the first instance
    if (seenTags.has(tag)) {
      return `<!-- duplicate {{${tag}}} — only the first instance is rendered -->`;
    }
    seenTags.add(tag);

    // Text tags — inline replacement
    if (TEXT_TAGS.has(tag)) {
      return renderTextTag(tag, ctx);
    }

    // Static tags — server-rendered HTML
    if (STATIC_TAGS.has(tag)) {
      return renderStaticTag(tag, ctx);
    }

    // Interactive tags — placeholder div for portal hydration
    if (INTERACTIVE_TAGS.has(tag)) {
      const slotId = `${scopeId}-widget-${slotCounter++}`;
      widgetSlots.push({ id: slotId, type: tag });
      return `<div data-inkwell-widget="${tag}" data-inkwell-id="${slotId}"></div>`;
    }

    return _match;
  });

  return { bodyHtml: processed, widgetSlots };
}

/**
 * Template tag descriptions for the editor reference panel
 */
export const TEMPLATE_TAG_DOCS: Array<{
  tag: string;
  label: string;
  description: string;
  category: "content" | "interactive" | "text";
}> = [
  { tag: "about", label: "About Section", description: "Full profile header with banner, avatar, name, bio, stats, social links, and follow/block buttons", category: "interactive" },
  { tag: "entries", label: "Journal Entries", description: "Your published entries with search, filters, pagination, and display modes", category: "interactive" },
  { tag: "guestbook", label: "Guestbook", description: "Guestbook messages and sign form for visitors", category: "interactive" },
  { tag: "newsletter", label: "Newsletter", description: "Newsletter subscribe form for email subscribers", category: "interactive" },
  { tag: "music", label: "Now Playing", description: "Music player embed (Spotify, YouTube, SoundCloud)", category: "interactive" },
  { tag: "support", label: "Support / Postage", description: "Postage button and external support links", category: "interactive" },
  { tag: "follow_button", label: "Follow Button", description: "Follow/unfollow button for visitors", category: "interactive" },
  { tag: "top_pals", label: "Top Pen Pals", description: "Grid of your top 6 pen pals with avatars", category: "content" },
  { tag: "tags", label: "Tag Cloud", description: "Size-weighted cloud of your most-used tags", category: "content" },
  { tag: "series", label: "Series List", description: "List of your entry series with counts", category: "content" },
  { tag: "pinned", label: "Pinned Entries", description: "Cards for your pinned entries", category: "content" },
  { tag: "rss", label: "RSS Link", description: "RSS feed subscribe link", category: "content" },
  { tag: "avatar", label: "Avatar", description: "Your profile avatar image", category: "text" },
  { tag: "display_name", label: "Display Name", description: "Your display name as text", category: "text" },
  { tag: "username", label: "Username", description: "Your @username as text", category: "text" },
  { tag: "bio", label: "Bio", description: "Your bio content (HTML if rich bio, plain text otherwise)", category: "text" },
  { tag: "stats", label: "Stats", description: "Entry count, pen pals, readers, and join date", category: "text" },
  { tag: "visitor_count", label: "Visitor Count", description: "Total profile page view count (increments for each visitor)", category: "text" },
];
