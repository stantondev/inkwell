import type { buildProfileStyles } from "@/lib/profile-styles";
import type { ProfileHome } from "@/lib/profile-home";

export type ProfileStyles = ReturnType<typeof buildProfileStyles>;

export interface ProfileUser {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  bio_html: string | null;
  pronouns: string | null;
  avatar_url: string | null;
  avatar_frame?: string | null;
  avatar_animation?: string | null;
  profile_effect?: string | null;
  profile_effect_intensity?: string | null;
  ap_id: string;
  subscription_tier?: string;
  created_at: string;
  profile_html?: string | null;
  profile_css?: string | null;
  profile_music?: string | null;
  /** Shows a ListenBrainz "Listening now" card (Settings → Listening). */
  shows_listening?: boolean;
  /** `/api/backgrounds/:username?v=…`, never the image itself. */
  profile_background_url?: string | null;
  /** `/api/banners/:username?v=…`, never the image itself. */
  profile_banner_url?: string | null;
  profile_background_color?: string | null;
  profile_accent_color?: string | null;
  profile_foreground_color?: string | null;
  profile_font?: string | null;
  profile_layout?: string | null;
  profile_home?: ProfileHome | null;
  profile_status?: string | null;
  profile_theme?: string | null;
  newsletter_enabled?: boolean;
  newsletter_name?: string | null;
  newsletter_description?: string | null;
  subscriber_count?: number;
  support_url?: string | null;
  support_label?: string | null;
  stripe_connect_enabled?: boolean;
  profile_entry_display?: string | null;
  pinned_entry_ids?: string[];
  social_links?: Record<string, string> | null;
  ink_donor_status?: string | null;
  founding_member_number?: number | null;
  ink_donor_amount_cents?: number | null;
  visitor_count?: number;
  entries_per_page?: Record<string, number> | null;
}

export interface ProfileEntry {
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
}

export interface ProfileSeriesItem {
  id: string;
  title: string;
  slug: string;
  status: "ongoing" | "completed";
  entry_count: number;
}

export interface TopFriendUser {
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame?: string | null;
  avatar_animation?: string | null;
}

export interface TopFriendSlot {
  position: number;
  user: TopFriendUser;
}

export type EntryDisplayMode = "full" | "cards" | "preview" | "magazine";
