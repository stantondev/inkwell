"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { AvatarConfig } from "@/lib/avatar-builder-config";

const AvatarBuilder = dynamic(
  () => import("@/components/avatar-builder").then((m) => m.AvatarBuilder),
  { ssr: false, loading: () => <div style={{ padding: "2rem", color: "var(--muted)" }}>Loading builder...</div> }
);

interface AvatarBuilderPageProps {
  user: {
    avatar_url: string | null;
    avatar_config: AvatarConfig | null;
    avatar_frame: string | null;
    subscription_tier: string;
    display_name: string;
  };
}

export function AvatarBuilderPage({ user }: AvatarBuilderPageProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

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
      <p
        className="text-sm mb-6"
        style={{ color: "var(--muted)" }}
      >
        Build a custom avatar instead of uploading a photo. Your avatar appears on your profile, in feeds, and across the fediverse.
      </p>

      {error && (
        <div
          className="text-sm mb-4 p-3 rounded-lg"
          style={{ background: "var(--danger-light, #fef2f2)", color: "var(--danger, #dc2626)" }}
        >
          {error}
        </div>
      )}

      <AvatarBuilder
        initialConfig={user.avatar_config}
        photoUrl={hasPhotoAvatar ? user.avatar_url : null}
        avatarFrame={user.avatar_frame}
        subscriptionTier={user.subscription_tier}
        displayName={user.display_name}
        onSave={handleSave}
        onRevertToPhoto={hasPhotoAvatar ? handleRevertToPhoto : undefined}
      />
    </div>
  );
}
