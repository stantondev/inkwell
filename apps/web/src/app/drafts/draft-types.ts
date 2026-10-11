// Shapes returned by GET /api/drafts.

export interface DraftEntry {
  id: string;
  title: string | null;
  status: "draft";
  privacy: string;
  word_count: number | null;
  excerpt: string | null;
  /** Plain-text opening of the body, already decoded, ≤200 chars, may be "". */
  preview_text: string | null;
  scheduled_at: string | null;
  /** A draft can carry a date the writer chose (backdating, imports). */
  published_at: string | null;
  created_at: string;
  updated_at: string;
  tags: string[];
  mood: string | null;
  cover_image_id: string | null;
  kind: "entry" | "sticky" | string;
  entry_source: "import" | "email" | string | null;
  circle_id: string | null;
}

export interface DraftsPagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface DraftsMeta {
  /** null when there is no limit (Plus, self-hosted). */
  draft_limit: number | null;
  /** Drafts that count toward the limit (scheduled and imported ones don't). */
  counted: number;
  scheduled: number;
}

export interface DraftsResponse {
  data: DraftEntry[];
  pagination: DraftsPagination;
  meta: DraftsMeta;
}

export type DraftSort = "updated" | "created" | "title";

export const DRAFTS_PER_PAGE = 20;
