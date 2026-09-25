import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { SERVER_API } from "@/lib/api";
import { decodeEntities } from "@/lib/decode-entities";
import { PenNibIcon, truncate, ogFonts, fetchImageDataUri } from "../../../og-shared";

/**
 * The link-preview picture for an entry or sticky (og:image / twitter:image).
 *
 * Facebook, iMessage, Slack, LinkedIn and Bluesky show the image and little
 * else — Facebook often drops the description entirely — so an entry with no
 * cover photo used to share as a bare grey link. This draws the writing itself
 * on a page: title, the opening lines, who wrote it and when.
 *
 * An entry with a cover photo gets the photo, full bleed, with the title and
 * byline over it. Drawing it here (rather than pointing og:image at the raw
 * upload) means every preview is 1200×630 with its size declared, which
 * Facebook needs to show a picture on a link's very first share.
 *
 * It fetches the entry the way a signed-out reader would, so only public posts
 * ever render; anything else gets the plain Inkwell card. Posts behind a
 * content warning show the warning, never the text.
 */

export const dynamic = "force-dynamic";

const W = 1200;
const H = 630;

const STICKY_COLORS: Record<string, string> = {
  yellow: "#fdf1a8",
  pink: "#fbd6dd",
  blue: "#d4e7f7",
  green: "#d9eecd",
  lilac: "#e5dcf5",
  peach: "#fde0c4",
};

interface EntryPayload {
  title: string | null;
  body_html: string | null;
  excerpt?: string | null;
  excerpt_custom?: boolean;
  published_at: string | null;
  cover_image_id?: string | null;
  word_count?: number | null;
  mood?: string | null;
  kind?: string;
  sticky_color?: string | null;
  privacy?: string;
  is_sensitive?: boolean;
  content_warning?: string | null;
  is_paywalled?: boolean;
  custom_domain?: string | null;
  author?: { username: string; display_name: string | null };
}

// Satori has no emoji font; missing glyphs draw as boxes.
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu;

function clean(text: string): string {
  return decodeEntities(text).replace(EMOJI, "").replace(/\s+/g, " ").trim();
}

/** The post's words, minus the quote-reprint "RE:" line, captions, code and embeds. */
function plainText(html: string): string {
  const stripped = html
    .replace(/<p[^>]*class="[^"]*quote-inline[^"]*"[^>]*>[\s\S]*?<\/p>/gi, " ")
    .replace(/<(figure|figcaption|pre|script|style|iframe|video|audio|table)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "");
  return clean(stripped);
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchAvatar(username: string): Promise<string | null> {
  return fetchImageDataUri(`${SERVER_API}/api/avatars/${encodeURIComponent(username)}`, 2_000_000);
}

function Byline({
  avatar,
  name,
  handle,
  size = 64,
  ink = "#1f1b16",
  muted = "#6b6258",
}: {
  avatar: string | null;
  name: string;
  handle: string;
  size?: number;
  ink?: string;
  muted?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          width={size}
          height={size}
          style={{ borderRadius: size, border: "3px solid #ffffff", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: "#2d4a8a",
            color: "#ffffff",
            fontSize: size * 0.45,
            fontWeight: 700,
          }}
        >
          {(name[0] ?? "?").toUpperCase()}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", marginLeft: 18 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: ink, lineHeight: 1.2 }}>{truncate(name, 40)}</span>
        <span style={{ fontSize: 21, color: muted, lineHeight: 1.3 }}>{handle}</span>
      </div>
    </div>
  );
}

function SiteMark({ label, color = "#2d4a8a" }: { label: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <PenNibIcon size={30} color={color} />
      <span style={{ fontSize: 21, color, marginLeft: 10, letterSpacing: "0.02em" }}>{label}</span>
    </div>
  );
}

function EntryImage({
  title,
  body,
  warning,
  avatar,
  name,
  handle,
  meta,
  site,
}: {
  title: string | null;
  body: string;
  warning: string | null;
  avatar: string | null;
  name: string;
  handle: string;
  meta: string;
  site: string;
}) {
  // With no title the opening lines carry the card, so they get the big type.
  const bodySize = title ? (body.length > 200 ? 27 : 30) : body.length > 220 ? 36 : 42;
  const titleSize = title && title.length > 55 ? 46 : 56;
  const bodyLines = title ? 4 : 6;
  const bodyChars = title ? 300 : 330;

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        backgroundColor: "#e9e2d4",
        padding: 34,
        fontFamily: "Lora",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: "#fdfaf3",
          borderRadius: 14,
          boxShadow: "0 2px 10px rgba(60,45,20,0.18)",
          padding: "40px 56px 36px 76px",
          position: "relative",
        }}
      >
        {/* Notebook margin rule */}
        <div
          style={{
            position: "absolute",
            left: 48,
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: "rgba(45,74,138,0.28)",
          }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Byline avatar={avatar} name={name} handle={handle} />
          <SiteMark label={site} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", paddingTop: 12 }}>
          {title && (
            <div
              style={{
                display: "block",
                fontSize: titleSize,
                fontWeight: 700,
                color: "#1f1b16",
                lineHeight: 1.18,
                marginBottom: 20,
                lineClamp: 2,
              }}
            >
              {truncate(title, 110)}
            </div>
          )}
          {warning !== null ? (
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                fontSize: 26,
                color: "#7a4a12",
                backgroundColor: "#fbe9cf",
                border: "2px solid #e8c48f",
                borderRadius: 12,
                padding: "14px 22px",
              }}
            >
              {warning ? `Content warning: ${truncate(warning, 120)}` : "This post has a content warning"}
            </div>
          ) : (
            body && (
              <div
                style={{
                  display: "block",
                  fontSize: bodySize,
                  color: "#3b342c",
                  lineHeight: 1.5,
                  lineClamp: bodyLines,
                }}
              >
                {truncate(body, bodyChars)}
              </div>
            )
          )}
        </div>

        {meta && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              borderTop: "1px solid rgba(45,74,138,0.18)",
              paddingTop: 16,
              fontSize: 21,
              color: "#6b6258",
            }}
          >
            {meta}
          </div>
        )}
      </div>
    </div>
  );
}

