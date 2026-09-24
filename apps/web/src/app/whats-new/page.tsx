import type { Metadata } from "next";
import Link from "next/link";
import { getSessionSafe } from "@/lib/session";
import { WHATS_NEW, whatsNewHref, type WhatsNewItem } from "@/lib/whats-new";
import { MarkWhatsNewSeen } from "@/components/whats-new-state";

export const metadata: Metadata = {
  title: "What's new",
  description: "Everything that's new on Inkwell, in plain words, with where to find it.",
  openGraph: {
    title: "What's new on Inkwell",
    description: "Everything that's new on Inkwell, in plain words, with where to find it.",
    url: "https://inkwell.social/whats-new",
  },
  alternates: { canonical: "https://inkwell.social/whats-new" },
};

const serif = "var(--font-lora, Georgia, serif)";

function formatDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function monthOf(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Item({ item, username }: { item: WhatsNewItem; username: string | null }) {
  const href = whatsNewHref(item.href, username);
  return (
    <article
      id={item.id}
      className="rounded-xl border p-5 sm:p-6 scroll-mt-24"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: "var(--muted)" }}>
        <span style={{ fontFamily: serif, fontStyle: "italic" }}>{formatDay(item.date)}</span>
        {item.tag && (
          <span
            className="rounded-full px-2 py-0.5 uppercase tracking-wider"
            style={{ background: "var(--accent-light)", color: "var(--accent)", fontSize: "10px" }}
          >
            {item.tag}
          </span>
        )}
      </div>
      <h2 className="text-lg font-semibold mb-1.5" style={{ fontFamily: serif }}>
        {item.title}
      </h2>
      <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
        {item.body}
      </p>
      {item.howTo && (
        <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
          <span style={{ fontStyle: "italic", fontFamily: serif }}>Where to find it:</span> {item.howTo}
        </p>
      )}
      {href && item.cta && (
        <Link
          href={href}
          className="inline-block mt-3 text-sm font-medium rounded-full px-4 py-1.5 border transition-opacity hover:opacity-80"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          {item.cta} →
        </Link>
      )}
    </article>
  );
}

export default async function WhatsNewPage() {
  const { session } = await getSessionSafe();
  const username = session?.user.username ?? null;

  const months: { month: string; items: WhatsNewItem[] }[] = [];
  for (const item of WHATS_NEW) {
    const m = monthOf(item.date);
    const last = months[months.length - 1];
    if (last?.month === m) last.items.push(item);
    else months.push({ month: m, items: [item] });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12" style={{ color: "var(--foreground)" }}>
      {session && <MarkWhatsNewSeen />}
      <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: serif }}>
        What&rsquo;s new
      </h1>
      <p className="text-sm mb-10" style={{ color: "var(--muted)" }}>
        What changed on Inkwell lately, in plain words, and where to find it. For ideas people asked for on the
        roadmap, see the <Link href="/roadmap/releases" style={{ color: "var(--accent)" }}>release notes</Link>. New to
        Inkwell? Start with the <Link href="/guide" style={{ color: "var(--accent)" }}>Reader&rsquo;s Guide</Link>.
      </p>

      {months.map(({ month, items }) => (
        <section key={month} className="mb-10">
          <h2
            className="text-xs uppercase tracking-widest mb-4"
            style={{ color: "var(--accent)", fontFamily: serif }}
          >
            {month}
          </h2>
          <div className="space-y-4">
            {items.map((item) => (
              <Item key={item.id} item={item} username={username} />
            ))}
          </div>
        </section>
      ))}

      <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
        Something not working, or an idea?{" "}
        <Link href="/roadmap/new" style={{ color: "var(--accent)" }}>
          Tell us on the roadmap
        </Link>
        .
      </p>
    </main>
  );
}
