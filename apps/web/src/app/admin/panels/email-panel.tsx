"use client";

import { useEffect, useState } from "react";
import { getSite, siteUrl } from "@/lib/site";
import { dollars, foundingPriceNote, lastDayAtPrice, type FoundingStatus } from "@/lib/plus-pitch";

// Draft written for the founder to edit before sending. Plain text: blank
// lines separate paragraphs; https:// links become clickable. The numbers come
// from /api/transparency when the panel opens, so the draft never goes stale.
const DRAFT_SUBJECT = "A note from the person who runs Inkwell";

interface Books {
  monthly_cost_cents: number;
  monthly_revenue_cents: number;
  users: { total: number; active_writers_30d: number };
  founding: FoundingStatus & { raised_cents?: number };
}

function draftBody(books: Books | null): string {
  const site = siteUrl("");
  const numbers = books
    ? `Inkwell has grown to ${books.users.total.toLocaleString()} people, and ${books.users.active_writers_30d} of them wrote something this month, without any ads or marketing. It costs about ${dollars(books.monthly_cost_cents)} a month to run. Members cover ${dollars(books.monthly_revenue_cents)} of that each month${books.founding.raised_cents ? `, and Founding Members have paid ${dollars(books.founding.raised_cents)} once` : ""}. The rest comes out of my pocket. You can see the real numbers here: ${site}/transparency`
    : `Inkwell has grown without any ads or marketing, but it doesn't pay for itself yet. You can see the real numbers here: ${site}/transparency`;
  const priceNote = foundingPriceNote(books?.founding);
  const founding =
    books && books.founding.remaining > 0
      ? `• Become one of ${books.founding.cap} Founding Members — ${dollars(books.founding.price_cents)} once${priceNote ? ` (it goes up to ${dollars(books.founding.next_price_cents ?? 0)} after ${lastDayAtPrice(books.founding)})` : ""}, and you have Plus for as long as Inkwell runs, with a numbered badge on your profile.\n`
      : "";

  return `Hi,

I'm Stanton. I build and run Inkwell by myself, around a day job, and I wanted to write to you directly.

${numbers}

I don't want to add ads, sell your data, or chase engagement. If you'd like to help keep it going, here's how:

${founding}• Try Plus free for 14 days, no card needed. If it's worth it to you, keep it for $5 a month or $50 a year.
• Give once, any amount, with nothing to renew.
• Or tell one friend who'd like a quiet place to write. That helps just as much.

Everything is here: ${site}/settings/billing

Thank you for writing here. If there's something that would make Inkwell better for you, tell me on the roadmap: ${site}/roadmap

— Stanton`;
}

export default function EmailPanel() {
  // The draft is inkwell.social's founder letter; another server starts blank.
  const selfHosted = getSite().selfHosted;
  const [subject, setSubject] = useState(selfHosted ? "" : DRAFT_SUBJECT);
  const [body, setBody] = useState("");
  // Leave out people who already pay: this email asks for support.
  const [excludePaying, setExcludePaying] = useState(!selfHosted);

  useEffect(() => {
    if (selfHosted) return;
    let alive = true;
    fetch("/api/transparency")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setBody((b) => b || draftBody(d?.data ?? null)); })
      .catch(() => { if (alive) setBody((b) => b || draftBody(null)); });
    return () => { alive = false; };
  }, [selfHosted]);
  const [count, setCount] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [busy, setBusy] = useState<"" | "test" | "send">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/announcement?body=${encodeURIComponent(body)}&exclude_paying=${excludePaying}`);
        const data = await res.json();
        if (res.ok) {
          setCount(data.recipient_count);
          setPreviewHtml(data.preview_html);
        } else {
          setError(data.error || "Couldn't load recipients");
        }
      } catch {
        setError("Network error");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [body, excludePaying]);

  async function post(path: string, payload: object) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function sendTest() {
    setBusy("test"); setMessage(""); setError("");
    const { ok, data } = await post("/api/admin/announcement/test", { subject, body });
    if (ok) setMessage(data.note ? `${data.note}` : `Test sent to ${data.sent_to}. Check your inbox.`);
    else setError(data.error || "Test send failed");
    setBusy("");
  }

  async function sendAll() {
    if (count == null || confirmText.trim() !== String(count)) return;
    setBusy("send"); setMessage(""); setError("");
    const { ok, data } = await post("/api/admin/announcement/send", { subject, body, confirm_count: count, exclude_paying: excludePaying });
    if (ok) {
      setMessage(`Queued for ${data.queued} people. It goes out gradually over the next few minutes.`);
      setConfirmText("");
    } else {
      setError(data.error || "Send failed");
      if (typeof data.recipient_count === "number") setCount(data.recipient_count);
    }
    setBusy("");
  }

  const inputStyle = { borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        A one-off email from you to every account
        {count != null && <> — <strong style={{ color: "var(--foreground)" }}>{count} people</strong></>}.
        Skips blocked accounts, fediverse sign-ins without a real email, and anyone who unsubscribed.
        Every email has a one-click unsubscribe. Nobody gets the same subject twice.
      </p>
      {!selfHosted && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={excludePaying} onChange={(e) => setExcludePaying(e.target.checked)} />
          Leave out people who already pay (Founding Members, Plus, Ink Donors)
        </label>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150}
            className="rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>Message (plain text)</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={24} maxLength={10000}
            className="rounded-lg border px-3 py-2 text-sm font-mono leading-relaxed" style={inputStyle} />
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>Preview</p>
          <iframe title="Email preview" srcDoc={previewHtml} sandbox="" className="w-full rounded-lg border bg-white"
            style={{ borderColor: "var(--border)", minHeight: 620 }} />
        </div>
      </div>

      {message && <p className="text-sm rounded-lg p-3" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>{message}</p>}
      {error && <p className="text-sm rounded-lg p-3" style={{ color: "var(--danger)", border: "1px solid var(--danger)" }}>{error}</p>}

      <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={sendTest} disabled={!!busy}
            className="rounded-full px-5 py-2 text-sm font-medium border disabled:opacity-50"
            style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
            {busy === "test" ? "Sending test…" : "Send a test to me"}
          </button>
          <span className="text-xs" style={{ color: "var(--muted)" }}>Always send yourself a test first.</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
          <label className="text-sm">
            Type <strong>{count ?? "…"}</strong> to confirm sending to everyone:
          </label>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} inputMode="numeric"
            className="rounded-lg border px-3 py-1.5 text-sm w-24" style={inputStyle} />
          <button onClick={sendAll} disabled={!!busy || count == null || confirmText.trim() !== String(count)}
            className="rounded-full px-5 py-2 text-sm font-medium disabled:opacity-40"
            style={{ background: "var(--danger, #dc2626)", color: "#fff" }}>
            {busy === "send" ? "Queuing…" : `Send to ${count ?? "…"} people`}
          </button>
        </div>
      </div>
    </div>
  );
}
