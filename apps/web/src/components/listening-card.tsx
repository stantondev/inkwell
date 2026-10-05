"use client";

import { useState } from "react";
import { listenBrainzCover, listenBrainzLink, type ListenBrainzMetadata } from "@/lib/music";

/**
 * The song a writer was listening to, filled in from ListenBrainz: cover art
 * (Cover Art Archive), track, artist and album, linking to the song's
 * MusicBrainz page. There's no player: ListenBrainz knows what was played, not
 * where to stream it.
 */
export function ListeningCard({
  track,
  compact = false,
}: {
  track: ListenBrainzMetadata;
  /** Feed cards: smaller, no album line. */
  compact?: boolean;
}) {
  const cover = listenBrainzCover(track);
  const [coverFailed, setCoverFailed] = useState(false);
  const href = listenBrainzLink(track);
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
        <span className="listening-card-track">{track.track}</span>
        <span className="listening-card-artist">
          {track.artist}
          {!compact && track.release && track.release !== track.track ? ` · ${track.release}` : ""}
        </span>
        <span className="listening-card-source">via ListenBrainz</span>
      </span>
    </>
  );

  const className = `listening-card${compact ? " listening-card-compact" : ""}`;

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}
      aria-label={`${track.track} by ${track.artist}, on MusicBrainz`}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}
