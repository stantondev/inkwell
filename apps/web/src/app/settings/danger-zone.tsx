"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DangerZone({ username }: { username: string }) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const confirmed = confirmation === username;

  async function handleDelete() {
    if (!confirmed) return;
    setDeleting(true);
    setError("");

    try {
      const res = await fetch("/api/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: confirmation }),
      });

      if (res.ok) {
        // Clear session cookie by navigating to sign-out, then redirect to home
        document.cookie = "inkwell_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to delete account. Please try again.");
        setDeleting(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        className="mt-12 rounded-xl border p-6"
        style={{ borderColor: "var(--danger, #dc2626)" }}
      >
        <h2
          className="text-base font-semibold mb-2"
          style={{ color: "var(--danger, #dc2626)" }}
        >
          Danger Zone
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          Permanently delete your account and all associated data. This cannot be
          undone.
        </p>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          style={{
            background: "var(--danger, #dc2626)",
            color: "#fff",
          }}
        >
          Delete Account
        </button>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) {
              setShowModal(false);
              setConfirmation("");
              setError("");
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border p-6"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <h3
              className="text-lg font-semibold mb-3"
              style={{ color: "var(--danger, #dc2626)" }}
            >
              Delete your account?
            </h3>

            <p className="text-sm mb-4" style={{ color: "var(--foreground)" }}>
              This is permanent and cannot be undone. All your entries, comments,
              stamps, relationships, and data will be deleted.
            </p>

            <p className="text-sm mb-2" style={{ color: "var(--foreground)" }}>
              Type{" "}
              <strong
                className="font-mono px-1 py-0.5 rounded text-sm"
                style={{ background: "var(--background)" }}
              >
                {username}
              </strong>{" "}
              to confirm:
            </p>

            <input
              type="text"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={username}
              disabled={deleting}
              autoFocus
              className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none focus:ring-2 focus:ring-[var(--danger)] transition mb-4"
              style={{ borderColor: "var(--border)" }}
            />

            {error && (
              <p
                className="text-sm mb-3"
                style={{ color: "var(--danger, #dc2626)" }}
              >
                {error}
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setConfirmation("");
                  setError("");
                }}
                disabled={deleting}
                className="rounded-lg px-4 py-2 text-sm font-medium border transition-colors"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!confirmed || deleting}
                className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                style={{
                  background: "var(--danger, #dc2626)",
                  color: "#fff",
                }}
              >
                {deleting ? "Deleting..." : "Delete my account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
