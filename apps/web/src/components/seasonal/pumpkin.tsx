/** A little jack-o'-lantern. Its face glows. `x`/`y` place it inside another SVG (the logo). */
export function Pumpkin({ size = 26, x, y, className = "" }: { size?: number; x?: number; y?: number; className?: string }) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={`tot-pumpkin ${className}`}>
      <path className="tot-stem" d="M15 8.5C15 6 15.6 4 17.6 2.6C18.3 2.1 19.2 2.9 18.7 3.6C17.6 5 17.4 6.6 17.5 8.6Z" />
      <path className="tot-leaf" d="M17.6 6.4C19.6 4.4 22.6 4.5 24 5.6C22.2 6.2 20.4 7.4 18.6 8Z" />
      <ellipse className="tot-body" cx="9.6" cy="18.6" rx="7.4" ry="10" />
      <ellipse className="tot-body" cx="22.4" cy="18.6" rx="7.4" ry="10" />
      <ellipse className="tot-body tot-body-mid" cx="16" cy="18.4" rx="7.6" ry="10.4" />
      <path className="tot-rib" d="M12.6 9.6C10.2 13 10.2 24 12.6 27.6M19.4 9.6C21.8 13 21.8 24 19.4 27.6" />
      <path className="tot-face" d="M9.4 16.6L12.4 13.8L13.6 17.4ZM22.6 16.6L19.6 13.8L18.4 17.4ZM14.8 18.6L16 16.6L17.2 18.6ZM9 20.6C11 24.4 21 24.4 23 20.6L21.2 21.6L20.2 20.8L18.6 22.2L17.2 21L16 22.4L14.8 21L13.4 22.2L11.8 20.8L10.8 21.6Z" />
    </svg>
  );
}
