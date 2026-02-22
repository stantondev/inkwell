"use client";

import { useEffect, useState } from "react";

export function ReadingProgress({ color = "var(--accent)" }: { color?: string }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function onScroll() {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? el.scrollTop / max : 0);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] pointer-events-none"
      style={{ height: 3 }}
    >
      <div
        style={{
          width: `${progress * 100}%`,
          height: "100%",
          background: color,
          transition: "width 0.08s linear",
          boxShadow: `0 0 8px ${color}80`,
        }}
      />
    </div>
  );
}
