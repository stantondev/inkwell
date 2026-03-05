import { processTemplateHtml, type TemplateContext } from "@/lib/template-tags";
import { scopeEntryHtml } from "@/lib/scope-styles";
import { CustomProfileHydrator } from "./custom-profile-hydrator";
import type { ProfileStyles } from "@/lib/profile-styles";

interface FullPageCustomProfileProps {
  profileHtml: string;
  profileCss: string | null;
  scopeId: string;
  templateContext: TemplateContext;
  styles: ProfileStyles;
  // Data for hydrated widgets
  entries: Array<{
    id: string;
    slug: string;
    title: string | null;
    body_html: string;
    mood: string | null;
    music: string | null;
    tags: string[];
    stamps?: string[];
    comment_count?: number;
    published_at: string;
    word_count?: number;
    excerpt?: string | null;
    cover_image_id?: string | null;
    category?: string | null;
  }>;
  entryCount: number;
  displayMode: "cards" | "full" | "preview";
  entryYears: number[];
  entryTags: Array<{ tag: string; count: number }>;
  entryCategories: Array<{ category: string; count: number }>;
}

/**
 * Server component that renders a full-page custom HTML profile.
 *
 * 1. Processes template tags ({{entries}}, {{guestbook}}, etc.) in the user's HTML
 * 2. Scopes CSS selectors to prevent style leakage
 * 3. Renders the processed HTML via dangerouslySetInnerHTML
 * 4. Includes a client-side hydrator that mounts React components into placeholder divs
 */
export function FullPageCustomProfile({
  profileHtml,
  profileCss,
  scopeId,
  templateContext,
  styles,
  entries,
  entryCount,
  displayMode,
  entryYears,
  entryTags,
  entryCategories,
}: FullPageCustomProfileProps) {
  // Step 1: Process template tags in the user's HTML
  const { bodyHtml: templateProcessed, widgetSlots } = processTemplateHtml(
    profileHtml,
    templateContext,
    scopeId
  );

  // Step 2: Sanitize HTML and scope CSS via existing pipeline
  const processed = scopeEntryHtml(templateProcessed, scopeId);

  // Step 3: Process custom CSS separately if provided
  const customCssProcessed = profileCss
    ? scopeEntryHtml(`<style>${profileCss}</style>`, scopeId)
    : null;

  // Combine all scoped styles
  const allStyles = [
    processed.scopedStyles,
    customCssProcessed?.scopedStyles,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <>
      {/* Scoped styles */}
      {allStyles && (
        <style dangerouslySetInnerHTML={{ __html: allStyles }} />
      )}

      {/* CSS containment for full-page mode */}
      <style
        dangerouslySetInnerHTML={{
          __html: `#${scopeId} { contain: layout style; position: relative; z-index: 0; }`,
        }}
      />

      {/* User's custom HTML with template tags replaced */}
      <div
        id={scopeId}
        className="inkwell-fullpage-profile overflow-hidden"
        dangerouslySetInnerHTML={{ __html: processed.bodyHtml }}
      />

      {/* Client-side hydrator mounts React components into placeholder divs */}
      {widgetSlots.length > 0 && (
        <CustomProfileHydrator
          key={`hydrator-${Date.now()}`}
          containerId={scopeId}
          widgetSlots={widgetSlots}
          profile={templateContext.profile}
          entries={entries}
          entryCount={entryCount}
          displayMode={displayMode}
          entryYears={entryYears}
          entryTags={entryTags}
          entryCategories={entryCategories}
          topFriends={templateContext.topFriends}
          isOwnProfile={templateContext.isOwnProfile}
          isLoggedIn={templateContext.isLoggedIn}
          relationshipStatus={templateContext.relationshipStatus}
          styles={styles}
          penPalCount={templateContext.penPalCount}
          readerCount={templateContext.readerCount}
        />
      )}
    </>
  );
}
