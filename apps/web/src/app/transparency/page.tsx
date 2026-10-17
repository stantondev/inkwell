import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSite } from "@/lib/site";
import { notFound } from "next/navigation";
import { getSessionSafe } from "@/lib/session";
import { dollars, foundingPriceNote, type FoundingStatus } from "@/lib/plus-pitch";

export const metadata: Metadata = {
  title: "Transparency — What Inkwell Costs to Run",
  description:
    "Inkwell's real monthly costs, what members contribute, and how much of the bill is covered. Updated automatically.",
  openGraph: {
    title: "Transparency — What Inkwell Costs to Run",
    description: "Real monthly costs, member revenue, and how much of the bill is covered.",
    url: "/transparency",
  },
  alternates: { canonical: "/transparency" },
};

export const revalidate = 300;

interface TransparencyData {
  as_of: string;
  costs: { label: string; monthly_cents: number; note: string }[];
  monthly_cost_cents: number;
  monthly_revenue_cents: number;
  revenue_source: "square" | "estimate";
  percent_covered: number;
  paying_members: number;
  monthly_paying_members?: number;
  founding: FoundingStatus & { raised_cents: number };
  lifetime?: {
    started_on: string;
    days: number;
    costs_since: string;
    billed_through: string | null;
    cost_cents: number;
    estimated_cents: number;
    paid_cents: number | null;
    behind_cents: number | null;
  };
  users: { total: number; active_writers_30d: number };
}

// Whole dollars: the totals include an estimate for the month in progress.
function roundDollars(cents: number) {
  return Math.round(cents / 100) * 100;
}

const serif = { fontFamily: "var(--font-lora, Georgia, serif)" };

