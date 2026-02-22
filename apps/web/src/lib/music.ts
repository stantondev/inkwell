/**
 * Music URL detection & embed support.
 * Used by both the editor (client) and the entry reading page (server).
 */

export interface MusicEmbed {
  service: "spotify" | "youtube" | "apple-music";
  embedUrl: string;
  /** Full-size height for the reading page */
  height: number;
  /** Label for accessibility / UI badges */
  label: string;
}

/**
 * Detects music service URLs and returns embed metadata.
 * Returns null if the input is plain text (not a supported URL).
 */
export function parseMusicUrl(input: string): MusicEmbed | null {
  if (!input) return null;
  const s = input.trim();

  // ── Spotify ───────────────────────────────────────────────────────
  // https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6
  // https://open.spotify.com/album/...
  // https://open.spotify.com/playlist/...
  // spotify:track:6rqhFgbbKwnb9MLmUQDhG6  (URI format)
  const spotifyUrl = s.match(
    /open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/
  );
  const spotifyUri = !spotifyUrl
    ? s.match(/^spotify:(track|album|playlist):([a-zA-Z0-9]+)$/)
    : null;
  const spotify = spotifyUrl || spotifyUri;
  if (spotify) {
    const [, kind, id] = spotify;
    return {
      service: "spotify",
      embedUrl: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator`,
      height: kind === "track" ? 152 : 352,
      label: `Spotify ${kind}`,
    };
  }

  // ── YouTube / YouTube Music ───────────────────────────────────────
  // https://www.youtube.com/watch?v=dQw4w9WgXcQ
  // https://youtu.be/dQw4w9WgXcQ
  // https://music.youtube.com/watch?v=dQw4w9WgXcQ
  const yt = s.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)/
  );
  if (yt) {
    return {
      service: "youtube",
      embedUrl: `https://www.youtube.com/embed/${yt[1]}`,
      height: 200,
      label: "YouTube",
    };
  }

  // ── Apple Music ───────────────────────────────────────────────────
  // https://music.apple.com/us/album/in-rainbows/1109714933
  if (/music\.apple\.com\//.test(s) && /\/(album|playlist)\//.test(s)) {
    return {
      service: "apple-music",
      embedUrl: s.replace("music.apple.com", "embed.music.apple.com"),
      height: 175,
      label: "Apple Music",
    };
  }

  return null;
}
