interface JournalPageProps {
  children: React.ReactNode;
  className?: string;
  corner?: boolean;
  edge?: boolean;
  style?: React.CSSProperties;
}

export function JournalPage({
  children,
  className = "",
  corner = false,
  edge = false,
  style,
}: JournalPageProps) {
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
