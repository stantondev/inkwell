import { archiveOriginName, postmarkDate } from "@/lib/archive";

/**
 * A cancellation postmark for posts brought over from another journal: the
 * old site's name around the ring, the date it was first written in the
 * middle, and wavy cancellation lines trailing off to the right. Drawn in
 * currentColor; `.archive-postmark` gives it worn ink.
 *
 * No hooks, so it renders in server components too. `uid` keeps the SVG
 * path/filter ids unique when several postmarks share a page.
 */
export function ArchivePostmark({
  origin,
  publishedAt,
  uid,
  width = 150,
  waves = true,
  className = "",
  title,
}: {
  origin: string | null | undefined;
  publishedAt: string | null | undefined;
  uid: string;
  width?: number;
  waves?: boolean;
  className?: string;
  title?: string;
}) {
  const date = postmarkDate(publishedAt);
  const name = archiveOriginName(origin).toUpperCase();
  const id = `pm-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // Worn ink reads as texture when large; small, it just fades the mark out.
  const worn = width >= 60;
  const viewWidth = waves ? 222 : 124;
  const height = Math.round((width * 120) / viewWidth);
  // Long names get a little less letter spacing so they fit the ring.
  const spacing = name.length > 9 ? 1.2 : 2.4;
  const wave = (y: number) => `M120,${y} q6,-5 12,0 t12,0 t12,0 t12,0 t12,0 t12,0 t12,0 t12,0`;

  return (
    <svg
      className={`archive-postmark ${className}`}
      width={width}
      height={height}
      viewBox={`0 0 ${viewWidth} 120`}
      {...(title === ""
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": title ?? `Postmarked ${archiveOriginName(origin)}${date ? `, ${date.long}` : ""}` })}
    >
      <defs>
        <path id={`${id}-top`} d="M21,60 A41,41 0 0 1 103,60" />
        <path id={`${id}-bottom`} d="M15,60 A47,47 0 0 0 109,60" />
        <filter id={`${id}-ink`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.8" xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="2.4" numOctaves="1" seed="3" result="speck" />
          <feColorMatrix in="speck" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.4" result="holes" />
          <feComposite in="rough" in2="holes" operator="in" />
        </filter>
      </defs>
      <g filter={worn ? `url(#${id}-ink)` : undefined} fill="none" stroke="currentColor">
        <circle cx="62" cy="60" r="55" strokeWidth="2.6" />
        <circle cx="62" cy="60" r="35" strokeWidth="1.2" />
        <text fill="currentColor" stroke="none" fontSize="10.5" fontWeight="700" letterSpacing={spacing} fontFamily="Georgia, 'Times New Roman', serif">
          <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">{name}</textPath>
        </text>
        <text fill="currentColor" stroke="none" fontSize="9" fontWeight="700" letterSpacing="3" fontFamily="Georgia, 'Times New Roman', serif">
          <textPath href={`#${id}-bottom`} startOffset="50%" textAnchor="middle">ARCHIVE</textPath>
        </text>
        <circle cx="21" cy="60" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="103" cy="60" r="1.6" fill="currentColor" stroke="none" />
        {date && (
          <>
            <text x="62" y="53" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8.5" letterSpacing="1.2" fontFamily="Georgia, 'Times New Roman', serif">
              {date.monthDay}
            </text>
            <text x="62" y="72" textAnchor="middle" fill="currentColor" stroke="none" fontSize="18" fontWeight="700" letterSpacing="0.5" fontFamily="Georgia, 'Times New Roman', serif">
              {date.year}
            </text>
          </>
        )}
        {waves && (
          <g strokeWidth="2.2" strokeLinecap="round">
            {[30, 45, 60, 75, 90].map((y) => (
              <path key={y} d={wave(y)} />
            ))}
          </g>
        )}
      </g>
    </svg>
  );
}

/** One line for cards: a small postmark and "From the LiveJournal archive". */
export function ArchiveSeal({
  origin,
  publishedAt,
  uid,
}: {
  origin: string | null | undefined;
  publishedAt: string | null | undefined;
  uid: string;
}) {
  return (
    <span className="archive-seal">
      <ArchivePostmark origin={origin} publishedAt={publishedAt} uid={uid} width={30} waves={false} title="" />
      <span>From the {archiveOriginName(origin)} archive</span>
    </span>
  );
}
