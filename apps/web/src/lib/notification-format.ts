// Shared by the Notifications page and the live pop-up toasts, so both
// describe and link a notification the same way.
import { STAMP_CONFIG } from "@/components/stamp-config";

export interface RemoteActor {
  username: string;
  domain: string;
  display_name: string;
  avatar_url: string | null;
  profile_url: string | null;
  ap_id: string | null;
  is_following_back?: boolean;
}

export interface Notification {
  id: string;
  type: string;
  read: boolean;
  inserted_at: string;
  target_type: string | null;
  target_id: string | null;
  follow_accepted?: boolean;
  actor: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  remote_actor?: RemoteActor | null;
  data?: Record<string, unknown>;
  entry?: {
    slug: string;
    title: string | null;
    kind?: "entry" | "sticky";
    excerpt?: string | null;
    user: { username: string };
  } | null;
}


// ─── Notification text ─────────────────────────────────────────
export function notificationText(n: Notification): string {
  switch (n.type) {
    case "follow_request":
      return "sent you a pen pal request";
    case "follow_accepted":
      return "is now your pen pal!";
    case "comment_added":
    case "comment":
      return "commented on your entry";
    case "reply":
      return "replied to your comment";
    case "mention":
      return "mentioned you in a comment";
    case "like":
      return "inked your entry from the fediverse";
    case "stamp": {
      const stampType = n.data?.stamp_type as string | undefined;
      const stampInfo = stampType ? STAMP_CONFIG[stampType] : null;
      if (stampInfo) {
        return `stamped your entry \u2014 \u201C${stampInfo.description}\u201D`;
      }
      return "stamped your entry";
    }
    case "feedback_status_change": {
      const status = n.data?.new_status as string | undefined;
      const labels: Record<string, string> = {
        under_review: "under review",
        planned: "planned",
        in_progress: "in progress",
        done: "shipped",
        declined: "declined",
      };
      const label = status ? labels[status] || status : "updated";
      return `marked your feedback as ${label}`;
    }
    case "feedback_comment":
      return "commented on your feedback post";
    case "feedback_mention":
      return "mentioned you in a feedback comment";
    case "poll_comment":
      return "commented on your poll";
    case "poll_mention":
      return "mentioned you in a poll comment";
    case "feedback_vote":
      return "upvoted your feedback post";
    case "letter":
      return "sent you a letter";
    case "tip": {
      const amountCents = n.data?.amount_cents as number | undefined;
      const amt = amountCents ? `$${(amountCents / 100).toFixed(2)}` : "";
      const tipMsg = n.data?.message as string | undefined;
      return `sent you ${amt ? amt + " in " : ""}postage${tipMsg ? ` \u2014 "${tipMsg}"` : ""}`;
    }
    case "ink":
      return "inked your entry";
    case "reprint":
      return "reprinted your entry";
    case "margin_note": {
      const snippet = n.data?.quote_snippet as string | undefined;
      return snippet ? `annotated "${snippet}"` : "annotated your entry";
    }
    case "invite_accepted":
      return "joined Inkwell from your invitation";
    case "fediverse_follow":
      return "followed you from the fediverse";
    case "fediverse_mention":
      return "mentioned you from the fediverse";
    case "guestbook": {
      const excerpt = n.data?.excerpt as string | undefined;
      const where = n.remote_actor ? " from the fediverse" : "";
      return `signed your guestbook${where}${excerpt ? ` — “${excerpt}”` : ""}`;
    }
    case "circle_response": {
      const circleName = n.data?.circle_name as string | undefined;
      return circleName ? `responded to your discussion in ${circleName}` : "responded to your discussion";
    }
    case "circle_mention": {
      const circleName2 = n.data?.circle_name as string | undefined;
      return circleName2 ? `mentioned you in ${circleName2}` : "mentioned you in a circle";
    }
    case "circle_prompt": {
      const where = n.data?.circle_name ? ` in ${n.data.circle_name}` : "";
      const title = n.data?.prompt_title as string | undefined;
      return `posted a new prompt${where}${title ? `: “${title}”` : ""}`;
    }
    case "circle_prompt_response": {
      const where = n.data?.circle_name ? ` in ${n.data.circle_name}` : "";
      const title = n.data?.prompt_title as string | undefined;
      return title ? `answered “${title}”${where}` : `answered your post${where}`;
    }
    case "circle_new_member": {
      const circleName3 = n.data?.circle_name as string | undefined;
      return circleName3 ? `joined ${circleName3}` : "joined your circle";
    }
    case "writer_plan_subscribe": {
      const subAmountCents = n.data?.amount_cents as number | undefined;
      const subAmt = subAmountCents ? `$${(subAmountCents / 100).toFixed(2)}/mo` : "";
      return `subscribed to your plan${subAmt ? ` (${subAmt})` : ""}`;
    }
    case "report":
      return "reported an entry";
    case "warning": {
      const strikeNumber = n.data?.strike_number as number | undefined;
      const escalated = n.data?.escalated_to_block as boolean | undefined;
      if (escalated) {
        return `issued a final warning — your account has been suspended`;
      }
      return strikeNumber
        ? `issued a formal warning (strike ${strikeNumber})`
        : "issued a formal warning";
    }
    default:
      return "interacted with your content";
  }
}

