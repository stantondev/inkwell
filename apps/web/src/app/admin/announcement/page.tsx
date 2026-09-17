"use client";

import { useEffect, useState } from "react";

// Draft written for the founder to edit before sending. Plain text: blank
// lines separate paragraphs; https:// links become clickable.
const DRAFT_SUBJECT = "A note from the person who runs Inkwell";
const DRAFT_BODY = `Hi,

I'm Stanton. I build and run Inkwell by myself, around a day job, and I wanted to write to you directly.

Inkwell has grown to more than 200 people without any ads or marketing — just people finding it and telling friends. That still amazes me. But it doesn't pay for itself yet. It costs about $67 a month to run, and right now members cover almost none of that. You can see the real numbers here: https://inkwell.social/transparency

I don't want to add ads, sell your data, or chase engagement. So I'm asking the people who write here to help keep it going, in whatever way works for you:

• Become one of 50 Founding Members — $99 once, and you have Plus for as long as Inkwell runs, with a numbered badge on your profile.
• Try Plus free for 14 days, no card needed. If it's worth it to you, keep it for $5 a month or $50 a year.
• Become an Ink Donor for $1–$3 a month.
• Or tell one friend who misses LiveJournal. That helps just as much.

Everything is here: https://inkwell.social/settings/billing

I've also just fixed a few things. If signing up crashed on you, especially if your browser translates pages, that's fixed now. Images in posts show up properly on Mastodon again, too.

Thank you for writing here. If there's something that would make Inkwell better for you, tell me on the roadmap: https://inkwell.social/roadmap

— Stanton`;

export default function AnnouncementPage() {
  const [subject, setSubject] = useState(DRAFT_SUBJECT);
  const [body, setBody] = useState(DRAFT_BODY);
  const [count, setCount] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [busy, setBusy] = useState<"" | "test" | "send">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/announcement?body=${encodeURIComponent(body)}`);
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
  }, [body]);

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
    const { ok, data } = await post("/api/admin/announcement/send", { subject, body, confirm_count: count });
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
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>Email everyone</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          A one-off email from you to every account
          {count != null && <> — <strong style={{ color: "var(--foreground)" }}>{count} people</strong></>}.
          Skips blocked accounts, fediverse sign-ins without a real email, and anyone who unsubscribed.
          Every email has a one-click unsubscribe. Nobody gets the same subject twice.
        </p>
      </div>

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
