// Pure CSS page-enter animation. Previously used `motion/react` which pulled
// the full Framer Motion library (~30-50KB gzipped) into every entry page
// just for a one-time fade-and-slide-in. The same effect is achieved with
// a CSS @keyframes rule (defined in globals.css as `.entry-template-enter`)
// and a `prefers-reduced-motion` media query also handled in CSS.
//
// No "use client" needed — this is a pure server component now.

export default function EntryTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="entry-template-enter">{children}</div>;
}
