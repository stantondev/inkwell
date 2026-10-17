/**
 * What a writer's exported website shows, read as a visitor would see it
 * (no token: public entries only). Shared by the page drawn for export and
 * the zip it goes into (app/api/me/site-export).
 */

import { apiFetch } from "@/lib/api";
import type { ProfileEntry } from "@/app/[username]/profile-types";
import type { GuestbookEntry } from "@/app/[username]/guestbook";

export const MAX_EXPORT_ENTRIES = 2000;

export interface ExportEntry extends ProfileEntry {
  kind?: string;
  sticky_color?: string | null;
  updated_at?: string;
}

/** Every public entry (or sticky), newest first. */
export async function allPublicEntries(username: string, kind: "entry" | "sticky" = "entry"): Promise<ExportEntry[]> {
  const out: ExportEntry[] = [];
  for (let page = 1; out.length < MAX_EXPORT_ENTRIES; page++) {
    const res = await apiFetch<{ data: ExportEntry[]; pagination?: { total?: number } }>(
      `/api/users/${encodeURIComponent(username)}/entries?kind=${kind}&page=${page}&per_page=50`,
    );
    const batch = res.data ?? [];
    out.push(...batch);
    const total = res.pagination?.total ?? 0;
    if (batch.length === 0 || out.length >= total) break;
  }
  return out;
}

/** Every guestbook signature, newest first (up to 500). */
export async function allGuestbook(username: string): Promise<GuestbookEntry[]> {
  const out: GuestbookEntry[] = [];
  for (let offset = 0; offset < 500; offset += 50) {
    const res = await apiFetch<{ data: GuestbookEntry[] }>(
      `/api/users/${encodeURIComponent(username)}/guestbook?limit=50&offset=${offset}`,
    );
    const batch = res.data ?? [];
    out.push(...batch);
    if (batch.length < 50) break;
  }
  return out;
}