export default async function TransparencyPage() {
  // A page about inkwell.social itself; a self-hosted server has no such thing.
  if (getSite().selfHosted) notFound();
  let data: TransparencyData | null = null;
  const [res, { session }] = await Promise.all([
    apiFetch<{ data: TransparencyData }>("/api/transparency").catch(() => null),
    getSessionSafe(),
  ]);
  data = res?.data ?? null;
  const signedIn = !!session;

  const covered = data ? Math.min(data.percent_covered, 100) : 0;
  const gap = data ? Math.max(data.monthly_cost_cents - data.monthly_revenue_cents, 0) : 0;
  const raised = data?.founding.raised_cents ?? 0;
  const life = data?.lifetime;
  const lifePaid = life?.paid_cents ?? null;
  const lifeShare = life && lifePaid != null && life.cost_cents > 0 ? Math.min(Math.round((lifePaid * 100) / life.cost_cents), 100) : 0;
  const lifeMonths = life ? Math.max(Math.round(life.days / 30.44), 1) : 0;
  const day = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
  const openedOn = life ? day(life.started_on, { month: "long", day: "numeric", year: "numeric" }) : "";
  const costsSince = life ? day(life.costs_since, { month: "long", year: "numeric" }) : "";
  const billedThrough = life?.billed_through ? day(life.billed_through, { month: "long", day: "numeric" }) : null;
  const priceNote = foundingPriceNote(data?.founding);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12" style={{ color: "var(--foreground)" }}>
      <p className="text-xs font-medium uppercase tracking-widest mb-2" style={{ color: "var(--accent)" }}>
        Open books
      </p>
      <h1 className="text-3xl font-bold mb-3" style={serif}>
        What Inkwell costs to run
      </h1>
      <p className="text-base leading-relaxed mb-10" style={{ color: "var(--muted)" }}>
        Inkwell has no ads, no investors, and doesn&apos;t sell your data. It&apos;s run by one person
        and paid for by the people who use it. These numbers come straight from our billing system
        and update on their own.
      </p>

      {!data ? (
        <div className="rounded-xl border p-5 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          The numbers are temporarily unavailable. Please check back in a few minutes.
        </div>
      ) : (
        <>
          {/* Coverage meter */}
          <section className="rounded-xl border p-6 mb-8" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="flex items-baseline justify-between gap-4 mb-3 flex-wrap">
              <h2 className="text-lg font-semibold" style={serif}>This month&apos;s bill</h2>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                <strong style={{ color: "var(--foreground)" }}>{dollars(data.monthly_revenue_cents)}</strong> of{" "}
                <strong style={{ color: "var(--foreground)" }}>{dollars(data.monthly_cost_cents)}</strong> covered by members
              </p>
            </div>
            <div
              className="h-4 rounded-full overflow-hidden"
              style={{ background: "var(--border)" }}
              role="progressbar"
              aria-valuenow={data.percent_covered}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Monthly costs covered"
            >
              <div className="h-full rounded-full" style={{ width: `${Math.max(covered, 2)}%`, background: "var(--accent)" }} />
            </div>
            <p className="text-sm mt-3">
              <strong>{data.percent_covered}% covered.</strong>{" "}
              <span style={{ color: "var(--muted)" }}>
                {data.percent_covered >= 100
                  ? "Members cover the full monthly bill. Thank you."
                  : `The other ${dollars(gap)} a month comes out of the founder's pocket.`}
              </span>
            </p>
            {raised > 0 && (
              <p className="text-sm mt-3 pt-3" style={{ borderTop: "1px solid var(--border)", color: "var(--muted)" }}>
                <strong style={{ color: "var(--foreground)" }}>
                  On top of that, {data.founding.sold} Founding {data.founding.sold === 1 ? "Member has" : "Members have"} paid{" "}
                  {dollars(raised)} once.
                </strong>{" "}
                It isn&apos;t counted in the meter above, which shows only what comes in every month.
              </p>
            )}
          </section>

          {/* Since launch */}
          {life && (
            <section className="rounded-xl border p-6 mb-8" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <h2 className="text-lg font-semibold mb-1" style={serif}>Since Inkwell opened</h2>
              <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
                Inkwell opened on {openedOn}, about {lifeMonths} {lifeMonths === 1 ? "month" : "months"} ago.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="text-2xl font-semibold" style={serif}>{dollars(roundDollars(life.cost_cents))}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>What running it has cost since {costsSince}</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold" style={serif}>{lifePaid != null ? dollars(lifePaid) : "—"}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>What members have paid in total</p>
                </div>
              </div>
              {lifePaid != null && (
                <>
                  <div
                    className="h-3 rounded-full overflow-hidden"
                    style={{ background: "var(--border)" }}
                    role="progressbar"
                    aria-valuenow={lifeShare}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Costs since launch paid back by members"
                  >
                    <div className="h-full rounded-full" style={{ width: `${Math.max(lifeShare, 2)}%`, background: "var(--accent)" }} />
                  </div>
                  <p className="text-sm mt-3">
                    {(life.behind_cents ?? 0) > 0 ? (
                      <>
                        <strong>Members have paid back {lifeShare}% of what Inkwell has cost so far.</strong>{" "}
                        <span style={{ color: "var(--muted)" }}>
                          {gap > 0
                            ? `Right now they cover ${data.percent_covered}% of each month.`
                            : "They now cover each month in full."}
                        </span>
                      </>
                    ) : (
                      <strong>Members have paid back everything Inkwell has cost. Thank you.</strong>
                    )}
                  </p>
                </>
              )}
              <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
                {billedThrough
                  ? `The cost is the real Fly and Resend bills through ${billedThrough}${life.estimated_cents > 0 ? `, plus about ${dollars(roundDollars(life.estimated_cents))} estimated for the days since` : ""}. `
                  : "The cost is estimated from the monthly bills below. "}
                Member payments are every payment through Square since April 2026, after card fees and refunds,
                not counting the founder&apos;s own.
              </p>
            </section>
          )}

          {/* Numbers */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[
              { label: "People on Inkwell", value: data.users.total.toLocaleString() },
              { label: "Wrote this month", value: data.users.active_writers_30d.toLocaleString() },
              { label: "Paying members", value: data.paying_members.toLocaleString(), note: "Monthly, yearly and Founding" },
              {
                label: "Founding Members",
                value: `${data.founding.sold} / ${data.founding.cap}`,
                note: raised > 0 ? `${dollars(raised)} paid once` : undefined,
              },
            ].map((s: { label: string; value: string; note?: string }) => (
              <div key={s.label} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <p className="text-2xl font-semibold" style={serif}>{s.value}</p>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{s.label}</p>
                {s.note && <p className="text-xs" style={{ color: "var(--muted)" }}>{s.note}</p>}
              </div>
            ))}
          </section>

          {/* Costs */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3" style={serif}>Where the money goes</h2>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              {data.costs.map((c, i) => (
                <div
                  key={c.label}
                  className="flex items-start justify-between gap-4 p-4"
                  style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
                >
                  <div>
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{c.note}</p>
                  </div>
                  <p className="text-sm font-medium whitespace-nowrap">{dollars(c.monthly_cents)}/mo</p>
                </div>
              ))}
              <div className="flex justify-between gap-4 p-4" style={{ borderTop: "1px solid var(--border)", background: "var(--background)" }}>
                <p className="text-sm font-semibold">Total</p>
                <p className="text-sm font-semibold">{dollars(data.monthly_cost_cents)}/mo</p>
              </div>
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
              Server and email costs only. The founder&apos;s time isn&apos;t counted, and the founder&apos;s own
              Plus subscription is left out of the member revenue above.
            </p>
          </section>

          {/* How to help */}
          <section className="rounded-xl border p-6 mb-8" style={{ borderColor: "var(--accent)", background: "var(--surface)" }}>
            <h2 className="text-xl font-semibold mb-2" style={serif}>How to help</h2>
            <ul className="text-sm leading-relaxed flex flex-col gap-2" style={{ color: "var(--muted)" }}>
              {data.founding.remaining > 0 && (
                <li>
                  <strong style={{ color: "var(--foreground)" }}>Become a Founding Member</strong> —{" "}
                  {dollars(data.founding.price_cents)} once for Plus as long as Inkwell runs.{" "}
                  {data.founding.remaining} of {data.founding.cap} left.
                  {priceNote && <> {priceNote}.</>}
                </li>
              )}
              <li>
                <strong style={{ color: "var(--foreground)" }}>Get Plus</strong> — $5 a month, or try it free for 14 days first.
              </li>
              <li>
                <strong style={{ color: "var(--foreground)" }}>Give once</strong> — any amount from $1, with nothing to renew.
              </li>
              <li>
                <strong style={{ color: "var(--foreground)" }}>Tell a friend who&apos;d like a quiet place to write.</strong> It costs nothing and helps just as much.
              </li>
            </ul>
            {signedIn ? (
              <Link
                href="/settings/billing"
                className="inline-flex mt-4 rounded-full px-6 py-2.5 text-sm font-medium"
                style={{ background: "var(--accent)", color: "var(--background)" }}
              >
                Support Inkwell
              </Link>
            ) : (
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <Link
                  href="/#pricing"
                  className="inline-flex rounded-full px-6 py-2.5 text-sm font-medium"
                  style={{ background: "var(--accent)", color: "var(--background)" }}
                >
                  See the plans
                </Link>
                <Link href="/login?next=/settings/billing" className="text-sm underline underline-offset-2" style={{ color: "var(--accent)" }}>
                  Already a member? Sign in
                </Link>
              </div>
            )}
          </section>

          {/* Honesty */}
          <section className="mb-4">
            <h2 className="text-xl font-semibold mb-3" style={serif}>The honest version</h2>
            <div className="flex flex-col gap-3 text-base leading-relaxed">
              <p>
                Inkwell is built and run by one person with a day job. I use AI tools (Claude) to help write
                the code, and I review and ship every change myself. You can read the{" "}
                <Link href="/ai" className="underline" style={{ color: "var(--accent)" }}>AI policy</Link> and the{" "}
                <Link href="/open-source" className="underline" style={{ color: "var(--accent)" }}>source code</Link>.
                Your writing is never used to train AI.
              </p>
              <p>
                Our first payment processor closed our account after people used stolen cards on the site.
                That&apos;s why reader tips and paid writer plans are paused, and why billing now runs through Square.
              </p>
              <p>
                If Inkwell ever has to close, you&apos;ll get plenty of notice and a full export of everything
                you&apos;ve written. And because Inkwell is part of the fediverse, the people who follow you
                aren&apos;t locked into Inkwell either.
              </p>
            </div>
          </section>

          <p className="text-xs mt-8" style={{ color: "var(--muted)" }}>
            Last updated {new Date(data.as_of).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
            {data.revenue_source === "estimate" && " · revenue estimated from billing records"}
          </p>
        </>
      )}
    </main>
  );
}
