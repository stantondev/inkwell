import { getSite } from "@/lib/site";

/**
 * A member's fediverse handle: @user@inkwell.social here, @user@<its domain>
 * on a self-hosted server. WebFinger answers on the site's own domain even
 * when a writer's pages live on their own custom domain.
 */
export function fediverseHandle(username: string): string {
  return `@${username}@${getSite().host}`;
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
