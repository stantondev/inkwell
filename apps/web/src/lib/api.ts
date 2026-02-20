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

  const res = await fetch(`${SERVER_API}${path}`, {
    ...options,
    headers,
    cache: "no-store", // always fresh for auth-sensitive data
  });

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
