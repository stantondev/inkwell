"use client";

import { useEffect, useState } from "react";

/**
 * A date shown in the reader's own time zone.
 *
 * The server and the first client render both format in UTC, so the HTML
 * React hydrates matches exactly (formatting in the reader's zone during
 * render made React discard the server HTML — error #418). Straight after
 * hydration it switches to the reader's zone. Without the switch, a post
 * written at 10:45 PM in New York showed as the next day.
 */
export function LocalDate({
  iso,
  options,
  className,
  style,
  asTime = true,
}: {
  iso: string;
  options: Omit<Intl.DateTimeFormatOptions, "timeZone">;
  className?: string;
  style?: React.CSSProperties;
  /** Render a <time> element (default) or a plain <span>. */
  asTime?: boolean;
}) {
  const [timeZone, setTimeZone] = useState("UTC");

  useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) setTimeZone(zone);
    } catch {
      // Keep UTC.
    }
  }, []);

  let text: string;
  try {
    text = new Date(iso).toLocaleDateString("en-US", { ...options, timeZone });
  } catch {
    text = new Date(iso).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
  }

  if (!asTime) {
    return <span className={className} style={style}>{text}</span>;
  }
  return (
    <time className={className} style={style} dateTime={iso}>
      {text}
    </time>
  );
}

export const FULL_DATE: Omit<Intl.DateTimeFormatOptions, "timeZone"> = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
};

export const SHORT_DATE: Omit<Intl.DateTimeFormatOptions, "timeZone"> = {
  month: "short",
  day: "numeric",
  year: "numeric",
};
