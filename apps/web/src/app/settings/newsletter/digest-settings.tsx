"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

export type NewsletterMode = "each" | "weekly" | "count";

export interface DigestStatus {
  queued: { id: string; title: string | null; slug: string | null; published_at: string | null; queued_at: string }[];
  next_send_at: string | null;
  posts_needed: number | null;
  last_sent_at: string | null;
  can_send_now: boolean;
}

export interface DigestForm {
  mode: NewsletterMode;
  day: number;
  hour: number;
  timezone: string;
  count: number;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function hourLabel(h: number) {
  const suffix = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${suffix}`;
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC";
  } catch {
    return "Etc/UTC";
  }
}

function timeZones(current: string) {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  return Array.from(new Set([current, browserTimeZone(), "Etc/UTC", ...zones])).filter(Boolean);
}

// Dates are shown after mount so the server and the first render agree.
function useNiceDate() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (iso: string | null, withTime = true) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (!ready) return d.toISOString().slice(0, 10);
    return d.toLocaleString(undefined, withTime
      ? { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { month: "long", day: "numeric" });
  };
}

export function DigestSettings({
  form,
  onChange,
  status,
  savedMode,
  username,
  onStatus,
}: {
  form: DigestForm;
  onChange: (form: DigestForm) => void;
  status: DigestStatus | null;
  /** The mode on the server, which decides what the queue means right now. */
  savedMode: NewsletterMode;
  username: string;
  onStatus: (status: DigestStatus) => void;
}) {
  const nice = useNiceDate();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const zones = useMemo(() => timeZones(form.timezone), [form.timezone]);

  const pickMode = (mode: NewsletterMode) => {
    // First time on a weekly digest: default to the writer's own time zone.
    const timezone = mode === "weekly" && form.timezone === "Etc/UTC" ? browserTimeZone() : form.timezone;
    onChange({ ...form, mode, timezone });
  };

  const remove = async (id: string) => {
    setBusy(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/newsletter/digest/entries/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) onStatus(data.data);
      else setMessage({ text: data.error || "Couldn't take that post out.", tone: "error" });
    } catch {
      setMessage({ text: "Couldn't take that post out.", tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const sendNow = async () => {
    if (!status || !window.confirm(`Email ${status.queued.length === 1 ? "this post" : `these ${status.queued.length} posts`} to your subscribers now?`)) return;
    setBusy("send");
    setMessage(null);
    try {
      const res = await fetch("/api/newsletter/digest/send", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onStatus(data.digest);
        setMessage({ text: "On its way. It'll show in your send history in a minute.", tone: "ok" });
      } else {
        setMessage({ text: data.error || "Couldn't send it.", tone: "error" });
      }
    } catch {
      setMessage({ text: "Couldn't send it.", tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const options: { mode: NewsletterMode; title: string; blurb: string }[] = [
    { mode: "each", title: "One email per post", blurb: "Each post you mark goes out when you publish it." },
    { mode: "weekly", title: "A weekly digest", blurb: "Posts you mark are gathered and sent together once a week." },
    { mode: "count", title: "Every few posts", blurb: "Posts you mark are sent together once enough are waiting." },
  ];

  const queued = status?.queued ?? [];

  return (
    <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
        How posts go out
      </h3>
      <p className="text-sm mt-1 mb-4" style={{ color: "var(--muted)" }}>
        You still choose which posts to email, with the newsletter box in the editor. This decides when they&apos;re sent.
      </p>

      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="How posts go out">
        {options.map((o) => {
          const on = form.mode === o.mode;
          return (
            <button
              key={o.mode}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pickMode(o.mode)}
              className="rounded-lg border p-3 text-left transition-colors"
              style={{
                borderColor: on ? "var(--accent)" : "var(--border)",
                background: on ? "var(--accent-light, var(--background))" : "var(--background)",
                boxShadow: on ? "0 0 0 1px var(--accent)" : "none",
              }}
            >
              <span className="block text-sm font-medium" style={{ color: "var(--foreground)" }}>{o.title}</span>
              <span className="block text-xs mt-1" style={{ color: "var(--muted)" }}>{o.blurb}</span>
            </button>
          );
        })}
      </div>

      {form.mode === "weekly" && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span>Send on</span>
          <select
            aria-label="Day"
            value={form.day}
            onChange={(e) => onChange({ ...form, day: Number(e.target.value) })}
            className="rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          >
            {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}s</option>)}
          </select>
          <span>at</span>
          <select
            aria-label="Time"
            value={form.hour}
            onChange={(e) => onChange({ ...form, hour: Number(e.target.value) })}
            className="rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          >
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
          <select
            aria-label="Time zone"
            value={form.timezone}
            onChange={(e) => onChange({ ...form, timezone: e.target.value })}
            className="rounded-lg border px-2 py-1.5 text-sm max-w-full"
            style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          >
            {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
        </div>
      )}

      {form.mode === "count" && (
        <div className="mt-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span>Send once</span>
            <select
              aria-label="Number of posts"
              value={form.count}
              onChange={(e) => onChange({ ...form, count: Number(e.target.value) })}
              className="rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
            >
              {Array.from({ length: 8 }, (_, i) => i + 3).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>posts are waiting</span>
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            A post never waits more than 30 days: if you stop short, what&apos;s waiting goes out then. At most one of these every three days.
          </p>
        </div>
      )}

      {form.mode !== "each" && (
        <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
          Each digest shows every post&apos;s title, picture and opening lines, with a link to read the rest. Digests don&apos;t count toward your monthly sends.
        </p>
      )}

      {form.mode === "each" && savedMode !== "each" && queued.length > 0 && (
        <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
          The {queued.length === 1 ? "post" : `${queued.length} posts`} already waiting will go out together within the hour after you save.
        </p>
      )}

      {(savedMode !== "each" || queued.length > 0) && (
        <div className="mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-medium">Waiting for the next digest</h4>
            {queued.length > 0 && status?.next_send_at && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {savedMode === "weekly" && <>Goes out {nice(status.next_send_at)}</>}
                {savedMode === "count" && (
                  <>
                    {status.posts_needed
                      ? `${status.posts_needed} more ${status.posts_needed === 1 ? "post" : "posts"}, or by ${nice(status.next_send_at, false)}`
                      : `Goes out soon (by ${nice(status.next_send_at, false)} at the latest)`}
                  </>
                )}
              </span>
            )}
          </div>

          {queued.length === 0 ? (
            <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
              Nothing yet. Tick &ldquo;Add to my next digest&rdquo; in the editor when you publish.
            </p>
          ) : (
            <ul className="mt-2 divide-y" style={{ borderColor: "var(--border)" }}>
              {queued.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                  <div className="min-w-0">
                    {e.slug && username ? (
                      <Link href={`/${username}/${e.slug}`} className="font-medium truncate block hover:underline">
                        {e.title || "Untitled entry"}
                      </Link>
                    ) : (
                      <span className="font-medium truncate block">{e.title || "Untitled entry"}</span>
                    )}
                    <span className="text-xs" style={{ color: "var(--muted)" }}>Published {nice(e.published_at, false)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(e.id)}
                    disabled={busy !== null}
                    className="shrink-0 text-xs font-medium disabled:opacity-50"
                    style={{ color: "var(--muted)" }}
                    aria-label={`Don't email ${e.title || "this post"}`}
                  >
                    {busy === e.id ? "Removing…" : "Don’t email"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {queued.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={sendNow}
                disabled={busy !== null || !status?.can_send_now}
                className="rounded-full border px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              >
                {busy === "send" ? "Sending…" : "Send now"}
              </button>
              {!status?.can_send_now && (
                <span className="text-xs" style={{ color: "var(--muted)" }}>A digest already went out today.</span>
              )}
            </div>
          )}

          {status?.last_sent_at && (
            <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
              Last digest: {nice(status.last_sent_at, false)} · <Link href="/settings/newsletter/sends" style={{ color: "var(--accent)" }}>Send history</Link>
            </p>
          )}
        </div>
      )}

      {message && (
        <p className="text-sm mt-3" role="status" style={{ color: message.tone === "ok" ? "var(--accent)" : "var(--danger)" }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
