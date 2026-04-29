/**
 * Cached server-side query helpers.
 *
 * Each function below is wrapped in `react.cache()` so multiple calls to the
 * same URL within a single SSR render share one API roundtrip.
 *
 * Without this, `generateMetadata` and the page component would each fetch
 * the same entry/profile/remote-entry independently, causing the duplicate
 * "twice in 1ms with different request IDs" pattern in production logs.
 *
 * `cache()` keys by argument identity, so each (path, token) pair is its own
 * cache entry — safe for both authenticated and unauthenticated requests.
 *
 * IMPORTANT: only use these from server components / route handlers. Client
 * components must continue to use `apiFetch` or the proxy routes.
 */

import { cache } from "react";
import { apiFetch } from "./api";

/**
 * GET /api/users/:username — cached profile lookup.
 * Both `generateMetadata` and the page component on `/[username]` call this.
 */
export const getProfile = cache(
  async <T = unknown>(username: string, token?: string | null): Promise<T> => {
    return apiFetch<T>(`/api/users/${username}`, {}, token);
  }
);

/**
 * GET /api/users/:username/entries/:slug — cached entry lookup.
 * Both `generateMetadata` and the page component on `/[username]/[slug]` call this.
 */
export const getEntry = cache(
  async <T = unknown>(
    username: string,
    slug: string,
    token?: string | null
  ): Promise<T> => {
    return apiFetch<T>(
      `/api/users/${username}/entries/${slug}`,
      {},
      token
    );
  }
);

/**
 * GET /api/remote-entries/:id — cached remote (fediverse) entry lookup.
 * Both `generateMetadata` and the page component on `/fediverse/[id]` call this.
 */
export const getRemoteEntry = cache(
  async <T = unknown>(id: string, token?: string | null): Promise<T> => {
    return apiFetch<T>(`/api/remote-entries/${id}`, {}, token);
  }
);
