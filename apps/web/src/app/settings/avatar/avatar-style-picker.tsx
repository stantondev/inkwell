"use client";

import { useRef, useState } from "react";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { AVATAR_FRAMES, AVATAR_ANIMATIONS } from "@/lib/avatar-frames";
import { resizeImage } from "@/lib/image-utils";
import { usePlusTrial } from "@/hooks/use-plus-trial";

interface AvatarStylePickerProps {
  avatarUrl: string | null;
  displayName: string;
  frame: string;
  animation: string;
  isPlus: boolean;
  onFrameChange: (frame: string) => void;
  onAnimationChange: (animation: string) => void;
  /** Called after a photo upload succeeds, with the new avatar URL. */
  onPhotoUploaded: (avatarUrl: string) => void;
}

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/**
 * The avatar you already have, with its frame and animation. Every choice
 * saves the moment it's clicked, so there is no Save button to miss.
 */
export function AvatarStylePicker({
  avatarUrl,
  displayName,
  frame,
  animation,
  isPlus,
  onFrameChange,
  onAnimationChange,
  onPhotoUploaded,
}: AvatarStylePickerProps) {
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trial = usePlusTrial();

  function markSaved() {
    setSave({ kind: "saved" });
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSave({ kind: "idle" }), 2000);
  }

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setSave({ kind: "saving" });
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSave({ kind: "error", message: data.error ?? "Couldn't save that. Please try again." });
        return false;
      }
      markSaved();
      return true;
    } catch {
      setSave({ kind: "error", message: "Network error. Please try again." });
      return false;
    }
  }

  async function chooseFrame(id: string) {
    if (id === frame) return;
    const previous = frame;
    onFrameChange(id);
    const ok = await patch({ avatar_frame: id === "none" ? null : id });
    if (!ok) onFrameChange(previous);
  }

  async function chooseAnimation(id: string) {
    if (id === animation) return;
    const previous = animation;
    onAnimationChange(id);
    const ok = await patch({ avatar_animation: id === "none" ? null : id });
    if (!ok) onAnimationChange(previous);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSave({ kind: "error", message: "Please choose an image file." });
      return;
    }
    setUploading(true);
    setSave({ kind: "idle" });
    try {
      const dataUri = await resizeImage(file, 400, 0.85);
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUri }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSave({ kind: "error", message: data.error ?? "Couldn't upload that photo." });
        return;
      }
      // A photo replaces any alien, so forget the builder settings: the
      // builder then offers to switch back to the photo.
      await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_config: null }),
      });
      onPhotoUploaded(data.data?.avatar_url ?? dataUri);
      markSaved();
    } catch {
      setSave({ kind: "error", message: "Upload failed. Please try again." });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const frameValue = frame === "none" ? null : frame;
  const animationValue = animation === "none" ? null : animation;

  return (
    <section className="avatar-style">
      <div className="avatar-style-current">
        <AvatarWithFrame
          url={avatarUrl}
          name={displayName}
          size={96}
          frame={frameValue}
          animation={animationValue}
          subscriptionTier={isPlus ? "plus" : "free"}
        />
        <div className="avatar-style-current-text">
          <p className="avatar-style-current-title">Your avatar</p>
          <p className="avatar-style-hint">
            Pick a frame below. It works with a photo or an Inkwell alien.
          </p>
          <div className="avatar-style-current-actions">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="avatar-builder-btn-secondary"
            >
              {uploading ? "Uploading…" : "Upload a photo"}
            </button>
            <span className="avatar-style-status" role="status" aria-live="polite">
              {save.kind === "saving" && "Saving…"}
              {save.kind === "saved" && "Saved"}
              {save.kind === "error" && <span style={{ color: "var(--danger, #dc2626)" }}>{save.message}</span>}
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      </div>

      <h2 className="avatar-style-heading">Frame</h2>
      <div className="avatar-style-grid" role="radiogroup" aria-label="Avatar frame">
        {AVATAR_FRAMES.map((f) => {
          const locked = f.plusOnly && !isPlus;
          const selected = frame === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => !locked && chooseFrame(f.id)}
              disabled={locked}
              className={`avatar-style-option${selected ? " is-selected" : ""}${locked ? " is-locked" : ""}`}
              title={locked ? `${f.description} (Plus)` : f.description}
            >
              <AvatarWithFrame
                url={avatarUrl}
                name={displayName}
                size={44}
                frame={f.id === "none" ? null : f.id}
                subscriptionTier="plus"
              />
              <span className="avatar-style-option-label">{f.label}</span>
              {locked && <span className="avatar-style-plus">✦ Plus</span>}
            </button>
          );
        })}
      </div>

      <h2 className="avatar-style-heading">
        Animation {!isPlus && <span className="avatar-style-plus">✦ Plus</span>}
      </h2>
      {isPlus ? (
        <div className="avatar-style-grid" role="radiogroup" aria-label="Avatar animation">
          {AVATAR_ANIMATIONS.map((a) => {
            const selected = animation === a.id;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => chooseAnimation(a.id)}
                className={`avatar-style-option${selected ? " is-selected" : ""}`}
                title={a.description}
              >
                <AvatarWithFrame
                  url={avatarUrl}
                  name={displayName}
                  size={44}
                  frame={frameValue}
                  animation={a.id === "none" ? null : a.id}
                  subscriptionTier="plus"
                />
                <span className="avatar-style-option-label">{a.label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="avatar-style-upsell">
          <p className="avatar-style-hint">
            Plus members can make their avatar float, glow, shimmer or shift colour.
          </p>
          <div className="avatar-style-current-actions">
            {trial.eligible && (
              <button
                type="button"
                onClick={trial.start}
                disabled={trial.starting}
                className="avatar-builder-btn-primary"
              >
                {trial.starting ? "Starting…" : `Try Plus free for ${trial.days} days`}
              </button>
            )}
            <a href="/settings/billing" className="avatar-builder-btn-link">
              About Plus
            </a>
          </div>
          {trial.error && (
            <p className="avatar-style-hint" style={{ color: "var(--danger, #dc2626)" }}>{trial.error}</p>
          )}
        </div>
      )}
    </section>
  );
}
