// Unsent letters, one per conversation, kept in this browser so leaving the
// page (or closing the stationery) doesn't lose what someone was writing.
// Browser storage can be missing or refuse writes (private windows, blocked
// site data), so every access is wrapped and failure just means no draft.

const key = (conversationId: string) => `inkwell-letter-draft:${conversationId}`;

export function isBlankLetter(html: string): boolean {
  return (
    html
      .replace(/<img\b[^>]*>/gi, "x")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim().length === 0
  );
}

export function loadLetterDraft(conversationId: string): string {
  try {
    return window.localStorage.getItem(key(conversationId)) ?? "";
  } catch {
    return "";
  }
}

export function saveLetterDraft(conversationId: string, html: string): void {
  try {
    if (isBlankLetter(html)) window.localStorage.removeItem(key(conversationId));
    else window.localStorage.setItem(key(conversationId), html);
  } catch {
    // no storage: the draft lives only as long as the page
  }
}

export function clearLetterDraft(conversationId: string): void {
  try {
    window.localStorage.removeItem(key(conversationId));
  } catch {
    // nothing to clear
  }
}
