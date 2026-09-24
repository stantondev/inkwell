// "What's new" — the plain-language changelog for members. The roadmap's
// release notes only cover items someone filed on the roadmap, so most of
// what shipped never reached anyone. Add new items at the TOP; the first
// item's id is what the unread dot compares against.
//
// `href` may contain {username}, replaced with the signed-in member's name.

export interface WhatsNewItem {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  body: string;
  howTo?: string;
  href?: string;
  cta?: string;
  tag?: "Writing" | "Reading" | "Letters" | "Profile" | "Fediverse" | "Mobile" | "Plus";
}

export const WHATS_NEW: WhatsNewItem[] = [
  {
    id: "2026-09-24-schedule-button",
    date: "2026-09-24",
    title: "Schedule a post right from the Publish button",
    body: "Next to Publish there's now a clock. Pick “Tomorrow morning”, “Saturday morning” or any time you like, then press Schedule and the entry publishes itself.",
    href: "/editor",
    cta: "Open the editor",
    tag: "Writing",
  },
  {
    id: "2026-09-24-phone-filters",
    date: "2026-09-24",
    title: "Feed and Explore get to the writing faster on phones",
    body: "Filters (source, sort and topics) now fold behind a single row that tells you what's showing, so the first entry is on screen when the page opens.",
    tag: "Mobile",
  },
  {
    id: "2026-09-24-guestbook-notifications",
    date: "2026-09-24",
    title: "Know when someone signs your guestbook",
    body: "Guestbook signatures from other Inkwell members now arrive as notifications (and push, if you've turned it on), with a preview of what they wrote. Before, only signatures from Mastodon did.",
    href: "/{username}#guestbook",
    cta: "Visit your guestbook",
    tag: "Profile",
  },
  {
    id: "2026-09-24-fediverse-letters",
    date: "2026-09-24",
    title: "Letters with your Mastodon friends",
    body: "You can now write private letters to fediverse accounts you follow or that follow you, and their private messages to you land in Letters instead of your notifications.",
    howTo: "In Letters, press New letter — fediverse pen pals are marked “fediverse”.",
    href: "/letters",
    cta: "Open Letters",
    tag: "Letters",
  },
  {
    id: "2026-09-24-magazine",
    date: "2026-09-24",
    title: "A real Magazine layout for your profile",
    body: "Your newest story becomes a cover story with a drop cap, the rest flow in newspaper columns, and there's a contents rail. Great for journals with years of entries.",
    howTo: "Settings → Customize → Layout → Magazine.",
    href: "/settings/customize",
    cta: "Try Magazine",
    tag: "Plus",
  },
  {
    id: "2026-09-23-letters-controls",
    date: "2026-09-23",
    title: "Letters got a lot better",
    body: "A reply bar at the bottom of every conversation, drafts that survive closing the page, archive, mute, mark as unread, and search inside your letters. You can also choose to accept letter requests from people who aren't your pen pals yet.",
    howTo: "Use the ⋯ menu on a conversation, or “Who can write to you” in Letters.",
    href: "/letters",
    cta: "Open Letters",
    tag: "Letters",
  },
  {
    id: "2026-09-23-translate",
    date: "2026-09-23",
    title: "Translate any entry in one click",
    body: "Reading someone who writes in Spanish, Russian or Chinese? Every entry page now has a Translate button above the text, and the title translates too.",
    howTo: "Set your language once in Settings → Profile for one-click translation.",
    tag: "Reading",
  },
  {
    id: "2026-09-23-archive-postmark",
    date: "2026-09-23",
    title: "Old posts can wear an archive postmark",
    body: "Brought your old journal over? Mark those posts as from your archive: a postmark on the card, and a paper-clipped note on the page saying when you first wrote it — in your own words if you like.",
    href: "/settings/import#archive",
    cta: "Your archive settings",
    tag: "Writing",
  },
  {
    id: "2026-09-22-readers",
    date: "2026-09-22",
    title: "See how many people read you",
    body: "Reader counts, counted privately (no tracking, no cookies): a reader is someone who actually stayed on your entry for ten seconds. Everyone sees totals; Plus adds a daily chart, top entries and where readers came from.",
    href: "/readers",
    cta: "See your readers",
    tag: "Writing",
  },
  {
    id: "2026-09-22-livejournal",
    date: "2026-09-22",
    title: "Bring your LiveJournal or Dreamwidth over",
    body: "Import your whole journal — with comments, moods and music — from an export file. Lost your LiveJournal password? You can still bring over your public entries.",
    href: "/switch/livejournal",
    cta: "How to move",
    tag: "Writing",
  },
  {
    id: "2026-09-22-profile-archive",
    date: "2026-09-22",
    title: "Browse a journal by year and month",
    body: "Profiles now have an archive: pick a year, then a month, instead of clicking Next page after page. Entry pages have Older / Newer links too.",
    tag: "Profile",
  },
  {
    id: "2026-09-22-mobile",
    date: "2026-09-22",
    title: "A better Inkwell on your phone",
    body: "Double-tap a page to ink it. Write opens a choice of a full entry or a quick sticky. Everything else lives under the You tab — including “Install the app” to put Inkwell on your home screen.",
    tag: "Mobile",
  },
  {
    id: "2026-09-22-media",
    date: "2026-09-22",
    title: "Videos and audio from the fediverse play here",
    body: "Posts from Mastodon, Pixelfed, PeerTube and Threads that include video or audio now play right in your Feed and Explore instead of showing only the caption.",
    tag: "Fediverse",
  },
  {
    id: "2026-09-21-bluesky",
    date: "2026-09-21",
    title: "Share your journal on Bluesky",
    body: "One switch puts your public entries on Bluesky too, through Bridgy Fed, so Bluesky readers can follow you there.",
    href: "/settings/fediverse",
    cta: "Turn it on",
    tag: "Fediverse",
  },
  {
    id: "2026-09-21-popups",
    date: "2026-09-21",
    title: "Notifications pop up as they arrive",
    body: "New comments, stamps and letters now appear in the corner while you're on Inkwell, with a soft chime. You can turn the pop-ups or the sound off.",
    href: "/settings/notifications",
    cta: "Notification settings",
    tag: "Reading",
  },
  {
    id: "2026-09-20-avatars",
    date: "2026-09-20",
    title: "Hand-drawn avatars",
    body: "Don't want to use a photo? Build a little ink-drawn alien — hundreds of thousands of combinations, with books, tea, candles and quills.",
    href: "/settings/avatar",
    cta: "Build yours",
    tag: "Profile",
  },
  {
    id: "2026-09-19-stickies",
    date: "2026-09-19",
    title: "Stickies: short thoughts",
    body: "Not everything needs a title. Jot a sticky (up to 500 characters) — it shows on your profile's corkboard and in Feed, and goes to Mastodon in full. Any sticky can grow into a full entry later.",
    howTo: "“Jot a sticky” under Write in the sidebar, or Write → Sticky on your phone.",
    href: "/{username}",
    cta: "See your corkboard",
    tag: "Writing",
  },
  {
    id: "2026-09-19-scheduled",
    date: "2026-09-19",
    title: "Schedule posts for later",
    body: "Write now, publish Tuesday at 9am. Scheduled posts go out on their own — including your newsletter and cross-posts.",
    howTo: "Use the clock next to Publish in the editor. Publish becomes Schedule.",
    href: "/editor",
    cta: "Open the editor",
    tag: "Writing",
  },
  {
    id: "2026-09-19-dates",
    date: "2026-09-19",
    title: "Change the date on any entry",
    body: "Backdate an entry to when you actually wrote it, or fix the date on an imported post. It moves to the right place on your profile.",
    howTo: "Editor → Settings → Date.",
    tag: "Writing",
  },
  {
    id: "2026-09-19-bulk",
    date: "2026-09-19",
    title: "Tidy up many posts at once",
    body: "The Posts page lets you select any number of entries and change privacy, category, series or tags, publish drafts, or delete — handy after an import.",
    href: "/manage",
    cta: "Open Posts",
    tag: "Writing",
  },
  {
    id: "2026-09-19-fedi-media-links",
    date: "2026-09-19",
    title: "PeerTube, Funkwhale and Castopod links play",
    body: "Paste a link from an independent video, music or podcast server into an entry's “listening to” field and it becomes a player.",
    tag: "Fediverse",
  },
  {
    id: "2026-09-17-founding",
    date: "2026-09-17",
    title: "Try Plus free for 14 days",
    body: "No card needed. Plus is also available yearly ($50), and the first 50 Founding Members get Plus for as long as Inkwell runs.",
    href: "/settings/billing",
    cta: "See Plus",
    tag: "Plus",
  },
];

export const LATEST_WHATS_NEW_ID = WHATS_NEW[0].id;

export function whatsNewHref(href: string | undefined, username: string | null | undefined): string | null {
  if (!href) return null;
  if (href.includes("{username}")) return username ? href.replace("{username}", username) : null;
  return href;
}
