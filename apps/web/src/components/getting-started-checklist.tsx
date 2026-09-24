"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { openJot } from "@/lib/stickies";

// "Getting started" on Feed for a member's first month. About half of new
// accounts never publish anything, and new writers who never respond to anyone
// look like spam to auto-moderation — so the steps lead to exactly those things:
// write, find people, respond to them.

interface Checklist {
  profile: boolean;
  published: boolean;
  following: number;
  responded: boolean;
  signed_guestbook: boolean;
}

interface Step {
  done: boolean;
  title: string;
  hint: string;
  href?: string;
  cta: string;
}

export function GettingStartedChecklist({ username }: { username: string }) {
  const [data, setData] = useState<Checklist | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/checklist", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.data) setData(d.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data || hidden) return null;

  const steps: Step[] = [
    {
      done: data.published,
      title: "Write your first entry",
      hint: "Anything goes — an introduction, a memory, what's on your mind. Or jot a quick sticky.",
      href: "/editor",
      cta: "Start writing",
    },
    {
      done: data.profile,
      title: "Add a picture and a few words about you",
      hint: "People follow writers they can picture. No photo? Draw a little alien instead.",
      href: "/settings/profile",
      cta: "Edit profile",
    },
    {
      done: data.following >= 3,
      title: `Find three writers to follow${data.following > 0 && data.following < 3 ? ` (${data.following} of 3)` : ""}`,
      hint: "Browse Explore by topic, or search for a friend's Mastodon handle.",
      href: "/explore",
      cta: "Explore",
    },
    {
      done: data.responded,
      title: "Respond to someone's writing",
      hint: "Leave a footnote, a stamp, or an ink on an entry you liked. Writers here notice.",
      href: "/explore",
      cta: "Find something to read",
    },
    {
      done: data.signed_guestbook,
      title: "Sign a guestbook",
      hint: "Every profile has one, near the bottom. A short hello goes a long way.",
      href: "/explore",
      cta: "Pick a profile",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  function dismiss() {
    setHidden(true);
    fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { getting_started_dismissed: true } }),
    }).catch(() => {});
  }

  return (
    <section className="getting-started" aria-labelledby="getting-started-title">
      <div className="getting-started-head">
        <div>
          <h2 id="getting-started-title" className="getting-started-title">
            Getting started
          </h2>
          <p className="getting-started-sub">
            {doneCount} of {steps.length} done · a few first steps to feel at home, @{username}
          </p>
        </div>
        <button type="button" onClick={dismiss} className="getting-started-dismiss">
          Hide
        </button>
      </div>
      <div className="getting-started-bar" aria-hidden="true">
        <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="getting-started-steps">
        {steps.map((s) => (
          <li key={s.title} className={`getting-started-step${s.done ? " is-done" : ""}`}>
            <span className="getting-started-check" aria-hidden="true">
              {s.done ? "✓" : ""}
            </span>
            <div className="getting-started-step-body">
              <p className="getting-started-step-title">
                {s.title}
                {s.done && <span className="sr-only"> (done)</span>}
              </p>
              {!s.done && <p className="getting-started-step-hint">{s.hint}</p>}
            </div>
            {!s.done && s.href && (
              <Link href={s.href} className="getting-started-cta">
                {s.cta}
              </Link>
            )}
            {!s.done && s.title === "Write your first entry" && (
              <button type="button" onClick={() => openJot()} className="getting-started-cta getting-started-cta--quiet">
                Jot a sticky
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
