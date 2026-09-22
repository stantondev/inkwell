import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession, getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { AdminConsole } from "./admin-console";
import type { AdminStats } from "./admin-overview";

export const metadata: Metadata = { title: "Admin" };

/**
 * The whole admin area. Everything lives in one console; the old
 * `/admin/<section>` routes redirect here with `?s=<section>`.
 *
 * Only the overview's data is fetched here, so opening Admin costs one
 * page's worth of work. Each panel fetches its own on first open.
 */
export default async function AdminPage() {
  const session = await getSession();
  const token = await getToken();
  const headers = { Authorization: `Bearer ${token}` };

  // Square is asked about paying members, so billing is fetched alongside
  // the stats with a short timeout — the console never waits on Square.
  const [data, billing] = await Promise.all([
    fetch(`${SERVER_API}/api/admin/stats`, { headers, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null),
    fetch(`${SERVER_API}/api/admin/billing-overview`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null),
  ]);

  const initialStats: AdminStats | null = data
    ? {
        stats: data.stats ?? null,
        recent_plus: data.recent_plus ?? [],
        recent_donors: data.recent_donors ?? [],
        recent_signups: data.recent_signups ?? [],
        billing,
      }
    : null;

  return (
    // useSearchParams needs a Suspense boundary to keep the route from
    // opting the whole page into client-side rendering.
    <Suspense fallback={null}>
      <AdminConsole
        currentUserId={session!.user.id}
        initialStats={initialStats}
        initialPendingReports={data?.stats?.pending_reports ?? 0}
      />
    </Suspense>
  );
}
