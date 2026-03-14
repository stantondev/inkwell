import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { DraftsList } from "./drafts-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Drafts — Inkwell" };

interface DraftEntry {
  id: string;
  title: string | null;
  body_html: string | null;
  mood: string | null;
  tags: string[];
  privacy: string;
  updated_at: string;
}

export default async function DraftsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let drafts: DraftEntry[] = [];
  try {
    const data = await apiFetch<{ data: DraftEntry[] }>(
      "/api/drafts",
      {},
      session.token
    );
    drafts = data.data ?? [];
  } catch {
    // show empty
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              Drafts
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Your unpublished work
            </p>
          </div>
          <Link
            href="/editor"
            className="rounded-full px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            + New entry
          </Link>
        </div>

        {/* Draft capacity indicator for free users */}
        {session.user.subscription_tier !== "plus" && (() => {
          const count = session.user.draft_count ?? drafts.length;
          const limit = 10;
          const pct = (count / limit) * 100;
          if (pct < 70) {
            return (
              <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
                {count} of {limit} drafts
              </p>
            );
          }
          const isAtLimit = count >= limit;
          return (
            <div
              className="rounded-lg border px-4 py-3 mb-4 text-xs"
              style={{
                borderColor: isAtLimit ? "var(--danger)" : "var(--warning, #b45309)",
                background: isAtLimit ? "rgba(220, 38, 38, 0.06)" : "rgba(180, 83, 9, 0.06)",
                color: isAtLimit ? "var(--danger)" : "var(--warning, #b45309)",
              }}
            >
              {isAtLimit ? (
                <p>
                  All {limit} draft slots full. Publish or remove a draft, or{" "}
                  <Link href="/settings/billing" style={{ textDecoration: "underline" }}>
                    upgrade to Plus
                  </Link>{" "}
                  for unlimited drafts.
                </p>
              ) : (
                <p>
                  {count} of {limit} drafts used.{" "}
                  <Link href="/settings/billing" style={{ textDecoration: "underline" }}>
                    Unlimited with Plus
                  </Link>.
                </p>
              )}
            </div>
          );
        })()}

        <DraftsList initialDrafts={drafts} />
      </div>
    </div>
  );
}
