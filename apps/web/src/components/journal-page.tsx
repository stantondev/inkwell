interface JournalPageProps {
  children: React.ReactNode;
  className?: string;
  corner?: boolean;
  edge?: boolean;
  style?: React.CSSProperties;
  /** Book mode: full-height page without card borders, used in horizontal book layout */
  bookPage?: boolean;
}

export function JournalPage({
  children,
  className = "",
  corner = false,
  edge = false,
  style,
  bookPage = false,
}: JournalPageProps) {
  if (bookPage) {
    // Book mode: keep card aesthetic but fit within book layout
    return (
      <div
        className={`journal-page journal-book-entry rounded-xl border overflow-hidden journal-corner journal-page-edge ${className}`}
        style={{ borderColor: "var(--border)", ...style }}
      >
        {children}
      </div>
    );
  }

  const classes = [
    "journal-page",
    "rounded-2xl",
    "border",
    "overflow-hidden",
    corner ? "journal-corner" : "",
    edge ? "journal-page-edge" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={{ borderColor: "var(--border)", ...style }}
    >
      {children}
    </div>
  );
}
