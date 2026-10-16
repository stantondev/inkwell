import type { Metadata } from "next";
import { headers } from "next/headers";

import { getProfile } from "@/lib/queries";
import { getSession, getToken } from "@/lib/session";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { BlockButton } from "./block-button";
import { SignupCta } from "@/components/signup-cta";
import { fediverseHandle } from "@/lib/fediverse";
import { profileFiltersFromParams } from "@/lib/profile-archive-params";
import { getSite } from "@/lib/site";
import { ProfileLayout } from "./profile-layout";
import { loadProfile, ProfileFrame } from "./load-profile";
import type { ProfileUser } from "./profile-types";

interface ProfileParams {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: ProfileParams): Promise<Metadata> {
  const { username } = await params;

  // Detect custom domain context
  const headersList = await import("next/headers").then(m => m.headers());
  const customDomain = headersList.get("x-custom-domain");

  try {
    // Pass the same token the page component uses so react.cache() dedupes.
    const token = await getToken();
    const data = await getProfile<{ data: ProfileUser; meta?: { custom_domain?: string; noindex?: boolean } }>(username, token);
    const profile = data.data;
    const displayName = profile.display_name || `@${username}`;
    const bio = profile.bio
      ? profile.bio.replace(/<[^>]+>/g, "").slice(0, 160)
      : `@${username} on Inkwell`;
    // Use header (custom domain request) or API response (inkwell.social request)
    const effectiveDomain = customDomain || data.meta?.custom_domain || null;
    const profileUrl = effectiveDomain
      ? `https://${effectiveDomain}`
      : `${getSite().url}/${username}`;
    const rssUrl = effectiveDomain
      ? `https://${effectiveDomain}/api/users/${username}/feed.xml`
      : `${getSite().url}/api/users/${username}/feed.xml`;
    // A drawn 1200×630 cover for the journal (banner, portrait, bio, handle):
    // Facebook and X showed the avatar alone as a small square beside the
    // link. The avatar URL's ?v= stamp changes with the profile, so reuse it
    // to give an updated profile a fresh preview past every cache.
    const version = profile.avatar_url?.match(/[?&]v=([^&]+)/)?.[1];
    const cardUrl = `/api/og/profile/${encodeURIComponent(username)}${version ? `?v=${version}` : ""}`;
    const cardAlt = `${displayName}'s journal on Inkwell`;

    return {
      ...(data.meta?.noindex ? { robots: { index: false, follow: false } } : {}),
      // On the writer's own domain the site is theirs — drop the root
      // layout's "· Inkwell" suffix.
      title: customDomain
        ? { absolute: displayName }
        : effectiveDomain
          ? displayName
          : `@${username}`,
      description: bio,
      ...(effectiveDomain ? { metadataBase: new URL(`https://${effectiveDomain}`) } : {}),
      openGraph: {
        title: displayName,
        description: bio,
        url: profileUrl,
        type: "profile",
        siteName: effectiveDomain ?? "Inkwell",
        images: [{ url: cardUrl, width: 1200, height: 630, alt: cardAlt, type: "image/png" }],
      },
      twitter: {
        site: "@inkwellsocial",
        card: "summary_large_image",
        title: displayName,
        description: bio,
        images: [{ url: cardUrl, alt: cardAlt }],
      },
      alternates: {
        canonical: profileUrl,
        types: {
          "application/rss+xml": rssUrl,
        },
      },
      // FEP-2345, as on entry pages
      other: { "fediverse:creator": fediverseHandle(profile.username ?? username) },
    };
  } catch {
    return { title: `@${username}` };
  }
}

/**
 * Subtle "Powered by Inkwell" footer for custom domain pages.
 * Rendered INSIDE the profile's theme wrapper so it inherits the author's colors.
 */
function PoweredByInkwell() {
  return (
    <div className="text-center py-6 text-xs" style={{ color: "var(--muted)" }}>
      <a
        href={getSite().url}
        className="hover:underline opacity-40 hover:opacity-70 transition-opacity"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic" }}
      >
        Powered by Inkwell
      </a>
    </div>
  );
}

export default async function ProfilePage({ params, searchParams }: ProfileParams) {
  const { username } = await params;
  // ?year=&month=&page=&sort=&tag=&category=&q= : the archive position, so
  // links and the Back button land on the same page of entries.
  const archive = profileFiltersFromParams(await searchParams);
  const session = await getSession();

  // Detect custom domain context (for rendering "Powered by Inkwell" inside theme wrapper)
  const reqHeaders = await headers();
  const isOnCustomDomain = !!reqHeaders.get("x-custom-domain");

  const loaded = await loadProfile(username, session, archive);

  // Handle blocked states — show limited profile
  if (loaded.kind === "unavailable") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)", color: "var(--foreground)" }}>
        <div className="text-center p-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted)" }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold mb-2">This profile is not available</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            The content you&apos;re looking for cannot be displayed.
          </p>
        </div>
      </div>
    );
  }

  if (loaded.kind === "blocked_by_me") {
    const { profile } = loaded;
    return (
      <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
        <div className="mx-auto max-w-2xl px-4 py-12">
          <div className="rounded-xl border p-8 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <AvatarWithFrame url={profile.avatar_url} name={profile.display_name} size={64} frame={profile.avatar_frame} animation={profile.avatar_animation} subscriptionTier={profile.subscription_tier} />
            <h1 className="text-lg font-semibold mt-4">@{profile.username}</h1>
            <p className="text-sm mt-2 mb-6" style={{ color: "var(--muted)" }}>
              You&apos;ve blocked this user. They can&apos;t see your content or interact with you.
            </p>
            <BlockButton targetUsername={username} initialBlocked={true} />
          </div>
        </div>
      </div>
    );
  }

  const { home, ctx, frame, jsonLd } = loaded;
  const width = isOnCustomDomain ? "" : home.width === "narrow" ? "max-w-2xl" : "max-w-7xl";

  return (
    <ProfileFrame
      frame={frame}
      containerClassName={`px-3 sm:px-4 ${isOnCustomDomain ? "lg:px-8 xl:px-12" : ""} py-8 ${width}`}
      before={
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      }
    >
      <ProfileLayout home={home} ctx={ctx} />

      {/* Signup CTA for logged-out visitors (not on custom domain — it's their site) */}
      {!session && !isOnCustomDomain && (
        <div className="mt-12 mb-4">
          <SignupCta
            heading="Start your own journal"
            subheading="Customize your space, connect with readers, and join the open social web. No algorithms, no ads."
          />
        </div>
      )}

      {isOnCustomDomain && <PoweredByInkwell />}
    </ProfileFrame>
  );
}
