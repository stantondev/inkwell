import Link from "next/link";

export const SERIF = "var(--font-lora, Georgia, serif)";
export const HELP_EMAIL = "hello@inkwell.social";

export type SourceKey = "wordpress" | "substack" | "medium";

export interface SwitchSource {
  key: SourceKey;
  name: string;
  /** Short line for the index card */
  cardBlurb: string;
  /** What the export file looks like */
  fileDescription: string;
  /** Export steps on the other platform (kept deliberately general) */
  exportSteps: string[];
  /** Notes about how the Inkwell importer handles this source */
  importNotes: string[];
  /** Honest limitations */
  limitations: string[];
  /** Whether a newsletter subscriber list is a natural thing to bring along */
  hasSubscribers: boolean;
}

export const SOURCES: Record<SourceKey, SwitchSource> = {
  wordpress: {
    key: "wordpress",
    name: "WordPress",
    cardBlurb: "Import your posts from a WordPress export file, with tags, dates and images.",
    fileDescription: "a WordPress export file (.xml, sometimes zipped)",
    exportSteps: [
      "Sign in to your WordPress dashboard.",
      "Open Tools → Export.",
      "Choose to export all content (or just posts) and download the export file. It's an .xml file.",
    ],
    importNotes: [
      "Only posts are imported. Pages and media-library attachments are skipped.",
      "WordPress categories come across as tags on your entries.",
      "Block-editor markup (the hidden <!-- wp:... --> comments) and shortcodes are cleaned out, so your posts read cleanly.",
      "Images in your posts are downloaded and re-hosted on Inkwell, so they keep working even if your old site goes away.",
    ],
    limitations: [
      "Comments on your WordPress posts are not imported.",
      "Pages, custom post types and theme/plugin settings don't come across.",
      "If your images were already broken or private on the old site, we can't fetch them.",
    ],
    hasSubscribers: false,
  },
  substack: {
    key: "substack",
    name: "Substack",
    cardBlurb: "Import your posts from a Substack export, and bring your subscriber list too.",
    fileDescription: "the .zip file Substack gives you",
    exportSteps: [
      "Sign in to Substack and open your publication's Settings.",
      "Find the Exports section and create a new export.",
      "When it's ready, download the .zip file. No need to unzip it.",
    ],
    importNotes: [
      "Upload the .zip as-is. We read each post's HTML and match it with the post details in the export.",
      "Posts that were still drafts on Substack stay drafts on Inkwell.",
      "Embeds like tweets, videos and subscribe buttons are stripped out, so what's left is your writing.",
      "Images in your posts are downloaded and re-hosted on Inkwell.",
    ],
    limitations: [
      "Comments and likes from Substack are not imported.",
      "Paid subscriptions don't transfer. Your readers' payment details stay with Substack.",
      "Embedded media (videos, tweets, podcasts) is removed rather than recreated.",
    ],
    hasSubscribers: true,
  },
  medium: {
    key: "medium",
    name: "Medium",
    cardBlurb: "Import your stories from Medium's account download, with their tags and dates.",
    fileDescription: "the .zip file from Medium's account download",
    exportSteps: [
      "Sign in to Medium and open your Settings.",
      "Look for the option to download your information, and request the download.",
      "Medium emails you a link. Download the .zip file. No need to unzip it.",
    ],
    importNotes: [
      "Upload the .zip as-is. Only your stories (the posts folder) are imported. Your responses, claps and other account data are left out.",
      "Story tags come across as tags on your entries.",
      "Images in your stories are downloaded and re-hosted on Inkwell.",
    ],
    limitations: [
      "Responses (Medium's comments), claps and followers are not imported.",
      "Publication and Partner Program settings don't come across.",
      "Medium doesn't give you a subscriber email list, so there's nothing to bring over there.",
    ],
    hasSubscribers: false,
  },
};

export const SOURCE_KEYS = Object.keys(SOURCES) as SourceKey[];

export function CtaButtons() {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <Link
        href="/get-started"
        className="inline-flex justify-center items-center rounded-full px-6 py-2.5 text-sm font-medium"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        Create your free account
      </Link>
      <Link
        href="/settings/import"
        className="inline-flex justify-center items-center rounded-full px-6 py-2.5 text-sm font-medium border"
        style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
      >
        Already here? Go to Import
      </Link>
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border p-6 sm:p-8 ${className}`}
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs uppercase tracking-widest mb-1"
      style={{ color: "var(--accent)", fontFamily: SERIF }}
    >
      {children}
    </p>
  );
}

export function HelpMoveCard({ heading }: { heading?: string }) {
  return (
    <Card>
      <h2 className="text-xl font-bold mb-3" style={{ fontFamily: SERIF }}>
        {heading ?? "Stuck? We'll help you move."}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed">
        <p>
          If your export won&apos;t import cleanly, or your archive is big and you&apos;d rather not do it
          alone, email us at{" "}
          <a
            href={`mailto:${HELP_EMAIL}`}
            className="underline underline-offset-2"
            style={{ color: "var(--accent)" }}
          >
            {HELP_EMAIL}
          </a>
          . Tell us where you&apos;re coming from and roughly how much you&apos;ve written, and a real
          person will help you get it moved.
        </p>
      </div>
    </Card>
  );
}

/** Reasons to choose Inkwell. Keep these in line with the landing page and CLAUDE.md. */
export const WHY_INKWELL: { title: string; body: string }[] = [
  {
    title: "No algorithm, no ads",
    body: "Your readers see your posts because they follow you, in the order you wrote them. Nobody is selling their attention.",
  },
  {
    title: "Your words stay yours",
    body: "You can export your whole journal whenever you like, from Settings. Your writing isn't locked in here.",
  },
  {
    title: "Readers on Mastodon can follow you",
    body: "Every Inkwell journal is part of the fediverse. People on Mastodon and other compatible apps can follow @you@inkwell.social without making an account.",
  },
  {
    title: "A page that looks like you",
    body: "Themes, a banner, avatar frames and a guestbook are free. Plus adds custom colors, fonts, layouts, your own HTML and CSS, and a custom domain.",
  },
  {
    title: "Newsletters built in",
    body: "Send entries to email subscribers. Free: up to 500 subscribers and 2 sends a month. Plus ($5/mo): unlimited subscribers and 8 sends a month.",
  },
];
