import { parseMusicUrl } from "@/lib/music";

/**
 * Compact inline music player for feed/explore/profile cards.
 * Renders a Spotify / YouTube / Apple Music iframe when the music field
 * contains a recognized URL. Returns null for plain-text music or empty values.
 */
export function MusicPlayer({ music }: { music: string | null }) {
  if (!music) return null;
  const embed = parseMusicUrl(music);
  if (!embed) return null;

  // Use compact heights for inline card context
  const compactHeight =
    embed.service === "spotify" ? 80 :
    embed.service === "youtube" ? 200 :
    152; // apple-music

  const ServiceIcon = () => {
    if (embed.service === "spotify") {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#1DB954" }}>
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
      );
    }
    if (embed.service === "youtube") {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#FF0000" }}>
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      );
    }
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#FA243C" }}>
        <path d="M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0 0 19.2.04a9.224 9.224 0 0 0-1.755-.045C17.178 0 16.91 0 16.643 0h-9.48c-.11 0-.22.005-.33.01a9.413 9.413 0 0 0-1.988.17A5.149 5.149 0 0 0 2.72 1.475c-.657.66-1.07 1.438-1.321 2.33a8.46 8.46 0 0 0-.26 1.83l-.005.29v12.15l.005.305c.024.65.098 1.29.26 1.92.254.88.667 1.66 1.32 2.32a5.065 5.065 0 0 0 2.45 1.4c.58.14 1.17.21 1.77.24.18.01.36.01.54.02h9.29c.2 0 .4 0 .59-.01.7-.03 1.39-.1 2.05-.33a4.882 4.882 0 0 0 2.06-1.31 5.06 5.06 0 0 0 1.06-1.78c.21-.57.34-1.17.39-1.78.02-.2.03-.41.03-.61V7.36c0-.12 0-.24-.01-.36l-.02-.87zM17.42 17.45c-.18.56-.52.98-1.01 1.29-.37.23-.79.35-1.23.37-.31.01-.62-.02-.92-.1a13.68 13.68 0 0 1-2.43-.91c-.56-.27-1.09-.58-1.58-.97a5.267 5.267 0 0 1-1.3-1.55c-.3-.55-.47-1.15-.5-1.78a3.168 3.168 0 0 1 .32-1.59c.23-.45.56-.82.96-1.11.37-.27.78-.46 1.24-.53.28-.04.57-.04.86-.01.38.05.74.16 1.09.31.18.08.36.17.53.27V6.46c0-.08.01-.16.03-.24.04-.16.14-.24.3-.22.13.02.26.05.39.09.23.07.45.16.66.27.05.03.1.06.14.1.07.06.1.14.1.24V14.56c0 .31-.02.63-.07.94-.07.46-.21.9-.43 1.3-.2.35-.44.66-.74.93-.2.18-.42.33-.66.46-.12.06-.24.12-.37.17-.08.03-.16.06-.24.09z"/>
      </svg>
    );
  };

  return (
    <div className="music-embed-container mt-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <ServiceIcon />
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
