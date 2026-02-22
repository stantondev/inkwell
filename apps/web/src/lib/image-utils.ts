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
