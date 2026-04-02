"use client";

import { useState, useRef, useCallback } from "react";
import { resizeEntryImage } from "@/lib/image-utils";
import type { GalleryPhoto, GalleryLayout, PhotoGalleryAttrs } from "@/lib/tiptap-photo-gallery";
import { GALLERY_LAYOUTS } from "@/lib/tiptap-photo-gallery";

interface GalleryEditorPanelProps {
  initialAttrs?: PhotoGalleryAttrs;
  isPlus: boolean;
  onDone: (attrs: PhotoGalleryAttrs) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function GalleryEditorPanel({ initialAttrs, isPlus, onDone, onCancel, onDelete }: GalleryEditorPanelProps) {
  const maxPhotos = isPlus ? 20 : 6;

  const [photos, setPhotos] = useState<GalleryPhoto[]>(initialAttrs?.photos || []);
  const [layout, setLayout] = useState<GalleryLayout>(initialAttrs?.layout || "grid");
  const [columns, setColumns] = useState(initialAttrs?.columns || 3);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragItemRef = useRef<number | null>(null);
  const dragOverItemRef = useRef<number | null>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (fileArray.length === 0) return;

    const remaining = maxPhotos - photos.length;
    if (remaining <= 0) {
      setError(`Maximum ${maxPhotos} photos per gallery${!isPlus ? " (upgrade to Plus for 20)" : ""}`);
      return;
    }

    const toUpload = fileArray.slice(0, remaining);
    if (fileArray.length > remaining) {
      setError(`Only adding ${remaining} of ${fileArray.length} — gallery limit is ${maxPhotos}`);
    } else {
      setError("");
    }

    setUploading(true);
    setUploadProgress(`Resizing ${toUpload.length} photo${toUpload.length > 1 ? "s" : ""}...`);

    try {
      // Resize all images client-side
      const resized: string[] = [];
      for (const file of toUpload) {
        const dataUri = await resizeEntryImage(file);
        resized.push(dataUri);
      }

      setUploadProgress(`Uploading ${resized.length} photo${resized.length > 1 ? "s" : ""}...`);

      // Batch upload
      const res = await fetch("/api/images/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: resized }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "Upload failed");
        setUploading(false);
        setUploadProgress("");
        return;
      }

      const newPhotos: GalleryPhoto[] = result.data.map((img: { id: string }, idx: number) => ({
        imageId: img.id,
        caption: "",
        alt: "",
        order: photos.length + idx,
      }));

      setPhotos(prev => [...prev, ...newPhotos]);
    } catch {
      setError("Upload failed — please try again");
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  }, [photos.length, maxPhotos, isPlus]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const updatePhoto = (index: number, updates: Partial<GalleryPhoto>) => {
    setPhotos(prev => prev.map((p, i) => i === index ? { ...p, ...updates } : p));
  };

  // Drag-and-drop reordering
  const handleSortDragStart = (index: number) => {
    dragItemRef.current = index;
  };

  const handleSortDragEnter = (index: number) => {
    dragOverItemRef.current = index;
  };

  const handleSortDragEnd = () => {
    if (dragItemRef.current === null || dragOverItemRef.current === null) return;
    if (dragItemRef.current === dragOverItemRef.current) return;

    setPhotos(prev => {
      const updated = [...prev];
      const draggedItem = updated[dragItemRef.current!];
      updated.splice(dragItemRef.current!, 1);
      updated.splice(dragOverItemRef.current!, 0, draggedItem);
      return updated.map((p, i) => ({ ...p, order: i }));
    });

    dragItemRef.current = null;
    dragOverItemRef.current = null;
  };

  const handleDone = () => {
    onDone({
      layout,
      columns,
      photos: photos.map((p, i) => ({ ...p, order: i })),
    });
  };

  return (
    <div className="gallery-editor-backdrop" onClick={onCancel}>
      <div className="gallery-editor-panel" onClick={e => e.stopPropagation()}>
        <div className="gallery-editor-header">
          <h3 style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic", margin: 0 }}>
            Photo Gallery
          </h3>
          <button onClick={onCancel} className="gallery-editor-close" aria-label="Close">
            &times;
          </button>
        </div>

        {/* Upload zone */}
        <div
          className="gallery-upload-zone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => !uploading && fileInputRef.current?.click()}
          style={{ cursor: uploading ? "wait" : "pointer" }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            onChange={e => e.target.files && handleFiles(e.target.files)}
            style={{ display: "none" }}
          />
          {uploading ? (
            <p style={{ color: "var(--muted)", margin: 0 }}>{uploadProgress}</p>
          ) : (
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Drop photos here or click to add
              <br />
              <span style={{ fontSize: "0.8rem" }}>
                {photos.length} / {maxPhotos} photos
                {!isPlus && photos.length >= 6 && " — upgrade to Plus for 20"}
              </span>
            </p>
          )}
        </div>

        {error && (
          <p style={{ color: "var(--danger, #dc2626)", fontSize: "0.85rem", margin: "0.5rem 0 0" }}>{error}</p>
        )}

        {/* Photo grid (sortable) */}
        {photos.length > 0 && (
          <div className="gallery-editor-photos">
            {photos.map((photo, idx) => (
              <div
                key={photo.imageId}
                className="gallery-editor-photo-card"
                draggable
                onDragStart={() => handleSortDragStart(idx)}
                onDragEnter={() => handleSortDragEnter(idx)}
                onDragEnd={handleSortDragEnd}
                onDragOver={e => e.preventDefault()}
              >
                <div className="gallery-editor-photo-thumb">
                  <img src={`/api/images/${photo.imageId}`} alt={photo.alt || ""} />
                  <button
                    className="gallery-editor-photo-remove"
                    onClick={() => removePhoto(idx)}
                    aria-label="Remove photo"
                  >
                    &times;
                  </button>
                  <span className="gallery-editor-photo-order">{idx + 1}</span>
                </div>
                <input
                  type="text"
                  placeholder="Caption..."
                  value={photo.caption}
                  onChange={e => updatePhoto(idx, { caption: e.target.value })}
                  className="gallery-editor-input"
                  maxLength={500}
                />
                <input
                  type="text"
                  placeholder="Alt text..."
                  value={photo.alt}
                  onChange={e => updatePhoto(idx, { alt: e.target.value })}
                  className="gallery-editor-input gallery-editor-alt"
                  maxLength={300}
                />
              </div>
            ))}
          </div>
        )}

        {/* Layout picker */}
        <div className="gallery-editor-section">
          <label className="gallery-editor-label">Layout</label>
          <div className="gallery-editor-layout-options">
            {GALLERY_LAYOUTS.map(l => {
              const locked = l.plusOnly && !isPlus;
              return (
                <button
                  key={l.value}
                  className={`gallery-editor-layout-btn ${layout === l.value ? "active" : ""} ${locked ? "locked" : ""}`}
                  onClick={() => !locked && setLayout(l.value)}
                  title={locked ? "Plus feature" : l.label}
                >
                  {l.label}
                  {locked && <span className="gallery-editor-lock">&#10025;</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Column selector (grid only) */}
        {layout === "grid" && (
          <div className="gallery-editor-section">
            <label className="gallery-editor-label">Columns</label>
            <div className="gallery-editor-col-options">
              {[2, 3, 4].map(n => (
                <button
                  key={n}
                  className={`gallery-editor-col-btn ${columns === n ? "active" : ""}`}
                  onClick={() => setColumns(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="gallery-editor-actions">
          {initialAttrs && onDelete && (
            <button
              onClick={() => { if (confirm("Remove this gallery from the entry?")) onDelete(); }}
              className="gallery-editor-cancel-btn"
              style={{ color: "var(--danger, #dc2626)" }}
            >
              Delete Gallery
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onCancel} className="gallery-editor-cancel-btn">
            Cancel
          </button>
          <button
            onClick={handleDone}
            disabled={photos.length === 0}
            className="gallery-editor-done-btn"
          >
            {initialAttrs ? "Update Gallery" : "Insert Gallery"}
          </button>
        </div>
      </div>
    </div>
  );
}
