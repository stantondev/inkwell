import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { ReadsChart } from "./reads-chart";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Readers" };

interface ReadsSummary {
  days: number;
  total: number;
  previous_total: number;
  all_time: number;
  plus: boolean;
  daily?: { day: string; reads: number }[];
  top_entries?: {
    id: string;
    title: string | null;
    slug: string | null;
    kind: string;
    excerpt: string | null;
    reads: number;
  }[];
  referrers?: { source: string; reads: number }[];
}

const RANGES = [7, 30, 90, 365];
const serif = { fontFamily: "var(--font-lora, Georgia, serif)" };

function sourceLabel(source: string): string {
  if (source === "") return "Direct, email or apps";
  if (source === "inkwell") return "Inkwell";
  if (source.startsWith("search:")) {
    const name = source.slice(7);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} search`;
  }
  return source;
}

function change(total: number, previous: number): string | null {
  if (previous === 0) return total > 0 ? "new this period" : null;
  const pct = Math.round(((total - previous) / previous) * 100);
  if (pct === 0) return "same as the period before";
  return `${pct > 0 ? "+" : ""}${pct}% vs the period before`;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      {children}
    </div>
  );
}

export default async function ReadersPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/readers");

  const { days: daysParam } = await searchParams;
  const days = RANGES.includes(Number(daysParam)) ? Number(daysParam) : 30;

  let data: ReadsSummary | null = null;
  try {
    const res = await apiFetch<{ data: ReadsSummary }>(`/api/me/reads?days=${days}`, {}, session.token);
    data = res.data;
  } catch {
    data = null;
  }

  const username = session.user.username;
  const delta = data ? change(data.total, data.previous_total) : null;
  const maxSource = Math.max(1, ...(data?.referrers ?? []).map((r) => r.reads));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold mb-1" style={serif}>Readers</h1>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        How many people read your entries, and where they came from. Counted without
        cookies or tracking; each reader counts once a day, and your own visits don&apos;t count.
      </p>

      <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/readers?days=${r}`}
            aria-current={r === days ? "page" : undefined}
            className="rounded-full border px-3 py-1 text-sm"
            style={
              r === days
                ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
                : { borderColor: "var(--border)", color: "var(--muted)" }
            }
          >
            {r === 365 ? "Year" : `${r} days`}
          </Link>
        ))}
      </div>

      {!data ? (
        <Card>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Reader stats couldn&apos;t load just now. Try again in a moment.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <Card>
            <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>
              Reads, last {days === 365 ? "year" : `${days} days`}
            </p>
            <p className="text-4xl font-bold" style={serif}>{data.total.toLocaleString("en-US")}</p>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              {delta ? `${delta} · ` : ""}{data.all_time.toLocaleString("en-US")} all time
            </p>
            {data.all_time === 0 && (
              <p className="text-sm mt-4" style={{ color: "var(--muted)" }}>
                Reads start counting from September 22, 2026. Share an entry and check back.
              </p>
            )}
          </Card>

          {data.plus && data.daily ? (
            <>
              <Card>
                <h2 className="text-base font-semibold mb-4" style={serif}>Reads per day</h2>
                <ReadsChart daily={data.daily} />
              </Card>

              <Card>
                <h2 className="text-base font-semibold mb-3" style={serif}>Most read</h2>
                {data.top_entries && data.top_entries.length > 0 ? (
                  <ol className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
                    {data.top_entries.map((e) => {
                      const label =
                        e.title || (e.excerpt ? e.excerpt.slice(0, 80) : e.kind === "sticky" ? "Sticky" : "Untitled");
                      return (
                        <li key={e.id} className="flex items-baseline justify-between gap-4 py-2" style={{ borderColor: "var(--border)" }}>
                          {e.slug ? (
                            <Link href={`/${username}/${e.slug}`} className="text-sm hover:underline truncate">
                              {label}
                            </Link>
                          ) : (
                            <span className="text-sm truncate">{label}</span>
                          )}
                          <span className="text-sm tabular-nums shrink-0" style={{ color: "var(--muted)" }}>
                            {e.reads.toLocaleString("en-US")}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>No reads in this period yet.</p>
                )}
              </Card>

              <Card>
                <h2 className="text-base font-semibold mb-3" style={serif}>Where readers came from</h2>
                {data.referrers && data.referrers.length > 0 ? (
                  <ul className="flex flex-col gap-2.5">
                    {data.referrers.map((r) => (
                      <li key={r.source} className="text-sm">
                        <div className="flex justify-between gap-4 mb-1">
                          <span className="truncate">{sourceLabel(r.source)}</span>
                          <span className="tabular-nums" style={{ color: "var(--muted)" }}>
                            {r.reads.toLocaleString("en-US")}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: "var(--border)" }} aria-hidden="true">
                          <div
                            className="h-1.5 rounded-full"
                            style={{ width: `${(r.reads / maxSource) * 100}%`, background: "var(--accent)" }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>No reads in this period yet.</p>
                )}
                <p className="text-xs mt-4" style={{ color: "var(--muted)" }}>
                  Reads inside Mastodon and other fediverse apps happen on those servers and can&apos;t
                  be counted here; their boosts and favorites show on each entry.
                </p>
              </Card>
            </>
          ) : (
            <Card>
              <h2 className="text-base font-semibold mb-2" style={serif}>See the whole picture with Plus</h2>
              <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
                Plus shows reads day by day, which entries people read most, and which sites
                and searches sent them. You can try it free for 14 days, no card needed.
              </p>
              <Link
                href="/settings/billing"
                className="inline-flex rounded-full px-5 py-2 text-sm font-medium"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Try Plus free
              </Link>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
