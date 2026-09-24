// The Inkwell Gazette: shared types and small formatting helpers.
// Data comes from GET /api/gazette (an edition) and /api/gazette/stories/:id.

export interface GazetteSection {
  id: string;
  label: string;
}

/** A story as it appears in an edition (a snapshot taken when it was published). */
export interface GazetteStory {
  id: string;
  url: string;
  title: string;
  description: string | null;
  image_url: string | null;
  image_description: string | null;
  provider_name: string | null;
  author_name: string | null;
  article_published_at: string | null;
  opinion: boolean;
  topics: string[];
  shares_today: number;
  shares_week: number;
  trending_on: string[];
  continuing?: boolean;
  response_count?: number;
}

export interface GazetteResponse {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  kind: string;
  published_at: string;
  word_count: number | null;
  gazette_story_id: string | null;
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    avatar_frame: string | null;
  };
}

export interface GazetteEditionMeta {
  number: number;
  slot: "morning" | "evening";
  published_at: string;
  story_count: number;
  publisher_count: number;
  people_sharing: number;
  previous_number: number | null;
  next_number: number | null;
  latest: boolean;
}

export interface GazetteEditionData {
  edition: GazetteEditionMeta | null;
  stories: GazetteStory[];
  responses: GazetteResponse[];
  sections: GazetteSection[];
  my_sections: string[];
  method?: { sources: string[]; per_publisher: number };
}

export interface ConversationPost {
  id: string;
  url: string;
  content_html: string;
  created_at: string;
  "reply?": boolean;
  boosts: number;
  likes: number;
  replies: number;
  author: {
    display_name: string;
    acct: string;
    domain: string;
    avatar_url: string | null;
    profile_url: string | null;
  };
}

export function sectionLabel(sections: GazetteSection[], id: string): string {
  const found = sections.find((s) => s.id === id)?.label;
  return found ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export function formatCount(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

/** "Shared by 216 people today" — or the week's count when today's is small. */
export function sharedLine(story: Pick<GazetteStory, "shares_today" | "shares_week">): string {
  if (story.shares_today >= 5) {
    return `Shared by ${formatCount(story.shares_today)} ${story.shares_today === 1 ? "person" : "people"} today`;
  }
  const n = Math.max(story.shares_week, story.shares_today);
  return `Shared by ${formatCount(n)} ${n === 1 ? "person" : "people"} this week`;
}

export function publisherOf(story: Pick<GazetteStory, "provider_name" | "url">): string {
  if (story.provider_name) return story.provider_name;
  try {
    return new URL(story.url).hostname.replace(/^www\./, "");
  } catch {
    return "the publisher";
  }
}

export function editionLabel(slot: string): string {
  return slot === "morning" ? "Morning edition" : "Evening edition";
}

export function storyHref(id: string): string {
  return `/gazette/story/${id}`;
}

export function writeAboutHref(id: string): string {
  return `/editor?gazette=${id}`;
}

export function responseHref(r: Pick<GazetteResponse, "slug" | "author">): string {
  return `/${r.author.username}/${r.slug}`;
}
