"use client";

import { useRouter } from "next/navigation";
import { openJotWithText } from "@/lib/stickies";

export function ShareChooser({ title, text, url }: { title: string; text: string; url: string }) {
  const router = useRouter();
  const nothing = !title && !text && !url;
  let host = "";
  try { host = url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch { /* no host */ }

  function jot() {
    openJotWithText([title, text, url].filter(Boolean).join("\n\n"));
  }

  function write() {
    const qs = new URLSearchParams();
    if (title) qs.set("shared_title", title);
    if (text) qs.set("shared_text", text);
    if (url) qs.set("shared_url", url);
    router.push(`/editor?${qs}`);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
        Share to Inkwell
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Jot it down as a sticky, or start a journal entry with it.
      </p>

      {nothing ? (
        <p className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          Nothing came through with the share. Try sharing again from the other app.
        </p>
      ) : (
        <div className="rounded-xl border p-4 mb-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          {title && <p className="font-semibold mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>{title}</p>}
          {text && <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</p>}
          {url && (
            <p className="text-sm mt-2 [overflow-wrap:anywhere]" style={{ color: "var(--accent)" }}>
              {host || url}
            </p>
          )}
        </div>
      )}

      {!nothing && (
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={jot}
            className="flex-1 rounded-full px-5 py-3 text-sm font-medium border"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
          >
            Jot a sticky
          </button>
          <button
            type="button"
            onClick={write}
            className="flex-1 rounded-full px-5 py-3 text-sm font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Start an entry
          </button>
        </div>
      )}
    </div>
  );
}
