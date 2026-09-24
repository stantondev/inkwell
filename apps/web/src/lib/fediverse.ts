/**
 * The domain in every Inkwell member's fediverse handle (@user@inkwell.social).
 * WebFinger answers on inkwell.social even when a writer's pages live on their
 * own domain.
 */
export const FEDIVERSE_HANDLE_DOMAIN = "inkwell.social";

export function fediverseHandle(username: string): string {
  return `@${username}@${FEDIVERSE_HANDLE_DOMAIN}`;
}

/**
 * The origin the visitor actually used. Behind Fly, `request.url` is the
 * container's own address (https://0.0.0.0:3000), so redirects built from it
 * sent browsers nowhere.
 */
export function publicOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
