/**
 * Music URL detection & embed support.
 * Used by both the editor (client) and the entry reading page (server).
 */

export type MusicService =
  | "spotify"
  | "youtube"
  | "apple-music"
  | "soundcloud"
  | "bandcamp"
  | "audio";

export interface MusicEmbed {
  service: MusicService;
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
  if (/music\.apple\.com\//.test(s) && /\/(album|playlist|song)\//.test(s)) {
    return {
      service: "apple-music",
      embedUrl: s.replace("music.apple.com", "embed.music.apple.com"),
      height: 175,
      label: "Apple Music",
    };
  }

  // ── SoundCloud ────────────────────────────────────────────────────
  // https://soundcloud.com/artist/track-name
  // https://soundcloud.com/artist/sets/playlist-name
  if (/soundcloud\.com\/[^/]+\/[^/]+/.test(s)) {
    return {
      service: "soundcloud",
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(s)}&color=%232d4a8a&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`,
      height: s.includes("/sets/") ? 300 : 166,
      label: "SoundCloud",
    };
  }

  // ── Bandcamp ──────────────────────────────────────────────────────
  // https://artist.bandcamp.com/track/track-name
  // https://artist.bandcamp.com/album/album-name
  if (/[a-zA-Z0-9-]+\.bandcamp\.com\/(track|album)\//.test(s)) {
    return {
      service: "bandcamp",
      embedUrl: s,
      height: s.includes("/album/") ? 340 : 120,
      label: "Bandcamp",
    };
  }

  // ── Direct audio file ─────────────────────────────────────────────
  // .mp3, .wav, .ogg, .m4a, .flac, .aac, .webm, .opus
  if (/^https?:\/\/.+\.(mp3|wav|ogg|m4a|flac|aac|webm|opus)(\?.*)?$/i.test(s)) {
    return {
      service: "audio",
      embedUrl: s,
      height: 54,
      label: "Audio",
    };
  }

  return null;
}

/**
 * Returns a human-friendly label for a music field value.
 * If it's a recognized service URL, returns the service name.
 * If it's plain text, returns the text as-is.
 */
export function getMusicLabel(input: string): string {
  if (!input) return "";
  const embed = parseMusicUrl(input);
  if (embed) return embed.label;
  return input;
}
