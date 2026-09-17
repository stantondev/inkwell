import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CtaButtons,
  Eyebrow,
  HelpMoveCard,
  SERIF,
  SOURCES,
  SOURCE_KEYS,
  WHY_INKWELL,
  type SourceKey,
} from "../switch-shared";

export const dynamicParams = false;

export function generateStaticParams() {
  return SOURCE_KEYS.map((source) => ({ source }));
}

function getSource(source: string) {
  return (SOURCE_KEYS as string[]).includes(source) ? SOURCES[source as SourceKey] : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ source: string }>;
}): Promise<Metadata> {
  const { source } = await params;
  const s = getSource(source);
  if (!s) return {};

  const title = `Moving from ${s.name} to Inkwell`;
  const description = `Bring every ${s.name} post with you. Export your archive, import it into Inkwell with original dates and images, and keep writing with no algorithm and no ads.`;
  const url = `https://inkwell.social/switch/${s.key}`;

  return {
    title,
    description,
    openGraph: { title: `${title} — Inkwell`, description, url, type: "website" },
    alternates: { canonical: url },
  };
}

function Step({ n, title, children }: { n: number; title?: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
        style={{ background: "var(--accent-light)", color: "var(--accent)", fontFamily: SERIF }}
      >
        {n}
      </span>
      <div className={`min-w-0 flex-1 ${title ? "" : "pt-1"}`}>
        {title && (
          <h3 className="font-bold mb-1" style={{ fontFamily: SERIF }}>
            {title}
          </h3>
        )}
        <div className="text-sm leading-relaxed space-y-2">{children}</div>
      </div>
    </div>
  );
}

export default async function SwitchSourcePage({
  params,
}: {
  params: Promise<{ source: string }>;
}) {
  const { source } = await params;
  const s = getSource(source);
  if (!s) notFound();

  const link = { color: "var(--accent)" } as const;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12" style={{ color: "var(--foreground)" }}>
      <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
        <Link href="/switch" className="hover:underline" style={link}>
          Switch to Inkwell
        </Link>{" "}
        / {s.name}
      </p>

      {/* Hero */}
      <Eyebrow>Moving from {s.name}</Eyebrow>
      <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ fontFamily: SERIF }}>
        Moving from {s.name}? Bring every post with you.
      </h1>
      <p className="text-base leading-relaxed mb-6" style={{ color: "var(--muted)" }}>
        Export your archive from {s.name}, upload it to Inkwell, and your posts arrive with their
        original dates and their images. Then keep writing somewhere with no algorithm
        and no ads.
      </p>
      <div className="mb-10">
        <CtaButtons />
      </div>

      {/* Why */}
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

      {/* Step 1: export */}
      <Card className="mb-6">
        <Eyebrow>Step one</Eyebrow>
        <h2 className="text-xl font-bold mb-2" style={{ fontFamily: SERIF }}>
          Export from {s.name}
        </h2>
        <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--muted)" }}>
          You&apos;re after {s.fileDescription}. Menu names change now and then, so if something
          looks a little different, look for the export or download option in your settings.
        </p>
        <div className="space-y-5">
          {s.exportSteps.map((step, i) => (
            <Step key={i} n={i + 1}>
              <p>{step}</p>
            </Step>
          ))}
        </div>
      </Card>

      {/* Step 2: import */}
      <Card className="mb-6">
        <Eyebrow>Step two</Eyebrow>
        <h2 className="text-xl font-bold mb-5" style={{ fontFamily: SERIF }}>
          Import into Inkwell
        </h2>
        <div className="space-y-5">
          <Step n={1} title="Create your account">
            <p>
              <Link href="/get-started" className="underline underline-offset-2" style={link}>
                Sign up for free
              </Link>
              . It only takes an email address. If you already have an account, sign in.
            </p>
          </Step>
          <Step n={2} title="Open Settings → Import">
            <p>
              Go to{" "}
              <Link href="/settings/import" className="underline underline-offset-2" style={link}>
                Settings → Import
              </Link>{" "}
              and pick <strong>{s.name}</strong> as the source (or leave it on Auto-detect).
            </p>
          </Step>
          <Step n={3} title="Choose drafts or published">
            <p>
              <strong>Drafts</strong> let you look everything over before anyone sees it.{" "}
              <strong>Published</strong> puts your posts live straight away. Either way they keep
              their original dates. You also choose a default privacy: public, friends only or
              private.
            </p>
          </Step>
          <Step n={4} title="Upload and let it run">
            <p>
              Upload {s.fileDescription} (up to 50MB). Big archives import in the background, and
              you can watch the progress on the same page.
            </p>
          </Step>
        </div>

        <div className="mt-6 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
          <h3 className="font-bold mb-2" style={{ fontFamily: SERIF }}>
            What to expect from a {s.name} import
          </h3>
          <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed">
            {s.importNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
            <li>
              If you import the same file twice, posts we already have (same title and date) are
              skipped.
            </li>
          </ul>
        </div>
      </Card>

      {/* Subscribers (Substack) */}
      {s.hasSubscribers && (
        <Card className="mb-6">
          <Eyebrow>Step three (optional)</Eyebrow>
          <h2 className="text-xl font-bold mb-3" style={{ fontFamily: SERIF }}>
            Bring your subscribers
          </h2>
          <div className="space-y-3 text-sm leading-relaxed">
            <p>
              Your {s.name} export includes a list of your subscribers&apos; email addresses. Turn on
              your newsletter at{" "}
              <Link href="/settings/newsletter" className="underline underline-offset-2" style={link}>
                Settings → Newsletter
              </Link>
              , then use the import option there to upload that CSV or paste the addresses in.
            </p>
            <p>
              To respect your readers, every imported address gets a confirmation email and only
              joins your list once they say yes. You can import up to 500 addresses at a time on
              Free, or 5,000 on Plus. Free newsletters hold up to 500 subscribers.
            </p>
          </div>
        </Card>
      )}

      {/* Limitations */}
      <Card className="mb-6">
        <h2 className="text-xl font-bold mb-3" style={{ fontFamily: SERIF }}>
          What doesn&apos;t come across
        </h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed">
          {s.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Card>

      <div className="mb-10">
        <HelpMoveCard />
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: SERIF }}>
          Ready to move?
        </h2>
        <div className="flex justify-center">
          <CtaButtons />
        </div>
        <p className="text-sm mt-6" style={{ color: "var(--muted)" }}>
          Coming from somewhere else?{" "}
          <Link href="/switch" className="underline underline-offset-2" style={link}>
            See all the ways to move
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
