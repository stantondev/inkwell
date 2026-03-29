import { PLUS_FRAME_IDS, AVATAR_ANIMATION_IDS } from "@/lib/avatar-frames";

interface AvatarWithFrameProps {
  url: string | null;
  name: string;
  size?: number;
  frame?: string | null;
  /** CSS animation style for the avatar (Plus only) */
  animation?: string | null;
  /** Pass the user's subscription tier to gate Plus frames/animations */
  subscriptionTier?: string;
}

/**
 * Avatar with optional decorative frame overlay.
 * Replaces inline Avatar components throughout the app.
 *
 * When a Plus-only frame is set but the user is not Plus,
 * the frame falls back to "none" (same pattern as custom colors).
 */
export function AvatarWithFrame({
  url,
  name,
  size = 32,
  frame,
  animation,
  subscriptionTier,
}: AvatarWithFrameProps) {
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  // Determine effective frame (gate Plus frames for non-Plus users)
  let effectiveFrame = frame && frame !== "none" ? frame : null;
  if (effectiveFrame && subscriptionTier && subscriptionTier !== "plus") {
    if (PLUS_FRAME_IDS.has(effectiveFrame)) {
      effectiveFrame = null;
    }
  }

  const hasFrame = !!effectiveFrame;

  // Determine effective animation (Plus-only)
  let animClass = "";
  if (animation && AVATAR_ANIMATION_IDS.has(animation)) {
    if (!subscriptionTier || subscriptionTier === "plus") {
      animClass = `avatar-anim-${animation}`;
    }
  }

  // Frame adds visual padding around the avatar
  const outerSize = hasFrame ? Math.round(size * 1.3) : size;
  const offset = hasFrame ? Math.round((outerSize - size) / 2) : 0;

  return (
    <div
      className={`relative inline-flex items-center justify-center flex-shrink-0 ${animClass}`}
      style={{ width: outerSize, height: outerSize }}
    >
      {/* Avatar image or initials */}
      <div
        className="absolute rounded-full overflow-hidden"
        style={{ width: size, height: size, top: offset, left: offset }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={name}
            className="w-full h-full object-cover"
            width={size}
            height={size}
          />
        ) : (
          <div
            className="w-full h-full rounded-full flex items-center justify-center font-semibold select-none"
            style={{
              background: "var(--accent-light)",
              color: "var(--accent)",
              fontSize: size * 0.38,
            }}
            aria-label={name}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Frame overlay */}
      {hasFrame && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/frames/${effectiveFrame}.svg`}
          alt=""
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
          width={outerSize}
          height={outerSize}
        />
      )}
    </div>
  );
}

/**
 * Simple avatar without frame support (backward compat / lightweight).
 * Use AvatarWithFrame when frame data is available.
 */
export function Avatar({
  url,
  name,
  size = 32,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  return <AvatarWithFrame url={url} name={name} size={size} />;
}
