"use client";

/**
 * One stamp as it sits on a post: the drawing at a slight, stable tilt, with
 * a postmark (round cancellation ring naming the town, INKWELL or the
 * sender's server, the day it was stamped, and wavy lines across the corner).
 */

import { useId } from "react";
import { StampArt } from "./stamp-art";
import { postmarkTown, stampDay, stampInfo, stampSeed, type StampMark } from "./stamp-config";

export type PostmarkStyle = "full" | "lines" | "none";

interface StampImpressionProps {
  mark: Pick<StampMark, "id" | "type" | "stamped_on" | "emoji" | "emoji_url" | "domain">;
  width: number;
  postmark?: PostmarkStyle;
  /** Play the press-down animation (a stamp that was just sent). */
  pressed?: boolean;
  /** Turn off the tilt (album pockets, picker sheet). */
  straight?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const WAVE = (y: number, from: number, to: number) => {
  const seg = 6;
  let d = `M${from} ${y}`;
  for (let x = from; x < to; x += seg) d += ` q${seg / 4} -2.4 ${seg / 2} 0 t${seg / 2} 0`;
  return d;
};

export function Postmark({
  town,
  stampedOn,
  variant,
}: {
  town: string;
  stampedOn: string | null | undefined;
  variant: "full" | "lines";
}) {
  const rid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const arcId = `pm-arc-${rid}`;
  const day = stampDay(stampedOn);
  const label = town.length > 22 ? town.slice(0, 21) + "…" : town;
  // Fit the town around the top half of the ring (≈ 58 units of arc).
  const fontSize = Math.min(6.4, 58 / Math.max(6, label.length * 0.68));
  return (
    <svg className="stamp-postmark" viewBox="0 0 100 60" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        {variant === "full" && (
          <>
            <circle cx="26" cy="30" r="22" strokeWidth="1.6" />
            <circle cx="26" cy="30" r="13.5" strokeWidth="1" />
          </>
        )}
        {[19, 26, 33, 40].map((y) => (
          <path key={y} d={WAVE(y, variant === "full" ? 50 : 44, 98)} strokeWidth="1.5" />
        ))}
      </g>
      {variant === "full" && (
        <>
          <path id={arcId} d="M8.2 30 A17.8 17.8 0 1 1 43.8 30" fill="none" stroke="none" />
          <text fontFamily="Georgia, serif" fontSize={fontSize} fontWeight="700" letterSpacing="0.6" fill="currentColor">
            <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
              {label}
            </textPath>
          </text>
          {day ? (
            <>
              <text x="26" y="29.5" textAnchor="middle" fontFamily="Georgia, serif" fontSize="6.6" fontWeight="700" fill="currentColor">
                {day.day} {day.month.toUpperCase()}
              </text>
              <text x="26" y="37" textAnchor="middle" fontFamily="Georgia, serif" fontSize="5.6" fill="currentColor">
                {day.year}
              </text>
            </>
          ) : (
            <text x="26" y="33" textAnchor="middle" fontFamily="Georgia, serif" fontSize="8" fill="currentColor">
              ✶
            </text>
          )}
          <path d="M14 46.5 h24" stroke="currentColor" strokeWidth="0.9" />
        </>
      )}
    </svg>
  );
}

export function StampImpression({
  mark,
  width,
  postmark = "full",
  pressed = false,
  straight = false,
  className = "",
  style,
}: StampImpressionProps) {
  const seed = stampSeed(mark.id);
  const tilt = straight ? 0 : (seed * 12 - 6).toFixed(2);
  const dy = straight ? 0 : Math.round(stampSeed(mark.id + "y") * 6 - 3);
  const pmTilt = (stampSeed(mark.id + "pm") * 20 - 12).toFixed(1);
  const info = stampInfo(mark.type);
  return (
    <span
      className={`stamp-impression${pressed ? " is-pressed" : ""} ${className}`}
      data-stamp={mark.type}
      title={info ? `${info.label} · ${info.description}` : undefined}
      style={
        {
          width,
          height: Math.round((width * 96) / 80),
          "--stamp-tilt": `${tilt}deg`,
          "--stamp-dy": `${dy}px`,
          "--pm-tilt": `${pmTilt}deg`,
          ...style,
        } as React.CSSProperties
      }
    >
      <span className="stamp-impression-body">
        <StampArt type={mark.type} width={width} emoji={mark.emoji} emojiUrl={mark.emoji_url} />
      </span>
      {postmark !== "none" && (
        <span className="stamp-impression-postmark">
          <Postmark town={postmarkTown(mark)} stampedOn={mark.stamped_on} variant={postmark} />
        </span>
      )}
    </span>
  );
}
