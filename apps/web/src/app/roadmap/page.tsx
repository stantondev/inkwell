import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import s from "./roadmap.module.css";
import { RoadmapCard } from "./roadmap-card";
import { EMPTY_SUMMARY, RoadmapLedger } from "./roadmap-ledger";
import {
  CATEGORY_LABELS,
  SORTS,
  monthKey,
  monthLabel,
  type FeedbackPost,
  type OutlineItem,
  type RoadmapContext,
  type RoadmapSummary,
} from "./roadmap-shared";

export const metadata: Metadata = {
  title: "Roadmap",
  description:
    "Everything members have asked Inkwell for, what's being built now, and everything that's shipped. Suggest an idea, vote, and follow it from received to shipped.",
  openGraph: {
    title: "The Roadmap · Inkwell",
    description: "Built in the open: what members asked for, what's being built, and what's shipped.",
    url: "/roadmap",
  },
  alternates: { canonical: "/roadmap" },
};

type View = "" | "open" | "shipped" | "declined";

const SHIPPED_PER_PAGE = 18;
const OVERVIEW_SHIPPED = 6;

interface PageProps {
  searchParams: Promise<{
    view?: string;
    category?: string;
    sort?: string;
    q?: string;
    page?: string;
    status?: string;
  }>;
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export default async function RoadmapPage({ searchParams }: PageProps) {
  const params = await searchParams;
  // Old links used ?status=done for shipped items.
  const rawView = params.view ?? (params.status === "done" ? "shipped" : "");
  const view: View = rawView === "open" || rawView === "shipped" || rawView === "declined" ? rawView : "";
  const category = params.category && CATEGORY_LABELS[params.category] ? params.category : "";
  const sort = SORTS.some((x) => x.value === params.sort) ? (params.sort as string) : "most_voted";
  const q = (params.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const session = await getSession();
  const isLoggedIn = !!session;
  const token = session?.token;

  const filters = new URLSearchParams();
  if (category) filters.set("category", category);
  if (q) filters.set("q", q);
  const withFilters = (extra: Record<string, string>) => {
    const p = new URLSearchParams(filters);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  };

  const wantOpen = view === "" || view === "open";
  const wantShipped = view === "" || view === "shipped";
  const shippedPerPage = view === "shipped" ? SHIPPED_PER_PAGE : OVERVIEW_SHIPPED;

  const [outlineR, openR, shippedR, declinedR] = await Promise.allSettled([
    apiFetch<{ data: OutlineItem[]; meta: RoadmapSummary }>(
      `/api/feedback/outline?${withFilters({ group: "all" })}`,
      {},
      token,
    ),
    wantOpen
      ? apiFetch<{ data: FeedbackPost[] }>(`/api/feedback?${withFilters({ sort, per_page: "50" })}`, {}, token)
      : Promise.resolve({ data: [] as FeedbackPost[] }),
    wantShipped
      ? apiFetch<{ data: FeedbackPost[] }>(
          `/api/feedback?${withFilters({
            status: "done",
            sort: "recently_shipped",
            per_page: String(shippedPerPage),
            page: String(view === "shipped" ? page : 1),
          })}`,
          {},
          token,
        )
      : Promise.resolve({ data: [] as FeedbackPost[] }),
    view === "declined"
      ? apiFetch<{ data: FeedbackPost[] }>(
          `/api/feedback?${withFilters({ status: "declined", sort: "recently_updated", per_page: "50" })}`,
          {},
          token,
        )
      : Promise.resolve({ data: [] as FeedbackPost[] }),
  ]);

  const outline = outlineR.status === "fulfilled" ? outlineR.value.data ?? [] : [];
  const summary = outlineR.status === "fulfilled" ? outlineR.value.meta ?? EMPTY_SUMMARY : EMPTY_SUMMARY;
  const openPosts = openR.status === "fulfilled" ? openR.value.data ?? [] : [];
  const shippedPosts = shippedR.status === "fulfilled" ? shippedR.value.data ?? [] : [];
  const declinedPosts = declinedR.status === "fulfilled" ? declinedR.value.data ?? [] : [];
  const loadFailed = [outlineR, openR, shippedR].some((r) => r.status === "rejected");

  const numbers = new Map(outline.map((o) => [o.id, o.number]));
  const filteredOpen = outline.filter((o) => !["done", "declined"].includes(o.status)).length;
  const filteredShipped = outline.filter((o) => o.status === "done").length;
  const filteredDeclined = outline.filter((o) => o.status === "declined").length;
  const shippedMonthCounts = new Map<string, number>();
  for (const o of outline) {
    if (o.status === "done" && o.completed_at) {
      const k = monthKey(o.completed_at);
      shippedMonthCounts.set(k, (shippedMonthCounts.get(k) ?? 0) + 1);
    }
  }
  const shippedPages = Math.max(1, Math.ceil(filteredShipped / SHIPPED_PER_PAGE));
  const filtering = !!(category || q);

  function href(overrides: Partial<{ view: string; category: string; sort: string; q: string; page: string }>) {
    const merged = { view, category, sort, q, page: "1", ...overrides };
    const p = new URLSearchParams();
    if (merged.view) p.set("view", merged.view);
    if (merged.category) p.set("category", merged.category);
    if (merged.sort && merged.sort !== "most_voted") p.set("sort", merged.sort);
    if (merged.q) p.set("q", merged.q);
    if (merged.page && merged.page !== "1") p.set("page", merged.page);
    const str = p.toString();
    return `/roadmap${str ? `?${str}` : ""}`;
  }

  const openCtx: RoadmapContext = { group: "open", category: category || undefined, sort, q: q || undefined };
  const shippedCtx: RoadmapContext = { group: "shipped", category: category || undefined, q: q || undefined };
  const declinedCtx: RoadmapContext = { group: "declined", category: category || undefined, q: q || undefined };

  // Shipped cards grouped by the month they went out
  const shippedByMonth: { key: string; posts: FeedbackPost[] }[] = [];
  for (const p of shippedPosts) {
    const key = p.completed_at ? monthKey(p.completed_at) : "earlier";
    const last = shippedByMonth[shippedByMonth.length - 1];
    if (last && last.key === key) last.posts.push(p);
    else shippedByMonth.push({ key, posts: [p] });
  }

  const tabs: { value: View; label: string; count?: number }[] = [
    { value: "", label: "Everything" },
    { value: "open", label: "Open", count: filteredOpen },
    { value: "shipped", label: "Shipped", count: filteredShipped },
  ];
  if (view === "declined") tabs.push({ value: "declined", label: "Declined", count: filteredDeclined });

  const sortRow = (
    <div className={s.sortRow} aria-label="Order open ideas by">
      {SORTS.map((o) => (
        <Link key={o.value} href={href({ sort: o.value })} className={sort === o.value ? s.sortActive : undefined}>
          {o.label}
        </Link>
      ))}
    </div>
  );

  const workbench = (
    <section className={s.section} aria-labelledby="rm-open">
      <div className={s.sectionHead}>
        <div>
          <h2 className={s.sectionTitle} id="rm-open">
            On the workbench <small>{filteredOpen} open</small>
          </h2>
          <p className={s.sectionNote}>Ideas and reports that are waiting, being looked at, planned, or being built.</p>
        </div>
        {openPosts.length > 1 && sortRow}
      </div>
      <div className={s.board}>
        {openPosts.length === 0 ? (
          <p className={s.empty}>
            {filtering ? (
              <>Nothing open matches that. <Link href={href({ category: "", q: "" })}>Clear the filters</Link></>
            ) : (
              <>The workbench is clear: everything asked for has shipped or been answered. <Link href="/roadmap/new">Suggest something</Link></>
            )}
          </p>
        ) : (
          <div className={s.grid}>
            {openPosts.map((p) => (
              <RoadmapCard key={p.id} post={p} number={numbers.get(p.id)} ctx={openCtx} isLoggedIn={isLoggedIn} />
            ))}
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className={s.root} style={{ background: "var(--background)", minHeight: "100vh" }}>
      <div className={s.wrap}>
        {/* ── Masthead ── */}
        <header className={s.masthead}>
          <div>
            <p className={s.eyebrow}>Built in the open</p>
            <h1 className={s.title}>
              The <em>Roadmap</em>
            </h1>
            <p className={s.lede}>
              Every idea, bug and question members have sent in, where each one stands, and everything that&rsquo;s
              shipped because someone asked. Open any card and flip through the rest with the arrows.
            </p>
            <div className={s.mastActions}>
              <Link href="/roadmap/new" className={s.btnPrimary}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Suggest something
              </Link>
              <Link href="/roadmap/releases" className={s.btnGhost}>
                Release notes
              </Link>
            </div>
          </div>

          <RoadmapLedger summary={summary} />
        </header>

        {/* ── Controls ── */}
        <div className={s.controls}>
          <nav className={s.tabs} aria-label="Show">
            {tabs.map((t) => (
              <Link
                key={t.value || "all"}
                href={href({ view: t.value })}
                className={`${s.tab} ${view === t.value ? s.tabActive : ""}`}
                aria-current={view === t.value ? "page" : undefined}
              >
                {t.label}
                {t.count != null && <span className={s.tabCount}>{t.count}</span>}
              </Link>
            ))}
          </nav>

          <div className={s.chips} role="group" aria-label="Kind">
            <Link href={href({ category: "" })} className={`${s.chip} ${!category ? s.chipActive : ""}`}>
              All kinds
            </Link>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <Link
                key={value}
                href={href({ category: value })}
                className={`${s.chip} ${category === value ? s.chipActive : ""}`}
                aria-current={category === value ? "true" : undefined}
              >
                <span className={s.cat} data-cat={value} style={{ letterSpacing: 0 }}>
                  <span className={s.dot} />
                </span>
                {label}s
              </Link>
            ))}
          </div>

          <form className={s.search} action="/roadmap" method="get" role="search">
            <SearchIcon />
            {view && <input type="hidden" name="view" value={view} />}
            {category && <input type="hidden" name="category" value={category} />}
            {sort !== "most_voted" && <input type="hidden" name="sort" value={sort} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search the roadmap"
              aria-label="Search the roadmap"
              enterKeyHint="search"
            />
          </form>
        </div>

        {loadFailed && (
          <p className={s.empty} role="status">
            Part of the roadmap didn&rsquo;t load. Try again in a moment.
          </p>
        )}

        {q && (
          <p className={s.sectionNote} style={{ marginTop: -14, marginBottom: 22 }}>
            {outline.length} {outline.length === 1 ? "card mentions" : "cards mention"} &ldquo;{q}&rdquo;.{" "}
            <Link href={href({ q: "" })} className={s.sectionLink}>
              Clear search
            </Link>
          </p>
        )}

        {/* ── Views ── */}
        {wantOpen && workbench}

        {view === "" && (
          <section className={s.section} aria-labelledby="rm-shipped">
            <div className={s.sectionHead}>
              <div>
                <h2 className={s.sectionTitle} id="rm-shipped">
                  Lately shipped <small>{filteredShipped} in all</small>
                </h2>
                <p className={s.sectionNote}>Postmarked the day each one went out.</p>
              </div>
              {filteredShipped > OVERVIEW_SHIPPED && (
                <Link href={href({ view: "shipped" })} className={s.sectionLink}>
                  See all {filteredShipped} shipped →
                </Link>
              )}
            </div>
            {shippedPosts.length === 0 ? (
              <p className={s.empty}>Nothing shipped matches that.</p>
            ) : (
              <div className={s.grid}>
                {shippedPosts.map((p) => (
                  <RoadmapCard key={p.id} post={p} number={numbers.get(p.id)} ctx={shippedCtx} isLoggedIn={isLoggedIn} />
                ))}
              </div>
            )}
          </section>
        )}

        {view === "shipped" && (
          <section className={s.section} aria-labelledby="rm-shipped">
            <div className={s.sectionHead}>
              <div>
                <h2 className={s.sectionTitle} id="rm-shipped">
                  Shipped <small>{filteredShipped} in all</small>
                </h2>
                <p className={s.sectionNote}>Newest first. Each card is postmarked the day it went out.</p>
              </div>
            </div>
            {shippedPosts.length === 0 ? (
              <p className={s.empty}>Nothing shipped matches that.</p>
            ) : (
              shippedByMonth.map((group) => (
                <div key={group.key}>
                  <h3 className={s.monthHead}>
                    {group.key === "earlier" ? "Earlier" : monthLabel(group.key, true)}
                    <b>
                      {shippedMonthCounts.get(group.key) ?? group.posts.length} shipped
                    </b>
                  </h3>
                  <div className={s.grid}>
                    {group.posts.map((p) => (
                      <RoadmapCard key={p.id} post={p} number={numbers.get(p.id)} ctx={shippedCtx} isLoggedIn={isLoggedIn} />
                    ))}
                  </div>
                </div>
              ))
            )}
            {shippedPages > 1 && (
              <nav className={s.pager} aria-label="Pages">
                {page > 1 ? <Link href={href({ page: String(page - 1) })}>← Newer</Link> : <span />}
                <span>
                  Page {page} of {shippedPages}
                </span>
                {page < shippedPages ? <Link href={href({ page: String(page + 1) })}>Older →</Link> : <span />}
              </nav>
            )}
          </section>
        )}

        {view === "declined" && (
          <section className={s.section} aria-labelledby="rm-declined">
            <div className={s.sectionHead}>
              <div>
                <h2 className={s.sectionTitle} id="rm-declined">
                  Declined <small>{filteredDeclined}</small>
                </h2>
                <p className={s.sectionNote}>Things we decided not to do, each with the reason on its card.</p>
              </div>
            </div>
            {declinedPosts.length === 0 ? (
              <p className={s.empty}>Nothing here.</p>
            ) : (
              <div className={s.grid}>
                {declinedPosts.map((p) => (
                  <RoadmapCard key={p.id} post={p} number={numbers.get(p.id)} ctx={declinedCtx} isLoggedIn={isLoggedIn} />
                ))}
              </div>
            )}
          </section>
        )}

        <footer className={s.foot}>
          <Link href="/roadmap/releases">Release notes</Link>
          {summary.declined > 0 && view !== "declined" && (
            <Link href={href({ view: "declined" })}>Declined ({summary.declined})</Link>
          )}
          <Link href="/roadmap/new">Suggest something</Link>
          <Link href="/help/contact">Write to us privately</Link>
        </footer>
      </div>
    </div>
  );
}
