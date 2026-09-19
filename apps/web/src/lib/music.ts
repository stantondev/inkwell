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
  | "audio"
  // Fediverse players, resolved on the server (see Inkwell.MediaEmbeds)
  | "peertube"
  | "funkwhale"
  | "castopod"
  | "owncast";

export interface MusicEmbed {
  service: MusicService;
  embedUrl: string;
  /** Full-size height for the reading page */
  height: number;
  /** Label for accessibility / UI badges */
  label: string;
  /** Video players size to 16:9 instead of a fixed height. */
  aspect?: "video";
  /** Title of the linked video, track or episode, when known. */
  title?: string;
  /** Players from independent fediverse servers are sandboxed. */
  fediverse?: boolean;
}

/**
 * Saved with an entry when its media link is a PeerTube, Funkwhale, Castopod
 * or Owncast link (`music_metadata`). Those can't be recognised from the URL
 * alone, so the server looks them up once, when the writer pastes the link.
 */
export interface MusicMetadata {
  service: "peertube" | "funkwhale" | "castopod" | "owncast";
  embed_url: string;
  label: string;
  title?: string;
  height?: number;
  aspect?: "video";
  source_url: string;
}

/**
 * The player for an entry's media field: a recognised service link, or a
 * fediverse player saved for exactly this link.
 */
export function resolveMusicEmbed(
  music: string | null | undefined,
  metadata?: MusicMetadata | null
): MusicEmbed | null {
  if (!music) return null;
  const known = parseMusicUrl(music);
  if (known) return known;
  if (metadata?.embed_url && metadata.source_url === music.trim()) {
    return {
      service: metadata.service,
      embedUrl: metadata.embed_url,
      height: metadata.height ?? (metadata.aspect === "video" ? 315 : 160),
      label: metadata.label,
      aspect: metadata.aspect,
      title: metadata.title,
      fediverse: true,
    };
  }
  return null;
}

/** Links worth asking the server about: https, and not a service we already know. */
export function mightBeFediverseMedia(input: string): boolean {
  const s = input.trim();
  return /^https:\/\/[^\s/]+\.[^\s]*$/i.test(s) && !parseMusicUrl(s);
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
