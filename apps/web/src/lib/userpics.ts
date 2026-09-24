// LiveJournal-style userpics: a writer's set of pictures, each with a keyword,
// one chosen per entry or comment (the avatar is the default).
// API: /api/me/icons (list/upload), /api/me/icons/:id (rename/delete),
// pictures at /api/userpics/:id.

export interface Userpic {
  id: string;
  keyword: string;
  url: string;
}

/** Userpics can be animated GIFs, kept as they are (up to this size). */
export const USERPIC_MAX_GIF_BYTES = 400_000;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Turn a chosen file into what the API accepts. GIFs small enough are sent
 * untouched so their animation survives (a canvas would flatten them);
 * everything else is cropped square to 200px (PNGs stay PNG, for transparency).
 */
export async function prepareUserpic(file: File): Promise<string> {
  if (file.type === "image/gif" && file.size <= USERPIC_MAX_GIF_BYTES) return readAsDataUrl(file);
  const { resizeImage } = await import("@/lib/image-utils");
  return resizeImage(file, 200, 0.88, file.type === "image/png" ? "image/png" : "image/jpeg");
}
