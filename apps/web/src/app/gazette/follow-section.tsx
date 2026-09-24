"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Follow a Gazette section: followed sections come first on the front page.
 * Saved in settings.gazette_topics (the same key the old topic picker used).
 */
export function FollowSection({
  sectionId,
  label,
  mySections,
  signedIn,
}: {
  sectionId: string;
  label: string;
  mySections: string[];
  signedIn: boolean;
}) {
  const [saved, setSaved] = useState(mySections);
  const following = saved.includes(sectionId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  if (!signedIn) {
    return (
      <Link href={`/login?next=/gazette?section=${sectionId}`} className="gz-follow">
        Sign in to follow {label}
      </Link>
    );
  }

  async function toggle() {
    const next = following
      ? saved.filter((s) => s !== sectionId)
      : Array.from(new Set([...saved, sectionId]));
    setSaving(true);
    setError(false);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { gazette_topics: next } }),
      });
      if (!res.ok) throw new Error();
      setSaved(next);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      className={`gz-follow ${following ? "gz-follow--on" : ""}`}
      onClick={toggle}
      disabled={saving}
      aria-pressed={following}
      title={following ? `${label} comes first on your front page` : `Put ${label} first on your front page`}
    >
      {error ? "Couldn't save — try again" : following ? `✓ Following ${label}` : `Follow ${label}`}
    </button>
  );
}
