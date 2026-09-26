import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How Inkwell Works — The Reader's Guide",
  description:
    "A walkthrough of Inkwell's journal, pen pals, stamps, inks, and the fediverse.",
  openGraph: {
    title: "How Inkwell Works — The Reader's Guide",
    description:
      "A walkthrough of Inkwell's journal, pen pals, stamps, inks, and the fediverse.",
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
        A walkthrough of Inkwell&rsquo;s journal, pen pals, stamps, inks, and the fediverse
      </p>

      <div className="space-y-6">
        {/* I. Feed & Explore */}
        <Section id="feed-explore" number="I" title="Your Feed & Explore">
          <p>
            Inkwell has two main places to read entries:{" "}
            <strong>Feed</strong> and <strong>Explore</strong>.
          </p>
          <p>
            <strong>Your Feed</strong> is personal: the people you follow,
            newest first, like letters arriving. Follow a writer and their
            public entries start arriving right away; once they accept, you&rsquo;re
            pen pals and their pen-pals-only entries arrive too. Accounts you
            follow on Mastodon and other fediverse platforms show up here as
            well. There&rsquo;s no sorting or ranking. Entries that arrived since
            your last visit are marked <strong>New</strong>, the top of the Feed
            says how many there are, and it tells you when you&rsquo;ve reached the
            end. The <strong>Everyone · Inkwell · Fediverse</strong> switch
            narrows it to one or the other.
          </p>
          <p>
            <strong>Explore</strong> is public: writing from everyone on
            Inkwell, whether you follow them or not. Think of it as a bookshop.
            It opens on a cover: <strong>writers to meet</strong>, the
            month&rsquo;s <strong>most inked</strong> entries and{" "}
            <strong>popular tags</strong>, with the newest writing starting on
            the facing page. Use <strong>Topics</strong> to browse one subject,{" "}
            <strong>Most inked</strong> to see community favourites, and the{" "}
            <strong>Fediverse</strong> tab for public posts from Mastodon and
            other servers. The search box finds writers, entries, and
            fediverse accounts by their @handle.
          </p>
          <p>
            <strong>Turning pages.</strong> On a computer, Feed and Explore read
            like an open book, two pages at a time. Turn the page with the
            arrow button on the right, the <kbd>←</kbd> <kbd>→</kbd> keys, or by
            scrolling sideways; the page number sits at the top, between the
            pages. On a phone, swipe sideways to turn the page and scroll down
            to read the rest of it. Double-tap a page to ink it.
          </p>
          <p style={{ color: "var(--muted)" }}>
            Tip: If your Feed is empty, it suggests writers to follow, and
            there are more on{" "}
            <Link href="/explore" className="underline" style={{ color: "var(--accent)" }}>
              Explore
            </Link>
            .
          </p>
        </Section>

        {/* II. Writing & Publishing */}
        <Section id="writing" number="II" title="Writing & Publishing">
          <p>
            Open the editor from the sidebar (or the Write button on your phone)
            to start writing. Select words to bold, italicise or link them, and
            on a new line type <strong>/</strong> for a menu of headings, lists,
            checklists, quotes, pictures, galleries and more. Markdown works as
            you type too: start a line with <code>#</code>, <code>-</code>,{" "}
            <code>1.</code>, <code>[ ]</code> or <code>&gt;</code>. Press{" "}
            <strong>⌘K</strong> (Ctrl+K on Windows) to add a link and{" "}
            <strong>⌘S</strong> to save.
          </p>
          <p>
            In the editor&rsquo;s <strong>Settings</strong>, <em>Who can read it</em>{" "}
            controls the entry&rsquo;s visibility:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Public</strong> — everyone can see it, including people on
              the fediverse (Mastodon, Pixelfed, etc.)
            </li>
            <li>
              <strong>Pen Pals only</strong> — only your pen pals can read it
            </li>
            <li>
              <strong>Private</strong> — only you can see it
            </li>
            <li>
              <strong>Custom</strong> — choose specific people using a friend
              filter
            </li>
          </ul>
          <p>
            Not ready to publish? Save your work as a <strong>draft</strong> and
            come back to it later. You can also add a category, tags, a mood
            (with a little face, in Classic pixel or Ink style), what you&rsquo;re
            listening to, where you are, a cover image, and an excerpt to give
            readers context. To publish later,
            press the clock next to <strong>Publish</strong> and pick a time;
            a past date in the editor&rsquo;s settings backdates the entry.
            Before anything goes out, <strong>Publish</strong> shows who will be
            able to read it and whether it will be emailed, cross-posted or put
            in a circle. To share an entry in one of your circles, choose the
            circle under <em>Sharing</em> in Settings.
          </p>
          <p>
            For a quick thought that doesn&rsquo;t need a title, <strong>jot a
            sticky</strong> (up to 500 characters). Stickies live on your
            profile&rsquo;s corkboard and in Feed, and any sticky can grow into a
            full entry later.
          </p>
          <p>
            Every entry page has a <strong>Translate</strong> button, and the{" "}
            <Link href="/readers" className="underline" style={{ color: "var(--accent)" }}>
              Readers
            </Link>{" "}
            page shows how many people read you. Bringing an old journal over?
            See{" "}
            <Link href="/switch" className="underline" style={{ color: "var(--accent)" }}>
              Switch to Inkwell
            </Link>{" "}
            (WordPress, Substack, Medium, LiveJournal and Dreamwidth), then tidy
            everything at once on the{" "}
            <Link href="/manage" className="underline" style={{ color: "var(--accent)" }}>
              Posts
            </Link>{" "}
            page.
          </p>
        </Section>

        {/* III. Pen Pals & Following */}
        <Section id="pen-pals" number="III" title="Pen Pals & Following">
          <p>
            On Inkwell, connections are called <strong>pen pals</strong> — like
            exchanging letters. Following someone asks to be their pen pal;
            when they accept, you both are.
          </p>
          <p>
            To follow a writer, press <strong>Follow</strong> on their profile,
            on Explore, or in your Feed&rsquo;s suggestions. The button reads{" "}
            <strong>Following</strong> while you wait, and their public entries
            are in your Feed straight away. Once they accept it says{" "}
            <strong>Pen Pals ✓</strong>, and their pen-pals-only entries arrive
            too. Pressing it again (Unfollow) takes their entries out of your
            Feed.
          </p>
          <p>
            <strong>Letters</strong> are private messages between pen pals (and
            fediverse accounts you follow). Open{" "}
            <Link href="/letters" className="underline" style={{ color: "var(--accent)" }}>
              Letters
            </Link>{" "}
            and press <em>New letter</em>. From there you can archive, mute or
            search conversations, and choose whether people who aren&rsquo;t
            your pen pals yet may send you one letter request.
          </p>
          <p>
            Every profile has a <strong>guestbook</strong> — sign it to leave a
            public hello on someone&rsquo;s page. They get a notification.
          </p>
          <p>
            <strong>Circles</strong> are small communities of writers, organised
            in threads. Join one on{" "}
            <Link href="/circles" className="underline" style={{ color: "var(--accent)" }}>
              Circles
            </Link>
            , then press <em>New thread</em> to start one with a journal entry,
            or open a thread and press <em>Write your answer</em>. Answers
            appear under the thread, and every post stays on its writer&rsquo;s
            journal and shows in members&rsquo; Feeds, publicly or for members
            only.
          </p>
          <p>
            You can follow writers from other fediverse platforms too — just
            search for their full handle (like{" "}
            <span style={{ fontFamily: "monospace", fontSize: "13px" }}>
              @user@mastodon.social
            </span>
            ) in the search bar on Explore.
          </p>
        </Section>

        {/* IV. Stamps, Inks, Reprints & Interaction */}
        <Section id="interaction" number="IV" title="Stamps, Inks, Reprints & Interaction">
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
            a discovery signal — they help surface great writing on Inkwell.
            The most-inked entries appear in the{" "}
            <strong>Most inked this month</strong> row on Explore, and you can
            sort Explore by &ldquo;Most Inked&rdquo; to find community favorites.
            Inks are an Inkwell-native feature and stay within the platform;
            when someone on Mastodon favorites your entry, it counts as an ink.
            On a phone, <strong>double-tap a page</strong> to ink it.
          </p>
          <p>
            <strong>Reprints</strong> are how you share someone else&rsquo;s
            writing with your followers — like a repost or boost. Click the
            reprint icon (↻) on any public entry to reprint it. Your followers
            will see it in their feed with a &ldquo;reprinted&rdquo; label.
            Reprints are federated — they appear as boosts on Mastodon and
            other fediverse platforms. You can also <strong>reprint with your
            thoughts</strong> by clicking the dropdown arrow, which lets you
            add your own commentary while embedding the original post.
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
            Two ways to get support from your readers today, both free:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>A support link</strong> — add your Ko-fi, Patreon, Buy Me
              a Coffee or any payment page in{" "}
              <Link href="/settings/support" className="underline" style={{ color: "var(--accent)" }}>
                Settings &rarr; Support link
              </Link>
              . A button appears on your profile and under every entry.
            </li>
            <li>
              <strong>Newsletter</strong> — build an email subscriber list and
              send your published entries directly to readers&rsquo; inboxes.
            </li>
          </ul>
          <p>
            Learn more on the{" "}
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
