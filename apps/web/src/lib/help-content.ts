export interface HelpEntry {
  id: string;
  title: string;
  snippet: string;
  keywords: string[];
  category: string;
  href: string;
}

export const HELP_CATEGORIES = [
  { id: "getting-started", label: "Getting Started", number: "I", description: "Create your account, write your first entry, and find your way around Inkwell." },
  { id: "writing", label: "Writing & Publishing", number: "II", description: "The editor, drafts, visibility, categories, series, cover images, and Post by Email." },
  { id: "social", label: "Social & Connections", number: "III", description: "Pen pals, stamps, inks, reprints, letters, circles, and bookmarks." },
  { id: "fediverse", label: "The Fediverse", number: "IV", description: "What ActivityPub is, cross-platform following, and how federation works." },
  { id: "customization", label: "Customization", number: "V", description: "Themes, custom HTML/CSS, custom domains, avatar builder, and profile music." },
  { id: "billing", label: "Billing & Plus", number: "VI", description: "Plus features, postage, writer subscriptions, newsletters, and Ink Donor." },
  { id: "safety", label: "Privacy & Safety", number: "VII", description: "Blocking, reporting, redactions, content warnings, and account deletion." },
  { id: "technical", label: "Technical", number: "VIII", description: "API keys, data export and import, RSS feeds, and developer documentation." },
];

