/**
 * Shared types for the Inline Marginalia feature.
 *
 * See CLAUDE.md > "Inline Marginalia" for the full design. Anchors follow
 * the W3C Web Annotation TextQuoteSelector model (quote + prefix + suffix)
 * with an optional TextPositionSelector fast-path hint.
 */

export interface AnchorData {
  /** The exact quoted text (after whitespace normalization). */
  quote_text: string;
  /** ~32 chars preceding the quote, used to disambiguate repeated quotes. */
  quote_prefix: string;
  /** ~32 chars following the quote, used to disambiguate repeated quotes. */
  quote_suffix: string;
  /**
   * Character offset of the quote start in the entry's normalized plain text.
   * Optional — used as a fast-path hint when the body hasn't been edited.
   */
  text_position_start?: number | null;
  /** Character offset of the quote end in the entry's normalized plain text. */
  text_position_end?: number | null;
}

export interface MarginNoteAuthor {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_frame: string | null;
  avatar_animation: string | null;
  subscription_tier: string | null;
}

export interface MarginNote extends AnchorData {
  id: string;
  entry_id: string;
  user_id: string;
  note_html: string;
  author: MarginNoteAuthor | null;
  orphaned: boolean;
  created_at: string;
  edited_at: string | null;
}

export interface MarginNoteListResponse {
  data: {
    notes: MarginNote[];
    orphaned: MarginNote[];
  };
}

/** Status of an anchor after attempting to resolve it against the live DOM. */
export type ResolutionStatus =
  | { kind: "exact"; range: Range }
  | { kind: "fuzzy"; range: Range; similarity: number }
  | { kind: "orphaned" };
