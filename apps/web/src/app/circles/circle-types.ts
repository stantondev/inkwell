// Shapes returned by the circles API (see CircleController on the API).

export const CIRCLE_CATEGORIES = [
  { value: "writing_craft", label: "Writing & Craft" },
  { value: "reading_books", label: "Reading & Books" },
  { value: "creative_arts", label: "Creative Arts" },
  { value: "lifestyle_interests", label: "Lifestyle" },
  { value: "tech_learning", label: "Tech & Learning" },
  { value: "community", label: "Community" },
];

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CIRCLE_CATEGORIES.map((c) => [c.value, c.label]),
);

export interface CirclePerson {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_frame?: string | null;
  avatar_animation?: string | null;
  subscription_tier?: string;
}

export interface CircleEntry {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  cover_image_id: string | null;
  privacy: string;
  published_at: string;
  word_count: number;
  ink_count: number;
  comment_count?: number;
  my_ink?: boolean;
  is_prompt: boolean;
  circle_prompt_id: string | null;
  response_count?: number | null;
  kind?: string;
  /** Entries answering this one (it started a thread) */
  answer_count?: number;
  answers?: CircleEntry[];
  /** The post or its newest answer, whichever is later */
  last_activity_at?: string;
  body_html?: string;
  is_current?: boolean;
  author: CirclePerson | null;
}

export interface CircleThread {
  circle: { id: string; name: string; slug: string; viewer_role: string | null; is_member: boolean };
  prompt: CircleEntry;
  answers: CircleEntry[];
  answer_count: number;
  viewer_answered: boolean;
}

export const threadHref = (circleSlug: string, entryId: string) => `/circles/${circleSlug}/t/${entryId}`;

export interface Circle {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  member_count: number;
  discussion_count: number;
  entry_count?: number;
  unread_count?: number;
  is_starter: boolean;
  last_activity_at: string | null;
  inserted_at: string;
  is_member?: boolean;
  viewer_role?: "owner" | "moderator" | "member" | null;
  has_archive?: boolean;
  prompt?: CircleEntry | null;
  member_preview?: {
    id: string;
    role: string;
    user: CirclePerson | null;
  }[];
  owner: CirclePerson | null;
}

export interface MyCirclesMeta {
  can_create: boolean;
  create_reason: string | null;
  create_message: string | null;
  circle_limit: number;
  circles_owned: number;
}

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.max(1, Math.floor(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
