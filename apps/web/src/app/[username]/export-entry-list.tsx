import type { ProfileStyles } from "@/lib/profile-styles";
import type { ProfileEntry } from "./profile-types";

/**
 * Every entry, newest first, for the page exported as a website (which has
 * no scripts, so no pages or search): title, date and opening lines, each
 * linking to its own page in the export.
 */
export function ExportEntryList({ entries, username, styles }: { entries: ProfileEntry[]; username: string; styles: ProfileStyles }) {
  if (entries.length === 0) return null;
  return (
    <section className="min-w-0 export-entry-list">
      <h2 className="text-sm font-medium uppercase tracking-widest mb-4" style={{ color: styles.muted }}>
        Journal entries
      </h2>
      <ol className="flex flex-col gap-5">
        {entries.map((e) => {
          const opening = (e.excerpt || e.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 220);
          return (
            <li key={e.id}>
              <a href={`/${username}/${e.slug}`} className="block group">
                <span className="block text-lg font-semibold group-hover:underline" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                  {e.title || opening.slice(0, 60) || "Untitled"}
                </span>
                <span className="block text-xs mt-0.5" style={{ color: styles.muted }}>
                  {new Date(e.published_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
                </span>
                {e.title && opening && <span className="block text-sm mt-1" style={{ color: styles.muted }}>{opening}{opening.length >= 220 ? "…" : ""}</span>}
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
