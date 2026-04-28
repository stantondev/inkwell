/**
 * Inkwell API client
 *
 * Server components and Route Handlers call the VM-internal URL (localhost:4000).
 * Client components use NEXT_PUBLIC_API_URL (the VM's external IP).
 */

export const SERVER_API = process.env.API_URL ?? "http://localhost:4000";
export const CLIENT_API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://192.168.64.2:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Server-side fetch — always uses the internal API URL.
 * Pass a Bearer token for authenticated endpoints.
 *
 * Retries once on 5xx errors to handle Fly.io Postgres cold starts
 * where the DB machine needs a moment to unsuspend.
 *
 * Has an 8-second timeout on the underlying fetch so a slow API can't
 * hang an entire SSR render — Fly's web health check times out at 15s,
 * so an unbounded fetch here can take down the whole web machine.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${SERVER_API}${path}`, {
        ...options,
        headers,
        cache: "no-store", // always fresh for auth-sensitive data
        signal: options.signal ?? AbortSignal.timeout(8000),
      });
    } catch (err) {
      // Treat AbortError / network errors as a 504 so the retry-on-5xx path
      // applies. After the second timeout, surface a real error.
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      const message =
        err instanceof Error ? err.message : "Network request failed";
      throw new ApiError(`Upstream API timeout: ${message}`, 504);
    }

    // Retry once on server errors (likely DB cold start)
    if (res.status >= 500 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(
        (body as { error?: string }).error ?? `Request failed (${res.status})`,
        res.status,
        body
      );
    }

    return res.json() as Promise<T>;
  }

  // Shouldn't reach here, but satisfy TypeScript
  throw new ApiError("Request failed after retries", 500);
}
