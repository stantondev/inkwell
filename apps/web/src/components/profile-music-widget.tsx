"use client";

import { useState, useEffect } from "react";
import { parseMusicUrl } from "@/lib/music";

function ServiceIcon({ service }: { service: string }) {
  if (service === "spotify") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ color: "#1DB954" }}
        aria-hidden="true"
      >
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    );
  }
  if (service === "youtube") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ color: "#FF0000" }}
        aria-hidden="true"
      >
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    );
  }
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ color: "#FA243C" }}
      aria-hidden="true"
    >
      <path d="M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0 0 19.2.04a9.224 9.224 0 0 0-1.755-.045C17.178 0 16.91 0 16.643 0h-9.48c-.11 0-.22.005-.33.01a9.413 9.413 0 0 0-1.988.17A5.149 5.149 0 0 0 2.72 1.475c-.657.66-1.07 1.438-1.321 2.33a8.46 8.46 0 0 0-.26 1.83l-.005.29v12.15l.005.305c.024.65.098 1.29.26 1.92.254.88.667 1.66 1.32 2.32a5.065 5.065 0 0 0 2.45 1.4c.58.14 1.17.21 1.77.24.18.01.36.01.54.02h9.29c.2 0 .4 0 .59-.01.7-.03 1.39-.1 2.05-.33a4.882 4.882 0 0 0 2.06-1.31 5.06 5.06 0 0 0 1.06-1.78c.21-.57.34-1.17.39-1.78.02-.2.03-.41.03-.61V7.36c0-.12 0-.24-.01-.36l-.02-.87z" />
    </svg>
  );
}

interface ProfileMusicWidgetProps {
  music: string;
  surfaceStyle: React.CSSProperties;
  mutedColor: string;
  borderColor: string;
  borderRadius?: string;
}

export function ProfileMusicWidget({
  music,
  surfaceStyle,
  mutedColor,
  borderColor,
  borderRadius = "rounded-xl",
}: ProfileMusicWidgetProps) {
  const [mounted, setMounted] = useState(false);
  const [autoplay, setAutoplay] = useState(true);

  useEffect(() => {
    const pref = localStorage.getItem("inkwell_music_autoplay");
    if (pref === "false") setAutoplay(false);
    setMounted(true);
  }, []);

  const embed = parseMusicUrl(music);
  if (!embed) return null;

  const toggleAutoplay = () => {
    const next = !autoplay;
    setAutoplay(next);
    localStorage.setItem("inkwell_music_autoplay", String(next));
  };

  // Build embed URL with autoplay if enabled and client-side
  let embedUrl = embed.embedUrl;
  if (mounted && autoplay) {
    if (embed.service === "spotify") embedUrl += "&autoplay=1";
    else if (embed.service === "youtube") embedUrl += "?autoplay=1";
  }

  return (
    <div className={`profile-widget-card ${borderRadius} border p-3 sm:p-4`} style={surfaceStyle}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <ServiceIcon service={embed.service} />
          <h3
            className="text-xs font-medium uppercase tracking-widest"
            style={{ color: mutedColor }}
          >
            Now Playing
          </h3>
        </div>
        {mounted && (
          <button
            onClick={toggleAutoplay}
            className="p-1 rounded-full transition-opacity hover:opacity-70"
            title={autoplay ? "Disable autoplay" : "Enable autoplay"}
            aria-label={autoplay ? "Disable autoplay" : "Enable autoplay"}
          >
            {autoplay ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: mutedColor }}
                aria-hidden="true"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: mutedColor }}
                aria-hidden="true"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
          </button>
        )}
      </div>
      {mounted ? (
        <div
          className="rounded-lg overflow-hidden border"
          style={{ borderColor }}
        >
          <iframe
            key={embedUrl}
            src={embedUrl}
            width="100%"
            height={embed.height}
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            title={`${embed.label} embed`}
            className="block"
          />
        </div>
      ) : (
        <div
          className="rounded-lg animate-pulse"
          style={{
            background: "var(--surface-hover)",
            height: embed.height,
          }}
        />
      )}
    </div>
  );
}
