import Link from "next/link";
import { getSite } from "@/lib/site";

/**
 * /about on a self-hosted server: who runs this one and what it is. The
 * inkwell.social About page is that service's mission, pricing and people,
 * which would be wrong here.
 */
export function SelfHostedAbout() {
  const site = getSite();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12" style={{ color: "var(--foreground)" }}>
      <h1 className="text-3xl font-bold mb-6" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
        About {site.name}
      </h1>

      <div className="space-y-4 leading-relaxed">
        <p>
          {site.name} is a social journal: a place to keep a journal, write letters to pen pals and make your page your
          own. There are no algorithms and no ads.
        </p>
        <p>
          It runs on{" "}
          <a href="https://inkwell.social/open-source" className="underline" style={{ color: "var(--accent)" }}>
            Inkwell
          </a>
          , open-source software, and is run independently of inkwell.social by the people at {site.host}. Every
          feature is available to everyone here; there is nothing to pay for.
        </p>
        <p>
          Members can be followed from Mastodon and the rest of the fediverse at <strong>@name@{site.host}</strong>.
        </p>
        <p>
          Questions, problems or reports:{" "}
          <a href={`mailto:${site.contactEmail}`} className="underline" style={{ color: "var(--accent)" }}>
            {site.contactEmail}
          </a>
          .
        </p>
      </div>

      <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
        <Link href="/guidelines" className="underline">Community guidelines</Link> ·{" "}
        <Link href="/terms" className="underline">Terms</Link> ·{" "}
        <Link href="/privacy" className="underline">Privacy</Link> ·{" "}
        <Link href="/help" className="underline">Help</Link>
      </p>
    </main>
  );
}
