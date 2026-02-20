"use client";

export function SignOutButton() {
  return (
    <form action="/auth/signout" method="POST">
      <button
        type="submit"
        className="text-sm font-medium transition-colors cursor-pointer"
        style={{ color: "var(--muted)" }}
      >
        Sign out
      </button>
    </form>
  );
}
