"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { timeAgo, type WebhookDelivery } from "./billing-shared";
import { BillingTroubleshooting } from "./billing-troubleshooting";

// Admin → Billing. One status line, then who has Plus and why. The repair
// tools from the April 2026 Square migration live in a collapsed
// "Troubleshooting" section at the bottom.

interface Member {
  id: string;
  username: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  kind: string;
  label: string;
  detail: string;
  donor: string | null;
  attention: boolean;
}

interface Problem {
  kind: string;
  message: string;
  usernames: string[];
}

interface PlanCheck {
  label: string;
  id: string | null;
  pricing: string | null;
  ok: boolean;
  note: string | null;
}

interface CheckoutFunnel {
  days: number;
  people: number;
  attempts: number;
  completed: number;
  stalled: boolean;
}

interface Overview {
  status: "ok" | "attention";
  problems: Problem[];
  counts: { plus: number; paying: number; founding: number; trial: number; granted: number; donors: number };
  last_webhook_at: string | null;
  plans: PlanCheck[];
  checkouts: CheckoutFunnel;
  members: Member[];
  recent_webhooks: WebhookDelivery[];
}

const KIND_COLOR: Record<string, string> = {
  founding: "#b45309",
  square: "var(--success, #16a34a)",
  canceling: "var(--muted)",
  trial: "var(--accent)",
  granted: "var(--accent)",
  donor: "var(--accent)",
};

export default function AdminBillingPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/billing-overview", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `Couldn't load billing (HTTP ${res.status})`);
        return;
      }
      setData(json);
      setError(null);
    } catch {
      setError("Couldn't load billing");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="admin-card text-sm" style={{ color: "var(--danger, #dc2626)" }}>
        {error}{" "}
        <button onClick={load} className="underline">
          Try again
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="admin-card text-sm" style={{ color: "var(--muted)" }}>
        Checking billing with Square…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StatusCard data={data} onChanged={load} />
      <CanPeoplePayCard plans={data.plans} checkouts={data.checkouts} />
      <MembersCard members={data.members} onChanged={load} />
      <GivePlusCard onChanged={load} />

      <details className="admin-card">
        <summary className="cursor-pointer text-sm font-medium" style={{ color: "var(--foreground)" }}>
          Troubleshooting
          <span className="font-normal" style={{ color: "var(--muted)" }}>
            {" "}
            — look up someone&apos;s Square payments, recheck everyone, webhook log
          </span>
        </summary>
        <div className="mt-4">
          <BillingTroubleshooting recent={data.recent_webhooks} onChanged={load} />
        </div>
      </details>
    </div>
  );
}

