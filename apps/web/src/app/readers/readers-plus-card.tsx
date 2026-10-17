"use client";

import Link from "next/link";
import { usePlusTrial } from "@/hooks/use-plus-trial";

const serif = { fontFamily: "var(--font-lora, Georgia, serif)" };

// The Readers page's Plus card. Offers the free trial only to someone who can
// still start one, and starts it right here instead of sending them away.
export function ReadersPlusCard() {
  const { eligible, days, starting, error, start } = usePlusTrial();

  return (
    <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h2 className="text-base font-semibold mb-2" style={serif}>See the whole picture with Plus</h2>
      <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        Plus shows reads day by day, which entries people read most, and which sites
        and searches sent them.
        {eligible && ` You can try it free for ${days} days, no card needed.`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {eligible ? (
          <button
            type="button"
            onClick={start}
            disabled={starting}
            className="inline-flex rounded-full px-5 py-2 text-sm font-medium"
            style={{ background: "var(--accent)", color: "var(--background)", opacity: starting ? 0.6 : 1 }}
          >
            {starting ? "Starting your trial…" : `Try Plus free for ${days} days`}
          </button>
        ) : (
          <Link
            href="/settings/billing"
            className="inline-flex rounded-full px-5 py-2 text-sm font-medium"
            style={{ background: "var(--accent)", color: "var(--background)" }}
          >
            See Plus
          </Link>
        )}
        {eligible && (
          <Link href="/settings/billing" className="text-sm underline underline-offset-2" style={{ color: "var(--accent)" }}>
            About Plus
          </Link>
        )}
      </div>
      {error && <p className="text-xs mt-2" style={{ color: "var(--danger, #c0392b)" }}>{error}</p>}
    </div>
  );
}
