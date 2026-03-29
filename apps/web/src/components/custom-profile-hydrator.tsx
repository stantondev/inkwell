"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { WidgetSlot } from "@/lib/template-tags";
import type { ProfileStyles } from "@/lib/profile-styles";

// Lazy imports to avoid pulling everything into the client bundle when not needed
import { Guestbook } from "@/app/[username]/guestbook";
import { ProfileSubscribeWidget } from "@/app/[username]/profile-subscribe-widget";
import { ProfileMusicWidget } from "@/components/profile-music-widget";
import { FollowButton } from "@/app/[username]/follow-button";
import { WriteLetterButton } from "@/app/[username]/write-letter-button";
import { BlockButton } from "@/app/[username]/block-button";
import { InlineStatusEditor } from "@/app/[username]/inline-status-editor";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { TipButton } from "@/components/tip-button";
import { ShareButton } from "@/components/share-button";
import { ProfileSupportWidget } from "@/app/[username]/profile-support-widget";
import { ProfileEntries } from "@/app/[username]/profile-entries";
import { ProfileSearchFilter } from "@/app/[username]/profile-search-filter";
import Link from "next/link";

interface HydratorProps {
  containerId: string;
  widgetSlots: WidgetSlot[];
  // Profile context
  profile: {
    id: string;
    username: string;
    display_name: string;
    bio: string | null;
    bio_html: string | null;
    pronouns: string | null;
    avatar_url: string | null;
    avatar_frame?: string | null;
    avatar_animation?: string | null;
    subscription_tier?: string;
    created_at: string;
    profile_music?: string | null;
    profile_status?: string | null;
    profile_banner_url?: string | null;
    newsletter_enabled?: boolean;
    newsletter_name?: string | null;
    newsletter_description?: string | null;
    subscriber_count?: number;
    support_url?: string | null;
    support_label?: string | null;
    stripe_connect_enabled?: boolean;
    ink_donor_status?: string | null;
    ink_donor_amount_cents?: number | null;
    social_links?: Record<string, string> | null;
  };
  // Entries data
  entries: Array<{
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
  }>;
  entryCount: number;
  displayMode: "cards" | "full" | "preview";
  // Filter metadata
  entryYears: number[];
  entryTags: Array<{ tag: string; count: number }>;
  entryCategories: Array<{ category: string; count: number }>;
  // Social data
  topFriends: Array<{
    position: number;
    user: {
      username: string;
      display_name: string;
      avatar_url: string | null;
      avatar_frame?: string | null;
      avatar_animation?: string | null;
    };
  }>;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
  relationshipStatus: string | null;
  incomingRequest: boolean;
  styles: ProfileStyles;
  // Counts
  followerCount: number;
  followingCount: number;
  fediverseFollowerCount: number;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function CustomProfileHydrator({
  containerId,
  widgetSlots,
  profile,
  entries,
  entryCount,
  displayMode,
  entryYears,
  entryTags,
  entryCategories,
  topFriends,
  isOwnProfile,
  isLoggedIn,
  relationshipStatus,
  incomingRequest,
  styles,
  followerCount,
  followingCount,
  fediverseFollowerCount,
}: HydratorProps) {
  const [portals, setPortals] = useState<React.ReactPortal[]>([]);

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const newPortals: React.ReactPortal[] = [];

    for (const slot of widgetSlots) {
      const node = container.querySelector(`[data-inkwell-id="${slot.id}"]`);
      if (!node) continue;

      const component = renderWidget(slot.type);
      if (component) {
        newPortals.push(createPortal(component, node as Element, slot.id));
      }
    }

    setPortals(newPortals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, widgetSlots.length]);

