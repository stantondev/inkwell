import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { SERVER_API } from "@/lib/api";
import { decodeEntities } from "@/lib/decode-entities";
import { fediverseHandle } from "@/lib/fediverse";
import { PenNibIcon, truncate, ogFonts, fetchImageDataUri } from "../../og-shared";

/**
 * The link-preview picture for a writer's journal (og:image on their profile).
 *
 * Profiles used to share with the avatar alone, which Facebook and X show as a
 * small square beside the link. This draws the journal's cover instead: banner
 * (when there is one), portrait, name, bio, their latest entry titles, how
 * much they've written, and the fediverse handle, so someone on Mastodon knows
 * they can follow from there.
 *
 * Fetched signed out, so suspended or unknown accounts get the plain card.
 */

export const dynamic = "force-dynamic";

const W = 1200;
const H = 630;

interface ProfilePayload {
  data?: {
    username: string;
    display_name: string | null;
    bio: string | null;
    bio_html?: string | null;
    profile_banner_url?: string | null;
    avatar_url?: string | null;
  };
  meta?: {
    entry_count?: number;
    follower_count?: number;
    custom_domain?: string | null;
  };
}

// Satori has no emoji font; missing glyphs draw as boxes.
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu;

function clean(text: string): string {
  return decodeEntities(text.replace(/<[^>]+>/g, " ")).replace(EMOJI, "").replace(/\s+/g, " ").trim();
}

/** Titles of the latest public entries (untitled ones skipped). */
async function recentTitles(username: string): Promise<string[]> {
  try {
    const res = await fetch(`${SERVER_API}/api/users/${username}/entries?per_page=6`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { title: string | null }[] };
    return (json.data ?? [])
      .map((e) => (e.title ? clean(e.title) : ""))
      .filter(Boolean)
      .slice(0, 3);
  } catch {
    return [];
  }
}

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

function PlainCard() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: "#faf8f5",
        fontFamily: "Lora",
      }}
    >
      <PenNibIcon size={72} />
      <div style={{ display: "flex", fontSize: 56, fontWeight: 700, color: "#2d4a8a", marginTop: 24 }}>Inkwell</div>
      <div style={{ display: "flex", fontSize: 22, color: "#666", marginTop: 12 }}>
        Your journal, your pen pals, your space.
      </div>
    </div>
  );
}

function Portrait({ avatar, name, size }: { avatar: string | null; name: string; size: number }) {
  if (avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatar}
        width={size}
        height={size}
        style={{ borderRadius: size, border: "6px solid #fdfaf3", boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }}
      />
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: size,
        border: "6px solid #fdfaf3",
        backgroundColor: "#2d4a8a",
        color: "#ffffff",
        fontSize: size * 0.42,
        fontWeight: 700,
      }}
    >
      {(name[0] ?? "?").toUpperCase()}
    </div>
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const fonts = await ogFonts();

  let payload: ProfilePayload | null = null;
  try {
    const res = await fetch(`${SERVER_API}/api/users/${encodeURIComponent(username)}`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (res.ok) payload = (await res.json()) as ProfilePayload;
  } catch {
    payload = null;
  }

  const user = payload?.data;
  if (!user) {
    return new ImageResponse(<PlainCard />, {
      width: W,
      height: H,
      fonts,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    });
  }

  const u = encodeURIComponent(user.username);
  const [avatar, banner, recent] = await Promise.all([
    user.avatar_url ? fetchImageDataUri(`${SERVER_API}/api/avatars/${u}`, 2_000_000) : null,
    // 404s when there's no banner; the profile payload doesn't say either way.
    fetchImageDataUri(`${SERVER_API}/api/banners/${u}`, 6_000_000),
    recentTitles(u),
  ]);

  const name = clean(user.display_name || user.username) || user.username;
  const bio = clean(user.bio_html || user.bio || "");
  const entries = payload?.meta?.entry_count ?? 0;
  const readers = payload?.meta?.follower_count ?? 0;
  const stats = [
    entries > 0 ? plural(entries, "entry", "entries") : "",
    readers > 0 ? plural(readers, "reader", "readers") : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
  const site = payload?.meta?.custom_domain || `inkwell.social/${user.username}`;
  const bannerH = banner ? 190 : 0;
  const portrait = banner ? 150 : 200;
  const titles = recent.slice(0, banner ? 2 : 3);

  const card = (
    <div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: "#e9e2d4", padding: 34, fontFamily: "Lora" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: "#fdfaf3",
          borderRadius: 14,
          boxShadow: "0 2px 10px rgba(60,45,20,0.18)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} width={W - 68} height={bannerH} style={{ width: W - 68, height: bannerH, objectFit: "cover" }} />
        )}

        <div
          style={{
            display: "flex",
            flex: 1,
            padding: banner ? "0 56px 34px" : "48px 56px 34px",
            marginTop: banner ? -portrait / 2 : 0,
          }}
        >
          <div style={{ display: "flex", flexShrink: 0 }}>
            <Portrait avatar={avatar} name={name} size={portrait} />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              marginLeft: 40,
              paddingTop: banner ? portrait / 2 + 12 : 6,
            }}
          >
            <div style={{ display: "block", fontSize: banner ? (name.length > 28 ? 40 : 48) : name.length > 28 ? 46 : 56, fontWeight: 700, color: "#1f1b16", lineHeight: 1.1, lineClamp: banner ? 1 : 2 }}>
              {truncate(name, 60)}
            </div>
            <div style={{ display: "flex", fontSize: 24, color: "#2d4a8a", marginTop: 10 }}>
              {fediverseHandle(user.username)}
            </div>
            {bio && (
              <div
                style={{
                  display: "block",
                  fontSize: 27,
                  color: "#3b342c",
                  lineHeight: 1.45,
                  marginTop: banner ? 14 : 20,
                  lineClamp: banner ? 1 : titles.length ? 2 : 4,
                }}
              >
                {truncate(bio, banner ? 70 : titles.length ? 150 : 260)}
              </div>
            )}
            {titles.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", marginTop: banner ? 18 : bio ? 26 : 30 }}>
                <span style={{ fontSize: 17, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8a7f72", marginBottom: 8 }}>
                  Lately
                </span>
                {titles.map((t) => (
                  <div key={t} style={{ display: "flex", fontSize: 25, color: "#1f1b16", lineHeight: 1.45 }}>
                    <span style={{ color: "#2d4a8a", marginRight: 12 }}>—</span>
                    <span style={{ display: "block", lineClamp: 1 }}>{truncate(t, 58)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(45,74,138,0.18)",
            margin: "0 56px",
            padding: "16px 0 26px",
            fontSize: 22,
            color: "#6b6258",
          }}
        >
          <span>{stats || "A journal on Inkwell"}</span>
          <div style={{ display: "flex", alignItems: "center" }}>
            <PenNibIcon size={28} />
            <span style={{ fontSize: 21, color: "#2d4a8a", marginLeft: 10 }}>{truncate(site, 40)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return new ImageResponse(card, {
    width: W,
    height: H,
    fonts,
    headers: {
      // The page links this with ?v=<profile stamp>, so a change gets a new URL.
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
