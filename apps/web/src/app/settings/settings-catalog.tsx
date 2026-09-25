/**
 * The settings catalog — one source of truth for every settings destination.
 *
 * The overview grid, the search index, the ⌘K jump switcher, the mobile nav
 * and each detail page's header all read from this list, so a page added here
 * shows up everywhere at once.
 */

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

/* eslint-disable react/jsx-key */
const I = {
  profile: <svg {...iconProps}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  avatar: <svg {...iconProps}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6.2 18.5a6.5 6.5 0 0 1 11.6 0" /></svg>,
  look: <svg {...iconProps}><rect x="2" y="4" width="20" height="14" rx="1" /><path d="M2 8h20" /><circle cx="5" cy="6" r=".5" fill="currentColor" /><path d="M8 21h8M12 18v3" /></svg>,
  bell: <svg {...iconProps}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
  palette: <svg {...iconProps}><circle cx="13.5" cy="6.5" r=".6" fill="currentColor" stroke="none" /><circle cx="17.5" cy="10.5" r=".6" fill="currentColor" stroke="none" /><circle cx="8.5" cy="7.5" r=".6" fill="currentColor" stroke="none" /><circle cx="6.5" cy="12.5" r=".6" fill="currentColor" stroke="none" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.83-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C21.97 6.01 17.46 2 12 2z" /></svg>,
  pin: <svg {...iconProps}><path d="M9 4v6l-2 4v2h10v-2l-2-4V4" /><line x1="12" y1="16" x2="12" y2="21" /><line x1="8" y1="4" x2="16" y2="4" /></svg>,
  people: <svg {...iconProps}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  link: <svg {...iconProps}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>,
  book: <svg {...iconProps}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
  chart: <svg {...iconProps}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
  sendMail: <svg {...iconProps}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /><line x1="10" y1="14" x2="21" y2="3" /></svg>,
  importIcon: <svg {...iconProps}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  mail: <svg {...iconProps}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
  invite: <svg {...iconProps}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>,
  globe: <svg {...iconProps}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
  heart: <svg {...iconProps}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>,
  filter: <svg {...iconProps}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>,
  redact: <svg {...iconProps}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>,
  shield: <svg {...iconProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  block: <svg {...iconProps}><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>,
  star: <svg {...iconProps}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  key: <svg {...iconProps}><circle cx="7.5" cy="15.5" r="4" /><path d="M10.5 12.5 21 2" /><path d="m17 6 3 3" /><path d="m14 9 3 3" /></svg>,
  download: <svg {...iconProps}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  trash: <svg {...iconProps}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
};
/* eslint-enable react/jsx-key */

export interface SettingsEntry {
  /** Stable id — used as the key for pinned cards. Never rename. */
  id: string;
  href: string;
  title: string;
  /** What you'll actually find inside. Shown on the overview card. */
  blurb: string;
  icon: React.ReactNode;
  group: string;
  /** Extra search terms that aren't in the title or blurb. */
  keywords?: string[];
  plus?: boolean;
  danger?: boolean;
}

export interface SettingsGroup {
  id: string;
  title: string;
  /** One line explaining what this whole group covers. */
  blurb: string;
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  { id: "account", title: "Account", blurb: "Who you are on Inkwell, and how we reach you." },
  { id: "space", title: "Your space", blurb: "How your journal looks to everyone who visits it." },
  { id: "writing", title: "Writing", blurb: "Tools for getting words in and organising them." },
  { id: "audience", title: "Audience", blurb: "Reaching readers, on Inkwell and beyond it." },
  { id: "privacy", title: "Privacy & safety", blurb: "Who sees your work, and what you see of others'." },
  { id: "plan", title: "Plan & data", blurb: "Your subscription, your keys, and your way out." },
];

export const SETTINGS_CATALOG: SettingsEntry[] = [
  // ── Account ──────────────────────────────────────────────────────────
  {
    id: "profile",
    href: "/settings/profile",
    title: "Profile",
    blurb:
      "Your display name, bio, pronouns and social links. Change your username or email address here too.",
    icon: I.profile,
    group: "account",
    keywords: ["name", "bio", "email", "username", "pronouns", "language", "social links"],
  },
  {
    id: "avatar",
    href: "/settings/avatar",
    title: "Avatar",
    blurb:
      "Upload a photo or draw an Inkwell alien in the builder. Frames and animations live here as well.",
    icon: I.avatar,
    group: "account",
    keywords: ["picture", "photo", "alien", "frame", "portrait"],
  },
  {
    id: "userpics",
    href: "/settings/userpics",
    title: "Userpics",
    blurb: "A set of pictures with keywords. Pick one for each entry and comment; your avatar stays the default.",
    icon: I.avatar,
    group: "account",
    keywords: ["userpic", "icons", "pictures", "keyword", "gif", "avatar"],
  },
  {
    id: "look",
    href: "/settings/look",
    title: "Look & feel",
    blurb: "Modern, or Classic (2004): Feed and Explore as one long column of entries, with the early-web look everywhere else.",
    icon: I.look,
    group: "account",
    keywords: ["classic", "2004", "retro", "old", "theme", "view", "layout", "nostalgia", "early web"],
  },
  {
    id: "notifications",
    href: "/settings/notifications",
    title: "Notifications",
    blurb:
      "Email, push and in-app alerts. Mute the chimes, hide the badges, or pause everything at once.",
    icon: I.bell,
    group: "account",
    keywords: ["push", "email", "sound", "badge", "alerts", "popups"],
  },

  // ── Your space ───────────────────────────────────────────────────────
  {
    id: "customize",
    href: "/settings/customize",
    title: "Customise",
    blurb:
      "Themes, colours, fonts, layouts, background and banner images, profile music, and custom HTML and CSS.",
    icon: I.palette,
    group: "space",
    keywords: ["theme", "colour", "color", "font", "layout", "css", "html", "music", "banner", "magazine"],
  },
  {
    id: "pinned",
    href: "/settings/pinned",
    title: "Pinned entries",
    blurb: "Choose up to three entries to hold at the top of your profile.",
    icon: I.pin,
    group: "space",
    keywords: ["featured", "highlight", "top posts"],
  },
  {
    id: "top-friends",
    href: "/settings/top-friends",
    title: "Top 6 pen pals",
    blurb: "Pick six people to show in your profile sidebar, in the order you want them.",
    icon: I.people,
    group: "space",
    keywords: ["friends", "top 6", "sidebar"],
  },
  {
    id: "domain",
    href: "/settings/domain",
    title: "Custom domain",
    blurb:
      "Serve your journal from your own address. We'll walk you through the DNS records and issue the certificate.",
    icon: I.link,
    group: "space",
    plus: true,
    keywords: ["dns", "url", "cname", "https", "certificate"],
  },

  // ── Writing ──────────────────────────────────────────────────────────
  {
    id: "series",
    href: "/settings/series",
    title: "Series",
    blurb: "Group entries into an ordered collection readers can follow from the beginning.",
    icon: I.book,
    group: "writing",
    keywords: ["collection", "chapters", "order"],
  },
  {
    id: "polls",
    href: "/settings/polls",
    title: "My polls",
    blurb: "Every poll you've attached to an entry — see the results, close one early, or delete it.",
    icon: I.chart,
    group: "writing",
    keywords: ["vote", "survey", "results"],
  },
  {
    id: "post-by-email",
    href: "/settings/post-by-email",
    title: "Post by email",
    blurb: "Get a private address that turns anything you send it into a published entry.",
    icon: I.sendMail,
    group: "writing",
    plus: true,
    keywords: ["email", "publish", "remote"],
  },
  {
    id: "import",
    href: "/settings/import",
    title: "Import",
    blurb:
      "Bring your archive across from LiveJournal, Dreamwidth, WordPress, Substack, Medium or a CSV — dates and comments included.",
    icon: I.importIcon,
    group: "writing",
    keywords: ["livejournal", "dreamwidth", "wordpress", "substack", "medium", "migrate", "backup"],
  },

  // ── Audience ─────────────────────────────────────────────────────────
  {
    id: "newsletter",
    href: "/settings/newsletter",
    title: "Newsletter",
    blurb:
      "Let readers subscribe by email and send entries straight to their inbox. Manage subscribers and send history.",
    icon: I.mail,
    group: "audience",
    keywords: ["email", "subscribers", "sends", "mailing list"],
  },
  {
    id: "invite",
    href: "/settings/invite",
    title: "Invite friends",
    blurb: "Share your personal invite link or send a sealed letter by email, and see who joined.",
    icon: I.invite,
    group: "audience",
    keywords: ["referral", "share", "invitations"],
  },
  {
    id: "fediverse",
    href: "/settings/fediverse",
    title: "Fediverse & Bluesky",
    blurb:
      "Link a Mastodon account, cross-post your entries, and bridge your writing to Bluesky.",
    icon: I.globe,
    group: "audience",
    keywords: ["mastodon", "activitypub", "bluesky", "bridge", "crosspost", "federation"],
  },
  {
    id: "support",
    href: "/settings/support",
    title: "Support link",
    blurb: "Point readers at your Ko-fi, Patreon or Buy Me a Coffee from your profile and entries.",
    icon: I.heart,
    group: "audience",
    keywords: ["kofi", "patreon", "tips", "donate", "postage"],
  },

  // ── Privacy & safety ─────────────────────────────────────────────────
  {
    id: "filters",
    href: "/settings/filters",
    title: "Filters",
    blurb:
      "Named groups of pen pals you can publish to — the audience behind the Custom privacy setting.",
    icon: I.filter,
    group: "privacy",
    keywords: ["friends list", "custom privacy", "groups", "audience"],
  },
  {
    id: "redactions",
    href: "/settings/redactions",
    title: "Redactions",
    blurb: "Words you'd rather not read. Any entry containing one disappears from your feeds.",
    icon: I.redact,
    group: "privacy",
    keywords: ["mute", "block words", "filter", "hide"],
  },
  {
    id: "content-safety",
    href: "/settings/content-safety",
    title: "Content safety",
    blurb: "Whether sensitive entries and Stickies appear in your feeds, plus eye-comfort mode.",
    icon: I.shield,
    group: "privacy",
    keywords: ["sensitive", "content warning", "stickies", "eye comfort"],
  },
  {
    id: "blocked",
    href: "/settings/blocked",
    title: "Blocked",
    blurb: "People and whole fediverse servers you've shut out, and the way to let them back in.",
    icon: I.block,
    group: "privacy",
    keywords: ["block", "mute", "domains", "defederate", "harassment"],
  },

  // ── Plan & data ──────────────────────────────────────────────────────
  {
    id: "billing",
    href: "/settings/billing",
    title: "Billing",
    blurb:
      "Your plan, your renewal date, Ink Donor support, and image storage. Start, pause or cancel here.",
    icon: I.star,
    group: "plan",
    keywords: ["plus", "subscription", "payment", "cancel", "donor", "founding", "storage", "trial"],
  },
  {
    id: "api",
    href: "/settings/api",
    title: "API keys",
    blurb: "Create keys for reading — and, on Plus, writing — your journal from your own tools.",
    icon: I.key,
    group: "plan",
    keywords: ["developer", "token", "integration", "rate limit"],
  },
  {
    id: "export",
    href: "/settings/export",
    title: "Data export",
    blurb: "Download everything you've written as a single file. Yours to keep, whatever happens here.",
    icon: I.download,
    group: "plan",
    keywords: ["download", "backup", "archive", "json"],
  },
  {
    id: "account",
    href: "/settings/account",
    title: "Delete account",
    blurb: "Close your account for good. Subscriptions are cancelled first; this cannot be undone.",
    icon: I.trash,
    group: "plan",
    danger: true,
    keywords: ["close", "remove", "danger", "cancel"],
  },
];

/** Look an entry up by pathname — longest matching href wins. */
export function entryForPath(pathname: string): SettingsEntry | undefined {
  return SETTINGS_CATALOG.filter(
    (e) => pathname === e.href || pathname.startsWith(e.href + "/")
  ).sort((a, b) => b.href.length - a.href.length)[0];
}

export function groupTitle(id: string): string {
  return SETTINGS_GROUPS.find((g) => g.id === id)?.title ?? "";
}

/** Case-insensitive match across title, blurb and keywords. */
export function matchesQuery(entry: SettingsEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    entry.title,
    entry.blurb,
    groupTitle(entry.group),
    ...(entry.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}
