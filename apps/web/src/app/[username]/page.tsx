import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import { FollowButton } from "./follow-button";
import { MusicPlayer } from "@/components/music-player";
import { EntryContent } from "@/components/entry-content";

interface ProfileParams {
  params: Promise<{ username: string }>;
}

interface ProfileUser {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  pronouns: string | null;
  avatar_url: string | null;
  ap_id: string;
  subscription_tier?: string;
  created_at: string;
}

interface ProfileEntry {
  id: string;
  slug: string;
  title: string | null;
  body_html: string;
  mood: string | null;
  music: string | null;
  tags: string[];
  comment_count?: number;
  published_at: string;
}

interface TopFriendUser {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface TopFriendSlot {
  position: number;
  user: TopFriendUser;
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(isoString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Avatar({ url, name, size = 80 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} width={size} height={size}
      className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center font-semibold select-none"
      style={{ width: size, height: size, background: "var(--accent-light)", color: "var(--accent)", fontSize: size * 0.38 }}
      aria-label={name}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

function TopFriends({ friends, isOwnProfile }: { friends: TopFriendSlot[]; isOwnProfile: boolean }) {
  if (friends.length === 0 && !isOwnProfile) return null;
  return (
    <div className="rounded-xl border p-4"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--muted)" }}>
          Top Pen Pals
        </h3>
        {isOwnProfile && (
          <Link href="/settings/top-friends" className="text-xs hover:underline"
            style={{ color: "var(--accent)" }}>
            Manage
          </Link>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {friends.map((slot) => (
          <Link key={slot.user.username} href={`/${slot.user.username}`}
            className="flex flex-col items-center gap-1 group">
            {slot.user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={slot.user.avatar_url} alt={slot.user.display_name}
                className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                {slot.user.display_name[0]}
              </div>
            )}
            <span className="text-xs text-center leading-tight truncate w-full group-hover:underline"
              style={{ color: "var(--muted)" }}>
              {slot.user.display_name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ProfileEntry({ entry, username }: { entry: ProfileEntry; username: string }) {
  const href = `/${username}/${entry.slug ?? entry.id}`;
  return (
    <article className="py-5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1 min-w-0">
          {entry.title && (
            <h2 className="text-lg font-semibold leading-snug mb-1"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              <Link href={href} className="hover:underline">{entry.title}</Link>
            </h2>
          )}
          {(entry.mood || entry.music) && (
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mb-2 text-xs" style={{ color: "var(--muted)" }}>
              {entry.mood && <span><span className="font-medium" style={{ color: "var(--foreground)" }}>mood:</span> {entry.mood}</span>}
              {entry.music && <span><span className="font-medium" style={{ color: "var(--foreground)" }}>♪</span> {entry.music}</span>}
            </div>
          )}
        </div>
        <span className="text-xs flex-shrink-0 mt-1" style={{ color: "var(--muted)" }}>
          {timeAgo(entry.published_at)}
        </span>
      </div>
      <EntryContent html={entry.body_html} entryId={entry.id}
        className="prose-entry text-sm leading-relaxed line-clamp-3 mb-3" />
      <MusicPlayer music={entry.music} />
      <div className="flex items-center justify-between mt-3">
        <div className="flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <Link key={tag} href={`/tag/${tag}`}
              className="text-xs px-2 py-0.5 rounded-full border transition-colors hover:border-accent"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              #{tag}
            </Link>
          ))}
        </div>
        <Link href={`${href}#comments`} className="flex items-center gap-1 text-xs"
          style={{ color: "var(--muted)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {entry.comment_count ?? 0}
        </Link>
      </div>
    </article>
  );
}

export async function generateMetadata({ params }: ProfileParams): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params }: ProfileParams) {
  const { username } = await params;
  const session = await getSession();
  const isOwnProfile = session?.user.username === username;

  // Fetch user profile
  let profile: ProfileUser;
  let entries: ProfileEntry[] = [];
  let topFriends: TopFriendSlot[] = [];
  let entryCount = 0;

  try {
    const data = await apiFetch<{
      data: ProfileUser;
      meta: { entry_count: number; top_friends: TopFriendSlot[] };
    }>(`/api/users/${username}`);

    profile = data.data;
    entryCount = data.meta.entry_count;
    topFriends = data.meta.top_friends ?? [];
  } catch {
    notFound();
  }

  // Fetch public entries
  try {
    const data = await apiFetch<{ data: ProfileEntry[] }>(
      `/api/users/${username}/entries?limit=5`
    );
    entries = data.data ?? [];
  } catch {
    // silently ignore — show no entries
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Profile header */}
        <header className="rounded-2xl border overflow-hidden mb-8"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="h-24 w-full" aria-hidden="true"
            style={{ background: "linear-gradient(135deg, var(--accent-light) 0%, var(--surface-hover) 100%)" }} />
          <div className="px-6 pb-6">
            <div className="-mt-10 mb-4 flex items-end justify-between">
              <div className="rounded-full p-1" style={{ background: "var(--surface)" }}>
                <Avatar url={profile.avatar_url} name={profile.display_name} size={80} />
              </div>
              {isOwnProfile ? (
                <Link href="/settings"
                  className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                  Edit profile
                </Link>
              ) : (
                <FollowButton targetUsername={username} />
              )}
            </div>

            <div className="mb-2">
              <h1 className="text-2xl font-semibold leading-tight">
                {profile.display_name}
                {profile.subscription_tier === "plus" && (
                  <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium align-middle"
                    style={{ background: "var(--accent)", color: "#fff" }}>
                    Plus
                  </span>
                )}
                {profile.pronouns && (
                  <span className="ml-2 text-base font-normal" style={{ color: "var(--muted)" }}>
                    ({profile.pronouns})
                  </span>
                )}
              </h1>
              <p className="text-sm" style={{ color: "var(--muted)" }}>@{profile.username}</p>
            </div>

            {profile.bio && (
              <p className="text-sm leading-relaxed mb-4" style={{ maxWidth: 520 }}>{profile.bio}</p>
            )}

            <div className="flex gap-5 text-sm" style={{ color: "var(--muted)" }}>
              <span><strong style={{ color: "var(--foreground)" }}>{entryCount}</strong> entries</span>
              <span>Joined {new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
            </div>
          </div>
        </header>

        {/* Two-column */}
        <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
          <section>
            <h2 className="text-sm font-medium uppercase tracking-widest mb-4" style={{ color: "var(--muted)" }}>
              Journal entries
            </h2>

            {entries.length === 0 ? (
              <div className="rounded-2xl border p-8 text-center"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <p className="text-sm" style={{ color: "var(--muted)" }}>No public entries yet.</p>
              </div>
            ) : (
              <div className="rounded-2xl border overflow-hidden"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <div className="px-5 divide-y" style={{ borderColor: "var(--border)" }}>
                  {entries.map((entry) => (
                    <ProfileEntry key={entry.id} entry={entry} username={username} />
                  ))}
                </div>
                {entryCount > entries.length && (
                  <div className="px-5 py-4 border-t flex items-center justify-between"
                    style={{ borderColor: "var(--border)" }}>
                    <span className="text-sm" style={{ color: "var(--muted)" }}>
                      Showing {entries.length} of {entryCount}
                    </span>
                    <Link href={`/${username}/archive`} className="text-sm font-medium"
                      style={{ color: "var(--accent)" }}>
                      View all entries →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="flex flex-col gap-6">
            <TopFriends friends={topFriends} isOwnProfile={isOwnProfile} />
            <div className="rounded-xl border p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <h3 className="text-xs font-medium uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>
                Subscribe
              </h3>
              <a href={`/api/users/${username}/feed.xml`}
                className="flex items-center gap-2 text-sm hover:underline" style={{ color: "var(--accent)" }}
                target="_blank" rel="noopener noreferrer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/>
                  <circle cx="5" cy="19" r="1"/>
                </svg>
                RSS feed
              </a>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
