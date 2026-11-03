"use client";

import { useEffect, useState, Suspense } from "react";
import { fediverseHandle } from "@/lib/fediverse";
import { BlueskyBridgeCard } from "./bluesky-bridge-card";
import { BlueskyAccountCard } from "./bluesky-account-card";
import { MastodonAccountsCard, GlobeIcon } from "./mastodon-accounts-card";

/**
 * Settings → Mastodon & Bluesky.
 *
 * Two different things live here, so the page is split by what people come
 * to do:
 *   1. Your accounts on other sites: link the Bluesky and Mastodon accounts
 *      you already have, to sign in with them and share entries from them.
 *   2. How people there can follow your journal: your @you@inkwell.social
 *      handle (always on) and the Bluesky bridge (gives the journal its own
 *      Bluesky account).
 * Until 2026-11-03 it was one list under "Fediverse Accounts" that talked
 * about Mastodon, with two Bluesky cards above it that did different things.
 */
export default function FediverseSettingsPage() {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUsername(d?.data?.username ?? null))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="your-accounts" className="flex flex-col gap-4">
        <SectionHeading
          id="your-accounts"
          title="Your accounts on other sites"
          text="Link accounts you already have. You can sign in to Inkwell with them, and when you publish you can tick them to post a short preview of the entry with a link back here."
        />
        <Suspense fallback={null}>
          <BlueskyAccountCard />
        </Suspense>
        <MastodonAccountsCard />
      </section>

      <section aria-labelledby="follow-your-journal" className="flex flex-col gap-4">
        <SectionHeading
          id="follow-your-journal"
          title="How people there can follow your journal"
          text="This is about your Inkwell journal itself, whether or not you have accounts anywhere else."
        />
        <FollowFromFediverseCard username={username} />
        <BlueskyBridgeCard />
      </section>
    </div>
  );
}

function SectionHeading({ id, title, text }: { id: string; title: string; text: string }) {
  return (
    <div>
      <h2 id={id} className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
        {title}
      </h2>
      <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        {text}
      </p>
    </div>
  );
}

function FollowFromFediverseCard({ username }: { username: string | null }) {
  const [copied, setCopied] = useState(false);
  const handle = username ? fediverseHandle(username) : null;

  const copy = async () => {
    if (!handle) return;
    try {
      await navigator.clipboard.writeText(handle);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the handle is on screen to copy by hand.
    }
  };

  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      aria-labelledby="follow-fediverse-heading"
    >
      <div className="flex items-start gap-3">
        <GlobeIcon />
        <div className="flex-1 min-w-0">
          <h3 id="follow-fediverse-heading" className="text-base font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            From Mastodon and the fediverse
          </h3>
          <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>
            Nothing to switch on. People on Mastodon and similar sites can search for your handle and follow
            your journal; your public entries reach them, and their replies come back here as footnotes.
          </p>
          {handle && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code
                className="text-sm px-2.5 py-1 rounded-lg break-all"
                style={{ background: "var(--background)", border: "1px solid var(--border)" }}
              >
                {handle}
              </code>
              <button type="button" onClick={copy} className="text-sm underline underline-offset-2" style={{ color: "var(--accent)" }}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
