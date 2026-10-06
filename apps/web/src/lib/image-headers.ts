/**
 * Headers for every image this app relays from the API (`/api/images`,
 * `/api/avatars`, `/api/banners`, `/api/userpics`).
 *
 * Images are served from the site's own origin, so a file opened directly in
 * the browser runs as that origin. `nosniff` stops the browser guessing a
 * different type, and the sandboxing CSP means no script in the file (an SVG,
 * say) can run. Neither affects how an image shows in an <img>.
 * Mirrors `Inkwell.Images.secure_headers/1` on the API.
 */
export const IMAGE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
} as const;
