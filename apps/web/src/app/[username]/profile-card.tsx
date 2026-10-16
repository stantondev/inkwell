import Link from "next/link";

import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { ShareButton } from "@/components/share-button";
import { getSite } from "@/lib/site";
import { FollowButton } from "./follow-button";
import { WriteLetterButton } from "./write-letter-button";
import { BlockButton } from "./block-button";
import { InlineStatusEditor } from "./inline-status-editor";
import { FediverseHandle } from "./fediverse-handle";
import { escapeHtml, SocialLinks } from "./profile-widgets";
import type { ProfileStyles, ProfileUser } from "./profile-types";

export interface ProfileCardProps {
  profile: ProfileUser;
  username: string;
  styles: ProfileStyles;
  isPlus: boolean;
  hasCustomBackground: boolean;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
  customDomainName: string | null;
  relationshipStatus: string | null;
  incomingRequest: boolean;
  letterAccess: string | null;
  entryCount: number;
  followerCount: number;
  followingCount: number;
  fediverseFollowerCount: number;
}

/** Banner, portrait, name, status, bio, counts and the follow/letter buttons. */
export function ProfileCard({
  profile,
  username,
  styles,
  isPlus,
  hasCustomBackground,
  isOwnProfile,
  isLoggedIn,
  customDomainName,
  relationshipStatus,
  incomingRequest,
  letterAccess,
  entryCount,
  followerCount,
  followingCount,
  fediverseFollowerCount,
}: ProfileCardProps) {
  return (
    <header className={`profile-header-card ${styles.borderRadius} border overflow-hidden`} style={styles.surface}>
      {/* Banner / header image */}
      <div className={`${profile.profile_banner_url ? "h-32 sm:h-48" : "h-24"} w-full overflow-hidden`} aria-hidden="true"
        style={{
          background: profile.profile_banner_url
            ? "transparent"
            : hasCustomBackground
              ? "rgba(0,0,0,0.2)"
              : isPlus && profile.profile_accent_color
                ? `linear-gradient(135deg, ${profile.profile_accent_color}33 0%, ${styles.surface.background} 100%)`
                : `linear-gradient(135deg, var(--accent-light) 0%, var(--surface-hover) 100%)`,
        }}>
        {profile.profile_banner_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.profile_banner_url} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="px-4 sm:px-6 pb-4 sm:pb-6">
        <div className="-mt-10 mb-4 flex items-end justify-between">
          <div className="rounded-full p-1" style={{ background: styles.surface.background }}>
            <AvatarWithFrame url={profile.avatar_url} name={profile.display_name} size={80} frame={profile.avatar_frame} animation={profile.avatar_animation} subscriptionTier={profile.subscription_tier} />
          </div>
          {isOwnProfile ? (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {customDomainName && (
                <a
                  href={`https://${customDomainName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors hover:opacity-80 inline-flex items-center gap-1.5"
                  style={{ borderColor: styles.accent, color: styles.accent }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  {customDomainName}
                </a>
              )}
              <Link href="/arrange"
                className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
                style={{ borderColor: styles.accent, color: styles.accent }}>
                Arrange page
              </Link>
              <Link href="/settings/profile"
                className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
                style={{ borderColor: styles.border, color: styles.muted }}>
                Edit profile
              </Link>
              <ShareButton
                url={`${getSite().url}/${username}`}
                title={profile.display_name || username}
                description={`@${username} on Inkwell`}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <FollowButton
                targetUsername={username}
                isLoggedIn={isLoggedIn}
                initialState={
                  relationshipStatus === "accepted" ? "pen_pals" :
                  relationshipStatus === "pending" ? "pending" :
                  incomingRequest ? "incoming" :
                  "idle"
                }
              />
              {/* Write a Letter button — only for accepted pen pals */}
              {(letterAccess === "letter" || letterAccess === "request") && isLoggedIn && (
                <WriteLetterButton username={username} request={letterAccess === "request"} />
              )}
              {isLoggedIn && (
                <BlockButton targetUsername={username} initialBlocked={false} />
              )}
              <ShareButton
                url={`${getSite().url}/${username}`}
                title={profile.display_name || username}
                description={`@${username} on Inkwell`}
              />
            </div>
          )}
        </div>

        <div className="mb-2">
          <h1 className="text-2xl font-semibold leading-tight">
            {profile.display_name}
            {profile.founding_member_number ? (
              <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium align-middle"
                style={{ background: styles.accent, color: "#fff" }}
                title="Helped fund Inkwell as one of its first 50 Founding Members">
                Founding Member #{profile.founding_member_number}
              </span>
            ) : profile.subscription_tier === "plus" && (
              <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium align-middle"
                style={{ background: styles.accent, color: "#fff" }}>
                Plus
              </span>
            )}
            {profile.ink_donor_status === "active" && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium align-middle"
                style={{ background: "var(--ink-deep, #2d4a8a)", color: "#fff", opacity: 0.9 }}>
                <svg width="8" height="10" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true">
                  <path d="M5 0C5 0 0 5.5 0 8a5 5 0 0 0 10 0C10 5.5 5 0 5 0Z" />
                </svg>
                Ink Donor
              </span>
            )}
            {profile.pronouns && (
              <span className="ml-2 text-base font-normal" style={{ color: styles.muted }}>
                ({profile.pronouns})
              </span>
            )}
          </h1>
          <p className="text-sm" style={{ color: styles.muted }}>@{profile.username}</p>
          <FediverseHandle username={profile.username} mutedColor={styles.muted} accentColor={styles.accent} />
        </div>

        {/* Status message — inline editable on own profile */}
        {isOwnProfile ? (
          <InlineStatusEditor
            initialStatus={profile.profile_status ?? null}
            mutedColor={styles.muted}
            accentColor={styles.accent}
          />
        ) : (
          profile.profile_status && (
            <p className="text-sm italic mt-1 mb-3" style={{ color: styles.muted }}>
              &ldquo;{profile.profile_status}&rdquo;
            </p>
          )
        )}

        {(profile.bio_html || profile.bio) && (
          <div
            className="prose-bio mb-4 max-w-prose"
            dangerouslySetInnerHTML={{
              __html: profile.bio_html || `<p>${escapeHtml(profile.bio || "")}</p>`
            }}
          />
        )}

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: styles.muted }}>
          <span><strong style={{ color: styles.foreground }}>{entryCount}</strong> entries</span>
          <span title="Total followers (including fediverse)"><strong style={{ color: styles.foreground }}>{followerCount}</strong> followers</span>
          <span title="Total following (including fediverse)"><strong style={{ color: styles.foreground }}>{followingCount}</strong> following</span>
          {fediverseFollowerCount > 0 && (
            <span title="Followers from the fediverse (Mastodon, etc.)" className="inline-flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <strong style={{ color: styles.foreground }}>{fediverseFollowerCount}</strong> from fediverse
            </span>
          )}
          <span>Joined {new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        </div>

        {/* Social links */}
        {profile.social_links && Object.keys(profile.social_links).length > 0 && (
          <SocialLinks links={profile.social_links} styles={styles} />
        )}
      </div>
    </header>
  );
}
