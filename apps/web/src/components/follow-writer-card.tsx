"use client";

import { useEffect, useState } from "react";
import { fediverseHandle } from "@/lib/fediverse";

/**
 * "Keep reading <writer>" for signed-out readers at the end of a post.
 *
 * Most people arrive from a link shared on Facebook, Mastodon, a group chat…
 * and don't know what Inkwell is. Rather than one "Join Inkwell" button, this
 * offers every way to follow the writer from wherever the reader already is:
 * an Inkwell account, their Mastodon/fediverse account, email (when the writer
 * has a newsletter) or RSS.
 *
 * On a writer's own domain the reader isn't on inkwell.social, so Inkwell
 * links are absolute.
 */

const SERVER_KEY = "inkwell-fediverse-server";
const INKWELL = "https://inkwell.social";

/** "https://Mastodon.Social/@me", "@me@mastodon.social" or "mastodon.social" → "mastodon.social". */
export function normalizeServer(input: string): string | null {
  // Link first ("https://mastodon.social/@me" → "mastodon.social"), then a
  // handle ("@me@mastodon.social" → "mastodon.social").
  let s = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "");
  if (s.includes("@")) s = s.slice(s.lastIndexOf("@") + 1);
  if (!s) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/.test(s)) return null;
  return s;
}

export function FollowWriterCard({
  username,
  displayName,
  newsletterEnabled,
  newsletterName,
  onCustomDomain,
}: {
  username: string;
  displayName: string;
  newsletterEnabled: boolean;
  newsletterName?: string | null;
  onCustomDomain: boolean;
}) {
  const handle = fediverseHandle(username);
  const actorUrl = `${INKWELL}/users/${username}`;
  const base = onCustomDomain ? INKWELL : "";
  const [server, setServer] = useState("");
  const [serverError, setServerError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SERVER_KEY);
      if (saved) setServer(saved);
    } catch {
      /* private mode */
    }
  }, []);

  function followFromServer(e: React.FormEvent) {
    e.preventDefault();
    const host = normalizeServer(server);
    if (!host) {
      setServerError(true);
      return;
    }
    setServerError(false);
    try {
      localStorage.setItem(SERVER_KEY, host);
    } catch {
      /* private mode */
    }
    // Mastodon (and most software that copied its API) opens its own
    // "Follow this account?" screen for this URL.
    window.open(`https://${host}/authorize_interaction?uri=${encodeURIComponent(actorUrl)}`, "_blank", "noopener");
  }

  async function copyHandle() {
    try {
      await navigator.clipboard.writeText(handle);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the handle is on screen to copy by hand */
    }
  }

  const subscribeHref = onCustomDomain ? "/subscribe" : `/${username}/subscribe`;
  const rssHref = `/api/users/${username}/feed.xml`;

  return (
    <section className="follow-writer" aria-labelledby="follow-writer-heading">
      <h2 id="follow-writer-heading" className="follow-writer-heading">
        Keep reading {displayName}
      </h2>
      <p className="follow-writer-sub">
        Follow along from wherever you already are. No algorithm decides whether you see the next one.
      </p>

      <div className="follow-writer-options">
        <div className="follow-writer-option">
          <div className="follow-writer-option-text">
            <h3>On Inkwell</h3>
            <p>A free account. Their new entries land in your feed, and you can write back.</p>
          </div>
          <div className="follow-writer-actions">
            <a className="follow-writer-btn follow-writer-btn-primary" href={`${base}/get-started?follow=${encodeURIComponent(username)}`}>
              Join free
            </a>
            <a className="follow-writer-link" href={`${base}/login?next=${encodeURIComponent(`/${username}`)}`}>
              Already on Inkwell? Sign in
            </a>
          </div>
        </div>

        <div className="follow-writer-option">
          <div className="follow-writer-option-text">
            <h3>On Mastodon or the fediverse</h3>
            <p>
              Follow <button type="button" className="follow-writer-handle" onClick={copyHandle} title="Copy">{handle}</button>
              {copied ? <span className="follow-writer-copied"> copied</span> : null} from your own account.
            </p>
          </div>
          <form className="follow-writer-server" onSubmit={followFromServer}>
            <label htmlFor="follow-writer-server-input" className="sr-only">Your server</label>
            <input
              id="follow-writer-server-input"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="e.g. mastodon.social"
              value={server}
              onChange={(e) => {
                setServer(e.target.value);
                setServerError(false);
              }}
              aria-invalid={serverError || undefined}
            />
            <button type="submit" className="follow-writer-btn">Follow</button>
          </form>
          {serverError && <p className="follow-writer-error">That doesn&rsquo;t look like a server name. Try something like mastodon.social.</p>}
        </div>

        {newsletterEnabled && (
          <div className="follow-writer-option">
            <div className="follow-writer-option-text">
              <h3>By email</h3>
              <p>{newsletterName ? <>Get <em>{newsletterName}</em> in your inbox.</> : "Get new entries in your inbox."} Unsubscribe any time.</p>
            </div>
            <div className="follow-writer-actions">
              <a className="follow-writer-btn" href={subscribeHref}>Subscribe</a>
            </div>
          </div>
        )}
      </div>

      <p className="follow-writer-foot">
        Or use a feed reader: <a href={rssHref}>RSS</a>
      </p>
    </section>
  );
}
