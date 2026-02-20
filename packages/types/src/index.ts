// Inkwell Shared Types
// These types are shared between the Next.js frontend and the Federation service.
// The Phoenix backend uses Elixir types but should match these contracts.

export type Privacy = "public" | "friends_only" | "private" | "custom";

export type RelationshipStatus = "pending" | "accepted" | "blocked";

export type CommunityRole = "member" | "moderator" | "admin" | "owner";

export type PostingAccess = "open" | "moderated" | "members_only";

export type NotificationType =
  | "comment"
  | "follow_request"
  | "follow_accepted"
  | "mention"
  | "community_invite"
  | "tip";

export interface User {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  pronouns: string | null;
  avatarUrl: string | null;
  profileHtml: string | null;
  profileCss: string | null;
  apId: string;
  createdAt: string;
}

export interface UserIcon {
  id: string;
  userId: string;
  imageUrl: string;
  keyword: string;
  isDefault: boolean;
  sortOrder: number;
}

export interface MusicMetadata {
  artist: string;
  track: string;
  album?: string;
  albumArtUrl?: string;
  service?: "lastfm" | "spotify" | "soundcloud" | "bandcamp" | "listenbrainz";
  embedUrl?: string;
}

export interface Entry {
  id: string;
  userId: string;
  title: string | null;
  bodyHtml: string;
  mood: string | null;
  music: string | null;
  musicMetadata: MusicMetadata | null;
  privacy: Privacy;
  userIconId: string | null;
  slug: string;
  tags: string[];
  publishedAt: string | null;
  apId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  entryId: string;
  userId: string | null;
  parentCommentId: string | null;
  bodyHtml: string;
  userIconId: string | null;
  apId: string;
  remoteAuthor: RemoteAuthor | null;
  depth: number;
  createdAt: string;
}

export interface RemoteAuthor {
  apId: string;
  name: string;
  avatarUrl: string | null;
  instance: string;
}

export interface Relationship {
  id: string;
  followerId: string;
  followingId: string;
  status: RelationshipStatus;
  isMutual: boolean;
  createdAt: string;
}

export interface FriendFilter {
  id: string;
  userId: string;
  name: string;
  memberIds: string[];
  createdAt: string;
}

export interface TopFriend {
  id: string;
  userId: string;
  friendId: string;
  position: number;
}

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  profileHtml: string | null;
  profileCss: string | null;
  rules: string | null;
  postingAccess: PostingAccess;
  apId: string;
  createdAt: string;
}

export interface Theme {
  id: string;
  creatorId: string;
  name: string;
  description: string | null;
  htmlTemplate: string;
  css: string;
  previewImageUrl: string | null;
  installCount: number;
  forkedFromId: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  actorId: string | null;
  targetType: string;
  targetId: string;
  read: boolean;
  createdAt: string;
}

// API Response types
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface FeedEntry extends Entry {
  author: User;
  userIcon: UserIcon | null;
  commentCount: number;
}
