"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CIRCLE_CATEGORIES, type Circle } from "../circle-types";

interface MemberOption {
  role: string;
  user: { id: string; username: string; display_name: string | null } | null;
}

// Stored descriptions are plain text (sanitized, so "&" arrives as "&amp;");
// a few older ones may hold simple HTML. Turn either back into editable text.
function descriptionToText(stored: string | null): string {
  if (!stored) return "";
  const withBreaks = stored
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  const el = document.createElement("textarea");
  el.innerHTML = withBreaks;
  return el.value.trim();
}

function errorFrom(data: { error?: string; errors?: Record<string, string[]> }, fallback: string): string {
  if (data.error) return data.error;
  if (data.errors) {
    const [field, messages] = Object.entries(data.errors)[0] ?? [];
    if (field && messages?.[0]) return `${field === "name" ? "Name" : field} ${messages[0]}`;
  }
  return fallback;
}

/**
 * Owner (and admin) controls for a circle: edit its name, topic and
 * description, hand it to another member, or delete it.
 */
export default function ManageCircle({
  circle,
  isOwner,
  onClose,
}: {
  circle: Circle;
  isOwner: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  const [name, setName] = useState(circle.name);
  const [category, setCategory] = useState(circle.category);
  const [description, setDescription] = useState("");
  const [originalDescription, setOriginalDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  const [members, setMembers] = useState<MemberOption[] | null>(null);
  const [heirId, setHeirId] = useState("");
  const [handing, setHanding] = useState(false);
  const [handError, setHandError] = useState("");

  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    const text = descriptionToText(circle.description);
    setDescription(text);
    setOriginalDescription(text);
  }, [circle.description]);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    fetch(`/api/circles/${circle.id}/members?per_page=200`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { data: MemberOption[] }) => {
        if (!cancelled) setMembers((data.data || []).filter((m) => m.user && m.role !== "owner"));
      })
      .catch(() => !cancelled && setMembers([]));
    return () => {
      cancelled = true;
    };
  }, [circle.id, isOwner]);

  const dirty =
    name.trim() !== circle.name || category !== circle.category || description.trim() !== originalDescription;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dirty) return;
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const res = await fetch(`/api/circles/${circle.id}/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), category, description: description.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setSaveError(errorFrom(data, "Couldn't save the changes. Try again."));
      }
    } catch {
      setSaveError("Couldn't save the changes. Try again.");
    }
    setSaving(false);
  };

  const heir = members?.find((m) => m.user?.id === heirId)?.user ?? null;

  const handleHandOver = async () => {
    if (!heir) return;
    const who = `@${heir.username}`;
    const ok = window.confirm(
      `Make ${who} the owner of ${circle.name}?\n\nYou'll stay on as a moderator. Only ${who} will be able to edit, delete or hand on the circle, and you can't take it back yourself.`,
    );
    if (!ok) return;
    setHanding(true);
    setHandError("");
    try {
      const res = await fetch(`/api/circles/${circle.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: heir.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setHandError(errorFrom(data, "Couldn't hand the circle over. Try again."));
      }
    } catch {
      setHandError("Couldn't hand the circle over. Try again.");
    }
    setHanding(false);
  };

  const handleDelete = async () => {
    if (confirmName.trim() !== circle.name.trim()) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/circles/${circle.id}/update`, { method: "DELETE" });
      if (res.ok) {
        router.push("/circles");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setDeleteError(errorFrom(data, "Couldn't delete the circle. Try again."));
    } catch {
      setDeleteError("Couldn't delete the circle. Try again.");
    }
    setDeleting(false);
  };

  return (
    <section className="circle-manage" aria-label="Manage circle">
      <div className="circle-manage-head">
        <h2 className="circle-section-heading" style={{ margin: 0 }}>
          Manage circle
        </h2>
        <button type="button" className="circle-link-btn" onClick={onClose}>
          Done
        </button>
      </div>
      {!isOwner && (
        <p className="circle-manage-note">You&rsquo;re seeing this as an admin. The owner is @{circle.owner?.username ?? "nobody"}.</p>
      )}

      <form onSubmit={handleSave} className="circle-manage-block">
        <h3 className="circle-manage-title">Details</h3>
        <label className="circle-manage-label" htmlFor="circle-manage-name">
          Name
        </label>
        <input
          id="circle-manage-name"
          className="circle-manage-input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          maxLength={100}
          required
        />
        <p className="circle-manage-hint">The circle&rsquo;s address stays the same, so old links keep working.</p>

        <label className="circle-manage-label" htmlFor="circle-manage-category">
          Topic
        </label>
        <select
          id="circle-manage-category"
          className="circle-manage-input"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setSaved(false);
          }}
        >
          {CIRCLE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <label className="circle-manage-label" htmlFor="circle-manage-description">
          Description
        </label>
        <textarea
          id="circle-manage-description"
          className="circle-manage-input"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setSaved(false);
          }}
          maxLength={5000}
          rows={5}
          placeholder="Who is it for, and what do people write here?"
        />

        <div className="circle-manage-row">
          <button type="submit" className="circle-btn" disabled={saving || !name.trim() || !dirty}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved && !dirty && <span className="circle-manage-ok">Saved.</span>}
        </div>
        {saveError && <p className="circle-entry-error">{saveError}</p>}
      </form>

      {isOwner && (
        <div className="circle-manage-block">
          <h3 className="circle-manage-title">Hand it to someone else</h3>
          <p className="circle-manage-hint">
            If you can&rsquo;t look after the circle any more, give it to another member so it doesn&rsquo;t go
            quiet. They become the owner; you stay on as a moderator and can leave whenever you like.
          </p>
          {members === null ? (
            <p className="circle-empty">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="circle-empty">Nobody else has joined yet. Once someone has, you can hand it to them.</p>
          ) : (
            <div className="circle-manage-row">
              <select
                aria-label="New owner"
                className="circle-manage-input"
                style={{ flex: "1 1 14rem", marginBottom: 0 }}
                value={heirId}
                onChange={(e) => setHeirId(e.target.value)}
              >
                <option value="">Choose a member…</option>
                {members.map((m) => (
                  <option key={m.user!.id} value={m.user!.id}>
                    {m.user!.display_name && m.user!.display_name !== m.user!.username
                      ? `${m.user!.display_name} (@${m.user!.username})`
                      : `@${m.user!.username}`}
                    {m.role === "moderator" ? " · moderator" : ""}
                  </option>
                ))}
              </select>
              <button type="button" className="circle-btn circle-btn--outline" disabled={!heir || handing} onClick={handleHandOver}>
                {handing ? "Handing over…" : "Make owner"}
              </button>
            </div>
          )}
          {handError && <p className="circle-entry-error">{handError}</p>}
        </div>
      )}

      <div className="circle-manage-block circle-manage-danger">
        <h3 className="circle-manage-title">Delete the circle</h3>
        <p className="circle-manage-hint">
          The circle and its page go away for everyone. Posts stay on their writers&rsquo; journals; ones that were
          for circle members only become private. This can&rsquo;t be undone.
        </p>
        <label className="circle-manage-label" htmlFor="circle-manage-confirm">
          Type the circle&rsquo;s name to confirm
        </label>
        <div className="circle-manage-row">
          <input
            id="circle-manage-confirm"
            className="circle-manage-input"
            style={{ flex: "1 1 14rem", marginBottom: 0 }}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={circle.name}
            autoComplete="off"
          />
          <button
            type="button"
            className="circle-btn circle-btn--danger"
            disabled={deleting || confirmName.trim() !== circle.name.trim()}
            onClick={handleDelete}
          >
            {deleting ? "Deleting…" : "Delete circle"}
          </button>
        </div>
        {deleteError && <p className="circle-entry-error">{deleteError}</p>}
      </div>
    </section>
  );
}
