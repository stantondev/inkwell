import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How Inkwell Works — The Reader's Guide",
  description:
    "Everything you need to know about writing, reading, and connecting on Inkwell.",
  openGraph: {
    title: "How Inkwell Works — The Reader's Guide",
    description:
      "Everything you need to know about writing, reading, and connecting on Inkwell.",
    url: "https://inkwell.social/guide",
  },
  alternates: { canonical: "https://inkwell.social/guide" },
};

/* ── section wrapper ──────────────────────────────────────────────── */
function Section({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div
        className="rounded-xl border p-6 sm:p-8"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <p
          className="text-xs uppercase tracking-widest mb-1"
          style={{ color: "var(--accent)", fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          {number}
        </p>
        <h2
          className="text-xl font-bold mb-4"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          {title}
        </h2>
        <div className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
          {children}
        </div>
      </div>
    </section>
  );
}

/* ── page ─────────────────────────────────────────────────────────── */
export default function GuidePage() {
  return (
    <main
      className="mx-auto max-w-3xl px-4 py-12"
      style={{ color: "var(--foreground)" }}
    >
      {/* Header */}
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        The Reader&rsquo;s Guide to Inkwell
      </h1>
      <p className="text-sm mb-10" style={{ color: "var(--muted)" }}>
        Everything you need to know about writing, reading, and connecting
      </p>

      <div className="space-y-6">
        {/* I. Feed & Explore */}
        <Section id="feed-explore" number="I" title="Your Feed & Explore">
          <p>
            Inkwell has two main places to read entries:{" "}
            <strong>Feed</strong> and <strong>Explore</strong>.
          </p>
          <p>
            <strong>Your Feed</strong> is personal — it shows entries from people
            you follow (your pen pals). Think of it as your mailbox. When a pen
            pal publishes a new entry, it arrives in your Feed. If you follow
            writers on Mastodon or other fediverse platforms, their posts appear
            here too.
          </p>
          <p>
            <strong>Explore</strong> is public — it shows all public entries from
            the Inkwell community and the wider fediverse. Think of it as a
            bookstore. You don&rsquo;t need to follow anyone to see content
            here. Use the category filters at the top to find entries about
            topics you care about.
          </p>
          <p style={{ color: "var(--muted)" }}>
            Tip: If your Feed feels empty, head to{" "}
            <Link href="/explore" className="underline" style={{ color: "var(--accent)" }}>
              Explore
            </Link>{" "}
            and follow some writers.
          </p>
        </Section>

        {/* II. Writing & Publishing */}
        <Section id="writing" number="II" title="Writing & Publishing">
          <p>
            Open the editor from the sidebar (or the top nav on mobile) to start
            writing. The rich text editor supports headings, bold, italic, links,
            images, lists, tables, and more.
          </p>
          <p>
            Every entry has a <strong>visibility setting</strong> that controls
            who can read it:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Public</strong> — everyone can see it, including people on
              the fediverse (Mastodon, Pixelfed, etc.)
            </li>
            <li>
              <strong>Friends Only</strong> — only your pen pals can read it
            </li>
            <li>
              <strong>Private</strong> — only you can see it
            </li>
            <li>
              <strong>Custom</strong> — choose specific people using a friend
              filter
            </li>
            <li>
              <strong>Paid subscribers only</strong> — only readers who
              subscribe to your plan can read the full entry (Plus feature)
            </li>
          </ul>
          <p>
            Not ready to publish? Save your work as a <strong>draft</strong> and
            come back to it later. You can also add a category, tags, mood,
            cover image, and excerpt to give readers context.
          </p>
        </Section>

        {/* III. Pen Pals & Following */}
        <Section id="pen-pals" number="III" title="Pen Pals & Following">
          <p>
            On Inkwell, connections are called <strong>pen pals</strong> — like
            exchanging letters. When you follow someone and they follow you
            back, you&rsquo;re pen pals.
          </p>
          <p>
            To follow a writer, visit their profile and click the follow button.
            Once they accept your request, their public and friends-only entries
            will appear in your Feed. You can also send them{" "}
            <strong>direct letters</strong> (private messages).
          </p>
          <p>
            You can follow writers from other fediverse platforms too — just
            search for their full handle (like{" "}
            <span style={{ fontFamily: "monospace", fontSize: "13px" }}>
              @user@mastodon.social
            </span>
            ) on the search page.
          </p>
        </Section>

        {/* IV. Stamps, Inks, Comments & Interaction */}
        <Section id="interaction" number="IV" title="Stamps, Inks & Interaction">
          <p>
            <strong>Stamps</strong> are Inkwell&rsquo;s way of reacting to
            entries — like pressing an ink stamp onto paper. Each entry shows
            which stamp types have been placed in the top-right corner (like
            postage on a letter).
          </p>
          <p>
            You can leave one stamp per entry. Pick the one that fits how the
            entry made you feel — &ldquo;Felt this,&rdquo; &ldquo;Holding
            space,&rdquo; &ldquo;Beautifully said,&rdquo; and more.
          </p>
          <p>
            <strong>Inks</strong> are a way to signal &ldquo;more people should
            read this.&rdquo; Click the ink drop icon on any entry to ink it.
            Unlike stamps (which express how something made you feel), inks are
            a discovery signal — they help surface great writing. The most-inked
            entries appear in the <strong>Trending This Week</strong> section on
            Explore, and you can sort Explore by &ldquo;Most Inked&rdquo; to
            find community favorites.
          </p>
          <p>
            <strong>Comments</strong> support @mentions — type{" "}
            <strong>@</strong> and start typing a username to mention someone.
            They&rsquo;ll get a notification. You can edit your comments within
            24 hours of posting.
          </p>
          <p>
            <strong>Bookmarks</strong> save entries to your private reading
            list. Click the ribbon icon on any entry to save it for later.
          </p>
        </Section>

        {/* V. The Fediverse */}
        <Section id="fediverse" number="V" title="The Fediverse">
          <p>
            Inkwell is part of the <strong>fediverse</strong> — a network of
            independent platforms connected through a protocol called
            ActivityPub. Think of it like email: you can send a message from
            Gmail to Outlook because they speak the same protocol. Similarly,
            Inkwell can talk to Mastodon, Pixelfed, Ghost, and hundreds of
            other platforms.
          </p>
          <p>
            <strong>What this means for you:</strong>
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              You can follow writers on Mastodon and other fediverse platforms
              directly from Inkwell. Their posts show up in your Feed.
            </li>
            <li>
              Your public entries are visible to people on other fediverse
              platforms. They can follow your Inkwell account from Mastodon
              using{" "}
              <span style={{ fontFamily: "monospace", fontSize: "13px" }}>
                @yourusername@inkwell.social
              </span>
              .
            </li>
            <li>
              When you see a handle like{" "}
              <span style={{ fontFamily: "monospace", fontSize: "13px" }}>
                @alice@mastodon.social
              </span>{" "}
              on Explore, that&rsquo;s a writer on Mastodon whose entries appear
              in Inkwell.
            </li>
          </ul>
          <p>
            <strong>One thing to know:</strong> if someone has accounts on both
            Inkwell and Mastodon (or another platform), those are separate
            identities. Following their Inkwell account shows you their Inkwell
            entries, and following their Mastodon account shows you their
            Mastodon posts. They&rsquo;re like two different mailboxes.
          </p>
          <p style={{ color: "var(--muted)" }}>
            You don&rsquo;t need to understand ActivityPub to use Inkwell — it
            all works automatically. But if you&rsquo;re curious, the fediverse
            is an open alternative to centralized social media where no single
            company controls the network.
          </p>
        </Section>

        {/* VI. Customizing Your Space */}
        <Section id="customizing" number="VI" title="Customizing Your Space">
          <p>
            Visit{" "}
            <Link href="/settings/customize" className="underline" style={{ color: "var(--accent)" }}>
              Settings &rarr; Customize
            </Link>{" "}
            to make your profile page your own. Every user gets:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>8 visual themes (Manuscript, Broadsheet, Midnight Library, and more)</li>
            <li>A status message (like an AIM away message)</li>
            <li>A bio with rich text formatting</li>
            <li>Social links (X, Bluesky, Mastodon, GitHub, website)</li>
            <li>A banner image and avatar</li>
            <li>Guestbook for visitors to sign</li>
          </ul>
          <p>
            <Link href="/settings/billing" className="underline" style={{ color: "var(--accent)" }}>
              Plus members
            </Link>{" "}
            ($5/mo) also get custom colors, backgrounds, fonts, layouts, a music
            player, avatar frames, widget ordering, custom HTML/CSS, and a custom
            domain for your profile — full creative control, like the early days
            of the web.
          </p>
        </Section>
      </div>

        {/* VII. Earning From Your Writing */}
        <Section id="earning" number="VII" title="Earning From Your Writing">
          <p>
            Inkwell offers several ways for writers to earn from their work,
            all available to{" "}
            <Link href="/settings/billing" className="underline" style={{ color: "var(--accent)" }}>
              Plus members
            </Link>{" "}
            with Stripe Connect enabled:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Paid subscriptions</strong> — create a monthly plan and
              publish entries that only your subscribers can read. You keep 92%
              of every subscription; Inkwell takes 8% to keep the platform
              running.
            </li>
            <li>
              <strong>Postage</strong> — readers can send you one-time payments
              as a thank-you for your writing, right from your profile or any
              entry.
            </li>
            <li>
              <strong>Newsletter</strong> — build an email subscriber list and
              send your published entries directly to readers&rsquo; inboxes.
            </li>
          </ul>
          <p>
            To get started, visit{" "}
            <Link href="/settings/support" className="underline" style={{ color: "var(--accent)" }}>
              Settings &rarr; Support
            </Link>{" "}
            to connect your Stripe account, then create your subscription plan
            in{" "}
            <Link href="/settings/subscriptions" className="underline" style={{ color: "var(--accent)" }}>
              Settings &rarr; Subscriptions
            </Link>
            . Learn more on the{" "}
            <Link href="/for-writers" className="underline" style={{ color: "var(--accent)" }}>
              For Writers
            </Link>{" "}
            page.
          </p>
        </Section>

      {/* Bottom links */}
      <div className="mt-12 pt-6 border-t" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
          More about Inkwell
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/guidelines" className="hover:underline" style={{ color: "var(--accent)" }}>
            Community Guidelines
          </Link>
          <Link href="/terms" className="hover:underline" style={{ color: "var(--accent)" }}>
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:underline" style={{ color: "var(--accent)" }}>
            Privacy Policy
          </Link>
          <Link href="/developers" className="hover:underline" style={{ color: "var(--accent)" }}>
            API Documentation
          </Link>
          <Link href="/roadmap" className="hover:underline" style={{ color: "var(--accent)" }}>
            Roadmap
          </Link>
        </div>
      </div>
    </main>
  );
}
