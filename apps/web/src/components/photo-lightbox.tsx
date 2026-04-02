"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

interface LightboxPhoto {
  imageId: string;
  caption: string;
  alt: string;
}

interface PhotoLightboxProps {
  photos: LightboxPhoto[];
  initialIndex: number;
  onClose: () => void;
  slideshowEnabled?: boolean;
}

export function PhotoLightbox({ photos, initialIndex, onClose, slideshowEnabled = false }: PhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const photo = photos[index];
  const total = photos.length;
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  const goNext = useCallback(() => {
    setIndex(i => Math.min(i + 1, total - 1));
  }, [total]);

  const goPrev = useCallback(() => {
    setIndex(i => Math.max(i - 1, 0));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && hasNext) goNext();
      else if (e.key === "ArrowLeft" && hasPrev) goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goNext, goPrev, hasNext, hasPrev]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Slideshow auto-advance
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setIndex(i => {
          if (i >= total - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        });
      }, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, total]);

  // Touch swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0 && hasNext) goNext();
      else if (dx > 0 && hasPrev) goPrev();
    }
  };

  const content = (
    <div
      className="lightbox-backdrop"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="lightbox-container" onClick={e => e.stopPropagation()}>
        {/* Counter + Close */}
        <div className="lightbox-header">
          <span className="lightbox-counter">
            {index + 1} / {total}
          </span>
          <div className="lightbox-header-actions">
            {slideshowEnabled && total > 1 && (
              <button
                className="lightbox-btn"
                onClick={() => { setPlaying(p => !p); }}
                aria-label={playing ? "Pause slideshow" : "Play slideshow"}
              >
                {playing ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="6,4 20,12 6,20"/>
                  </svg>
                )}
              </button>
            )}
            <button className="lightbox-btn lightbox-close" onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Main image */}
        <div className="lightbox-image-wrap">
          {hasPrev && (
            <button className="lightbox-arrow lightbox-arrow-left" onClick={goPrev} aria-label="Previous">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}
          <img
            src={`/api/images/${photo.imageId}`}
            alt={photo.alt || ""}
            className="lightbox-image"
          />
          {hasNext && (
            <button className="lightbox-arrow lightbox-arrow-right" onClick={goNext} aria-label="Next">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          )}
        </div>

        {/* Caption */}
        {photo.caption && (
          <p className="lightbox-caption">{photo.caption}</p>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
