/**
 * The domain in every Inkwell member's fediverse handle (@user@inkwell.social).
 * WebFinger answers on inkwell.social even when a writer's pages live on their
 * own domain.
 */
export const FEDIVERSE_HANDLE_DOMAIN = "inkwell.social";

export function fediverseHandle(username: string): string {
  return `@${username}@${FEDIVERSE_HANDLE_DOMAIN}`;
}