  function renderWidget(type: string): React.ReactNode {
    const username = profile.username;

    switch (type) {
      case "about":
        return (
          <div className="inkwell-about-widget">
            {/* Banner */}
            <div
              className={`${profile.profile_banner_url ? "h-32 sm:h-48" : "h-24"} w-full overflow-hidden rounded-t-xl`}
              style={{
                background: profile.profile_banner_url
                  ? "transparent"
                  : `linear-gradient(135deg, var(--accent-light) 0%, var(--surface-hover) 100%)`,
              }}
            >
              {profile.profile_banner_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.profile_banner_url} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="px-4 sm:px-6 pb-4 sm:pb-6">
              <div className="-mt-10 mb-4 flex items-end justify-between">
                <div className="rounded-full p-1" style={{ background: styles.surface.background }}>
                  <AvatarWithFrame
                    url={profile.avatar_url}
                    name={profile.display_name}
                    size={80}
                    frame={profile.avatar_frame}
                    animation={profile.avatar_animation}
                    subscriptionTier={profile.subscription_tier}
                  />
                </div>
                {isOwnProfile ? (
                  <div className="flex items-center gap-2">
                    <Link
                      href="/settings"
                      className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
                      style={{ borderColor: styles.border, color: styles.muted }}
                    >
                      Edit profile
                    </Link>
                    <ShareButton
                      url={`https://inkwell.social/${username}`}
                      title={profile.display_name || username}
                      description={`@${username} on Inkwell`}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <FollowButton
                      targetUsername={username}
                      initialState={
                        relationshipStatus === "accepted"
                          ? "pen_pals"
                          : relationshipStatus === "pending"
                            ? "pending"
                            : incomingRequest
                              ? "incoming"
                              : "idle"
                      }
                    />
                    {relationshipStatus === "accepted" && isLoggedIn && (
                      <WriteLetterButton username={username} />
                    )}
                    {isLoggedIn && (
                      <BlockButton targetUsername={username} initialBlocked={false} />
                    )}
                    <ShareButton
                      url={`https://inkwell.social/${username}`}
                      title={profile.display_name || username}
                      description={`@${username} on Inkwell`}
                    />
                  </div>
                )}
              </div>

              <div className="mb-2">
                <h1 className="text-2xl font-semibold leading-tight">
                  {profile.display_name}
                  {profile.subscription_tier === "plus" && (
                    <span
                      className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium align-middle"
                      style={{ background: styles.accent, color: "#fff" }}
                    >
                      Plus
                    </span>
                  )}
                  {profile.ink_donor_status === "active" && (
                    <span
                      className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium align-middle"
                      style={{ background: "var(--ink-deep, #2d4a8a)", color: "#fff", opacity: 0.9 }}
                    >
                      Ink Donor
                    </span>
                  )}
                  {profile.pronouns && (
                    <span className="ml-2 text-base font-normal" style={{ color: styles.muted }}>
                      ({profile.pronouns})
                    </span>
                  )}
                </h1>
                <p className="text-sm" style={{ color: styles.muted }}>
                  @{username}
                </p>
              </div>

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
                    __html: profile.bio_html || `<p>${escapeHtml(profile.bio || "")}</p>`,
                  }}
                />
              )}

              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: styles.muted }}>
                <span>
                  <strong style={{ color: styles.foreground }}>{entryCount}</strong> entries
                </span>
                <span title="Total followers (including fediverse)">
                  <strong style={{ color: styles.foreground }}>{followerCount}</strong> followers
                </span>
                <span title="Total following (including fediverse)">
                  <strong style={{ color: styles.foreground }}>{followingCount}</strong> following
                </span>
                {fediverseFollowerCount > 0 && (
                  <span title="Followers from the fediverse (Mastodon, etc.)" className="inline-flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    <strong style={{ color: styles.foreground }}>{fediverseFollowerCount}</strong> from fediverse
                  </span>
                )}
                <span>
                  Joined{" "}
                  {new Date(profile.created_at).toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>

              {profile.social_links && Object.keys(profile.social_links).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {Object.entries(profile.social_links).map(([platform, url]) => {
                    if (!url) return null;
                    return (
                      <a
                        key={platform}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors hover:opacity-80"
                        style={{ borderColor: styles.border, color: styles.muted }}
                      >
                        {platform}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );

      case "entries": {
        const hasFilterMeta = entryYears.length > 0 || entryTags.length > 0 || entryCategories.length > 0;
        if (hasFilterMeta && entryCount > 3) {
          return (
            <ProfileSearchFilter
              username={username}
              displayMode={displayMode}
              initialEntries={entries}
              totalCount={entryCount}
              styles={styles}
              entryYears={entryYears}
              entryTags={entryTags}
              entryCategories={entryCategories}
            />
          );
        }
        return (
          <ProfileEntries
            username={username}
            displayMode={displayMode}
            initialEntries={entries}
            totalCount={entryCount}
            styles={styles}
          />
        );
      }

      case "guestbook":
        return (
          <Guestbook
            username={username}
            isOwnProfile={isOwnProfile}
            isLoggedIn={isLoggedIn}
            styles={styles}
          />
        );

      case "newsletter":
        if (!profile.newsletter_enabled) return null;
        return (
          <ProfileSubscribeWidget
            username={username}
            newsletterName={profile.newsletter_name ?? null}
            newsletterDescription={profile.newsletter_description ?? null}
            subscriberCount={profile.subscriber_count ?? 0}
            styles={styles}
            preview={isOwnProfile}
          />
        );

      case "music":
        if (!profile.profile_music) return null;
        return (
          <ProfileMusicWidget
            music={profile.profile_music}
            surfaceStyle={styles.surface}
            mutedColor={styles.muted}
            borderColor={styles.border}
            borderRadius={styles.borderRadius}
          />
        );

      case "support": {
        const hasTips = profile.stripe_connect_enabled && !isOwnProfile && isLoggedIn;
        const hasTipsPreview = profile.stripe_connect_enabled && isOwnProfile;
        const hasExternalLink = !!profile.support_url;
        if (!hasTips && !hasTipsPreview && !hasExternalLink) return null;
        return (
          <div className="flex flex-col gap-4">
            {(hasTips || hasTipsPreview) && (
              <div>
                {hasTipsPreview ? (
                  <div className="opacity-60 cursor-default">
                    <div
                      className="flex items-center justify-center gap-2 w-full rounded-lg border px-4 py-2.5 text-sm font-medium"
                      style={{ borderColor: styles.accent, color: styles.accent }}
                    >
                      Send postage
                    </div>
                    <p className="text-xs mt-2 text-center" style={{ color: styles.muted }}>
                      Visitors will see this widget
                    </p>
                  </div>
                ) : (
                  <TipButton recipientId={profile.id} recipientName={profile.display_name} />
                )}
              </div>
            )}
            {hasExternalLink && (
              <ProfileSupportWidget
                supportUrl={profile.support_url!}
                supportLabel={profile.support_label ?? null}
                displayName={profile.display_name}
                styles={styles}
                preview={isOwnProfile}
              />
            )}
          </div>
        );
      }

      case "follow_button":
        if (isOwnProfile) return null;
        return (
          <FollowButton
            targetUsername={username}
            initialState={
              relationshipStatus === "accepted"
                ? "pen_pals"
                : relationshipStatus === "pending"
                  ? "pending"
                  : incomingRequest
                    ? "incoming"
                    : "idle"
            }
          />
        );

      default:
        return null;
    }
  }

  return <>{portals}</>;
}
