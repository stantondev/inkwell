"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { createAvatar } from "@dicebear/core";
import * as croodles from "@dicebear/croodles";
import * as croodlesNeutral from "@dicebear/croodles-neutral";
import {
  AVATAR_STYLES,
  OPTIONAL_CATEGORIES,
  getStyleById,
  getDefaultOptionsForStyle,
  type AvatarConfig,
} from "@/lib/avatar-builder-config";
import { renderSvgToDataUri } from "@/lib/avatar-render";
import { AvatarWithFrame } from "@/components/avatar-with-frame";

interface AvatarBuilderProps {
  initialConfig: AvatarConfig | null;
  photoUrl: string | null;
  avatarFrame?: string | null;
  subscriptionTier?: string;
  displayName: string;
  onSave: (config: AvatarConfig, renderedDataUri: string) => Promise<void>;
  onRevertToPhoto?: () => void;
  compact?: boolean;
}

// Map style IDs to their DiceBear style objects
const DICEBEAR_STYLES: Record<string, typeof croodles> = {
  croodles: croodles,
  croodlesNeutral: croodlesNeutral,
};

function buildDiceBearOptions(options: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (OPTIONAL_CATEGORIES.has(key)) {
      if (value === "__none") {
        result[`${key}Probability`] = 0;
      } else {
        result[key] = [value];
        result[`${key}Probability`] = 100;
      }
    } else {
      result[key] = [value];
    }
  }
  return result;
}

export function AvatarBuilder({
  initialConfig,
  photoUrl,
  avatarFrame,
  subscriptionTier,
  displayName,
  onSave,
  onRevertToPhoto,
  compact = false,
}: AvatarBuilderProps) {
  const initStyleId = initialConfig?.style ?? "croodles";
  const initStyle = getStyleById(initStyleId);

  const [styleId, setStyleId] = useState(initStyleId);
  const [options, setOptions] = useState<Record<string, string>>(
    initialConfig?.options ?? { ...getDefaultOptionsForStyle(initStyle) }
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const currentStyle = getStyleById(styleId);
  const [activeCategory, setActiveCategory] = useState(currentStyle.categories[0].id);

  // Generate SVG string on every option change
  const svgString = useMemo(() => {
    const dicebearStyle = DICEBEAR_STYLES[styleId] ?? croodles;
    const dbOpts = buildDiceBearOptions(options);
    const avatar = createAvatar(dicebearStyle, {
      ...dbOpts,
      backgroundColor: ["transparent"],
      backgroundType: ["solid"],
    });
    return avatar.toString();
  }, [options, styleId]);

  // Generate a data URI for the AvatarWithFrame preview
  const previewDataUri = useMemo(() => {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
  }, [svgString]);

  // In compact mode (onboarding), auto-render and call onSave on every change
  // so the avatar is captured without requiring an explicit "Save" click
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!compact) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const dataUri = await renderSvgToDataUri(svgString, 400, 0.85);
        const config: AvatarConfig = { style: styleId, options };
        await onSaveRef.current(config, dataUri);
      } catch {
        // Silently fail — user can still manually save
      }
    }, 500);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [compact, svgString, styleId, options]);

  function switchStyle(newStyleId: string) {
    const newStyle = getStyleById(newStyleId);
    setStyleId(newStyleId);
    setOptions(getDefaultOptionsForStyle(newStyle));
    setActiveCategory(newStyle.categories[0].id);
    setSaved(false);
  }

  function updateOption(key: string, value: string) {
    setOptions((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function randomize() {
    const newOptions: Record<string, string> = {};
    for (const cat of currentStyle.categories) {
      const choices = cat.options.filter((o) => !o.plusOnly);
      const random = choices[Math.floor(Math.random() * choices.length)];
      newOptions[cat.id] = random.value;
    }
    setOptions(newOptions);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const dataUri = await renderSvgToDataUri(svgString, 400, 0.85);
      const config: AvatarConfig = { style: styleId, options };
      await onSave(config, dataUri);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const categories = currentStyle.categories;
  const activeCat = categories.find((c) => c.id === activeCategory);

  return (
    <div className={`avatar-builder ${compact ? "avatar-builder-compact" : ""}`}>
      {/* Preview */}
      <div className="avatar-builder-preview-section">
        <div className="avatar-builder-preview">
          <div
            className="avatar-builder-svg"
            dangerouslySetInnerHTML={{ __html: svgString }}
          />
        </div>

        {/* Preview with frame */}
        {avatarFrame && avatarFrame !== "none" && (
          <div className="avatar-builder-frame-preview">
            <AvatarWithFrame
              url={previewDataUri}
              name={displayName}
              size={compact ? 48 : 56}
              frame={avatarFrame}
              subscriptionTier={subscriptionTier}
            />
            <span className="avatar-builder-frame-label">With frame</span>
          </div>
        )}

        <div className="avatar-builder-preview-actions">
          <button
            type="button"
            onClick={randomize}
            className="avatar-builder-btn-secondary"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="2" />
              <circle cx="8" cy="8" r="1.5" fill="currentColor" />
              <circle cx="16" cy="8" r="1.5" fill="currentColor" />
              <circle cx="8" cy="16" r="1.5" fill="currentColor" />
              <circle cx="16" cy="16" r="1.5" fill="currentColor" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            </svg>
            Randomize
          </button>
        </div>
      </div>

      {/* Customization panel */}
      <div className="avatar-builder-panel">
        {/* Style toggle */}
        {AVATAR_STYLES.length > 1 && (
          <div className="avatar-builder-style-toggle">
            {AVATAR_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => switchStyle(s.id)}
                className={`avatar-builder-style-btn ${styleId === s.id ? "active" : ""}`}
                title={s.description}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Category tabs */}
        <div className="avatar-builder-categories">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`avatar-builder-cat-tab ${activeCategory === cat.id ? "active" : ""}`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Option grid */}
        <div className="avatar-builder-options">
          {activeCat && activeCat.type === "color" && (
            <div className="avatar-builder-swatches">
              {activeCat.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateOption(activeCat.id, opt.value)}
                  className={`avatar-builder-swatch ${options[activeCat.id] === opt.value ? "active" : ""}`}
                  style={{ backgroundColor: `#${opt.value}` }}
                  title={opt.label}
                  aria-label={opt.label}
                />
              ))}
            </div>
          )}

          {activeCat && activeCat.type === "select" && (
            <div className="avatar-builder-pills">
              {activeCat.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateOption(activeCat.id, opt.value)}
                  className={`avatar-builder-pill ${options[activeCat.id] === opt.value ? "active" : ""}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions — hidden in compact mode (auto-saved) */}
        {!compact && (
          <div className="avatar-builder-actions">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="avatar-builder-btn-primary"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save avatar"}
            </button>

            {photoUrl && onRevertToPhoto && (
              <button
                type="button"
                onClick={onRevertToPhoto}
                className="avatar-builder-btn-link"
              >
                Use uploaded photo instead
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
