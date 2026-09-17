"use client";

import { useEffect, useState } from "react";

// One billing-status request per page load, shared by every upgrade prompt on
// the page (the customize editor renders several).
let statusPromise: Promise<{ eligible: boolean; days: number }> | null = null;

function loadTrialStatus() {
  if (!statusPromise) {
    statusPromise = fetch("/api/billing/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => ({ eligible: !!d?.data?.trial_eligible, days: d?.data?.trial_days ?? 14 }))
      .catch(() => ({ eligible: false, days: 14 }));
  }
  return statusPromise;
}

/** Whether the signed-in user can start a free Plus trial, and a starter. */
export function usePlusTrial() {
  const [eligible, setEligible] = useState(false);
  const [days, setDays] = useState(14);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    loadTrialStatus().then((s) => {
      if (!alive) return;
      setEligible(s.eligible);
      setDays(s.days);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function start() {
    setStarting(true);
    setError("");
    try {
      const res = await fetch("/api/billing/start-trial", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't start your trial.");
        setStarting(false);
        return;
      }
      // Plus checks are rendered from the session on the server, so reload.
      window.location.reload();
    } catch {
      setError("Network error. Please try again.");
      setStarting(false);
    }
  }

  return { eligible, days, starting, error, start };
}
