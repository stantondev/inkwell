import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = {
  title: "The Press Room — Inkwell System Status",
  description: "Check the current operational status of Inkwell's systems.",
  openGraph: {
    title: "The Press Room — Inkwell System Status",
    description: "Check the current operational status of Inkwell's systems.",
    url: "https://inkwell.social/help/status",
  },
  alternates: { canonical: "https://inkwell.social/help/status" },
};

interface HealthResponse {
  status: string;
  database?: string;
}

async function checkHealth(): Promise<{ api: boolean; database: boolean }> {
  try {
    const data = await apiFetch<HealthResponse>("/health", {
      cache: "no-store",
    });
    return {
      api: data.status === "ok",
      database: data.database === "ok" || data.status === "ok",
    };
  } catch {
    return { api: false, database: false };
  }
}

function StatusRow({ label, ok, description }: { label: string; ok: boolean; description: string }) {
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-xl border p-5"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div>
        <p
          className="text-sm font-semibold"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          {label}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          {description}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ background: ok ? "#22c55e" : "#ef4444" }}
        />
        <span
          className="text-xs font-medium"
          style={{ color: ok ? "#22c55e" : "#ef4444" }}
        >
          {ok ? "Operational" : "Disruption"}
        </span>
      </div>
    </div>
  );
}

export default async function StatusPage() {
  const { api, database } = await checkHealth();
  const webOk = true; // If this page renders, web is up

  return (
    <main
      className="mx-auto max-w-3xl px-4 py-12"
      style={{ color: "var(--foreground)" }}
    >
      {/* Breadcrumb */}
      <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
        <Link href="/help" className="hover:underline" style={{ color: "var(--accent)" }}>
          Help Center
        </Link>
        {" "}/ System Status
      </p>

      <p
        className="text-xs uppercase tracking-widest mb-1"
        style={{ color: "var(--accent)", fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Status
      </p>
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        The Press Room
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>
        Current operational status of Inkwell&rsquo;s systems
      </p>

      {/* Overall status */}
      <div
        className="rounded-xl border p-6 mb-6 text-center"
        style={{
          borderColor: "var(--border)",
          background: webOk && api && database ? "var(--surface)" : "var(--surface)",
        }}
      >
        <span
          className="inline-block w-4 h-4 rounded-full mb-3"
          style={{ background: webOk && api && database ? "#22c55e" : "#ef4444" }}
        />
        <p
          className="text-lg font-bold"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          {webOk && api && database ? "All Systems Operational" : "Some Systems Experiencing Issues"}
        </p>
      </div>

      {/* Status rows */}
      <div className="space-y-3 mb-8">
        <StatusRow
          label="Web"
          ok={webOk}
          description="The Inkwell website and user interface"
        />
        <StatusRow
          label="API"
          ok={api}
          description="Backend services, authentication, and data"
        />
        <StatusRow
          label="Database"
          ok={database}
          description="Data storage and retrieval"
        />
      </div>

      {/* Last checked */}
      <p className="text-xs text-center mb-8" style={{ color: "var(--muted)" }}>
        Last checked: {new Date().toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </p>

      {/* Bottom links */}
      <div className="pt-6 border-t" style={{ borderColor: "var(--border)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Experiencing an issue?{" "}
          <Link href="/help/contact" className="underline" style={{ color: "var(--accent)" }}>
            Contact us
          </Link>{" "}
          or check the{" "}
          <Link href="/roadmap" className="underline" style={{ color: "var(--accent)" }}>
            Roadmap
          </Link>{" "}
          for known issues.
        </p>
      </div>
    </main>
  );
}
