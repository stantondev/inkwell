import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Share to Inkwell — Help Center",
  description:
    "Send a link, a quote or a thought from any app on your phone straight into Inkwell, as a sticky or the start of an entry. iPhone setup with a free Apple Shortcut.",
  openGraph: {
    title: "Share to Inkwell — Inkwell Help Center",
    description: "Send links and text from any app on your phone straight into Inkwell.",
    url: "https://inkwell.social/help/share-to-inkwell",
  },
  alternates: { canonical: "https://inkwell.social/help/share-to-inkwell" },
};

function Section({ id, number, title, children }: { id: string; number: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="rounded-xl border p-6 sm:p-8" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--accent)", fontFamily: "var(--font-lora, Georgia, serif)" }}>
          {number}
        </p>
        <h2 className="text-xl font-bold mb-4" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
          {title}
        </h2>
        <div className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
          {children}
        </div>
      </div>
    </section>
  );
}

/** The text the shortcut's Text action starts with. Shown so people can copy it exactly. */
const SHARE_URL_PREFIX = "https://inkwell.social/share?text=";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
        style={{ background: "var(--accent)", color: "#fff" }}
        aria-hidden="true"
      >
        {n}
      </span>
      <div className="pt-0.5">{children}</div>
    </li>
  );
}

export default function ShareToInkwellPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12" style={{ color: "var(--foreground)" }}>
      <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
        <Link href="/help" className="hover:underline" style={{ color: "var(--accent)" }}>Help Center</Link>
        {" "}/ Share to Inkwell
      </p>

      <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--accent)", fontFamily: "var(--font-lora, Georgia, serif)" }}>
        On your phone
      </p>
      <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
        Share to Inkwell
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>
        Send a link, a quote or a passing thought from any app straight into Inkwell: jot it as a sticky, or
        start an entry with it.
      </p>

      <div className="space-y-6">
        <Section id="how" number="I" title="How it works">
          <p>
            Apps don&rsquo;t need to know about Inkwell. When you tap <strong>Share</strong> in Safari, News,
            Photos or anywhere else, the app hands what you shared to your phone&rsquo;s share menu, and your
            phone lists the apps that can take it. Once Inkwell is set up, it&rsquo;s in that list.
          </p>
          <p>
            Pick Inkwell and a small page opens showing what you shared, with two choices:{" "}
            <strong>Jot a sticky</strong> or <strong>Start an entry</strong> (the link and any text are quoted at
            the top, ready for you to write about).
          </p>
          <p>
            How you set it up depends on your phone: iPhone and iPad use a free Apple Shortcut (below); Android
            just needs the Inkwell app installed.
          </p>
        </Section>

        <Section id="iphone" number="II" title="iPhone and iPad: add the Shortcut">
          <p>
            Apple only lists App Store apps in the share menu, so on iPhone a small Shortcut does the job. It
            takes about two minutes, once. You&rsquo;ll use the <strong>Shortcuts</strong> app that comes with
            your iPhone (if you deleted it, it&rsquo;s free in the App Store).
          </p>
          <ol className="space-y-3 list-none pl-0">
            <Step n={1}>Open <strong>Shortcuts</strong> and tap <strong>+</strong> at the top right to start a new shortcut.</Step>
            <Step n={2}>
              Tap the name at the top (it says &ldquo;New Shortcut&rdquo;), choose <strong>Rename</strong>, and call
              it <strong>Share to Inkwell</strong>. You can pick an icon and colour here too.
            </Step>
            <Step n={3}>
              Tap the <strong>ⓘ</strong> button at the bottom, turn on <strong>Show in Share Sheet</strong>, then
              tap <strong>Done</strong>. The shortcut now starts with &ldquo;Receive <em>Any</em> input from{" "}
              <em>Share Sheet</em>&rdquo;. That&rsquo;s right as it is.
            </Step>
            <Step n={4}>
              In the search box at the bottom (&ldquo;Search for apps and actions&rdquo;), search for{" "}
              <strong>URL Encode</strong> and tap it. It should read &ldquo;URL <em>Encode</em>{" "}
              <em>Shortcut Input</em>&rdquo;.
            </Step>
            <Step n={5}>
              Search for <strong>Text</strong> and tap it to add a text box. Type this into the box exactly:
              <code
                className="block my-2 px-3 py-2 rounded-lg text-xs [overflow-wrap:anywhere] select-all"
                style={{ background: "var(--background)", border: "1px solid var(--border)" }}
              >
                {SHARE_URL_PREFIX}
              </code>
              Then, with the cursor right after the <code>=</code>, tap <strong>URL Encoded Text</strong> in the
              bar above the keyboard, so it sits at the end of the line.
            </Step>
            <Step n={6}>
              Search for <strong>Open URLs</strong> and tap it. It should read &ldquo;Open <em>Text</em>&rdquo;.
            </Step>
            <Step n={7}>Tap <strong>Done</strong>. That&rsquo;s it.</Step>
          </ol>
          <p className="pt-2">
            <strong>To use it:</strong> in Safari (or any app), tap <strong>Share</strong>, scroll down the list of
            actions and tap <strong>Share to Inkwell</strong>. To keep it near the top, scroll to the bottom of
            that list, tap <strong>Edit Actions…</strong> and add it to your Favourites.
          </p>
          <p>
            The first time, your iPhone asks whether the shortcut may open inkwell.social. Tap{" "}
            <strong>Always Allow</strong>.
          </p>
          <p style={{ color: "var(--muted)" }}>
            Good to know: the shortcut opens Inkwell in Safari, not in the Inkwell app on your home screen
            (iPhones keep the two separate). If Safari asks you to sign in, do it once and it will remember you.
          </p>
        </Section>

        <Section id="android" number="III" title="Android">
          <p>
            Install Inkwell from Chrome: open{" "}
            <Link href="/" className="underline" style={{ color: "var(--accent)" }}>inkwell.social</Link>, tap
            the <strong>⋮</strong> menu, and choose <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
            Inkwell then appears in the share menu of every app, alongside your other apps.
          </p>
          <p>
            Already installed it before this feature arrived? It can take a day for Chrome to notice. Removing
            Inkwell from your home screen and installing it again makes it appear straight away.
          </p>
        </Section>

        <Section id="trouble" number="IV" title="If something isn't working">
          <p>
            <strong>Inkwell isn&rsquo;t in the share menu (iPhone).</strong> Check that{" "}
            <strong>Show in Share Sheet</strong> is on in the shortcut&rsquo;s ⓘ settings, then look at the very
            bottom of the share menu under <strong>Edit Actions…</strong>.
          </p>
          <p>
            <strong>The page says &ldquo;Nothing came through with the share.&rdquo;</strong> The Text step
            probably doesn&rsquo;t end with the <em>URL Encoded Text</em> variable. Open the shortcut and check
            step 5.
          </p>
          <p>
            <strong>It asks me to sign in every time.</strong> Sign in to inkwell.social in Safari itself (not the
            home-screen app); Safari will remember you from then on.
          </p>
          <p>
            Still stuck?{" "}
            <Link href="/help/contact" className="underline" style={{ color: "var(--accent)" }}>Write to us</Link>{" "}
            and we&rsquo;ll help you set it up.
          </p>
        </Section>
      </div>
    </main>
  );
}
