/** Decode HTML entities in plain-text excerpts so they render as proper Unicode characters */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => {
      try { return String.fromCodePoint(parseInt(code, 10)); } catch { return ""; }
    })
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ""; }
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&hellip;/g, "\u2026")
    .replace(/&[a-zA-Z]+;/g, "");
}
