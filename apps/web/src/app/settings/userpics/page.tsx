"use client";

import { useEffect, useRef, useState } from "react";
import { prepareUserpic, type Userpic } from "@/lib/userpics";

export default function UserpicsPage() {
  const [pics, setPics] = useState<Userpic[] | null>(null);
  const [limit, setLimit] = useState(10);
  const [loadError, setLoadError] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; keyword: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me/icons");
        if (!res.ok) throw new Error();
        const body = await res.json();
        setPics(body.data ?? []);
        setLimit(body.meta?.limit ?? 10);
      } catch {
        setLoadError(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !keyword.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await prepareUserpic(file);
      const res = await fetch("/api/me/icons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, keyword: keyword.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't upload.");
      setPics((p) => [...(p ?? []), body.data]);
      setKeyword("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't upload.");
    } finally {
      setBusy(false);
    }
  }

  async function rename(id: string, next: string) {
    const trimmed = next.trim();
    const current = pics?.find((p) => p.id === id);
    setEditing(null);
    if (!trimmed || !current || trimmed === current.keyword) return;
    setError(null);
    const res = await fetch(`/api/me/icons/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: trimmed }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || "That didn't save."); return; }
    setPics((p) => (p ?? []).map((x) => (x.id === id ? body.data : x)));
  }

  async function remove(pic: Userpic) {
    if (!confirm(`Delete “${pic.keyword}”? Entries and comments that used it will show your avatar instead.`)) return;
    setError(null);
    const res = await fetch(`/api/me/icons/${pic.id}`, { method: "DELETE" });
    if (!res.ok) { setError("That didn't delete. Try again."); return; }
    setPics((p) => (p ?? []).filter((x) => x.id !== pic.id));
  }

  if (loadError) {
    return <p className="text-sm" style={{ color: "var(--danger)" }}>Couldn&rsquo;t load your userpics. Refresh to try again.</p>;
  }
  if (!pics) return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>;

  const full = pics.length >= limit;

  return (
    <div className="space-y-6">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Like LiveJournal: keep a set of pictures, each with a keyword, and choose one for each entry
        and comment. Your avatar stays the default. Animated GIFs keep moving.
      </p>

      <form onSubmit={add} className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Add a userpic</h2>
          <span className="text-xs" style={{ color: "var(--muted)" }}>{pics.length} of {limit}</span>
        </div>
        {full ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            You have {limit} userpics, the most your plan allows. Delete one to add another
            {limit < 50 && <>, or <a href="/settings/billing" className="underline">upgrade to Plus</a> for 50</>}.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="userpic-slot" aria-label={file ? "Change picture" : "Choose a picture"}>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" />
              ) : (
                <span aria-hidden="true">+</span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div className="flex-1 min-w-[12rem] space-y-2">
              <input type="text" value={keyword} maxLength={50} onChange={(e) => setKeyword(e.target.value)}
                placeholder="Keyword, like “coffee” or “rainy day”"
                aria-label="Keyword"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }} />
              <button type="submit" disabled={!file || !keyword.trim() || busy}
                className="rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "var(--surface)" }}>
                {busy ? "Uploading…" : "Add userpic"}
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
      </form>

      {pics.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>No userpics yet. Your avatar is used everywhere until you add some.</p>
      ) : (
        <ul className="userpic-grid">
          {pics.map((pic) => (
            <li key={pic.id} className="userpic-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pic.url} alt={pic.keyword} width={100} height={100} />
              {editing?.id === pic.id ? (
                <input autoFocus value={editing.keyword} maxLength={50}
                  aria-label={`New keyword for ${pic.keyword}`}
                  onChange={(e) => setEditing({ id: pic.id, keyword: e.target.value })}
                  onBlur={() => rename(pic.id, editing.keyword)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename(pic.id, editing.keyword);
                    if (e.key === "Escape") setEditing(null);
                  }}
                  className="w-full rounded border px-1 text-xs text-center"
                  style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }} />
              ) : (
                <button type="button" className="userpic-keyword" title="Rename"
                  onClick={() => setEditing({ id: pic.id, keyword: pic.keyword })}>{pic.keyword}</button>
              )}
              <button type="button" className="userpic-delete" onClick={() => remove(pic)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
