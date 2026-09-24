// The reader's "Look & feel": Modern (the default) or Classic, a 2004
// LiveJournal-style view. Stored in users.settings.site_look. The root layout
// puts data-look="classic" on <body> (restyles the site through CSS tokens);
// Feed and Explore also switch to the friends-page layout.

export type SiteLook = "modern" | "classic";

export function siteLookOf(settings: Record<string, unknown> | null | undefined): SiteLook {
  return settings?.site_look === "classic" ? "classic" : "modern";
}

/**
 * Save the reader's look and reload, so the server renders the page with the
 * new data-look (and Feed/Explore with the matching layout). Returns false
 * when saving failed; the page stays as it was.
 */
export async function saveSiteLook(look: SiteLook): Promise<boolean> {
  try {
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { site_look: look } }),
    });
    if (!res.ok) return false;
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}
