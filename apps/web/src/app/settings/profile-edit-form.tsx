"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { resizeImage } from "@/lib/image-utils";

interface FullUser {
  id: string;
  username: string;
  email: string;
  display_name: string;
  bio: string | null;
  pronouns: string | null;
  avatar_url: string | null;
}

function AvatarPreview({ url, name, size = 80 }: { url: string | null; name: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={url} alt={name} width={size} height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center font-semibold select-none"
      style={{
        width: size, height: size,
        background: "var(--accent-light)", color: "var(--accent)",
        fontSize: size * 0.32,
      }}
      aria-label={name}>
      {initials}
    </div>
  );
}

export function ProfileEditForm({ user }: { user: FullUser }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    display_name: user.display_name ?? "",
    bio: user.bio ?? "",
    pronouns: user.pronouns ?? "",
    avatar_url: user.avatar_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please select an image file");
      setStatus("error");
      return;
    }

    setUploading(true);
    setStatus("idle");

    try {
      // Resize image client-side (center-crop to square, max 400px, JPEG quality 85%)
      // This handles any size photo — even 20MB iPhone photos
      const dataUri = await resizeImage(file, 400, 0.85);

      // Upload to API
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUri }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? "Failed to upload avatar");
        setStatus("error");
      } else {
        setForm(f => ({ ...f, avatar_url: data.data?.avatar_url ?? dataUri }));
        setStatus("success");
        router.refresh();
      }
    } catch {
      setErrorMsg("Upload failed — please try again");
      setStatus("error");
    } finally {
      setUploading(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemoveAvatar() {
    setForm(f => ({ ...f, avatar_url: "" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("idle");

    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: form.display_name,
          bio: form.bio || null,
          pronouns: form.pronouns || null,
          avatar_url: form.avatar_url || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Failed to save");
        setStatus("error");
      } else {
        setStatus("success");
        router.refresh();
      }
    } catch {
      setErrorMsg("Network error — please try again");
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none focus:ring-2 focus:ring-[var(--accent)] transition";
  const inputStyle = { borderColor: "var(--border)" };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Avatar section */}
      <div>
        <label className="block text-sm font-medium mb-3">Profile picture</label>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <AvatarPreview url={form.avatar_url || null} name={form.display_name || "?"} size={80} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "rgba(0,0,0,0.5)" }}
              aria-label="Change profile picture">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
              {uploading ? "Resizing & uploading..." : "Upload photo"}
            </button>
            {form.avatar_url && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="text-xs transition-colors"
                style={{ color: "var(--muted)" }}>
                Remove photo
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleAvatarUpload}
            className="hidden"
          />
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
          Any size photo works — it will be automatically cropped and resized.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Display name</label>
        <input type="text" value={form.display_name} required maxLength={80}
          onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
          className={inputClass} style={inputStyle} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Bio</label>
        <textarea value={form.bio} rows={3} maxLength={500}
          onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
          placeholder="Tell people a little about yourself..."
          className={inputClass} style={{ ...inputStyle, resize: "vertical" }} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Pronouns</label>
        <input type="text" value={form.pronouns} maxLength={40}
          onChange={e => setForm(f => ({ ...f, pronouns: e.target.value }))}
          placeholder="e.g. she/her, they/them"
          className={inputClass} style={inputStyle} />
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button type="submit" disabled={saving}
          className="rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60 transition"
          style={{ background: "var(--accent)", color: "#fff" }}>
          {saving ? "Saving..." : "Save changes"}
        </button>
        {status === "success" && (
          <span className="text-sm font-medium" style={{ color: "var(--success)" }}>
            Saved
          </span>
        )}
        {status === "error" && (
          <span className="text-sm" style={{ color: "var(--danger)" }}>{errorMsg}</span>
        )}
      </div>

      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        Username: <strong>@{user.username}</strong> · Email: {user.email}
      </p>
    </form>
  );
}
