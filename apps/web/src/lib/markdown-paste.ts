import { marked } from "marked";

/**
 * Detects whether a string is likely Markdown using a weighted scoring heuristic.
 * Threshold of 4+ avoids false positives on plain text with occasional dashes/asterisks.
 */
export function isMarkdown(text: string): boolean {
  let score = 0;

  // Headers: # Title
  if (/^#{1,6}\s+\S/m.test(text)) score += 3;

  // Bold/italic: **bold**, *italic*, __bold__, _italic_
  if (/(\*\*|__).+?\1/.test(text)) score += 2;
  if (/(?<!\*)(\*|_)(?!\s).+?(?<!\s)\1(?!\*)/.test(text)) score += 1;

  // Unordered lists: - item, * item, + item (at line start)
  const ulMatches = text.match(/^[\t ]*[-*+]\s+\S/gm);
  if (ulMatches) score += Math.min(ulMatches.length, 3);

  // Ordered lists: 1. item
  if (/^\d+\.\s+\S/m.test(text)) score += 2;

  // Links: [text](url)
  if (/\[.+?\]\(.+?\)/.test(text)) score += 2;

  // Images: ![alt](url)
  if (/!\[.*?\]\(.+?\)/.test(text)) score += 3;

  // Code blocks: ```
  if (/^```/m.test(text)) score += 3;

  // Inline code: `code`
  if (/`.+?`/.test(text)) score += 1;

  // Blockquotes: > text
  if (/^>\s+\S/m.test(text)) score += 2;

  // Horizontal rules: ---, ***, ___
  if (/^([-*_]){3,}\s*$/m.test(text)) score += 2;

  // Task lists: - [ ] or - [x]
  if (/^[\t ]*[-*+]\s+\[[ xX]\]/m.test(text)) score += 3;

  // Tables: | cell | cell |
  if (/^\|.+\|/m.test(text) && /^\|[\s-:|]+\|/m.test(text)) score += 3;

  return score >= 4;
}

/**
 * Detects if clipboard HTML is just a plain-text wrapper with no real formatting.
 * Browsers often wrap plain text in <meta charset><span> when copying from terminals, etc.
 * Returns true if the HTML contains no meaningful formatting tags.
 */
export function isPlainTextHtml(html: string): boolean {
  // Strip all HTML tags
  const stripped = html.replace(/<[^>]*>/g, "").trim();
  // Strip metadata/wrapper tags and check if any formatting tags remain
  const withoutWrappers = html
    .replace(/<\/?(?:meta|span|div|p|br|html|head|body)[^>]*>/gi, "")
    .replace(/\n/g, "")
    .trim();
  // If after removing basic wrapper tags there's nothing structural left,
  // this is plain text in an HTML envelope
  return withoutWrappers === stripped;
}

/**
 * Converts Markdown text to HTML suitable for TipTap insertion.
 * Post-processes task lists to match TipTap's expected data attributes.
 */
export function markdownToHtml(text: string): string {
  let html = marked.parse(text, { async: false }) as string;

  // Post-process task lists for TipTap compatibility
  // marked outputs: <ul>\n<li><input type="checkbox" ...> text</li>
  // TipTap expects: <ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>text</p></li>

  // Convert <ul> containing task items to taskList
  html = html.replace(
    /<ul>\n?((?:<li><input[^>]*>[\s\S]*?<\/li>\n?)+)<\/ul>/g,
    (_match, items: string) => {
      const converted = items.replace(
        /<li><input\s+(?:disabled=""\s+)?type="checkbox"(\s+checked="")?\s*>\s*([\s\S]*?)<\/li>/g,
        (_m: string, checked: string | undefined, content: string) => {
          const isChecked = checked ? "true" : "false";
          return `<li data-type="taskItem" data-checked="${isChecked}"><p>${content.trim()}</p></li>`;
        }
      );
      return `<ul data-type="taskList">${converted}</ul>`;
    }
  );

  return html;
}
