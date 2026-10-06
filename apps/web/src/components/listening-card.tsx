"use client";

import { useState } from "react";
import { songCover, songLink, songSource, songTitle, type SongMetadata } from "@/lib/music";

/**
 * The song (or album) a writer was listening to, filled in from ListenBrainz
 * or a pasted MusicBrainz/ListenBrainz link: cover art (Cover Art Archive),
 * title, artist and album, linking to its page. There's no player: these
 * services know what a song is, not where to stream it.
 */
export function ListeningCard({
  track,
  compact = false,
}: {
  track: SongMetadata;
  /** Feed cards: smaller, no album line. */
  compact?: boolean;
}) {
  const cover = songCover(track);
  const [coverFailed, setCoverFailed] = useState(false);
  const href = songLink(track);
  const title = songTitle(track);
  // A song shows its album underneath; an album link has none.
  const album = track.track && track.release && track.release !== track.track ? track.release : null;
  const size = compact ? 44 : 64;

  const body = (
    <>
      {cover && !coverFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="listening-card-cover"
          onError={() => setCoverFailed(true)}
        />
      ) : (
        <span className="listening-card-cover listening-card-cover-empty" style={{ width: size, height: size }} aria-hidden="true">
          ♪
        </span>
      )}
      <span className="listening-card-text">
        <span className="listening-card-track">{title}</span>
        {(track.artist || (!compact && album)) && (
          <span className="listening-card-artist">
            {track.artist}
            {!compact && album ? `${track.artist ? " · " : ""}${album}` : ""}
          </span>
        )}
        <span className="listening-card-source">{songSource(track)}</span>
      </span>
    </>
  );

  const className = `listening-card${compact ? " listening-card-compact" : ""}`;

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}
      aria-label={track.artist ? `${title} by ${track.artist}` : title}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}
