/**
 * Resize an image file to a max dimension and return a data URI.
 * Used by both the welcome page and the profile settings form.
 */
export function resizeImage(
  file: File,
  maxSize = 400,
  quality = 0.85,
  format: "image/jpeg" | "image/png" = "image/jpeg"
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const { naturalWidth: w, naturalHeight: h } = img;
      const cropSize = Math.min(w, h);
      const sx = (w - cropSize) / 2;
      const sy = (h - cropSize) / 2;
      const outSize = Math.min(cropSize, maxSize);

      const canvas = document.createElement("canvas");
      canvas.width = outSize;
      canvas.height = outSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }

      ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, outSize, outSize);

      const dataUri = canvas.toDataURL(format, quality);
      resolve(dataUri);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Resize an image for entry content — keeps aspect ratio, max 1200px, 0.8 quality.
 */
export async function resizeEntryImage(
  file: File,
  maxDimension = 1200,
  quality = 0.8
): Promise<string> {
  if (file.type === "image/avif") {
    const kept = await keepSmallAvif(file, maxDimension);
    if (kept) return kept;
  }
  return resizeBackgroundImage(file, maxDimension, quality);
}

// AVIF is usually much smaller than the JPEG we'd re-encode it to, so one
// that's already within the size we'd resize to is uploaded untouched
// (readers that can't show AVIF get a JPEG copy from /api/images). If this
// browser can't even decode it, it's still uploaded as is when small enough.
const MAX_AVIF_BYTES = 4_000_000;

function keepSmallAvif(file: File, maxDimension: number): Promise<string | null> {
  if (file.size > MAX_AVIF_BYTES) return Promise.resolve(null);

  const asDataUri = () =>
    new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const uri = typeof reader.result === "string" ? reader.result : null;
        resolve(uri && uri.startsWith("data:image/avif;base64,") ? uri : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const fits = img.naturalWidth <= maxDimension && img.naturalHeight <= maxDimension;
      resolve(fits ? asDataUri() : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(asDataUri());
    };
    img.src = url;
  });
}

/**
 * Resize a background image — keeps aspect ratio (no crop), max dimension limited.
 */
export function resizeBackgroundImage(
  file: File,
  maxDimension = 1920,
  quality = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const { naturalWidth: w, naturalHeight: h } = img;
      let outW = w;
      let outH = h;

      if (w > maxDimension || h > maxDimension) {
        const scale = maxDimension / Math.max(w, h);
        outW = Math.round(w * scale);
        outH = Math.round(h * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }

      ctx.drawImage(img, 0, 0, outW, outH);

      const dataUri = canvas.toDataURL("image/jpeg", quality);
      resolve(dataUri);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}
