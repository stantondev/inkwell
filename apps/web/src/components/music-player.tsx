import { parseMusicUrl, type MusicService } from "@/lib/music";

function ServiceIcon({ service }: { service: MusicService }) {
  if (service === "spotify") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#1DB954" }}>
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
      </svg>
    );
  }
  if (service === "youtube") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#FF0000" }}>
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    );
  }
  if (service === "apple-music") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#FA243C" }}>
        <path d="M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0 0 19.2.04a9.224 9.224 0 0 0-1.755-.045C17.178 0 16.91 0 16.643 0h-9.48c-.11 0-.22.005-.33.01a9.413 9.413 0 0 0-1.988.17A5.149 5.149 0 0 0 2.72 1.475c-.657.66-1.07 1.438-1.321 2.33a8.46 8.46 0 0 0-.26 1.83l-.005.29v12.15l.005.305c.024.65.098 1.29.26 1.92.254.88.667 1.66 1.32 2.32a5.065 5.065 0 0 0 2.45 1.4c.58.14 1.17.21 1.77.24.18.01.36.01.54.02h9.29c.2 0 .4 0 .59-.01.7-.03 1.39-.1 2.05-.33a4.882 4.882 0 0 0 2.06-1.31 5.06 5.06 0 0 0 1.06-1.78c.21-.57.34-1.17.39-1.78.02-.2.03-.41.03-.61V7.36c0-.12 0-.24-.01-.36l-.02-.87z"/>
      </svg>
    );
  }
  if (service === "soundcloud") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#FF5500" }}>
        <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.057-.05-.1-.099-.1m-.899.828c-.06 0-.091.037-.104.094L0 14.479l.172 1.31c.013.06.045.09.104.09.061 0 .09-.03.099-.09l.21-1.31-.21-1.332c-.009-.06-.038-.094-.099-.094m1.83-1.229c-.063 0-.109.05-.116.104l-.21 2.563.21 2.458c.007.06.053.104.116.104.065 0 .108-.044.12-.104l.24-2.458-.24-2.563c-.012-.058-.055-.104-.12-.104m.944-.424c-.074 0-.13.06-.134.12l-.194 2.986.194 2.82c.004.065.06.12.134.12.07 0 .125-.055.133-.12l.217-2.82-.217-2.986c-.008-.065-.063-.12-.133-.12m.974-.295c-.083 0-.148.067-.15.135l-.18 3.28.18 2.89c.002.074.067.135.15.135.08 0 .145-.061.15-.135l.2-2.89-.2-3.28c-.005-.068-.07-.135-.15-.135m.99-.17c-.09 0-.162.074-.166.15l-.163 3.45.163 2.924c.004.08.076.15.166.15.088 0 .16-.07.164-.15l.186-2.924-.186-3.45c-.004-.077-.076-.15-.164-.15m1.016-.18c-.1 0-.18.08-.184.165l-.15 3.63.15 2.94c.004.09.084.165.184.165.097 0 .176-.075.18-.165l.17-2.94-.17-3.63c-.004-.085-.083-.165-.18-.165m1.015.06c-.109 0-.194.09-.2.18l-.135 3.39.135 2.955c.006.1.091.18.2.18s.19-.08.196-.18l.152-2.955-.152-3.39c-.006-.09-.087-.18-.196-.18m1.06-.394c-.12 0-.213.098-.218.195l-.12 3.784.12 2.97c.005.1.098.195.218.195.118 0 .21-.095.215-.195l.14-2.97-.14-3.784c-.005-.097-.097-.195-.215-.195m1.032-.36c-.127 0-.228.105-.23.21l-.11 4.143.11 2.975c.002.113.103.21.23.21.124 0 .224-.097.227-.21l.12-2.975-.12-4.143c-.003-.105-.103-.21-.227-.21m1.082-.18c-.137 0-.242.113-.245.226l-.093 4.323.093 2.97c.003.12.108.226.245.226.135 0 .24-.106.243-.226l.104-2.97-.104-4.323c-.003-.113-.108-.226-.243-.226m1.05.12c-.147 0-.261.12-.264.24l-.08 3.963.08 2.97c.003.127.117.24.264.24.144 0 .257-.113.26-.24l.09-2.97-.09-3.963c-.003-.12-.116-.24-.26-.24m1.088-.18c-.157 0-.28.128-.282.255l-.067 4.143.067 2.955c.002.135.125.255.282.255.154 0 .276-.12.28-.255l.077-2.955-.077-4.143c-.004-.127-.126-.255-.28-.255m1.063.48c-.167 0-.295.135-.298.27l-.053 3.393.053 2.97c.003.142.131.27.298.27.163 0 .29-.128.294-.27l.06-2.97-.06-3.393c-.004-.135-.13-.27-.294-.27m1.127-.72c-.176 0-.313.142-.315.285l-.04 4.113.04 2.955c.002.15.14.285.315.285.174 0 .31-.135.313-.285l.046-2.955-.046-4.113c-.003-.143-.14-.285-.313-.285m1.088.06c-.184 0-.327.15-.33.3l-.03 3.753.03 2.955c.003.158.146.3.33.3.18 0 .323-.142.326-.3l.036-2.955-.036-3.753c-.003-.15-.146-.3-.326-.3m1.12-.48c-.195 0-.345.158-.348.315l-.015 4.233.015 2.94c.003.165.153.315.348.315.19 0 .34-.15.342-.315l.018-2.94-.018-4.233c-.002-.157-.152-.315-.342-.315m1.474 1.665c-.24 0-.42.18-.42.42v5.46c0 .24.18.42.42.42h4.275c1.38 0 2.55-1.14 2.55-2.55s-1.14-2.55-2.535-2.55c-.51 0-.99.15-1.395.405-.225-2.04-1.935-3.615-4.035-3.615-.555 0-1.095.12-1.575.33-.18.075-.225.15-.225.3v6.78c.005.165.135.3.3.315"/>
      </svg>
    );
  }
  if (service === "bandcamp") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#1DA0C3" }}>
        <path d="M0 18.75l7.437-13.5H24l-7.438 13.5z"/>
      </svg>
    );
  }
  // Audio file
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" style={{ color: "var(--accent)" }}>
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3"/>
      <circle cx="18" cy="16" r="3"/>
    </svg>
  );
}

