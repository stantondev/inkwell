"use client";

import { useCallback, useEffect, useState } from "react";

interface ModAction {
  id: string;
  action: "block" | "limit" | "hide_entry" | "clear";
  automated: boolean;
  score: number | null;
  reasons: string[];
  hidden_entry_count: number;
  inserted_at: string;
  reversed_at: string | null;
  note: boolean;
  user: { id: string; username: string; display_name: string | null; email_domain: string | null; joined: string; blocked: boolean; limited: boolean };
}

interface CheckResult {
  username: string;
  decision: string;
  score: number;
  reasons: string[];
  blocked: boolean;
  limited: boolean;
}

const FILTERS = [
  { id: "active", label: "In effect" },
  { id: "notes", label: "Flagged, not acted on" },
  { id: "all", label: "Everything" },
];

function utc(iso: string) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
}

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - utc(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const LABEL: Record<string, string> = { block: "Blocked", limit: "Limited", hide_entry: "Post hidden", clear: "Cleared" };

export default function ModerationPage() {
  const [filter, setFilter] = useState("active");
  const [rows, setRows] = useState<ModAction[]>([]);
  const [mode, setMode] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [checkName, setCheckName] = useState("");
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [scanMsg, setScanMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/moderation?filter=${filter}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load");
      setRows(data.data);
      setMode(data.mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function undo(row: ModAction) {
    const what = row.action === "block" ? `unblock @${row.user.username} and restore ${row.hidden_entry_count} post(s)` : `undo this for @${row.user.username}`;
    if (!confirm(`This will ${what}. The account won't be flagged again unless someone reports it. Continue?`)) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/moderation/${row.id}/undo`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Undo failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Undo failed");
    } finally {
      setBusyId("");
    }
  }

  async function runCheck(e: React.FormEvent) {
    e.preventDefault();
    setCheck(null);
    const res = await fetch(`/api/admin/moderation/check?username=${encodeURIComponent(checkName.replace(/^@/, ""))}`);
    const data = await res.json();
    if (res.ok) setCheck(data);
    else setError(data.error || "Check failed");
  }

  async function scanNow() {
    setScanMsg("Scanning…");
    const res = await fetch(`/api/admin/moderation/scan`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setScanMsg(data.error || "Scan failed"); return; }
    setScanMsg(`Scanned ${data.scanned} accounts: ${data.blocked.length} blocked, ${data.limited.length} limited, ${data.review.length} flagged for review${data.mode === "dry_run" ? " (dry run — nothing changed)" : ""}.`);
    load();
  }

  const card = { borderColor: "var(--border)", background: "var(--surface)" };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>Moderation</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Spam is checked automatically every hour, whenever a new account posts, and whenever someone files a report.
          Obvious spam is blocked and its posts hidden; borderline accounts are kept out of Explore. Rule-based — no AI.
          Paying members and established writers are never blocked automatically; they show up under &ldquo;Flagged, not acted on&rdquo;.
          {mode === "dry_run" && <strong style={{ color: "var(--danger)" }}> Currently in dry-run mode: nothing is being changed.</strong>}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={runCheck} className="rounded-xl border p-4 flex flex-col gap-2" style={card}>
          <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>Check an account</label>
          <div className="flex gap-2">
            <input value={checkName} onChange={(e) => setCheckName(e.target.value)} placeholder="username"
              className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }} />
            <button className="rounded-full px-4 py-1.5 text-sm font-medium" style={{ background: "var(--accent)", color: "#fff" }}>Check</button>
          </div>
          {check && (
            <div className="text-sm">
              <p><strong>@{check.username}</strong>: score {check.score} → <strong>{check.decision}</strong>{check.blocked && " (already blocked)"}{check.limited && " (limited)"}</p>
              <ul className="mt-1 text-xs list-disc pl-5" style={{ color: "var(--muted)" }}>
                {check.reasons.length ? check.reasons.map((r) => <li key={r}>{r}</li>) : <li>No spam signals</li>}
              </ul>
            </div>
          )}
        </form>
        <div className="rounded-xl border p-4 flex flex-col gap-2" style={card}>
          <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>Run the hourly scan now</label>
          <button onClick={scanNow} className="self-start rounded-full px-4 py-1.5 text-sm font-medium border" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>Scan recent accounts</button>
          {scanMsg && <p className="text-sm" style={{ color: "var(--muted)" }}>{scanMsg}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className="rounded-full px-3 py-1 text-sm border"
            style={{ borderColor: filter === f.id ? "var(--accent)" : "var(--border)", color: filter === f.id ? "var(--accent)" : "var(--muted)" }}>
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Nothing here.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border p-4" style={card}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: r.note ? "var(--surface-hover, var(--border))" : r.action === "block" ? "var(--danger, #dc2626)" : "var(--accent)", color: r.note ? "var(--foreground)" : "#fff" }}>
                    {r.note ? "Flagged" : LABEL[r.action] ?? r.action}{r.reversed_at && !r.note ? " · undone" : ""}
                  </span>
                  <a href={`/admin/users?q=${encodeURIComponent(r.user.username)}`} className="font-medium hover:underline">@{r.user.username}</a>
                  {r.score != null && <span style={{ color: "var(--muted)" }}>score {r.score}</span>}
                  <span style={{ color: "var(--muted)" }}>· {r.user.email_domain} · joined {ago(r.user.joined)} · {ago(r.inserted_at)}</span>
                </div>
                {!r.reversed_at && r.action !== "clear" && (
                  <button onClick={() => undo(r)} disabled={busyId === r.id}
                    className="rounded-full px-3 py-1 text-xs font-medium border disabled:opacity-50"
                    style={{ borderColor: "var(--border)" }}>
                    {busyId === r.id ? "Undoing…" : r.action === "block" ? "Undo — not spam" : "Undo"}
                  </button>
                )}
              </div>
              <ul className="mt-2 text-xs list-disc pl-5 flex flex-col gap-0.5" style={{ color: "var(--muted)" }}>
                {r.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
