"use client";

import dynamic from "next/dynamic";
import styles from "./play.module.css";

// The game keeps its progress in the browser and runs on the reader's own date,
// so it's drawn there and nowhere else.
const Office = dynamic(
  () =>
    Promise.all([import("./dead-letter-office"), import("@/lib/dead-letter/weeks")]).then(([m, w]) => {
      function Today() {
        // Local preview of any week, drafts included: /play?week=<id>. Never in production,
        // where only approved weeks reach readers.
        const asked = new URLSearchParams(window.location.search).get("week");
        const preview = process.env.NODE_ENV !== "production" && asked ? w.weekById(asked) : null;
        if (preview) return <m.DeadLetterOffice week={preview} preview />;
        return <m.DeadLetterOffice week={w.weekFor(w.localDay())} />;
      }
      return Today;
    }),
  { ssr: false, loading: () => <div className={`${styles.office} ${styles.loading}`} aria-hidden="true" /> },
);

export function PlayClient() {
  return <Office />;
}
