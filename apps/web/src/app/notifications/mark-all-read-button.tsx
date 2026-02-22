"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarkAllReadButton({ unreadIds }: { unreadIds: string[] }) {
  const router = useRouter();
  const [marking, setMarking] = useState(false);

  async function handleClick() {
    setMarking(true);
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds }),
      });
      router.refresh();
    } finally {
      setMarking(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={marking}
      className="text-xs font-medium hover:underline disabled:opacity-50"
      style={{ color: "var(--accent)" }}>
      {marking ? "Marking…" : "Mark all read"}
    </button>
  );
}