function CanPeoplePayCard({ plans, checkouts }: { plans: PlanCheck[]; checkouts: CheckoutFunnel }) {
  const broken = plans.filter((p) => !p.ok);

  return (
    <div className="admin-card">
      <h2 className="admin-card-header">Can people pay?</h2>
      <p className="text-sm" style={{ color: "var(--muted)", marginTop: -4 }}>
        Square&apos;s checkout silently refuses to finish a plan priced RELATIVE. That broke every
        Plus and Ink Donor signup from April to September 2026, so each plan is checked here.
      </p>

      <ul className="mt-3 space-y-1">
        {plans.map((p) => (
          <li key={p.label} className="text-sm flex items-baseline gap-2">
            <span style={{ color: p.ok ? "var(--success, #16a34a)" : "#b45309" }}>{p.ok ? "✓" : "⚠"}</span>
            <span style={{ minWidth: 110 }}>{p.label}</span>
            <span style={{ color: "var(--muted)" }}>
              {p.pricing ? p.pricing.toLowerCase() : "—"}
              {p.note ? ` · ${p.note}` : ""}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-sm" style={{ color: checkouts.stalled ? "#b45309" : "var(--muted)" }}>
        Last {checkouts.days} days: {checkouts.people === 0
          ? "nobody opened a Plus or Ink Donor checkout."
          : `${checkouts.people} ${checkouts.people === 1 ? "person" : "people"} opened a checkout, ${checkouts.completed} subscribed.`}
        {checkouts.stalled ? " Nobody completed — try a checkout yourself." : ""}
      </p>

      {broken.length > 0 && (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Fix: create a STATIC-priced plan variation in Square and point the matching
          SQUARE_*_PLAN_VARIATION_ID secret at it. Square won&apos;t let an existing plan&apos;s
          pricing be edited.
        </p>
      )}
    </div>
  );
}

function StatusCard({ data, onChanged }: { data: Overview; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const c = data.counts;

  const parts = [
    `${c.plus} with Plus`,
    c.paying ? `${c.paying} paying` : null,
    c.founding ? `${c.founding} Founding` : null,
    c.trial ? `${c.trial} on trial` : null,
    c.granted ? `${c.granted} given Plus` : null,
    c.donors ? `${c.donors} donating` : null,
  ].filter(Boolean);

  async function markFree() {
    if (!confirm("Mark these accounts as free? Their Plus time has already run out.")) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/run-grace-expiration", { method: "POST", cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.result) {
        const done = json.result.downgraded.length;
        const kept = json.result.candidates.length - done;
        setNote(kept > 0 ? `Marked ${done} as free. ${kept} still have a Square subscription Square hasn't confirmed ended.` : `Marked ${done} as free.`);
        onChanged();
      } else {
        setNote(json.error || "That didn't work");
      }
    } catch {
      setNote("Network error");
    } finally {
      setBusy(false);
    }
  }

  const ok = data.status === "ok";

  return (
    <div
      className="admin-card"
      style={
        ok
          ? undefined
          : {
              background: "color-mix(in srgb, #f59e0b 8%, var(--surface))",
              borderColor: "color-mix(in srgb, #f59e0b 40%, var(--border))",
            }
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="admin-card-header" style={{ marginBottom: 4 }}>
            {ok ? "✓ Billing looks good" : "Billing needs a look"}
          </h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {parts.join(" · ")}
            {" · "}last Square event {timeAgo(data.last_webhook_at)}
          </p>
        </div>
        <button onClick={onChanged} className="text-xs underline opacity-70 hover:opacity-100 shrink-0">
          refresh
        </button>
      </div>

      {!ok && (
        <ul className="mt-3 space-y-2">
          {data.problems.map((p) => (
            <li key={p.kind} className="text-sm flex items-start justify-between gap-3">
              <span>
                <span style={{ color: "#b45309" }}>⚠</span> {p.message}
                {p.usernames.length > 0 && (
                  <span style={{ color: "var(--muted)" }}> ({p.usernames.map((u) => `@${u}`).join(", ")})</span>
                )}
              </span>
              {p.kind === "expired" && (
                <button
                  onClick={markFree}
                  disabled={busy}
                  className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap shrink-0"
                  style={{ background: "var(--accent)", color: "white", opacity: busy ? 0.6 : 1 }}
                >
                  {busy ? "Working…" : "Mark as free"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {note && (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          {note}
        </p>
      )}
    </div>
  );
}

function MembersCard({ members, onChanged }: { members: Member[]; onChanged: () => void }) {
  return (
    <div className="admin-card">
      <h2 className="admin-card-header">Who has Plus</h2>
      {members.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Nobody yet.
        </p>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {members.map((m) => (
            <MemberRow key={m.id} m={m} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberRow({ m, onChanged }: { m: Member; onChanged: () => void }) {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const color = m.attention ? "#b45309" : KIND_COLOR[m.kind] || "var(--foreground)";
  const checkable = !["founding", "donor"].includes(m.kind);

  async function check() {
    setChecking(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/sync-user-by-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: m.email }),
        cache: "no-store",
      });
      const json = await res.json();
      if (json.ok) {
        setNote(json.changes?.length ? `Updated: ${json.changes.join(", ")}` : "Matches Square");
        if (json.changes?.length) onChanged();
      } else {
        setNote(json.error || "Couldn't check");
      }
    } catch {
      setNote("Network error");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderColor: "var(--border)" }}>
      <Link href={`/${m.username}`} className="shrink-0">
        <Avatar url={m.avatar_url} name={m.display_name || m.username} size={32} />
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={`/${m.username}`} className="text-sm font-medium hover:underline">
          {m.display_name || m.username}
        </Link>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {" "}
          @{m.username}
        </span>
        <div className="text-xs truncate" style={{ color: "var(--muted)" }}>
          {m.detail}
          {m.donor ? ` · ${m.donor}` : ""}
          {note ? ` · ${note}` : ""}
        </div>
      </div>
      <span
        className="text-xs font-medium whitespace-nowrap shrink-0 px-2 py-0.5 rounded-full"
        style={{ color, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)` }}
      >
        {m.label}
      </span>
      {checkable && (
        <button
          onClick={check}
          disabled={checking}
          className="text-xs underline opacity-70 hover:opacity-100 shrink-0 hidden sm:inline"
          title="Ask Square for this member's current subscription and fix our record if it's off"
        >
          {checking ? "Checking…" : "Check with Square"}
        </button>
      )}
    </div>
  );
}

function GivePlusCard({ onChanged }: { onChanged: () => void }) {
  const [who, setWho] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function give(e: React.FormEvent) {
    e.preventDefault();
    const id = who.trim().replace(/^@+/, "");
    if (!id || !until) return;
    const isEmail = /.+@.+\..+/.test(id);
    if (!confirm(`Give ${isEmail ? id : "@" + id} Plus through ${until}? It ends on its own after that date.`)) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/grant-plus-until", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [isEmail ? "email" : "username"]: id, expires_at: `${until}T23:59:59Z` }),
        cache: "no-store",
      });
      const json = await res.json();
      if (json.ok) {
        setNote({ ok: true, text: `Gave @${json.user.username} Plus through ${until}.` });
        setWho("");
        setUntil("");
        onChanged();
      } else {
        setNote({ ok: false, text: json.error || "That didn't work" });
      }
    } catch {
      setNote({ ok: false, text: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  const input = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--foreground)",
  };

  return (
    <div className="admin-card">
      <h2 className="admin-card-header" style={{ marginBottom: 4 }}>
        Give someone Plus
      </h2>
      <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
        For gifts, comps, or making up for a billing problem. Plus ends on its own after the date.
      </p>
      <form onSubmit={give} className="flex flex-col sm:flex-row gap-2">
        <input
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder="@username or email"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          required
          className="flex-1 px-2 py-1.5 rounded text-sm"
          style={input}
        />
        <input
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          required
          className="px-2 py-1.5 rounded text-sm"
          style={input}
        />
        <button
          type="submit"
          disabled={busy || !who.trim() || !until}
          className="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap"
          style={{ background: "var(--accent)", color: "white", opacity: busy || !who.trim() || !until ? 0.5 : 1 }}
        >
          {busy ? "Giving…" : "Give Plus"}
        </button>
      </form>
      {note && (
        <p className="mt-2 text-xs" style={{ color: note.ok ? "var(--success, #16a34a)" : "var(--danger, #dc2626)" }}>
          {note.text}
        </p>
      )}
    </div>
  );
}