function StickyImage({
  body,
  warning,
  color,
  avatar,
  name,
  handle,
  meta,
  site,
}: {
  body: string;
  warning: string | null;
  color: string;
  avatar: string | null;
  name: string;
  handle: string;
  meta: string;
  site: string;
}) {
  const size = body.length > 260 ? 34 : body.length > 140 ? 40 : 48;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: "#e9e2d4",
        fontFamily: "Lora",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 1020,
          height: 540,
          backgroundColor: color,
          padding: "44px 56px 34px",
          boxShadow: "0 3px 6px rgba(60,45,20,0.15), 0 18px 30px -10px rgba(60,45,20,0.35)",
          transform: "rotate(-1deg)",
          position: "relative",
        }}
      >
        {/* Tape */}
        <div
          style={{
            position: "absolute",
            top: -16,
            left: 440,
            width: 140,
            height: 34,
            backgroundColor: "rgba(255,255,255,0.6)",
            transform: "rotate(2deg)",
          }}
        />
        <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
          {warning !== null ? (
            <div style={{ display: "flex", fontSize: 34, color: "#2b2620" }}>
              {warning ? `Content warning: ${truncate(warning, 120)}` : "This sticky has a content warning"}
            </div>
          ) : (
            <div style={{ display: "block", fontSize: size, color: "#2b2620", lineHeight: 1.4, lineClamp: 7 }}>
              {truncate(body, 380)}
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Byline avatar={avatar} name={name} handle={handle} size={56} ink="#2b2620" muted="rgba(43,38,32,0.65)" />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <SiteMark label={site} color="#2b2620" />
            {meta && <span style={{ fontSize: 19, color: "rgba(43,38,32,0.65)", marginTop: 6 }}>{meta}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CoverImage({
  cover,
  title,
  body,
  avatar,
  name,
  handle,
  meta,
  site,
}: {
  cover: string;
  title: string | null;
  body: string;
  avatar: string | null;
  name: string;
  handle: string;
  meta: string;
  site: string;
}) {
  const heading = title || truncate(body, 120);
  const headingSize = heading.length > 70 ? 44 : heading.length > 40 ? 52 : 60;
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", fontFamily: "Lora", backgroundColor: "#1f1b16" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cover} width={W} height={H} style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }} />
      {/* Darken the lower part so the words read on any photo */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 400,
          backgroundImage: "linear-gradient(to bottom, rgba(20,16,12,0) 0%, rgba(20,16,12,0.62) 45%, rgba(20,16,12,0.9) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 30,
          right: 34,
          display: "flex",
          alignItems: "center",
          backgroundColor: "rgba(253,250,243,0.92)",
          borderRadius: 40,
          padding: "8px 20px 8px 14px",
        }}
      >
        <SiteMark label={site} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 56,
          bottom: 40,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "block",
            fontSize: headingSize,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.15,
            lineClamp: 2,
            marginBottom: 24,
            textShadow: "0 2px 12px rgba(0,0,0,0.35)",
          }}
        >
          {truncate(heading, 110)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <Byline avatar={avatar} name={name} handle={handle} size={58} ink="#ffffff" muted="rgba(255,255,255,0.78)" />
          {meta && <span style={{ fontSize: 20, color: "rgba(255,255,255,0.8)" }}>{meta}</span>}
        </div>
      </div>
    </div>
  );
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string; slug: string }> }) {
  const { username, slug } = await params;
  const fonts = await ogFonts();

  const data = await fetchJson<{ data: EntryPayload }>(
    `${SERVER_API}/api/users/${encodeURIComponent(username)}/entries/${encodeURIComponent(slug)}`
  );
  const entry = data?.data;

  // Only public posts get a picture of their words. Anything else (private,
  // friends-only, deleted, API down) gets the plain card, cached briefly.
  if (!entry || entry.privacy !== "public" || entry.is_paywalled) {
    return new ImageResponse(<PlainCard />, {
      width: W,
      height: H,
      fonts,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    });
  }

  const authorUsername = entry.author?.username ?? username;
  const name = clean(entry.author?.display_name || authorUsername) || authorUsername;
  const avatar = await fetchAvatar(authorUsername);
  const site = entry.custom_domain || "inkwell.social";
  const handle = `@${authorUsername}`;
  const warning = entry.is_sensitive ? clean(entry.content_warning ?? "") : null;
  const title = entry.title ? clean(entry.title) : null;
  let body = plainText(entry.body_html ?? "");
  if (!body && entry.excerpt) body = clean(entry.excerpt);

  const date = formatDate(entry.published_at);
  const isSticky = entry.kind === "sticky";

  // A cover photo leads, unless the post is behind a content warning (the
  // page leaves its cover out of previews too) or the photo won't decode.
  const cover =
    !isSticky && !warning && entry.cover_image_id
      ? await fetchImageDataUri(`${SERVER_API}/api/images/${encodeURIComponent(entry.cover_image_id)}`, 6_000_000)
      : null;

  let content: React.ReactElement;
  if (cover) {
    const mins = entry.word_count && entry.word_count > 0 ? Math.max(1, Math.round(entry.word_count / 200)) : null;
    const meta = [date, mins ? `${mins} min read` : ""].filter(Boolean).join("  ·  ");
    content = (
      <CoverImage cover={cover} title={title} body={body} avatar={avatar} name={name} handle={handle} meta={meta} site={site} />
    );
  } else if (isSticky) {
    const color = STICKY_COLORS[entry.sticky_color ?? ""] ?? STICKY_COLORS.yellow;
    content = (
      <StickyImage
        body={body}
        warning={warning}
        color={color}
        avatar={avatar}
        name={name}
        handle={handle}
        meta={date}
        site={site}
      />
    );
  } else {
    const mins = entry.word_count && entry.word_count > 0 ? Math.max(1, Math.round(entry.word_count / 200)) : null;
    const mood = entry.mood ? clean(entry.mood) : "";
    const meta = [date, mins ? `${mins} min read` : "", mood ? `feeling ${truncate(mood, 30)}` : ""]
      .filter(Boolean)
      .join("  ·  ");
    content = (
      <EntryImage
        title={title}
        body={body}
        warning={warning}
        avatar={avatar}
        name={name}
        handle={handle}
        meta={meta}
        site={site}
      />
    );
  }

  return new ImageResponse(content, {
    width: W,
    height: H,
    fonts,
    headers: {
      // The page links this with ?v=<updated_at>, so an edit gets a new URL.
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
