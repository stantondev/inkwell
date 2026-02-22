import { scopeEntryHtml } from "@/lib/scope-styles";

/**
 * Renders entry HTML with scoped styles and sanitized content.
 * Custom <style> tags are extracted, their selectors are prefixed
 * with the entry's unique ID so they don't leak to the rest of the page.
 *
 * This is what enables the fun LiveJournal/MySpace-era custom HTML:
 * <marquee>, CSS animations, custom colors, gradients, text effects, etc.
 */
export function EntryContent({
  html,
  entryId,
  className,
}: {
  html: string;
  entryId: string;
  className?: string;
}) {
  const scopeId = `entry-${entryId}`;
  const { bodyHtml, scopedStyles } = scopeEntryHtml(html, scopeId);

  return (
    <>
      {scopedStyles && (
        <style dangerouslySetInnerHTML={{ __html: scopedStyles }} />
      )}
      <div
        id={scopeId}
        className={className}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </>
  );
}