// ─── Helpers ───────────────────────────────────────────────────
// Older fediverse notifications stored the preview with HTML entities still in
// it ("haven&#39;t"). Decode them for display.
export function decodeEntities(text: string): string {
  // Pure string work, not a DOM <textarea>: this also runs during server
  // rendering, and decoding only in the browser made the server's text differ
  // from the client's (a hydration error on the Notifications page).
  if (!text.includes("&")) return text;
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00A0",
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return named[code.toLowerCase()] ?? match;
  });
}

export function getEntryHref(n: Notification): string | null {
  if (n.entry) return `/${n.entry.user.username}/${n.entry.slug}`;
  // A fediverse post you commented on, read on Inkwell's own page for it.
  if (n.target_type === "remote_entry" && n.target_id) return `/fediverse/${n.target_id}`;
  return null;
}

export function getActorInfo(n: Notification) {
  if (n.actor) {
    return {
      displayName: n.actor.display_name,
      avatarUrl: n.actor.avatar_url,
      href: `/${n.actor.username}`,
      isRemote: false,
      handle: null,
    };
  }
  if (n.remote_actor) {
    return {
      displayName: n.remote_actor.display_name || n.remote_actor.username,
      avatarUrl: n.remote_actor.avatar_url,
      href: n.remote_actor.profile_url,
      isRemote: true,
      handle: `@${n.remote_actor.username}@${n.remote_actor.domain}`,
    };
  }
  return {
    displayName: "Someone",
    avatarUrl: null,
    href: null,
    isRemote: false,
    handle: null,
  };
}

export function getNotificationHref(n: Notification): string | null {
  // Invite accepted notifications link to the new user's profile
  if (n.type === "invite_accepted" && n.actor) {
    return `/${n.actor.username}`;
  }
  // Postage notifications link to the postage history page
  if (n.type === "tip") {
    return "/settings/support/postage";
  }
  // Letter notifications link to the conversation thread
  if (n.type === "letter" && n.data?.conversation_id) {
    return `/letters/${n.data.conversation_id}`;
  }
  // Writer plan subscribe notifications link to the subscriptions settings
  if (n.type === "writer_plan_subscribe") {
    return "/settings/subscriptions";
  }
  // Circle notifications link to the circle or discussion
  if ((n.type === "circle_response" || n.type === "circle_mention") && n.data?.circle_slug && n.data?.discussion_id) {
    return `/circles/${n.data.circle_slug}/${n.data.discussion_id}`;
  }
  // A new prompt opens its thread; an answer opens the thread at that answer.
  if (n.type === "circle_prompt" && n.data?.circle_slug && n.target_id) {
    return `/circles/${n.data.circle_slug}/t/${n.target_id}`;
  }
  if (n.type === "circle_prompt_response" && n.data?.circle_slug && n.data?.prompt_id) {
    return `/circles/${n.data.circle_slug}/t/${n.data.prompt_id}#answer-${n.target_id}`;
  }
  if (n.type === "circle_new_member" && n.data?.circle_slug) {
    return `/circles/${n.data.circle_slug}`;
  }
  // Reply notifications link to entry comments
  if (n.type === "reply") {
    const entryHref = getEntryHref(n);
    if (entryHref) return `${entryHref}#comments`;
  }
  // Margin note notifications link to the specific margin note anchor
  if (n.type === "margin_note") {
    const entryHref = getEntryHref(n);
    const noteId = n.data?.margin_note_id as string | undefined;
    if (entryHref && noteId) return `${entryHref}#marginalia-${noteId}`;
    if (entryHref) return entryHref;
  }
  // Poll notifications link to the poll
  if ((n.type === "poll_comment" || n.type === "poll_mention") && n.target_id) {
    return `/polls/${n.target_id}`;
  }
  // Fediverse mention. Direct and followers-only posts 404 for anyone who
  // isn't signed in on the remote server, so only link to the post when it's
  // public; otherwise send people to the sender's profile.
  if (n.type === "fediverse_mention") {
    const actor = n.data?.remote_actor as { profile_url?: string } | undefined;
    if (n.data?.public === true && n.data?.post_url) return n.data.post_url as string;
    return actor?.profile_url ?? null;
  }
  // Guestbook notification — link to the profile's guestbook section
  if (n.type === "guestbook" && n.data?.profile_username) {
    return `/${n.data.profile_username}#guestbook`;
  }
  // Feedback notifications link to the roadmap post
  if (
    (n.type === "feedback_status_change" ||
      n.type === "feedback_comment" ||
      n.type === "feedback_vote" ||
      n.type === "feedback_mention") &&
    n.data?.post_id
  ) {
    return `/roadmap/${n.data.post_id}`;
  }
  // Report notifications link to the admin reports queue
  if (n.type === "report") {
    return "/admin/reports";
  }
  // Warning notifications link to the Community Guidelines so users can read
  // what they violated. (The warning text in the notification row is the headline.)
  if (n.type === "warning") {
    return "/guidelines";
  }
  const entryHref = getEntryHref(n);
  if (entryHref) return entryHref;
  if (
    (n.type === "follow_request" || n.type === "follow_accepted") &&
    n.actor
  ) {
    return `/${n.actor.username}`;
  }
  if (n.remote_actor?.profile_url) return n.remote_actor.profile_url;
  return null;
}
