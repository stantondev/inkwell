/**
 * Shared Avatar component used across feed, profile, comments, notifications, etc.
 * Shows user image if available, falls back to styled initials.
 */

interface AvatarProps {
  url: string | null;
  name: string;
  size?: number;
}

export function Avatar({ url, name, size = 36 }: AvatarProps) {
  const initial = name[0]?.toUpperCase() ?? "?";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold select-none flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: "var(--accent-light)",
        color: "var(--accent)",
        fontSize: size * 0.38,
      }}
      aria-label={name}
    >
      {initial}
    </div>
  );
}
