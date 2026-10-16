import type { ProfileBlock } from "@/lib/profile-home";
import type { ProfileStyles } from "./profile-types";

// The things writers put on their page themselves (Arrange my page). Text is
// plain and rendered by React, so nothing in it is ever treated as HTML.

/** A small, stable tilt for a block, from its id: pinned-on, not random. */
export function tiltOf(id: string, range = 2.4): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.round(((Math.abs(h) % 1000) / 1000 - 0.5) * 2 * range * 10) / 10;
}

/** Whether a writer's own block has anything in it yet (empty ones aren't shown to visitors). */
export function homeBlockFilled(block: ProfileBlock): boolean {
  const c = block.config ?? {};
  switch (block.type) {
    case "note":
      return !!(c.title?.trim() || c.body?.trim());
    case "photo":
      return !!c.image_id;
    case "quote":
      return !!c.text?.trim();
    case "now":
      return (c.items ?? []).some((i) => i.label?.trim() || i.value?.trim());
    case "countdown":
      return !!c.date;
    case "links":
      return (c.items ?? []).some((i) => !!i.url);
    default:
      return true;
  }
}

function Label({ children, styles }: { children: React.ReactNode; styles: ProfileStyles }) {
  return (
    <h3 className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: styles.muted }}>
      {children}
    </h3>
  );
}

export function NoteWidget({ block, styles, displayName }: { block: ProfileBlock; styles: ProfileStyles; displayName: string }) {
  const { title, body, style = "card", color = "yellow" } = block.config;
  const tilt = tiltOf(block.id);

  if (style === "sticky") {
    return (
      <div className="home-sticky" style={{ "--home-tilt": `${tilt}deg`, background: `var(--sticky-${color})` } as React.CSSProperties}>
        {title && <h3 className="home-sticky-title">{title}</h3>}
        {body && <p className="home-note-body">{body}</p>}
      </div>
    );
  }

  if (style === "index") {
    return (
      <div className="home-index-card">
        <h3 className="home-index-title">{title || " "}</h3>
        {body && <p className="home-note-body home-index-body">{body}</p>}
      </div>
    );
  }

  if (style === "letter") {
    return (
      <div className="home-letter">
        {title && <p className="home-letter-salutation">{title}</p>}
        {body && <p className="home-note-body">{body}</p>}
        <p className="home-letter-signature">— {displayName}</p>
      </div>
    );
  }

  return (
    <div className={`profile-widget-card ${styles.borderRadius} border p-3 sm:p-4`} style={styles.surface}>
      {title && <h3 className="text-base font-semibold mb-2" style={{ fontFamily: "var(--serif, var(--font-lora, Georgia, serif))" }}>{title}</h3>}
      {body && <p className="home-note-body" style={{ color: styles.foreground }}>{body}</p>}
    </div>
  );
}

export function PhotoWidget({ block, styles }: { block: ProfileBlock; styles: ProfileStyles }) {
  const { image_id, caption, alt, style = "plain" } = block.config;
  if (!image_id) return null;
  const src = `/api/images/${image_id}`;
  const altText = alt || caption || "";

  if (style === "polaroid" || style === "taped") {
    return (
      <figure
        className={style === "polaroid" ? "home-polaroid" : "home-taped"}
        style={{ "--home-tilt": `${tiltOf(block.id, 2)}deg` } as React.CSSProperties}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={altText} loading="lazy" />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    );
  }

  return (
    <figure className="home-photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={altText} loading="lazy" className={styles.borderRadius} />
      {caption && <figcaption style={{ color: styles.muted }}>{caption}</figcaption>}
    </figure>
  );
}

export function QuoteWidget({ block, styles }: { block: ProfileBlock; styles: ProfileStyles }) {
  const { text, cite } = block.config;
  return (
    <figure className={`profile-widget-card home-quote ${styles.borderRadius} border p-4 sm:p-5`} style={styles.surface}>
      <span className="home-quote-mark" aria-hidden="true" style={{ color: styles.accent }}>&ldquo;</span>
      <blockquote className="home-note-body">{text}</blockquote>
      {cite && <figcaption style={{ color: styles.muted }}>— {cite}</figcaption>}
    </figure>
  );
}

export function NowWidget({ block, styles }: { block: ProfileBlock; styles: ProfileStyles }) {
  const items = (block.config.items ?? []).filter((i) => i.label?.trim() || i.value?.trim());
  return (
    <div className={`profile-widget-card ${styles.borderRadius} border p-3 sm:p-4`} style={styles.surface}>
      <Label styles={styles}>Currently</Label>
      <dl className="home-now">
        {items.map((i, n) => (
          <div key={n} className="home-now-row">
            <dt style={{ color: styles.muted }}>{i.label}</dt>
            <dd style={{ color: styles.foreground }}>{i.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Whole days from today (UTC) to a YYYY-MM-DD date; negative when past. */
function daysUntil(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

export function CountdownWidget({ block, styles }: { block: ProfileBlock; styles: ProfileStyles }) {
  const { label, date } = block.config;
  if (!date) return null;
  const days = daysUntil(date);
  const n = Math.abs(days);
  const what = label?.trim() || "the day";
  return (
    <div className={`profile-widget-card home-countdown ${styles.borderRadius} border p-4`} style={styles.surface}>
      {days === 0 ? (
        <p className="home-countdown-today" suppressHydrationWarning>Today: {what}</p>
      ) : (
        <>
          <p className="home-countdown-number" style={{ color: styles.accent }} suppressHydrationWarning>{n.toLocaleString("en-US")}</p>
          <p className="home-countdown-label" style={{ color: styles.muted }} suppressHydrationWarning>
            {n === 1 ? "day" : "days"} {days > 0 ? "until" : "since"} {what}
          </p>
        </>
      )}
    </div>
  );
}

export function LinksWidget({ block, styles }: { block: ProfileBlock; styles: ProfileStyles }) {
  const items = (block.config.items ?? []).filter((i) => !!i.url);
  return (
    <div className={`profile-widget-card ${styles.borderRadius} border p-3 sm:p-4`} style={styles.surface}>
      <Label styles={styles}>{block.config.title?.trim() || "Elsewhere"}</Label>
      <ul className="flex flex-col gap-1.5">
        {items.map((i, n) => (
          <li key={n}>
            <a
              href={i.url}
              target="_blank"
              rel="nofollow ugc noopener noreferrer"
              className="home-link text-sm hover:underline"
              style={{ color: styles.accent }}
            >
              {i.label?.trim() || hostOf(i.url!)}
              <span aria-hidden="true"> ↗</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Dividers other than the theme's own line. */
export function FancyDivider({ style, className }: { style: string; className?: string }) {
  return <div role="separator" className={`home-divider home-divider-${style} ${className ?? ""}`} />;
}
