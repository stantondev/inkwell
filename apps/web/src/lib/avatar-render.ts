/**
 * Render an SVG string to a JPEG data URI at the specified size.
 * Used to convert DiceBear SVG to a storable avatar_url.
 * Same canvas pattern as resizeImage() in image-utils.ts.
 */
export function renderSvgToDataUri(
  svgString: string,
  size: number = 400,
  quality: number = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }

      // White background (JPEG has no transparency)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);

      // Draw SVG centered and scaled to fill
      ctx.drawImage(img, 0, 0, size, size);

      const dataUri = canvas.toDataURL("image/jpeg", quality);
      resolve(dataUri);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to render SVG to image"));
    };

    img.src = url;
  });
}
