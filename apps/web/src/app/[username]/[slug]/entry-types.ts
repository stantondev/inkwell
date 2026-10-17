import type { StampMark } from "@/components/stamp-config";
import type { MusicMetadata } from "@/lib/music";
import type { PollData } from "@/components/poll-widget";
import type { MarginNote } from "@/lib/marginalia/types";

// The entry as the API renders it (EntryController.render_entry_full plus the
// extras the public show/1 adds). Shared by the entry page and /preview/[id].

export interface EntryAuthor {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame?: string | null;
  avatar_animation?: string | null;
  bio: string | null;
  pronouns: string | null;
  support_url?: string | null;
  support_label?: string | null;
  stripe_connect_enabled?: boolean;
  subscription_tier?: string | null;
  newsletter_enabled?: boolean;
  newsletter_name?: string | null;
}

export interface EntryData {
  id: string;
  title: string | null;
  body_html: string;
  mood: string | null;
  mood_key?: string | null;
  mood_theme?: string | null;
  location?: string | null;
  userpic?: { id: string; keyword: string; url: string } | null;
  music: string | null;
  music_metadata?: MusicMetadata | null;
  tags: string[];
  privacy: string;
  custom_filter_id?: string | null;
  status?: string | null;
  scheduled_at?: string | null;
  slug: string;
  published_at: string;
  created_at: string;
  updated_at?: string;
  stamps?: string[];
  my_stamp?: string | null;
  /** The newest stamps on the entry, as impressions (newest first). */
  stamp_marks?: StampMark[];
  stamp_count?: number;
  /** The viewer's own note and the day they stamped (entry page only). */
  my_note?: string | null;
  my_stamped_on?: string | null;
  bookmarked?: boolean;
  word_count?: number;
  /** Owner only: how many times the entry has been read. */
  read_count?: number;
  excerpt?: string | null;
  cover_image_id?: string | null;
  category?: string | null;
  series_id?: string | null;
  series_order?: number | null;
  series?: {
    id: string;
    title: string;
    slug: string;
    status: string;
    entry_count: number;
    username: string;
    prev_entry?: { slug: string; title: string | null } | null;
    next_entry?: { slug: string; title: string | null } | null;
  } | null;
  /** The writer's previous/next journal entries by date, among those the viewer can read. */
  journal_nav?: {
    older: { title: string | null; slug: string; published_at: string } | null;
    newer: { title: string | null; slug: string; published_at: string } | null;
  };
  sensitive?: boolean;
  content_warning?: string | null;
  admin_sensitive?: boolean;
  is_sensitive?: boolean;
  ink_count?: number;
  reprint_count?: number;
  margin_note_count?: number;
  my_ink?: boolean;
  my_reprint?: boolean;
  marginalia?: MarginNote[];
  orphaned_marginalia?: MarginNote[];
  tip_total_cents?: number;
  tip_count?: number;
  poll?: PollData | null;
  entry_source?: string | null;
  imported_from?: string | null;
  imported_url?: string | null;
  archive_mark?: boolean;
  archive_note?: string | null;
  is_paywalled?: boolean;
  quoted_entry?: {
    id: string;
    type: "local" | "remote";
    title: string | null;
    body_html: string | null;
    excerpt: string | null;
    slug?: string | null;
    url?: string | null;
    cover_image_id?: string | null;
    published_at: string;
    word_count?: number | null;
    ink_count?: number;
    reprint_count?: number;
    category?: string | null;
    tags?: string[];
    author: {
      username: string;
      display_name: string;
      avatar_url: string | null;
      avatar_frame?: string | null;
      subscription_tier?: string | null;
      ink_donor_status?: string | null;
      domain?: string;
    };
  } | null;
  writer_plan?: {
    id: string;
    name: string;
    price_cents: number;
    subscriber_count: number;
  } | null;
  is_paid?: boolean;
  custom_domain?: string | null;
  /** New account that links out and hasn't interacted with anyone yet. */
  noindex?: boolean;
  kind?: "entry" | "sticky";
  sticky_color?: string | null;
  expanded_into?: { slug: string; title: string | null; username: string } | null;
  source_sticky?: { slug: string; username: string; excerpt: string | null } | null;
  gazette_story?: { id: string; title: string; url: string; provider_name: string | null } | null;
  circle?: { id: string; name: string; slug: string; is_prompt: boolean; viewer_role: string | null } | null;
  circle_prompt?: { id: string; title: string | null; slug: string; username: string } | null;
  author: EntryAuthor;
}