/**
 * Compact inline music player for feed/explore/profile cards.
 * Renders embeds for recognized services, an <audio> player for direct
 * audio file links, or nothing for plain-text music values.
 */
export function MusicPlayer({ music }: { music: string | null }) {
  if (!music) return null;
  const embed = parseMusicUrl(music);
  if (!embed) return null;

  // Direct audio file — render native <audio> player
  if (embed.service === "audio") {
    return (
      <div className="mt-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <ServiceIcon service="audio" />
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Now playing
          </span>
        </div>
        <div
          className="rounded-xl overflow-hidden border p-3"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            controls
            preload="metadata"
            src={embed.embedUrl}
            className="w-full"
            style={{ height: 40 }}
          />
        </div>
      </div>
    );
  }

  // Bandcamp — uses an iframe with their embed player
  // Bandcamp embeds require the album/track ID which we can't get from URL alone,
  // so link to the page instead with a styled button
  if (embed.service === "bandcamp") {
    return (
      <div className="mt-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <ServiceIcon service="bandcamp" />
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Now playing
          </span>
        </div>
        <a
          href={embed.embedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors hover:opacity-80"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--foreground)",
          }}
        >
          <ServiceIcon service="bandcamp" />
          <span>Listen on Bandcamp</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto" style={{ color: "var(--muted)" }}>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      </div>
    );
  }

  // Use compact heights for inline card context
  const compactHeight =
    embed.service === "spotify" ? 152 :
    embed.service === "youtube" ? 200 :
    embed.service === "soundcloud" ? (embed.height > 200 ? 300 : 166) :
    152; // apple-music

  return (
    <div className="music-embed-container mt-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <ServiceIcon service={embed.service} />
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Now playing
        </span>
      </div>
      <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
        <iframe
          src={embed.embedUrl}
          width="100%"
          height={compactHeight}
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          title={`${embed.label} embed`}
          className="block"
        />
      </div>
    </div>
  );
}
