// Community Guidelines content — 8 pages displayed in the onboarding book UI.
// Each page maps to one physical page in the book (left/right spread on desktop).

export interface GuidelinePage {
  id: string;
  title: string;
  body: string[]; // Array of paragraphs
}

export const GUIDELINES_PAGES: GuidelinePage[] = [
  {
    id: "welcome",
    title: "Welcome to the Community",
    body: [
      "Inkwell is a space for authentic human expression. There are no algorithms deciding what you see, no ads monetizing your attention, and no engagement tricks competing for your time.",
      "Your journal is yours \u2014 we just provide the paper and the pen.",
      "These guidelines exist to keep Inkwell a place where every writer feels safe to be honest, vulnerable, and creative. They\u2019re short on purpose. We trust you to write with care.",
    ],
  },
  {
    id: "kind",
    title: "Be Kind, Be Genuine",
    body: [
      "Treat others the way you\u2019d treat a pen pal: with warmth, curiosity, and good faith. We\u2019re all here to write and to read \u2014 not to score points.",
      "Constructive feedback is welcome when invited. Cruelty never is.",
      "Respect people\u2019s pronouns and chosen names. If you make a mistake, correct yourself and move on \u2014 no drama needed.",
      "Remember that there is a real person behind every journal entry. Write your comments and guestbook messages accordingly.",
    ],
  },
  {
    id: "welcome-content",
    title: "What Belongs Here",
    body: [
      "Inkwell is built for long-form personal writing: reflections, creative writing, poetry, essays, fiction, travel journals, tutorials, reviews, letters to no one in particular.",
      "Art, photography, music recommendations, reading lists, and anything you\u2019d put in a zine or a handwritten letter \u2014 it all belongs here.",
      "If your content touches on mature, sensitive, or potentially distressing topics, please use a content warning so readers can make an informed choice before reading. This isn\u2019t censorship \u2014 it\u2019s courtesy.",
    ],
  },
  {
    id: "not-welcome",
    title: "What Doesn\u2019t Belong Here",
    body: [
      "Hate speech, slurs, or content that targets people based on their identity \u2014 including race, ethnicity, gender, sexuality, disability, religion, or nationality.",
      "Harassment, bullying, doxxing, threats, or coordinated pile-ons against any individual or group.",
      "Non-consensual intimate imagery, or any sexual content involving minors. This results in an immediate permanent ban and a report to law enforcement.",
      "Spam, scams, phishing, or commercial solicitation disguised as journal entries.",
      "Malware, malicious code, or any attempt to exploit other users or the platform.",
    ],
  },
  {
    id: "privacy",
    title: "Privacy and Consent",
    body: [
      "Don\u2019t share another person\u2019s private information \u2014 real name, address, workplace, photos \u2014 without their explicit consent.",
      "Don\u2019t screenshot or redistribute entries that were shared as friends-only or with a custom filter. Those privacy settings exist for a reason.",
      "Respect the boundaries others set for their work. If someone asks you to remove something you\u2019ve written about them, honor that request.",
      "Your pen pals trust you. Be worthy of that trust.",
    ],
  },
  {
    id: "fediverse",
    title: "The Open Social Web",
    body: [
      "Inkwell is part of the fediverse \u2014 a network of independent platforms connected through ActivityPub. Your public entries may be seen by people on Mastodon, Pixelfed, and other federated services.",
      "These community standards apply equally to content that travels across the fediverse. What you publish here carries the Inkwell name with it.",
      "Be a good neighbor. We may limit or suspend federation with instances that don\u2019t uphold basic safety standards \u2014 and we expect other instances to hold us to the same bar.",
    ],
  },
  {
    id: "ip",
    title: "Intellectual Property",
    body: [
      "Share your own original work, or content you have clear permission to share.",
      "Credit your sources and inspirations. A link, a mention, a hat-tip \u2014 it goes a long way.",
      "Don\u2019t plagiarize or claim someone else\u2019s writing, art, or ideas as your own. The internet has a long memory.",
      "When in doubt, link instead of copy. Fair use has limits, and respecting creators is part of being one.",
    ],
  },
  {
    id: "paid-content",
    title: "Paid Content & Subscriptions",
    body: [
      "Writers on Inkwell can create paid subscription plans and publish entries exclusively for their subscribers. This is a privilege, not a right \u2014 it comes with responsibility.",
      "Be honest about what subscribers will get. Don\u2019t promise daily updates and deliver once a month. Don\u2019t gate content that was previously free without telling your readers.",
      "Paid entries should represent your genuine best work \u2014 not a paywall thrown in front of content that doesn\u2019t warrant it. Your subscribers are supporting you because they value your writing.",
      "Refund disputes are handled through Stripe. If a subscriber cancels, they keep access until the end of their billing period. No hard feelings.",
      "The same content standards apply to paid entries as to free ones. A paywall does not make prohibited content acceptable.",
    ],
  },
  {
    id: "ai",
    title: "AI and Authentic Writing",
    body: [
      "Inkwell celebrates human creativity and authentic expression. This is a place for your words, your ideas, and your voice.",
      "AI tools for grammar checking, translation, and accessibility are welcome \u2014 they help you say what you mean more clearly.",
      "If you post content that is substantially AI-generated, please disclose that. Transparency builds trust, and your readers deserve to know what they\u2019re reading.",
      "Fully automated AI accounts (other than the official Muse writing prompt bot) are not permitted. Every account on Inkwell should have a real person behind it.",
      "Writing prompts from Muse are starting points \u2014 your response should be yours. The best entries on Inkwell are the ones that could only have been written by you.",
    ],
  },
  {
    id: "enforcement",
    title: "When Things Go Wrong",
    body: [
      "If you see something that violates these guidelines, let us know. You can reach us at hello@inkwell.social or through the community roadmap.",
      "We investigate every report fairly and act proportionally. Our graduated response is: a friendly reminder, then a formal warning, then a temporary suspension, and finally a permanent ban.",
      "You may appeal any moderation decision. We\u2019re human too, and we\u2019d rather have a conversation than make a mistake.",
      "Our goal is to guide, not to punish. Most issues resolve with a simple conversation \u2014 and we\u2019d like to keep it that way.",
    ],
  },
];
