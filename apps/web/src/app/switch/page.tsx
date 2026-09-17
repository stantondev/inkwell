import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CtaButtons,
  Eyebrow,
  HELP_EMAIL,
  SERIF,
  SOURCES,
  SOURCE_KEYS,
  WHY_INKWELL,
} from "./switch-shared";

const TITLE = "Bring your writing to Inkwell";
const DESCRIPTION =
  "Moving from WordPress, Substack or Medium? Import your posts, with their original dates and images, and keep writing on a journal with no algorithm and no ads.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://inkwell.social/switch",
    type: "website",
  },
  alternates: { canonical: "https://inkwell.social/switch" },
};

export default function SwitchIndexPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12" style={{ color: "var(--foreground)" }}>
      {/* Hero */}
      <Eyebrow>Switch to Inkwell</Eyebrow>
      <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ fontFamily: SERIF }}>
        {TITLE}
      </h1>
      <p className="text-base leading-relaxed mb-6" style={{ color: "var(--muted)" }}>
        You don&apos;t have to start from a blank page. Export your archive from the platform
        you&apos;re leaving, upload it at Settings → Import, and your posts arrive with their
        original dates and images.
      </p>
      <div className="mb-10">
        <CtaButtons />
      </div>

      {/* Sources */}
      <h2 className="text-xl font-bold mb-4" style={{ fontFamily: SERIF }}>
        Where are you coming from?
      </h2>
      <div className="grid gap-4 sm:grid-cols-3 mb-10">
        {SOURCE_KEYS.map((key) => {
          const s = SOURCES[key];
          return (
            <Link
              key={key}
              href={`/switch/${key}`}
              className="rounded-xl border p-5 flex flex-col hover:shadow-sm transition-shadow"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <span className="text-lg font-bold mb-2" style={{ fontFamily: SERIF }}>
                {s.name}
              </span>
              <span className="text-sm leading-relaxed flex-1" style={{ color: "var(--muted)" }}>
                {s.cardBlurb}
              </span>
              <span className="text-sm mt-3" style={{ color: "var(--accent)" }}>
                How to move →
              </span>
            </Link>
          );
        })}
      </div>

      {/* Somewhere else */}
      <Card className="mb-10">
        <h2 className="text-xl font-bold mb-3" style={{ fontFamily: SERIF }}>
          Coming from LiveJournal, Dreamwidth, Tumblr or somewhere else?
        </h2>
        <div className="space-y-3 text-sm leading-relaxed">
          <p>
            We&apos;ll be straight with you: there&apos;s no one-click importer for those yet.
          </p>
          <p>
            What does work today is our generic import. If you can get your posts into a CSV file
            (columns like <code>title</code>, <code>body</code>, <code>date</code>,{" "}
            <code>tags</code>) or a JSON list of posts with a title, body and date, you can upload
            it at{" "}
            <Link href="/settings/import" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
              Settings → Import
            </Link>{" "}
            and it will come in just like the others.
          </p>
          <p>
            If that sounds like a lot, email{" "}
            <a
              href={`mailto:${HELP_EMAIL}`}
              className="underline underline-offset-2"
              style={{ color: "var(--accent)" }}
            >
              {HELP_EMAIL}
            </a>{" "}
            and tell us where your archive lives. We&apos;ll help you move it.
          </p>
        </div>
      </Card>

      {/* How importing works */}
      <Card className="mb-10">
        <h2 className="text-xl font-bold mb-3" style={{ fontFamily: SERIF }}>
          How importing works
        </h2>
        <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed">
          <li>
            Choose whether posts come in as <strong>drafts</strong>, so you can look them over first,
            or <strong>published</strong> right away. Either way they keep their original dates.
          </li>
          <li>Choose a default privacy: public, friends only or private.</li>
          <li>
            Images in your posts are downloaded and re-hosted on Inkwell, so they don&apos;t break
            when your old site goes away.
          </li>
          <li>
            If you import the same file twice, posts we already have (same title and date) are
            skipped.
          </li>
          <li>Uploads can be up to 50MB. Big archives import in the background while you get on with things.</li>
        </ul>
      </Card>

      {/* Why Inkwell */}
      <h2 className="text-xl font-bold mb-4" style={{ fontFamily: SERIF }}>
        Why writers choose Inkwell
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 mb-10">
        {WHY_INKWELL.map((w) => (
          <div
            key={w.title}
            className="rounded-xl border p-5"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <h3 className="font-bold mb-1" style={{ fontFamily: SERIF }}>
              {w.title}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              {w.body}
            </p>
          </div>
        ))}
      </div>

      <CtaButtons />
    </div>
  );
}