export const HELP_ENTRIES: HelpEntry[] = [
  // ── Getting Started ──
  { id: "gs-account", title: "Creating your account", snippet: "Sign up with a magic link — no password needed.", keywords: ["signup", "register", "magic link", "email", "login"], category: "getting-started", href: "/help/getting-started#first-entry" },
  { id: "gs-onboarding", title: "The onboarding wizard", snippet: "Set your username, avatar, bio, theme, and read the community guidelines.", keywords: ["onboarding", "setup", "wizard", "welcome"], category: "getting-started", href: "/help/getting-started#first-entry" },
  { id: "gs-first-entry", title: "Writing your first entry", snippet: "Open the editor, write something, set visibility, and hit Publish.", keywords: ["first", "write", "publish", "editor", "entry"], category: "getting-started", href: "/help/getting-started#first-entry" },
  { id: "gs-feed", title: "Understanding Feed vs Explore", snippet: "Feed shows entries from people you follow. Explore shows everything.", keywords: ["feed", "explore", "discover", "timeline"], category: "getting-started", href: "/help/getting-started#finding-people" },
  { id: "gs-follow", title: "Following writers", snippet: "Visit a profile and click Follow to add them as a pen pal.", keywords: ["follow", "pen pal", "friend", "connection"], category: "getting-started", href: "/help/getting-started#finding-people" },

  // ── Writing & Publishing ──
  { id: "w-editor", title: "Using the rich text editor", snippet: "Formatting, images, links, tables, task lists, and more.", keywords: ["editor", "formatting", "bold", "italic", "toolbar", "tiptap"], category: "writing", href: "/help/faq#write-entry" },
  { id: "w-drafts", title: "Saving drafts", snippet: "Save work-in-progress entries and publish when you're ready.", keywords: ["draft", "save", "unpublished"], category: "writing", href: "/help/faq#drafts" },
  { id: "w-visibility", title: "Entry visibility settings", snippet: "Public, friends-only, private, custom filter, or paid subscribers.", keywords: ["visibility", "privacy", "public", "private", "friends"], category: "writing", href: "/help/faq#visibility" },
  { id: "w-categories", title: "Categories and tags", snippet: "Organize entries by topic for better discovery.", keywords: ["category", "tag", "organize", "topic"], category: "writing", href: "/help/faq#categories-tags" },
  { id: "w-series", title: "Series and collections", snippet: "Group related entries into an ordered series.", keywords: ["series", "collection", "group", "order"], category: "writing", href: "/help/faq#series" },
  { id: "w-cover", title: "Cover images", snippet: "Upload a hero image that appears on feed cards and entry pages.", keywords: ["cover", "image", "photo", "hero"], category: "writing", href: "/help/faq#cover-image" },
  { id: "w-email", title: "Post by Email", snippet: "Publish entries by sending an email to your unique address.", keywords: ["email", "post", "publish"], category: "writing", href: "/help/faq#post-by-email" },

  // ── Social & Connections ──
  { id: "s-penpals", title: "Pen pals and following", snippet: "Mutual follows create pen pal connections with extra features.", keywords: ["pen pal", "follow", "friend", "mutual"], category: "social", href: "/help/faq#pen-pals" },
  { id: "s-stamps", title: "Stamps (reactions)", snippet: "Press an ink stamp on entries to share how they made you feel.", keywords: ["stamp", "reaction", "like", "felt", "beautifully said"], category: "social", href: "/help/faq#stamps" },
  { id: "s-inks", title: "Inks (discovery signal)", snippet: "Ink entries to help surface great writing for the community.", keywords: ["ink", "trending", "discovery", "recommend"], category: "social", href: "/help/faq#stamps-vs-inks" },
  { id: "s-reprints", title: "Reprints (sharing)", snippet: "Share entries with your followers like a repost or boost.", keywords: ["reprint", "boost", "share", "repost", "quote"], category: "social", href: "/help/faq#reprints" },
  { id: "s-letters", title: "Letters (private messages)", snippet: "Send rich text messages privately to other users.", keywords: ["letter", "message", "dm", "private", "letterbox"], category: "social", href: "/help/faq#letters" },
  { id: "s-circles", title: "Circles (group discussions)", snippet: "Join writing circles for group discussions with a salon aesthetic.", keywords: ["circle", "group", "discussion", "salon", "community"], category: "social", href: "/help/faq#circles" },
  { id: "s-comments", title: "Comments (marginalia)", snippet: "Leave threaded comments with @mentions on entries.", keywords: ["comment", "reply", "mention", "marginalia", "thread"], category: "social", href: "/guide#interaction" },

  // ── The Fediverse ──
  { id: "f-what", title: "What is the fediverse?", snippet: "A network of independent platforms connected through ActivityPub.", keywords: ["fediverse", "activitypub", "federation", "decentralized"], category: "fediverse", href: "/help/faq#what-is-fediverse" },
  { id: "f-mastodon", title: "Following from Mastodon", snippet: "Mastodon users can follow you at @username@inkwell.social.", keywords: ["mastodon", "follow", "handle", "fediverse"], category: "fediverse", href: "/help/faq#mastodon-follow" },
  { id: "f-crosspost", title: "Cross-posting to Mastodon", snippet: "Post a preview to your Mastodon timeline when you publish.", keywords: ["crosspost", "mastodon", "share"], category: "fediverse", href: "/help/faq#cross-post" },
  { id: "f-handle", title: "Your fediverse handle", snippet: "Your handle is @username@inkwell.social — share it anywhere.", keywords: ["handle", "address", "identity", "fediverse"], category: "fediverse", href: "/help/faq#fediverse-handle" },

  // ── Customization ──
  { id: "c-themes", title: "Profile themes", snippet: "Choose from 8 structural themes with unique typography and style.", keywords: ["theme", "customize", "design", "appearance"], category: "customization", href: "/help/faq#themes" },
  { id: "c-html", title: "Custom HTML/CSS profiles", snippet: "Plus users can build their own profile layout with template tags.", keywords: ["html", "css", "custom", "template", "myspace"], category: "customization", href: "/help/faq#custom-html" },
  { id: "c-domain", title: "Custom domains", snippet: "Point your own domain at your Inkwell profile.", keywords: ["domain", "custom", "url", "dns"], category: "customization", href: "/help/faq#custom-domain" },
  { id: "c-avatar", title: "Avatar builder", snippet: "Create a hand-drawn avatar character without uploading a photo.", keywords: ["avatar", "builder", "character", "croodles"], category: "customization", href: "/help/faq#avatar-builder" },

  // ── Billing & Plus ──
  { id: "b-plus", title: "Inkwell Plus features", snippet: "Custom colors, fonts, layouts, stamps, domains, and more for $5/mo.", keywords: ["plus", "subscription", "premium", "features", "upgrade"], category: "billing", href: "/help/faq#plus-features" },
  { id: "b-cancel", title: "Canceling your subscription", snippet: "Manage or cancel via the Stripe customer portal.", keywords: ["cancel", "unsubscribe", "stop", "billing"], category: "billing", href: "/help/faq#cancel" },
  { id: "b-postage", title: "Postage (reader support)", snippet: "Readers send one-time payments to writers as a thank-you.", keywords: ["postage", "tip", "payment", "support", "money"], category: "billing", href: "/help/faq#postage" },
  { id: "b-donor", title: "Ink Donor", snippet: "Contribute $1–$3/month to support Inkwell and get a badge.", keywords: ["donor", "donation", "support", "badge"], category: "billing", href: "/help/faq#ink-donor" },
  { id: "b-writer", title: "Writer subscription plans", snippet: "Create a paid subscription for exclusive content.", keywords: ["writer", "plan", "subscription", "paid", "monetize"], category: "billing", href: "/help/faq#writer-plans" },

  // ── Privacy & Safety ──
  { id: "p-block", title: "Blocking users", snippet: "Block users from your profile to prevent all interaction.", keywords: ["block", "ban", "prevent", "hide"], category: "safety", href: "/help/faq#block-user" },
  { id: "p-report", title: "Reporting content", snippet: "Report spam, harassment, or other violations.", keywords: ["report", "flag", "abuse", "spam", "harassment"], category: "safety", href: "/help/faq#report-content" },
  { id: "p-redactions", title: "Redactions (keyword muting)", snippet: "Hide entries containing specific words from your feeds.", keywords: ["redact", "mute", "filter", "keyword", "hide"], category: "safety", href: "/help/faq#redactions" },
  { id: "p-cw", title: "Content warnings", snippet: "Label sensitive content and control what you see.", keywords: ["content warning", "sensitive", "nsfw", "trigger"], category: "safety", href: "/help/faq#content-warnings" },
  { id: "p-delete", title: "Deleting your account", snippet: "Permanently remove your account and all associated data.", keywords: ["delete", "remove", "account", "data", "permanent"], category: "safety", href: "/help/faq#delete-account" },
  { id: "p-export", title: "Data export", snippet: "Download all your entries, comments, and account data.", keywords: ["export", "download", "data", "backup"], category: "safety", href: "/help/faq#data-export" },

  // ── Technical ──
  { id: "t-api", title: "API documentation", snippet: "Programmatic access with API keys and REST endpoints.", keywords: ["api", "developer", "key", "endpoint", "rest"], category: "technical", href: "/developers" },
  { id: "t-import", title: "Importing content", snippet: "Import from WordPress, Medium, Substack, and more.", keywords: ["import", "wordpress", "medium", "substack", "migrate"], category: "technical", href: "/settings/import" },
  { id: "t-rss", title: "RSS feeds", snippet: "Subscribe to any profile or tag via RSS.", keywords: ["rss", "feed", "subscribe", "xml"], category: "technical", href: "/guide#feed-explore" },
  { id: "t-newsletter", title: "Newsletter delivery", snippet: "Send published entries to email subscribers.", keywords: ["newsletter", "email", "subscriber", "send"], category: "technical", href: "/settings/newsletter" },

  // ── Links to existing pages ──
  { id: "x-guide", title: "The Reader's Guide", snippet: "A full walkthrough of Inkwell's features.", keywords: ["guide", "tutorial", "walkthrough", "how"], category: "getting-started", href: "/guide" },
  { id: "x-guidelines", title: "Community Guidelines", snippet: "Inkwell's rules for respectful, creative community participation.", keywords: ["guidelines", "rules", "policy", "community", "behavior"], category: "safety", href: "/guidelines" },
  { id: "x-about", title: "About Inkwell", snippet: "Our mission, values, and what we believe in.", keywords: ["about", "mission", "values", "inkwell"], category: "getting-started", href: "/about" },
  { id: "x-roadmap", title: "Roadmap & Feedback", snippet: "See what's planned and submit ideas or bug reports.", keywords: ["roadmap", "feedback", "feature", "bug", "request", "planned"], category: "getting-started", href: "/roadmap" },
];
