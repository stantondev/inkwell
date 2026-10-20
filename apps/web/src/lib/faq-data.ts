export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export interface FaqCategory {
  id: string;
  label: string;
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  { id: "account", label: "Account & Getting Started" },
  { id: "writing", label: "Writing & Publishing" },
  { id: "social", label: "Social & Connections" },
  { id: "fediverse", label: "The Fediverse" },
  { id: "customization", label: "Customization" },
  { id: "billing", label: "Billing & Plus" },
  { id: "safety", label: "Privacy & Safety" },
];

export const FAQ_ITEMS: FaqItem[] = [
  // ── Account & Getting Started ──
  {
    id: "create-account",
    question: "How do I create an account?",
    answer:
      'Visit <a href="/get-started">Get Started</a> and enter your email address. We\'ll send you a magic link — click it to sign in instantly. No password needed.',
    category: "account",
  },
  {
    id: "magic-link",
    question: "What is a magic link?",
    answer:
      "A magic link is a one-time sign-in link sent to your email. It expires after 15 minutes and can only be used once. This means you never have to remember a password — just check your inbox.",
    category: "account",
  },
  {
    id: "setup-profile",
    question: "How do I set up my profile?",
    answer:
      'After signing in, you\'ll go through a short onboarding wizard where you can set your username, upload an avatar, write a bio, and choose a theme. You can always change these later in <a href="/settings">Settings</a>.',
    category: "account",
  },
  {
    id: "what-is-plus",
    question: "What is Inkwell Plus?",
    answer:
      'Inkwell Plus ($5/month) unlocks custom colors, fonts, background images, profile music, avatar animations, custom HTML/CSS, custom domains, the Keepsakes sheet of stamps, unlimited drafts, extended newsletter sends, and API write access. <a href="/settings/billing">Learn more</a>.',
    category: "account",
  },
  {
    id: "change-username",
    question: "Can I change my username?",
    answer:
      'Yes. Go to <a href="/settings/profile">Settings &rarr; Profile</a> and click on your username to edit it. Your fediverse handle will update automatically, but people who followed your old handle may need to re-follow.',
    category: "account",
  },

  // ── Writing & Publishing ──
  {
    id: "write-entry",
    question: "How do I write and publish an entry?",
    answer:
      'Click <strong>Write an entry</strong> in the sidebar (or the Write button on your phone) to open the editor. Type <strong>/</strong> on a new line for headings, lists, checklists and pictures, or use the toolbar. Choose who can read it in <strong>Settings</strong>, then click <strong>Publish</strong>: you\'ll see who it goes to before it goes out. Drafts save themselves as you write.',
    category: "writing",
  },
  {
    id: "visibility",
    question: "What are the visibility options?",
    answer:
      '<ul><li><strong>Public</strong> — visible to everyone, including the fediverse</li><li><strong>Friends Only</strong> — only your pen pals can read it</li><li><strong>Private</strong> — only you can see it</li><li><strong>Custom</strong> — visible to specific people via a friend filter</li></ul>',
    category: "writing",
  },
  {
    id: "drafts",
    question: "How do drafts work?",
    answer:
      'Click <strong>Save draft</strong> instead of Publish to save your work without making it public. Find your drafts in the sidebar under <strong>Drafts</strong>. You can edit and publish them anytime. Your drafts save automatically while you write, and they\'re kept until you delete them. Free accounts can have 25 drafts on the go at once (scheduled and imported posts don\'t count); Plus has no limit. On the <a href="/drafts">Drafts</a> page you can search, sort, preview and delete them, one at a time or several at once.',
    category: "writing",
  },
  {
    id: "stickies",
    question: "What are stickies?",
    answer:
      'Stickies are short thoughts — no title, up to 500 characters — drawn as sticky notes. Choose the small sticky-note button beside <strong>Write an entry</strong> in the sidebar (or Write &rarr; Sticky on your phone). They show on your profile&rsquo;s corkboard and in Feed, go to Mastodon in full, and any sticky can be expanded into a full entry later. Don&rsquo;t want to see them? Turn them off in <a href="/settings/content-safety">Settings &rarr; Content Safety</a>.',
    category: "writing",
  },
  {
    id: "userpics",
    question: "What are userpics?",
    answer:
      "A set of pictures, each with a keyword, that you choose between for each entry and footnote. Add them in Settings → <strong>Userpics</strong> (PNG, JPEG, GIF or WebP; animated GIFs keep moving). In the editor, click the little picture at the start of the mood line; above the footnote box, use <strong>Posting as</strong>. Your avatar stays the default, and deleting a userpic puts your avatar back wherever it was used. Free accounts can keep 10, Plus 50.",
    category: "customization",
  },
  {
    id: "classic-view",
    question: "Can Inkwell look like the early-2000s web?",
    answer:
      "Yes. Click your name at the bottom of the sidebar and set <strong>Look</strong> to <strong>Classic</strong> (on your phone: <strong>You</strong> → Look), or in Settings → <strong>Look &amp; feel</strong>. Feed and Explore become one long column of boxed entries, and the rest of the site takes on the early-web colours and type. Only you see it; writers&rsquo; journals keep their own themes. Switch back to Modern the same way.",
    category: "writing",
  },
  {
    id: "moods",
    question: "How do moods work?",
    answer:
      "Next to <strong>feeling</strong> in the editor, click <strong>your mood…</strong> and pick one of about 130 moods; each has a little face. You can then change the words and keep the face (the “tired” face with “up way too late”), or click the face to change only the face. At the bottom of the list, choose <strong>Classic</strong> (pixel smileys) or <strong>Ink</strong> (hand-drawn) for your whole journal; readers see your choice. Your mood, music and location appear under the title as <em>Current mood</em>, <em>Current music</em> and <em>Current location</em>.",
    category: "writing",
  },
  {
    id: "listening-to",
    question: "What can I put in “Listening to”?",
    answer:
      'A Spotify, YouTube, Apple Music, SoundCloud, Bandcamp or audio-file link plays inline, and so do PeerTube, Funkwhale, Castopod and Owncast links. A MusicBrainz or ListenBrainz link to a song or album shows as a card with its cover. Plain words like “Artist — Track” work too. If you use <a href="https://listenbrainz.org" target="_blank" rel="noopener noreferrer">ListenBrainz</a>, add your username in <a href="/settings/listening">Settings → Listening</a> and a <strong>Now playing</strong> button fills in the song you\'re playing, with its cover art, from Navidrome, Funkwhale or anything else that scrobbles. Your profile shows it too: the song you\'re playing or last played, in place of your profile song (you can switch that off there). Inkwell only reads your public listens, so it never needs your ListenBrainz password.',
    category: "writing",
  },
  {
    id: "schedule",
    question: "Can I schedule a post, or change an entry's date?",
    answer:
      "Yes. In the editor, press the <strong>clock</strong> next to Publish and pick a time (or set the <strong>Date</strong> in Settings). A future time turns <strong>Publish</strong> into <strong>Schedule</strong>, and the entry goes out on its own at that time (with your newsletter and cross-posts, if you chose them). A past date in Settings backdates the entry, handy for old journal entries.",
    category: "writing",
  },
  {
    id: "readers",
    question: "Can I see how many people read my writing?",
    answer:
      'Yes, on the <a href="/readers">Readers</a> page. A read is counted when someone has your entry on screen for ten seconds, on its own page or in their Feed or Explore; it uses no cookies and doesn&rsquo;t track who they are. Everyone sees totals; Plus adds a daily chart, your top entries and where readers came from. Reads inside Mastodon apps can&rsquo;t be counted.',
    category: "writing",
  },
  {
    id: "bulk-posts",
    question: "How do I change many posts at once?",
    answer:
      'Open <a href="/manage">Posts</a>, tick the entries you want (or tick the header box and choose &ldquo;Select all&rdquo;), then change privacy, category, series or tags, publish drafts, or delete them together.',
    category: "writing",
  },
  {
    id: "cover-image",
    question: "How do I add a cover image?",
    answer:
      "In the editor, click the image icon above the title area to upload a cover image. Cover images appear at the top of your entry in feeds and on the detail page. Images are resized automatically to keep things fast.",
    category: "writing",
  },
  {
    id: "post-by-email",
    question: "What is Post by Email?",
    answer:
      'Plus subscribers can publish entries by sending an email to a unique address. Enable it in <a href="/settings/post-by-email">Settings &rarr; Post by Email</a>. The email subject becomes the title, and the body becomes the entry content.',
    category: "writing",
  },
  {
    id: "categories-tags",
    question: "How do categories and tags work?",
    answer:
      "Categories are broad topics (like Personal, Creative Writing, Tech) that help readers find your entries on Explore. Tags are freeform keywords you add to entries. Both help with discovery. You can set a category inline in the editor or in the settings panel.",
    category: "writing",
  },
  {
    id: "series",
    question: "Can I organize entries into a series?",
    answer:
      'Yes. Create a series in <a href="/settings/series">Settings &rarr; Series</a>, then assign entries to it from the editor settings panel. Series entries display navigation links to the previous and next entries.',
    category: "writing",
  },

  // ── Social & Connections ──
  {
    id: "pen-pals",
    question: "What are pen pals?",
    answer:
      "Pen pals are Inkwell's term for mutual follows. Following someone sends them a pen pal request, and their public entries start appearing in your Feed straight away. When they accept, you're pen pals: you can see each other's friends-only entries and send letters (private messages).",
    category: "social",
  },
  {
    id: "dead-letter-office",
    question: "What is the Dead Letter Office?",
    answer:
      'A daily game at <a href="/play">/play</a>. Each weekday a real letter from history arrives torn, with some words washed away and the address gone: mend it, fill in the missing words, and work out who it was for and when. All five letters in a week are by one famous writer, and each one you deliver adds a clue to the file, so you can try to name them. Easy, Medium and Hard change how many pieces there are and how many letters of each lost word survive. Your score and rank are private (there is no leaderboard), and a day you miss waits for you. The letters are real and quoted exactly from public-domain editions; the history after each one was researched with AI help and checked by a person before it went live.',
    category: "social",
  },
  {
    id: "stamps",
    question: "How do stamps work?",
    answer:
      'A stamp is postage you send a writer. Pick one from the sheet (I felt this, Rooting for you, Beautifully said, Holding space, Thank you, Made me laugh, First Class, and the season\'s commemorative issue) and it lands in the top-right corner of the entry with a postmark and the day you sent it. You can add one line on the back, up to 140 characters, that only the writer sees. Readers see the stamps and their dates but never who sent them. One stamp per entry; you can change it or take it back. Writers keep every stamp they receive in their <a href="/stamp-album">Stamp album</a>. Plus members also get a sheet of Keepsakes. You can put a stamp on a letter, too: choose it beside the reply box or in the corner of the stationery, and it shows on the letter with a postmark from the day you sent it.',
    category: "social",
  },
  {
    id: "stamps-vs-inks",
    question: "What is the difference between stamps and inks?",
    answer:
      "<strong>Stamps</strong> express how an entry made you feel (reaction). <strong>Inks</strong> signal \"more people should read this\" (discovery). Think of stamps as personal and inks as a recommendation. The most-inked entries of the month appear at the top of Explore.",
    category: "social",
  },
  {
    id: "reprints",
    question: "How do reprints work?",
    answer:
      "Reprints share someone else's writing with your followers — like a repost. Click the reprint icon (\u21BB) on any public entry. You can also reprint with your thoughts, adding your own commentary while embedding the original. Reprints federate as boosts to the fediverse.",
    category: "social",
  },
  {
    id: "letters",
    question: "What are Letters?",
    answer:
      'Letters are private messages between pen pals — and fediverse accounts you follow or that follow you. Open <a href="/letters">Letters</a> and press <strong>New letter</strong>. Use the &#8943; menu on a conversation to archive, mute, mark as unread or delete it for yourself, and the search box to find old letters. Under <strong>Who can write to you</strong> you can let people who aren&rsquo;t your pen pals send one letter request, which waits quietly in your Requests tab until you accept or decline.',
    category: "social",
  },
  {
    id: "guestbook",
    question: "What is the guestbook?",
    answer:
      "Every profile has a guestbook — a public spot for visitors to leave a short hello, like the guestbooks on old personal websites. You&rsquo;re notified when someone signs yours. You can remove any message on your own guestbook, and you can remove messages you left on someone else&rsquo;s.",
    category: "social",
  },
  {
    id: "translate",
    question: "Can I read entries written in another language?",
    answer:
      'Yes. Every entry page has a <strong>Translate</strong> button above the text, and feed cards have one too. Set your language in <a href="/settings/profile">Settings &rarr; Profile</a> and it translates in one click.',
    category: "social",
  },
  {
    id: "circles",
    question: "What are Circles?",
    answer:
      'Circles are small communities of writers. A circle is a list of threads: any member starts one by writing an ordinary journal entry in the circle (press "New thread", or choose the circle under Circle in the editor\'s Entry Settings), and members answer it with entries of their own ("Write your answer" on the thread). Answers appear under the thread, and every post stays on its writer\'s journal and shows in members\' Feeds. Posts can be public or for circle members only (never sent to the fediverse). Owners and moderators can pin a thread as the circle\'s prompt. The owner can rename the circle, change its description, hand it to another member, or delete it from Manage circle on the circle\'s page. There are no votes: threads are sorted by latest activity. Anyone whose account is at least a week old can start a circle: up to 3 on the free plan, 10 with Plus. Find them at <a href="/circles">Circles</a>.',
    category: "social",
  },
  {
    id: "blocking",
    question: "How do I block someone?",
    answer:
      "Visit their profile and click the three-dot menu, then choose Block. Blocked users can't see your entries, comment, send letters, sign your guestbook, or interact with your content. You won't see their content either.",
    category: "social",
  },

  // ── The Fediverse ──
  {
    id: "what-is-fediverse",
    question: "What is the fediverse?",
    answer:
      "The fediverse is a network of independent platforms connected through a protocol called ActivityPub. Think of it like email — you can send messages between Gmail and Outlook because they use the same protocol. Inkwell can talk to Mastodon, Pixelfed, and hundreds of other platforms.",
    category: "fediverse",
  },
  {
    id: "mastodon-follow",
    question: "Can Mastodon users follow me?",
    answer:
      'Yes! Your fediverse handle is <strong>@yourusername@inkwell.social</strong>. Anyone on Mastodon or another fediverse platform can search for this handle and follow you. Your public entries will appear in their timeline.',
    category: "fediverse",
  },
  {
    id: "fediverse-mentions",
    question: "Can I mention someone on Mastodon in an entry?",
    answer:
      "Yes. Write their full handle, like <strong>@someone@mastodon.social</strong>. When you publish, Inkwell looks the account up and links it, showing just <strong>@someone</strong>. Their server is told they were mentioned, so they get a notification, and they receive the post and any edits even if they don't follow you. To mention another Inkwell writer, <strong>@username</strong> is enough.",
    category: "fediverse",
  },
  {
    id: "fediverse-posts",
    question: "Why do I see posts from other platforms on Explore?",
    answer:
      "Inkwell connects to the wider fediverse, so public posts from Mastodon and other platforms appear on Explore's Fediverse tab (the Inkwell tab shows writing from Inkwell members). They're marked with a globe icon and the server they came from.",
    category: "fediverse",
  },
  {
    id: "fediverse-handle",
    question: "What is my fediverse handle?",
    answer:
      "Your fediverse handle is <strong>@yourusername@inkwell.social</strong>. It's displayed on your profile page. Click it to copy. Share this handle with people on Mastodon or other fediverse platforms so they can follow you.",
    category: "fediverse",
  },
  {
    id: "cross-post",
    question: "Can I cross-post to Mastodon?",
    answer:
      'Yes. Link your Mastodon account in <a href="/settings/fediverse">Settings &rarr; Fediverse</a>, then enable cross-posting when publishing. A preview of your entry (title, excerpt, and link) will be posted to your Mastodon timeline.',
    category: "fediverse",
  },

  // ── Customization ──
  {
    id: "customize-profile",
    question: "How do I customize my profile?",
    answer:
      'To arrange your page, choose <strong>Arrange page</strong> on your profile (or go to <a href="/arrange">Arrange your page</a>): drag things where you want them, change a row\'s columns, add notes, photos, quotes, a "Currently" list, countdowns and links, start from a layout or press Shuffle, and add stickers (choose <strong>Stickers</strong>, then tap a card), including ones you make from your own pictures (<strong>Find the subject</strong> cuts out what\'s in a photo, on your own device). Pen pals can give each other stickers with the gift button on a profile; gifts wait in your Stickers drawer until you place them. Your guestbook can show notes as a list, envelopes or postcards (Edit on the guestbook). It\'s free for everyone; Plus adds a Keepsakes sticker pack and room for 50 of your own stickers instead of 10. To change how it looks, go to <a href="/settings/customize">Settings &rarr; Customize</a>: all users get 8 themes, a status message, bio formatting, social links and a banner image. Avatar frames are on <a href="/settings/avatar">Settings &rarr; Avatar</a>. Plus users also get custom colors, fonts, backgrounds, music and custom HTML/CSS.',
    category: "customization",
  },
  {
    id: "themes",
    question: "What themes are available?",
    answer:
      "Inkwell has 8 structural themes: Classic, Manuscript, Broadsheet, Midnight Library, Botanical Press, Neon Terminal, Watercolor, and Zine. Each has unique typography, spacing, and decorative elements. All themes are free.",
    category: "customization",
  },
  {
    id: "custom-html",
    question: "How does custom HTML/CSS work?",
    answer:
      'Plus users can add custom CSS and HTML to their profile in <a href="/settings/customize">Settings &rarr; Customize</a>. Your CSS restyles your whole profile page (and only your page); your HTML appears as a card among your widgets.',
    category: "customization",
  },
  {
    id: "custom-domain",
    question: "How do custom domains work?",
    answer:
      'Plus subscribers can point their own domain at Inkwell so their profile and entries render at that domain. Set it up in <a href="/settings/domain">Settings &rarr; Custom Domain</a>. DNS verification and TLS certificates are handled automatically. Your fediverse identity stays @username@inkwell.social.',
    category: "customization",
  },
  {
    id: "avatar-builder",
    question: "Can I create an avatar without uploading a photo?",
    answer:
      'Yes! The Avatar Builder in <a href="/settings/avatar">Settings &rarr; Avatar</a> lets you build a hand-drawn Inkwell alien. Choose a head, eyes, antennae, expression and a literary prop &mdash; an open book, a teacup, reading glasses, a dip pen, a wax-sealed letter &mdash; or switch to a Scene for a whole little vignette. Randomize for inspiration.',
    category: "customization",
  },

  // ── Billing & Subscriptions ──
  {
    id: "plus-features",
    question: "What does Plus include?",
    answer:
      'Plus is $5/month or $50/year, and you can try it free for 14 days with no card. It gives you your own domain (yourname.com), detailed reader stats (reads by day, most-read entries, where readers came from), a page that looks like you (custom colors, fonts, backgrounds, music and HTML/CSS), and a bigger newsletter (unlimited subscribers, 8 sends a month). It also includes 1 GB of image storage that grows by 1 GB every year you\'re a member, unlimited drafts and series, cross-posting to Mastodon, Post by Email, API write access, Plus stickers and avatar frames, and the Keepsakes sheet of stamps. All 8 profile themes are free for everyone. <a href="/settings/billing">View details</a>.',
    category: "billing",
  },
  {
    id: "founding",
    question: "What is a Founding Member?",
    answer:
      'Founding Members pay once and have Plus for as long as Inkwell runs, with a numbered badge on their profile. There are only 50. The price rises from $99 to $149 after October 31, 2026; anyone who already joined keeps their seat and number. <a href="/settings/billing">Become one</a> or <a href="/transparency">see where the money goes</a>.',
    category: "billing",
  },
  {
    id: "cancel",
    question: "How do I cancel my subscription?",
    answer:
      'Go to <a href="/settings/billing">Settings &rarr; Billing</a> and choose <strong>Cancel subscription</strong>. Nothing more is charged, and Plus stays on until the end of the period you already paid for. If you change your mind before then, <strong>Keep my Plus</strong> undoes the cancel.',
    category: "billing",
  },
  {
    id: "ink-donor",
    question: "Can I support Inkwell without getting Plus?",
    answer:
      'Yes. Give a one-time gift of any amount from $1 in <a href="/settings/billing#gift">Settings &rarr; Billing</a>, with nothing to renew. (Monthly Ink Donor donations were retired in October 2026; anyone already giving that way can keep it or cancel it from the same page.)',
    category: "billing",
  },
  {
    id: "support-link",
    question: "Can readers support me directly?",
    answer:
      'Yes. Add your Ko-fi, Patreon, Buy Me a Coffee or any payment page in <a href="/settings/support">Settings &rarr; Support link</a>, and a button appears on your profile and under every entry. It\'s free for everyone and Inkwell takes nothing.',
    category: "billing",
  },

  // ── Privacy & Safety ──
  {
    id: "block-user",
    question: "How do I block someone?",
    answer:
      "Visit their profile, click the three-dot menu (\u22EF), and select Block. Blocked users can't see your content, send you messages, or interact with your entries. You won't see their content either. Manage blocks in Settings &rarr; Blocked Users.",
    category: "safety",
  },
  {
    id: "report-content",
    question: "How do I report content?",
    answer:
      "To report an entry, open its page, click the three-dot menu and select Report. To report an account as a whole (a spammy profile, unwanted pen pal requests or letters, someone pretending to be someone else), open their profile, click the three-dot menu (\u22EF) and select Report. Choose a reason and optionally add details. Reports are reviewed by the Inkwell team, and the person isn't told who reported them.",
    category: "safety",
  },
  {
    id: "pen-pal-request-limits",
    question: "Why can't I send a pen pal request?",
    answer:
      'Spam accounts use pen pal requests to get in front of people, so new accounts have a couple of rules for their first week: write a few words about yourself in <a href="/settings/profile">Settings &rarr; Profile</a> first, so people can see who\'s asking, and send up to 20 requests a day. If our spam checks are looking over your account, requests are paused until that lifts, usually once you\'ve joined in a little (footnotes, inks and stamps all count). You can always accept requests people send you.',
    category: "safety",
  },
  {
    id: "redactions",
    question: "What are redactions?",
    answer:
      'Redactions let you mute content by keyword. Add words in <a href="/settings/redactions">Settings &rarr; Redactions</a> and entries containing those words will be hidden from your Feed, Explore, and profile views. You can add up to 100 words.',
    category: "safety",
  },
  {
    id: "content-warnings",
    question: "How do content warnings work?",
    answer:
      "Authors can mark entries as sensitive and add a content warning message. Sensitive entries are hidden behind a \"Show content\" overlay. By default, sensitive entries don't appear on Explore — you can opt in via Settings &rarr; Content Safety.",
    category: "safety",
  },
  {
    id: "delete-account",
    question: "How do I delete my account?",
    answer:
      'Go to <a href="/settings/account">Settings &rarr; Delete account</a>. Type your username to confirm. All your data will be permanently deleted. Comments and feedback posts are anonymized (content preserved, your name removed).',
    category: "safety",
  },
  {
    id: "data-export",
    question: "Can I export my data?",
    answer:
      'Yes. Go to <a href="/settings/export">Settings &rarr; Data Export</a> to download all your entries, comments, and account data. On the same page, <strong>Download as a website</strong> gives you your page and every public entry as plain files you can open in a browser or put on any web host (Neocities, GitHub Pages, your own server). Your entries are also available via RSS at your profile page.',
    category: "safety",
  },
];
