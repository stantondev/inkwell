"use client";

/**
 * "Your page as a website": downloads a .zip of the writer's page, plus a
 * page for every public entry, as plain files any static host can serve
 * (app/api/me/site-export).
 */

import { useState } from "react";

export function SiteExportCard() {
  const [state, setState] = useState<"idle" | "packing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setState("packing");
    setError(null);
    try {
      const res = await fetch("/api/me/site-export");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Couldn't pack your page right now. Try again in a minute.");
      }
      const blob = await res.blob();
      const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "inkwell-site.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't pack your page right now. Try again in a minute.");
      setState("idle");
    }
  }

  return (
    <section id="website" className="rounded-xl border p-6 mb-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
        Your page as a website
      </h2>
      <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        Download your page, and a page for every public entry and sticky, as plain HTML, CSS and pictures. Open it in any
        browser, or put the folder on Neocities, GitHub Pages or your own server. Your home is yours to take.
      </p>
      <button
        type="button"
        onClick={download}
        disabled={state === "packing"}
        className="rounded-full px-5 py-2 text-sm font-medium disabled:opacity-60"
        style={{ background: "var(--accent)", color: "var(--background)" }}
      >
        {state === "packing" ? "Packing your page…" : "Download as a website (.zip)"}
      </button>
      {state === "done" && (
        <p className="text-sm mt-3" role="status" style={{ color: "var(--muted)" }}>
          Downloaded. The README inside says how to put it online.
        </p>
      )}
      {error && (
        <p className="text-sm mt-3" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <p className="text-xs mt-4" style={{ color: "var(--muted)" }}>
        Only what visitors can see goes in. For a full backup of everything, including private entries, use the export below.
      </p>
    </section>
  );
}
