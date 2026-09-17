import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = {
  title: "Transparency — What Inkwell Costs to Run",
  description:
    "Inkwell's real monthly costs, what members contribute, and how much of the bill is covered. Updated automatically.",
  openGraph: {
    title: "Transparency — What Inkwell Costs to Run",
    description: "Real monthly costs, member revenue, and how much of the bill is covered.",
    url: "https://inkwell.social/transparency",
  },
  alternates: { canonical: "https://inkwell.social/transparency" },
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
  founding: { cap: number; sold: number; remaining: number; price_cents: number; raised_cents: number };
  users: { total: number; active_writers_30d: number };
}

function dollars(cents: number) {
  const d = cents / 100;
  return `$${d % 1 === 0 ? d.toFixed(0) : d.toFixed(2)}`;
}

const serif = { fontFamily: "var(--font-lora, Georgia, serif)" };

export default async function TransparencyPage() {
  let data: TransparencyData | null = null;
  try {
    const res = await apiFetch<{ data: TransparencyData }>("/api/transparency");
    data = res.data;
  } catch {
    data = null;
  }

  const covered = data ? Math.min(data.percent_covered, 100) : 0;

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
                  : `The other ${dollars(Math.max(data.monthly_cost_cents - data.monthly_revenue_cents, 0))} a month comes out of the founder's pocket.`}
              </span>
            </p>
          </section>

          {/* Numbers */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[
              { label: "People on Inkwell", value: data.users.total.toLocaleString() },
              { label: "Wrote this month", value: data.users.active_writers_30d.toLocaleString() },
              { label: "Paying members", value: data.paying_members.toLocaleString() },
              { label: "Founding Members", value: `${data.founding.sold} / ${data.founding.cap}` },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <p className="text-2xl font-semibold" style={serif}>{s.value}</p>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{s.label}</p>
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
                </li>
              )}
              <li>
                <strong style={{ color: "var(--foreground)" }}>Get Plus</strong> — $5 a month, or try it free for 14 days first.
              </li>
              <li>
                <strong style={{ color: "var(--foreground)" }}>Become an Ink Donor</strong> — $1–$3 a month, or a one-time gift.
              </li>
              <li>
                <strong style={{ color: "var(--foreground)" }}>Tell a friend who misses LiveJournal.</strong> It costs nothing and helps just as much.
              </li>
            </ul>
            <Link
              href="/settings/billing"
              className="inline-flex mt-4 rounded-full px-6 py-2.5 text-sm font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Support Inkwell
            </Link>
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
