/** Stickies: short posts (no title, up to 500 characters) drawn as sticky notes. */

export const STICKY_MAX_CHARS = 500;

export const STICKY_COLORS = [
  { id: "yellow", label: "Yellow" },
  { id: "pink", label: "Pink" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "lilac", label: "Lilac" },
  { id: "peach", label: "Peach" },
] as const;

export type StickyColor = (typeof STICKY_COLORS)[number]["id"];

/**
 * A small, stable tilt for each sticky (-1.4° to 1.4°) so a board of them
 * looks hand-placed. Derived from the id so it's the same on every render.
 */
export function stickyTilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 29) - 14) / 10;
}

/** Window event that opens the Jot composer from anywhere (sidebar, menu, feed prompt). */
export const OPEN_JOT_EVENT = "inkwell-open-jot";

export function openJot() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_JOT_EVENT));
}
