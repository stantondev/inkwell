"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { resizeImage } from "@/lib/image-utils";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { detectService, getServiceIconSvg } from "@/lib/support-services";
import { BioEditor } from "@/components/bio-editor";

interface FullUser {
  id: string;
  username: string;
  email: string;
  display_name: string;
  bio: string | null;
  bio_html: string | null;
  pronouns: string | null;
  avatar_url: string | null;
  support_url?: string | null;
  support_label?: string | null;
}

export function ProfileEditForm({ user }: { user: FullUser }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    display_name: user.display_name ?? "",
    bio_html: user.bio_html || user.bio || "",
    pronouns: user.pronouns ?? "",
    avatar_url: user.avatar_url ?? "",
    support_url: user.support_url ?? "",
    support_label: user.support_label ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Username editing state
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(user.username);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [usernameSuccess, setUsernameSuccess] = useState(false);
  const usernameCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function handleUsernameChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setNewUsername(cleaned);
    setUsernameError("");
    setUsernameSuccess(false);
    setUsernameAvailable(null);

    if (cleaned === user.username) {
      return;
    }

    if (cleaned.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    if (usernameCheckTimeout.current) clearTimeout(usernameCheckTimeout.current);
    usernameCheckTimeout.current = setTimeout(async () => {
      setUsernameChecking(true);
      try {
        const res = await fetch(`/api/username-available?username=${encodeURIComponent(cleaned)}`);
        if (res.ok) {
          const data = await res.json();
          setUsernameAvailable(data.available);
        }
      } catch {
        // ignore check errors
      } finally {
        setUsernameChecking(false);
      }
    }, 400);
  }

  async function handleUsernameSave() {
    if (!newUsername || newUsername === user.username || usernameAvailable === false) return;
    setUsernameSaving(true);
    setUsernameError("");
    setUsernameSuccess(false);
    try {
      const res = await fetch("/api/me/username", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername }),
      });
      if (res.ok) {
        setUsernameSuccess(true);
        setEditingUsername(false);
        router.refresh();
      } else {
        const data = await res.json();
        const errMsg = typeof data.errors === "object"
          ? Object.values(data.errors).flat().join(", ")
          : data.errors || data.error || "Failed to update username";
        setUsernameError(errMsg as string);
      }
    } catch {
      setUsernameError("Network error — please try again");
    } finally {
      setUsernameSaving(false);
    }
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
          bio_html: form.bio_html || null,
          pronouns: form.pronouns || null,
          avatar_url: form.avatar_url || null,
          support_url: form.support_url || null,
          support_label: form.support_label || null,
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
        <label className="block text-sm font-medium mb-3">Avatar</label>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <AvatarWithFrame url={form.avatar_url || null} name={form.display_name || "?"} size={80} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "rgba(0,0,0,0.5)" }}
              aria-label="Change avatar">
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
              {uploading ? "Resizing & uploading..." : "Upload avatar"}
            </button>
            {form.avatar_url && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="text-xs transition-colors"
                style={{ color: "var(--muted)" }}>
                Remove avatar
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
          Any size image works — it will be automatically cropped and resized.
        </p>
      </div>

      {/* Username */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Username</label>
        {!editingUsername ? (
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: "var(--foreground)" }}>@{user.username}</span>
            <button
              type="button"
              onClick={() => { setEditingUsername(true); setNewUsername(user.username); setUsernameAvailable(null); setUsernameError(""); setUsernameSuccess(false); }}
              className="text-xs font-medium"
              style={{ color: "var(--accent)" }}>
              Change
            </button>
            {usernameSuccess && (
              <span className="text-xs font-medium" style={{ color: "var(--success)" }}>Updated!</span>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: "var(--muted)" }}>@</span>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => handleUsernameChange(e.target.value)}
                maxLength={30}
                className={inputClass}
                style={inputStyle}
                placeholder="username"
                autoFocus
              />
            </div>
            {newUsername !== user.username && newUsername.length >= 3 && (
              <div className="text-xs">
                {usernameChecking ? (
                  <span style={{ color: "var(--muted)" }}>Checking...</span>
                ) : usernameAvailable === true ? (
                  <span style={{ color: "var(--success)" }}>Available</span>
                ) : usernameAvailable === false ? (
                  <span style={{ color: "var(--danger)" }}>Already taken</span>
                ) : null}
              </div>
            )}
            {newUsername.length > 0 && newUsername.length < 3 && (
              <p className="text-xs" style={{ color: "var(--danger)" }}>Must be at least 3 characters</p>
            )}
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Changing your username will update your profile URL and fediverse address.
            </p>
            {usernameError && (
              <p className="text-xs" style={{ color: "var(--danger)" }}>{usernameError}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUsernameSave}
                disabled={usernameSaving || !newUsername || newUsername === user.username || usernameAvailable === false || newUsername.length < 3}
                className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition"
                style={{ background: "var(--accent)", color: "#fff" }}>
                {usernameSaving ? "Saving..." : "Update username"}
              </button>
              <button
                type="button"
                onClick={() => { setEditingUsername(false); setUsernameError(""); }}
                className="text-xs font-medium"
                style={{ color: "var(--muted)" }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Display name</label>
        <input type="text" value={form.display_name} required maxLength={80}
          onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
          className={inputClass} style={inputStyle} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Bio</label>
        <BioEditor
          content={form.bio_html}
          onChange={(html) => setForm(f => ({ ...f, bio_html: html }))}
          placeholder="Tell people about yourself..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Pronouns</label>
        <input type="text" value={form.pronouns} maxLength={40}
          onChange={e => setForm(f => ({ ...f, pronouns: e.target.value }))}
          placeholder="e.g. she/her, they/them"
          className={inputClass} style={inputStyle} />
      </div>

      {/* Writer Support Link */}
      <div className="border-t pt-5 mt-2" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-sm font-semibold mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
          Writer Support Link
        </h3>
        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
          Add a link to your Ko-fi, Buy Me a Coffee, Patreon, or any support page.
          It will appear on your profile and at the bottom of your entries.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Support URL</label>
            <input
              type="url"
              value={form.support_url}
              maxLength={500}
              onChange={e => setForm(f => ({ ...f, support_url: e.target.value }))}
              placeholder="https://ko-fi.com/yourname"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Button label</label>
            <input
              type="text"
              value={form.support_label}
              maxLength={50}
              onChange={e => setForm(f => ({ ...f, support_label: e.target.value }))}
              placeholder="Support My Writing"
              className={inputClass}
              style={inputStyle}
            />
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Leave blank to use the default label.
            </p>
          </div>

          {form.support_url && form.support_url.startsWith("https://") && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted)" }}>Preview</label>
              <div
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              >
                <span
                  dangerouslySetInnerHTML={{ __html: getServiceIconSvg(detectService(form.support_url).icon) }}
                  style={{ color: detectService(form.support_url).color }}
                />
                {form.support_label || "Support My Writing"}
              </div>
              <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                Detected: {detectService(form.support_url).name}
              </p>
            </div>
          )}
        </div>
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
        Email: {user.email}
      </p>
    </form>
  );
}
