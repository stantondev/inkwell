"use client";

import { useEffect, useRef, useState } from "react";
import { PhotoLightbox } from "@/components/photo-lightbox";

interface GalleryState {
  photos: { imageId: string; caption: string; alt: string }[];
  initialIndex: number;
  slideshowEnabled: boolean;
}

interface GalleryHydratorProps {
  /** Whether Plus-only features like slideshow are available */
  authorIsPlus?: boolean;
}

export function GalleryHydrator({ authorIsPlus = false }: GalleryHydratorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<GalleryState | null>(null);

  useEffect(() => {
    const container = containerRef.current?.closest(".prose-entry") || document;

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const figure = target.closest("[data-gallery-photo]");
      if (!figure) return;

      const gallery = figure.closest("[data-photo-gallery]");
      if (!gallery) return;

      // Collect all photos in this gallery
      const figures = gallery.querySelectorAll("[data-gallery-photo]");
      const photos: { imageId: string; caption: string; alt: string }[] = [];
      let clickedIndex = 0;

      figures.forEach((fig, idx) => {
        const imageId = fig.getAttribute("data-image-id") || "";
        const img = fig.querySelector("img");
        const alt = img?.getAttribute("alt") || "";
        const figcaption = fig.querySelector("figcaption");
        const caption = figcaption?.textContent || "";
        photos.push({ imageId, caption, alt });
        if (fig === figure) clickedIndex = idx;
      });

      if (photos.length > 0) {
        e.preventDefault();
        setLightbox({
          photos,
          initialIndex: clickedIndex,
          slideshowEnabled: authorIsPlus,
        });
      }
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [authorIsPlus]);

  return (
    <>
      <div ref={containerRef} style={{ display: "none" }} />
      {lightbox && (
        <PhotoLightbox
          photos={lightbox.photos}
          initialIndex={lightbox.initialIndex}
          onClose={() => setLightbox(null)}
          slideshowEnabled={lightbox.slideshowEnabled}
        />
      )}
    </>
  );
}
