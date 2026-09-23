"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArchivePostmark } from "@/components/archive-postmark";
import { archiveOriginName } from "@/lib/archive";

interface Origin {
  origin: string;
  count: number;
  marked: number;
  earliest: string | null;
  latest: string | null;
}

interface ArchiveSummary {
  origins: Origin[];
  note: string;
  note_max: number;
}

function years(o: Origin) {
  const a = o.earliest ? new Date(o.earliest).getUTCFullYear() : null;
  const b = o.latest ? new Date(o.latest).getUTCFullYear() : null;
  if (!a || !b) return "";
  return a === b ? ` (${a})` : ` (${a}–${b})`;
}

/**
 * Settings → Import → "Your archive": the postmark and cover letter on posts
 * already imported, switched on or off for all of them at once, plus the
 * writer's own note for the cover letter. Only shown once something has been
 * imported.
 */
export function ArchiveSettings() {
  const [data, setData] = useState<ArchiveSummary | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const onFinished = () => setReloadKey((k) => k + 1);
    window.addEventListener("inkwell-import-finished", onFinished);
    return () => window.removeEventListener("inkwell-import-finished", onFinished);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/archive")
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.data) throw new Error();
        if (cancelled) return;
        setData(json.data);
        setNote(json.data.note ?? "");
        setSavedNote(json.data.note ?? "");
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const patch = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/me/archive", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) throw new Error(json?.error || "Couldn't save that. Try again in a moment.");
      setData(json.data);
      return json.data as ArchiveSummary & { changed?: number };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const setMark = async (origin: string, on: boolean) => {
    const result = await patch({ archive_mark: on, origin }, `mark-${origin}`);
    if (result) {
      const n = result.changed ?? 0;
      setMessage(
        n === 0
          ? "Nothing needed changing."
          : `${on ? "Postmarked" : "Took the postmark off"} ${n} ${n === 1 ? "post" : "posts"}.`,
      );
    }
  };

  const saveNote = async () => {
    const result = await patch({ note }, "note");
    if (result) {
      setNote(result.note);
      setSavedNote(result.note);
      setMessage(result.note ? "Cover letter note saved." : "Cover letter note removed.");
    }
  };

  if (loadError) {
    return (
      <section id="archive" className="rounded-xl border p-4 mt-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Couldn&apos;t load your archive settings. Refresh the page to try again.
        </p>
      </section>
    );
  }

  if (!data || data.origins.length === 0) return null;

  const primary = data.origins[0];
  const max = data.note_max || 600;

  return (
    <section id="archive" className="rounded-xl border p-5 mt-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            Your archive
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Posts you brought over can wear a postmark from where they first lived, with a cover letter
            clipped to the top saying when you wrote them. Readers can set the letter aside; the postmark stays.
          </p>
        </div>
        <ArchivePostmark
          origin={primary.origin}
          publishedAt={primary.earliest}
          uid="settings-archive"
          width={120}
          className="hidden sm:block shrink-0"
        />
      </div>

      <ul className="mt-4 space-y-3">
        {data.origins.map((o) => {
          const name = archiveOriginName(o.origin);
          const allOn = o.marked === o.count;
          const noneOn = o.marked === 0;
          return (
            <li key={o.origin} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="font-medium">
                    {o.count} {o.count === 1 ? "post" : "posts"} from {name}
                  </span>
                  <span style={{ color: "var(--muted)" }}>{years(o)}</span>
                  <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    {allOn ? "All postmarked." : noneOn ? "No postmark." : `Postmarked on ${o.marked} of ${o.count}.`}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!allOn && (
                    <button
                      type="button"
                      onClick={() => setMark(o.origin, true)}
                      disabled={busy !== null}
                      className="rounded-full px-3.5 py-1.5 text-sm font-medium disabled:opacity-60"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      {busy === `mark-${o.origin}` ? "Working…" : noneOn ? "Postmark all" : "Postmark the rest"}
                    </button>
                  )}
                  {!noneOn && (
                    <button
                      type="button"
                      onClick={() => setMark(o.origin, false)}
                      disabled={busy !== null}
                      className="rounded-full border px-3.5 py-1.5 text-sm disabled:opacity-60"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {busy === `mark-${o.origin}` ? "Working…" : "Remove from all"}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        To change single posts, select them on the <Link href="/manage" className="underline">Posts page</Link> and
        use Postmark.
      </p>

      <div className="mt-5">
        <label htmlFor="archive-note" className="block text-sm font-medium mb-1.5">
          A note on the cover letter <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
        </label>
        <textarea
          id="archive-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={max}
          rows={3}
          placeholder="e.g. I wrote these between fifteen and eighteen. I've left them exactly as they were."
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--border)",
            background: "var(--background)",
            color: "var(--foreground)",
            fontFamily: "var(--font-lora, Georgia, serif)",
            fontStyle: note ? "italic" : "normal",
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Signed with your name on every postmarked post. {note.length}/{max}
          </span>
          <button
            type="button"
            onClick={saveNote}
            disabled={busy !== null || note.trim() === savedNote.trim()}
            className="rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {busy === "note" ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>

      {(message || error) && (
        <p className="text-sm mt-3" role="status" style={{ color: error ? "var(--danger)" : "var(--muted)" }}>
          {error || message}
        </p>
      )}
    </section>
  );
}
