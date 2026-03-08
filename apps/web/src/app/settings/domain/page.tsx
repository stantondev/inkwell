"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface DomainData {
  id: string;
  domain: string;
  status: string;
  dns_verified_at: string | null;
  cert_issued_at: string | null;
  last_check_at: string | null;
  error_message: string | null;
  created_at: string;
}

type SessionUser = {
  subscription_tier?: string;
};

export default function CustomDomainSettingsPage() {
  const [domain, setDomain] = useState<DomainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDomain = useCallback(async () => {
    try {
      const res = await fetch("/api/custom-domain");
      if (res.ok) {
        const data = await res.json();
        setDomain(data.data ?? null);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.data ?? data);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchDomain(), fetchUser()]).finally(() => setLoading(false));
  }, [fetchDomain, fetchUser]);

  // Auto-poll while pending
  useEffect(() => {
    if (domain?.status === "pending_dns" || domain?.status === "pending_cert") {
      pollRef.current = setInterval(fetchDomain, 10_000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
    if (pollRef.current) clearInterval(pollRef.current);
  }, [domain?.status, fetchDomain]);

  const handleConnect = async () => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/custom-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.errors?.domain?.[0] || "Failed to connect domain");
      } else {
        setDomain(data.data);
        setInput("");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      await fetch("/api/custom-domain/check", { method: "POST" });
      await fetchDomain();
    } catch {
      // silent
    } finally {
      setChecking(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm("Remove your custom domain? Your profile will only be accessible at inkwell.social.")) return;
    setRemoving(true);
    try {
      await fetch("/api/custom-domain", { method: "DELETE" });
      setDomain(null);
    } catch {
      // silent
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl lg:max-w-5xl mx-auto py-10 px-4">
        <h1
          className="text-xl font-bold mb-6"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Custom Domain
        </h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading...</p>
      </div>
    );
  }

  const isPlus = (user?.subscription_tier ?? "free") === "plus";

  // Not Plus — show upgrade prompt
  if (!isPlus) {
    return (
      <div className="max-w-2xl lg:max-w-5xl mx-auto py-10 px-4">
        <h1
          className="text-xl font-bold mb-6"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Custom Domain
        </h1>
        <div
          className="rounded-xl border p-6"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
            Custom domains let you serve your Inkwell profile at your own domain
            (e.g., <strong>yourname.com</strong>). This is a Plus feature.
          </p>
          <a
            href="/settings/billing"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)", color: "white" }}
          >
            Upgrade to Plus
          </a>
        </div>
      </div>
    );
  }

  // No domain configured
  if (!domain || domain.status === "removed") {
    return (
      <div className="max-w-2xl lg:max-w-5xl mx-auto py-10 px-4">
        <h1
          className="text-xl font-bold mb-6"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Custom Domain
        </h1>
        <div
          className="rounded-xl border p-6"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
            Point your own domain at Inkwell so readers can visit your profile at
            a custom URL like <strong>yourname.com</strong>. We&apos;ll handle the SSL
            certificate automatically.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="blog.example.com"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
              onKeyDown={(e) => { if (e.key === "Enter") handleConnect(); }}
            />
            <button
              onClick={handleConnect}
              disabled={saving || !input.trim()}
              className="rounded-full px-5 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {saving ? "Connecting..." : "Connect Domain"}
            </button>
          </div>
          {error && (
            <p className="text-sm mt-3" style={{ color: "var(--danger, #dc2626)" }}>{error}</p>
          )}
        </div>
      </div>
    );
  }

  // Domain configured — show status
  const isApex = !domain.domain.includes(".") || domain.domain.split(".").length === 2;

  return (
    <div className="max-w-2xl lg:max-w-5xl mx-auto py-10 px-4">
      <h1
        className="text-xl font-bold mb-6"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Custom Domain
      </h1>

      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {/* Domain + status */}
        <div className="flex items-center gap-3 mb-4">
          <StatusDot status={domain.status} />
          <span className="text-sm font-medium">{domain.domain}</span>
          <StatusLabel status={domain.status} />
        </div>

        {/* pending_dns — DNS instructions */}
        {domain.status === "pending_dns" && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Configure your DNS records to point to Inkwell. Changes can take up to 48 hours to propagate.
            </p>

            {isApex ? (
              <DnsInstructionsApex domain={domain.domain} />
            ) : (
              <DnsInstructionsSubdomain domain={domain.domain} />
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleCheck}
                disabled={checking}
                className="rounded-full px-4 py-2 text-sm font-medium border transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              >
                {checking ? "Checking..." : "Check DNS"}
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="text-sm hover:underline"
                style={{ color: "var(--muted)" }}
              >
                Remove
              </button>
            </div>

            {domain.error_message && (
              <p className="text-sm" style={{ color: "var(--danger, #dc2626)" }}>
                {domain.error_message}
              </p>
            )}
          </div>
        )}

        {/* pending_cert — Certificate being issued */}
        {domain.status === "pending_cert" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: "var(--accent)" }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-sm" style={{ color: "var(--accent)" }}>DNS verified</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" className="animate-spin"
                style={{ color: "var(--muted)" }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"
                  fill="none" strokeDasharray="40" strokeDashoffset="10" />
              </svg>
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                SSL certificate being issued... This usually takes 1&ndash;5 minutes.
              </span>
            </div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              If this takes longer than 10 minutes, make sure your DNS proxy is turned off
              (Cloudflare users: use &ldquo;DNS only&rdquo; / gray cloud mode). The certificate
              can&apos;t be issued while traffic is proxied through another service.
            </p>
            <button
              onClick={handleRemove}
              disabled={removing}
              className="text-sm hover:underline"
              style={{ color: "var(--muted)" }}
            >
              Remove
            </button>
            {domain.error_message && (
              <p className="text-sm" style={{ color: "var(--danger, #dc2626)" }}>
                {domain.error_message}
              </p>
            )}
          </div>
        )}

        {/* active — Live! */}
        {domain.status === "active" && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Your custom domain is live! Readers can visit your profile at:
            </p>
            <a
              href={`https://${domain.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
              style={{ color: "var(--accent)" }}
            >
              https://{domain.domain}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
            <div className="pt-2">
              <button
                onClick={handleRemove}
                disabled={removing}
                className="text-sm rounded-full px-4 py-2 border transition-opacity hover:opacity-80"
                style={{ borderColor: "var(--danger, #dc2626)", color: "var(--danger, #dc2626)" }}
              >
                {removing ? "Removing..." : "Remove Domain"}
              </button>
            </div>
          </div>
        )}

        {/* error state */}
        {domain.status === "error" && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--danger, #dc2626)" }}>
              {domain.error_message || "Something went wrong with your domain setup."}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCheck}
                disabled={checking}
                className="rounded-full px-4 py-2 text-sm font-medium border transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              >
                {checking ? "Retrying..." : "Retry"}
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="text-sm hover:underline"
                style={{ color: "var(--muted)" }}
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Info box */}
      <div
        className="mt-6 rounded-xl border p-5 text-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}
      >
        <p className="font-medium mb-2" style={{ color: "var(--foreground)" }}>
          How custom domains work
        </p>
        <ul className="space-y-1.5 list-disc list-inside">
          <li>Your profile, entries, and subscribe page are served at your domain</li>
          <li>Your fediverse identity stays <strong>@username@inkwell.social</strong></li>
          <li>SSL certificates are provisioned and renewed automatically</li>
          <li>App features (Feed, Editor, Settings) always use inkwell.social</li>
          <li>Visitors to your custom domain see your public profile (they manage their own accounts at inkwell.social)</li>
        </ul>

        <p className="font-medium mt-4 mb-2" style={{ color: "var(--foreground)" }}>
          Troubleshooting
        </p>
        <ul className="space-y-1.5 list-disc list-inside">
          <li><strong>Certificate stuck?</strong> Turn off any DNS proxy (Cloudflare orange cloud &rarr; gray cloud). The cert can&apos;t be verified through a proxy.</li>
          <li><strong>DNS not detected?</strong> Wait a few minutes and click &ldquo;Check DNS&rdquo; again. Some providers take longer to propagate.</li>
          <li><strong>Using a subdomain?</strong> (e.g., blog.yoursite.com) — add a CNAME record. Using a root domain? (e.g., yoursite.com) — use CNAME flattening if your provider supports it, otherwise use A/AAAA records.</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending_dns: "#eab308",
    pending_cert: "#eab308",
    active: "#22c55e",
    error: "#ef4444",
    removed: "#9ca3af",
  };
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
      style={{ background: colors[status] ?? "#9ca3af" }}
    />
  );
}

function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending_dns: "Awaiting DNS",
    pending_cert: "Issuing certificate",
    active: "Active",
    error: "Error",
    removed: "Removed",
  };
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full"
      style={{
        background: status === "active" ? "rgba(34,197,94,0.1)" : "var(--accent-light)",
        color: status === "active" ? "#22c55e" : "var(--muted)",
      }}
    >
      {labels[status] ?? status}
    </span>
  );
}

function DnsInstructionsSubdomain({ domain }: { domain: string }) {
  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: "var(--border)", background: "var(--background)" }}
    >
      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        Step 1 — Point your subdomain to Inkwell
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead>
            <tr style={{ color: "var(--muted)" }}>
              <th className="text-left py-1 pr-4 font-medium">Type</th>
              <th className="text-left py-1 pr-4 font-medium">Name</th>
              <th className="text-left py-1 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-1 pr-4 font-mono text-xs">CNAME</td>
              <td className="py-1 pr-4 font-mono text-xs">{domain.split(".")[0]}</td>
              <td className="py-1 font-mono text-xs">inkwell-web.fly.dev</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        className="rounded-lg p-3 text-xs space-y-1.5"
        style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", color: "var(--muted)" }}
      >
        <p className="font-medium" style={{ color: "var(--foreground)" }}>
          ⚡ Using Cloudflare?
        </p>
        <p>
          Make sure the <strong>proxy is turned OFF</strong> (gray cloud / &ldquo;DNS only&rdquo;) for this
          record. Orange cloud (proxied) prevents the SSL certificate from being issued.
        </p>
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        DNS changes usually propagate within a few minutes, but can take up to 48 hours in rare cases.
        Once we detect the record, we&apos;ll automatically issue an SSL certificate.
      </p>
    </div>
  );
}

function DnsInstructionsApex({ domain }: { domain: string }) {
  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: "var(--border)", background: "var(--background)" }}
    >
      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        Step 1 — Point your domain to Inkwell
      </p>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        If your DNS provider supports CNAME flattening, ANAME, or ALIAS records (Cloudflare, DNSimple, etc.):
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead>
            <tr style={{ color: "var(--muted)" }}>
              <th className="text-left py-1 pr-4 font-medium">Type</th>
              <th className="text-left py-1 pr-4 font-medium">Name</th>
              <th className="text-left py-1 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-1 pr-4 font-mono text-xs">CNAME</td>
              <td className="py-1 pr-4 font-mono text-xs">@</td>
              <td className="py-1 font-mono text-xs">inkwell-web.fly.dev</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Otherwise, use A/AAAA records pointing to Fly.io&apos;s anycast IPs. Check{" "}
        <a
          href="https://fly.io/docs/networking/custom-domains/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          Fly.io docs
        </a>{" "}
        for current IP addresses.
      </p>

      <div
        className="rounded-lg p-3 text-xs space-y-1.5"
        style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", color: "var(--muted)" }}
      >
        <p className="font-medium" style={{ color: "var(--foreground)" }}>
          ⚡ Using Cloudflare?
        </p>
        <p>
          Make sure the <strong>proxy is turned OFF</strong> (gray cloud / &ldquo;DNS only&rdquo;) for this
          record. Orange cloud (proxied) prevents the SSL certificate from being issued. You can turn the
          proxy back on after the certificate is active.
        </p>
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        DNS changes usually propagate within a few minutes, but can take up to 48 hours in rare cases.
        Once we detect the record, we&apos;ll automatically issue an SSL certificate.
      </p>
    </div>
  );
}
