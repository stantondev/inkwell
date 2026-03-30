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
  { id: "billing", label: "Billing & Subscriptions" },
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
      'Inkwell Plus ($5/month) unlocks custom colors, fonts, layouts, background images, profile music, avatar frames and animations, custom HTML/CSS, custom domains, the First Class stamp, unlimited drafts, extended newsletter sends, and API write access. <a href="/settings/billing">Learn more</a>.',
    category: "account",
  },
  {
    id: "change-username",
    question: "Can I change my username?",
    answer:
      'Yes. Go to <a href="/settings">Settings &rarr; Profile</a> and click on your username to edit it. Your fediverse handle will update automatically, but people who followed your old handle may need to re-follow.',
    category: "account",
  },

  // ── Writing & Publishing ──
  {
    id: "write-entry",
    question: "How do I write and publish an entry?",
    answer:
      'Click the <strong>Write</strong> button in the sidebar (or top nav on mobile) to open the editor. Write your entry using the rich text toolbar, set your visibility in the settings panel, then click <strong>Publish</strong>. You can also save as a draft first.',
    category: "writing",
  },
  {
    id: "visibility",
    question: "What are the visibility options?",
    answer:
      '<ul><li><strong>Public</strong> — visible to everyone, including the fediverse</li><li><strong>Friends Only</strong> — only your pen pals can read it</li><li><strong>Private</strong> — only you can see it</li><li><strong>Custom</strong> — visible to specific people via a friend filter</li><li><strong>Paid subscribers only</strong> — only readers who subscribe to your plan (Plus feature)</li></ul>',
    category: "writing",
  },
  {
    id: "drafts",
    question: "How do drafts work?",
    answer:
      'Click <strong>Save draft</strong> instead of Publish to save your work without making it public. Find your drafts in the sidebar under <strong>Drafts</strong>. You can edit and publish them anytime. Free users can save up to 10 drafts; Plus users get unlimited.',
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
      "Pen pals are Inkwell's term for mutual follows. When you follow someone and they follow you back, you're pen pals. Pen pals can see each other's friends-only entries and send direct letters (private messages).",
    category: "social",
  },
  {
    id: "stamps",
    question: "How do stamps work?",
    answer:
      'Stamps are Inkwell\'s reactions — like pressing an ink stamp onto paper. You can leave one stamp per entry, choosing from 7 types: Felt this, Holding space, Beautifully said, Rooting for you, Throwback, I can\'t even, and First Class (Plus only). Stamps appear in the top-right corner of entries like postage on a letter.',
    category: "social",
  },
  {
    id: "stamps-vs-inks",
    question: "What is the difference between stamps and inks?",
    answer:
      "<strong>Stamps</strong> express how an entry made you feel (reaction). <strong>Inks</strong> signal \"more people should read this\" (discovery). Think of stamps as personal and inks as a recommendation. The most-inked entries appear in Trending on Explore.",
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
      'Letters are private messages between you and another user. You can send rich text with formatting and images. Access your conversations from <strong>Letterbox</strong> in the sidebar.',
    category: "social",
  },
  {
    id: "circles",
    question: "What are Circles?",
    answer:
      'Circles are group discussion spaces with a Writer\'s Salon aesthetic. They\'re flat (no threading, no upvotes) — every voice is equal. Plus users can create up to 10 circles; everyone can browse, join, and participate. Find them at <a href="/circles">Circles</a>.',
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
    id: "fediverse-posts",
    question: "Why do I see posts from other platforms on Explore?",
    answer:
      "Inkwell connects to the wider fediverse, so public posts from Mastodon and other platforms may appear on Explore. These are marked with a globe icon and the originating instance domain. You can filter Explore by source (All / Inkwell / Fediverse).",
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
      'Go to <a href="/settings/customize">Settings &rarr; Customize</a>. All users get 8 themes, a status message, bio formatting, social links, a banner image, and avatar frames. Plus users also get custom colors, fonts, layouts, backgrounds, music, widget ordering, and custom HTML/CSS.',
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
      'Plus users can write custom HTML and CSS for their profile in <a href="/settings/customize">Settings &rarr; Customize</a>. You can use it as a sidebar widget or in full-page mode where your HTML replaces the entire profile layout. 17 template tags (like {{entries}}, {{guestbook}}, {{avatar}}) let you embed platform widgets in your custom layout.',
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
      'Yes! The Avatar Builder in <a href="/settings/avatar">Settings &rarr; Avatar</a> lets you create a custom hand-drawn character using DiceBear Croodles. Customize face, hair, eyes, mouth, and more. You can also randomize for inspiration.',
    category: "customization",
  },

  // ── Billing & Subscriptions ──
  {
    id: "plus-features",
    question: "What does Plus include?",
    answer:
      'Plus ($5/month) includes: custom profile colors, fonts, layouts, backgrounds, and music; avatar frames and animations; custom HTML/CSS; custom domain; First Class stamp; unlimited drafts and filters; extended image storage; 8 newsletter sends/month; API write access; and the Plus badge. <a href="/settings/billing">View details</a>.',
    category: "billing",
  },
  {
    id: "cancel",
    question: "How do I cancel my subscription?",
    answer:
      'Go to <a href="/settings/billing">Settings &rarr; Subscription</a> and click <strong>Manage subscription</strong>. This opens the Stripe customer portal where you can cancel, update payment, or view invoices. Your Plus features remain active until the end of the billing period.',
    category: "billing",
  },
  {
    id: "ink-donor",
    question: "What is an Ink Donor?",
    answer:
      'Ink Donors contribute $1, $2, or $3/month to help keep Inkwell running. In return, you get an "Ink Donor" badge on your profile and feed cards. No features are unlocked — it\'s purely voluntary support. You can be both Plus and Ink Donor.',
    category: "billing",
  },
  {
    id: "postage",
    question: "How does Postage work?",
    answer:
      "Postage lets readers send one-time payments to writers as a thank-you. Writers need Plus + Stripe Connect (set up in Settings &rarr; Support). Readers pay the postage amount plus processing fees. Writers receive 92%; Inkwell takes 8%.",
    category: "billing",
  },
  {
    id: "writer-plans",
    question: "How do writer subscription plans work?",
    answer:
      'Plus writers can create a monthly subscription plan ($1\u2013$100) and publish paid-only entries. Subscribers pay the plan price; writers keep 92%. Set up in <a href="/settings/subscriptions">Settings &rarr; Subscriptions</a> after connecting Stripe.',
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
      "On any entry's detail page, click the three-dot menu and select Report. Choose a reason (spam, harassment, hate speech, etc.) and optionally add details. Reports are reviewed by the Inkwell team.",
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
      'Go to <a href="/settings">Settings &rarr; Profile</a> and scroll to the Danger Zone section at the bottom. Type your username to confirm. All your data will be permanently deleted. Comments and feedback posts are anonymized (content preserved, your name removed).',
    category: "safety",
  },
  {
    id: "data-export",
    question: "Can I export my data?",
    answer:
      'Yes. Go to <a href="/settings/export">Settings &rarr; Data Export</a> to download all your entries, comments, and account data. Your entries are also available via RSS at your profile page.',
    category: "safety",
  },
];
