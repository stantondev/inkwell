export interface CommentAuthor {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_frame?: string | null;
  subscription_tier?: string | null;
}

export interface CommentRemoteAuthor {
  username: string;
  domain: string;
  display_name: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  ap_id: string;
}

export interface Comment {
  id: string;
  entry_id: string;
  user_id: string | null;
  parent_comment_id: string | null;
  body_html: string;
  depth: number;
  author: CommentAuthor | null;
  remote_author: CommentRemoteAuthor | null;
  created_at: string;
  edited_at: string | null;
}

export interface CommentThread {
  comment: Comment;
  replies: CommentThread[];
}

/**
 * Build a thread tree from a flat list of comments.
 * Comments with a parent_comment_id that doesn't exist in the list
 * (orphaned replies from deleted parents) become root-level.
 */
export function buildThreadTree(comments: Comment[]): CommentThread[] {
  const map = new Map<string, CommentThread>();
  const roots: CommentThread[] = [];

  // First pass: create nodes
  for (const c of comments) {
    map.set(c.id, { comment: c, replies: [] });
  }

  // Second pass: link parents to children
  for (const c of comments) {
    const node = map.get(c.id)!;
    if (c.parent_comment_id && map.has(c.parent_comment_id)) {
      map.get(c.parent_comment_id)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Count total comments in a thread tree (including all nested replies).
 */
export function countThreadComments(threads: CommentThread[]): number {
  let count = 0;
  for (const t of threads) {
    count += 1 + countThreadComments(t.replies);
  }
  return count;
}

/**
 * Format a relative time string from an ISO timestamp.
 */
export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

/**
 * Check if a comment is within the 24-hour edit window.
 */
export function isWithinEditWindow(createdAt: string): boolean {
  const created = new Date(createdAt).getTime();
  const deadline = created + 24 * 60 * 60 * 1000;
  return Date.now() < deadline;
}
