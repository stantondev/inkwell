"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { AvatarConfig } from "@/lib/avatar-builder-config";
import { AvatarStylePicker } from "./avatar-style-picker";

const AvatarBuilder = dynamic(
  () => import("@/components/avatar-builder").then((m) => m.AvatarBuilder),
  { ssr: false, loading: () => <div style={{ padding: "2rem", color: "var(--muted)" }}>Loading builder...</div> }
);

interface AvatarBuilderPageProps {
  user: {
    avatar_url: string | null;
    avatar_config: AvatarConfig | null;
    avatar_frame: string | null;
    avatar_animation: string | null;
    subscription_tier: string;
    display_name: string;
  };
}

export function AvatarBuilderPage({ user }: AvatarBuilderPageProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);
  const [frame, setFrame] = useState(user.avatar_frame || "none");
  const [animation, setAnimation] = useState(user.avatar_animation || "none");
  const isPlus = user.subscription_tier === "plus";

  // Determine if user has a "real photo" avatar (non-constructed)
  const hasPhotoAvatar = user.avatar_url && !user.avatar_config;

  async function handleSave(config: AvatarConfig, renderedDataUri: string) {
    setError(null);

    // 1. Upload rendered image via existing avatar endpoint
    const avatarRes = await fetch("/api/me/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: renderedDataUri }),
    });
    if (!avatarRes.ok) {
      setError("Failed to save avatar image.");
      throw new Error("Avatar upload failed");
    }

    // 2. Save config for re-editing
    const configRes = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_config: config }),
    });
    if (!configRes.ok) {
      setError("Avatar saved but config could not be stored.");
      throw new Error("Config save failed");
    }

    setAvatarUrl(renderedDataUri);
    router.refresh();
  }

  async function handleRevertToPhoto() {
    setError(null);

    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_config: null }),
    });
    if (!res.ok) {
      setError("Failed to revert to photo.");
      return;
    }

    router.refresh();
  }

  return (
    <div>
      {error && (
        <div
          className="text-sm mb-4 p-3 rounded-lg"
          style={{ background: "var(--danger-light, #fef2f2)", color: "var(--danger, #dc2626)" }}
        >
          {error}
        </div>
      )}

      <AvatarStylePicker
        avatarUrl={avatarUrl}
        displayName={user.display_name}
        frame={frame}
        animation={animation}
        isPlus={isPlus}
        onFrameChange={setFrame}
        onAnimationChange={setAnimation}
        onPhotoUploaded={(url) => {
          setAvatarUrl(url);
          router.refresh();
        }}
      />

      <h2 className="avatar-style-heading avatar-style-builder-heading">Or draw an Inkwell alien</h2>
      <p className="avatar-style-hint mb-4">
        Build one below and press Save avatar. It replaces your current avatar everywhere, including across the fediverse.
      </p>

      <AvatarBuilder
        initialConfig={user.avatar_config}
        photoUrl={hasPhotoAvatar ? user.avatar_url : null}
        avatarFrame={frame}
        subscriptionTier={user.subscription_tier}
        displayName={user.display_name}
        onSave={handleSave}
        onRevertToPhoto={hasPhotoAvatar ? handleRevertToPhoto : undefined}
      />

      <p className="avatar-builder-attribution">
        Hand-drawn for Inkwell &mdash; a small colony of literary aliens, with
        props to match. Portraits stay legible everywhere they appear; scenes
        are drawn for your profile page, where there&rsquo;s room to see them.
      </p>
    </div>
  );
}
