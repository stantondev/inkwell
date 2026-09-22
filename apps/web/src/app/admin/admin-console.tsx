"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ADMIN_GROUPS,
  ADMIN_SECTIONS,
  DEFAULT_SECTION,
  sectionById,
} from "./admin-sections";
import { AdminProvider } from "./admin-context";
import type { AdminStats } from "./admin-overview";
import { AdminOverview } from "./admin-overview";

/**
 * The admin console — one page, no navigation.
 *
 * Replaces thirteen separate routes behind a wrapping tab bar. The rail
 * switches panels with local state, so moving between Reports and Billing
 * costs nothing; each panel's code is fetched the first time it's opened
 * and cached after that, which keeps the initial load to the overview.
 *
 * The active section is mirrored into `?s=` so a panel can be linked and
 * bookmarked, and the old `/admin/<thing>` routes redirect here.
 */

const PanelLoading = () => (
  <div className="adm-panel-loading" role="status">
    <span className="adm-spinner" aria-hidden="true" />
    Loading…
  </div>
);

// Each panel is its own chunk. `ssr: false` because every one of them
// fetches on mount behind an admin session — there is nothing to render
// on the server and pretending otherwise just doubles the work.
const PANELS: Record<string, React.ComponentType> = {
  users: dynamic(() => import("./panels/users-panel"), { loading: PanelLoading, ssr: false }),
  reports: dynamic(() => import("./panels/reports-panel"), { loading: PanelLoading, ssr: false }),
  moderation: dynamic(() => import("./panels/moderation-panel"), { loading: PanelLoading, ssr: false }),
  warnings: dynamic(() => import("./panels/warnings-panel"), { loading: PanelLoading, ssr: false }),
  entries: dynamic(() => import("./panels/entries-panel"), { loading: PanelLoading, ssr: false }),
  polls: dynamic(() => import("./panels/polls-panel"), { loading: PanelLoading, ssr: false }),
  billing: dynamic(() => import("./panels/billing-panel"), { loading: PanelLoading, ssr: false }),
  growth: dynamic(() => import("./panels/growth-panel"), { loading: PanelLoading, ssr: false }),
  email: dynamic(() => import("./panels/email-panel"), { loading: PanelLoading, ssr: false }),
  federation: dynamic(() => import("./panels/federation-panel"), { loading: PanelLoading, ssr: false }),
  relays: dynamic(() => import("./panels/relays-panel"), { loading: PanelLoading, ssr: false }),
  domains: dynamic(() => import("./panels/domains-panel"), { loading: PanelLoading, ssr: false }),
};

interface Props {
  currentUserId: string;
  initialStats: AdminStats | null;
  initialPendingReports: number;
}

export function AdminConsole({
  currentUserId,
  initialStats,
  initialPendingReports,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("s");

  const [active, setActive] = useState(() => sectionById(requested).id);
  const [pendingReports, setPendingReports] = useState(initialPendingReports);
  const [railOpen, setRailOpen] = useState(false);

  // Keep state in step with the URL when the query param changes from the
  // outside — a back/forward press, or a link into a specific panel.
  useEffect(() => {
    const id = sectionById(requested).id;
    setActive((current) => (current === id ? current : id));
  }, [requested]);

  const go = useCallback(
    (id: string) => {
      setActive(id);
      setRailOpen(false);
      // replace, not push: the rail is a view switch, not thirteen history
      // entries between you and the page you arrived from.
      const query = id === DEFAULT_SECTION ? "" : `?s=${id}`;
      router.replace(`/admin${query}`, { scroll: false });
      window.scrollTo({ top: 0, behavior: "auto" });
    },
    [router]
  );

  const refreshBadges = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) return;
      const data = await res.json();
      const next = data?.stats?.pending_reports;
      if (typeof next === "number") setPendingReports(next);
    } catch {
      // A stale badge is not worth surfacing an error for.
    }
  }, []);

  const section = sectionById(active);
  const Panel = PANELS[active];

  // Nothing navigates here, so the document title would otherwise sit on
  // "Admin" forever — including in the tab strip and in browser history.
  useEffect(() => {
    document.title =
      active === DEFAULT_SECTION
        ? "Admin · Inkwell"
        : `${section.label} · Admin · Inkwell`;
  }, [active, section.label]);

  const ctx = useMemo(
    () => ({ currentUserId, refreshBadges }),
    [currentUserId, refreshBadges]
  );

  const badgeFor = (key: string | null | undefined) =>
    key === "pending_reports" ? pendingReports : 0;

  return (
    <AdminProvider value={ctx}>
      <div className="adm-console">
        {/* ── Rail ─────────────────────────────────────────────────── */}
        <aside
          className={`adm-rail${railOpen ? " adm-rail--open" : ""}`}
          aria-label="Admin sections"
        >
          <nav className="adm-rail-inner">
            {ADMIN_GROUPS.map((group) => {
              const items = ADMIN_SECTIONS.filter((s) => s.group === group.id);
              if (items.length === 0) return null;
              return (
                <div key={group.id} className="adm-rail-group">
                  {group.label && (
                    <div className="adm-rail-group-label">{group.label}</div>
                  )}
                  {items.map((item) => {
                    const count = badgeFor(item.badge);
                    const on = item.id === active;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`adm-rail-item${on ? " adm-rail-item--on" : ""}`}
                        onClick={() => go(item.id)}
                        aria-current={on ? "page" : undefined}
                      >
                        <span className="adm-rail-icon">{item.icon}</span>
                        <span className="adm-rail-label">{item.label}</span>
                        {count > 0 && (
                          <span className="adm-rail-badge">
                            {count > 9 ? "9+" : count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* ── Panel ────────────────────────────────────────────────── */}
        <main className="adm-main">
          <div className="adm-main-head">
            <button
              type="button"
              className="adm-rail-toggle"
              onClick={() => setRailOpen((v) => !v)}
              aria-expanded={railOpen}
              aria-label="Show admin sections"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
              Sections
            </button>

            <div className="adm-main-title-row">
              <span className="adm-main-icon">{section.icon}</span>
              <div>
                <h2 className="adm-main-title">{section.label}</h2>
                <p className="adm-main-blurb">{section.blurb}</p>
              </div>
            </div>
          </div>

          <div className="adm-panel">
            {active === "overview" ? (
              <AdminOverview
                stats={initialStats}
                pendingReports={pendingReports}
                onGo={go}
              />
            ) : Panel ? (
              <Panel />
            ) : (
              <p className="adm-empty">That section doesn&apos;t exist.</p>
            )}
          </div>
        </main>
      </div>

      {railOpen && (
        <button
          type="button"
          className="adm-rail-scrim"
          aria-label="Close sections"
          onClick={() => setRailOpen(false)}
        />
      )}

      <p className="adm-footer-link">
        <Link href="/feed">← Back to Inkwell</Link>
      </p>
    </AdminProvider>
  );
}
