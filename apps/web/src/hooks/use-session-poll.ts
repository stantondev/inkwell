"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type SessionPollStatus = "polling" | "found" | "timeout" | "idle";

const POLL_INTERVAL = 3000; // 3 seconds
const POLL_TIMEOUT = 10 * 60 * 1000; // 10 minutes

/**
 * Polls GET /api/session to detect when auth completes in another context
 * (e.g., browser sets cookie that PWA can read, or another tab completes login).
 *
 * Returns the redirect destination based on the session user's onboarding state.
 */
export function useSessionPoll(enabled: boolean) {
  const [status, setStatus] = useState<SessionPollStatus>(enabled ? "polling" : "idle");
  const [destination, setDestination] = useState<string>("/feed");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/session");
      if (res.ok) {
        const data = await res.json();
        const onboarded = data?.data?.settings?.onboarded;
        setDestination(onboarded ? "/feed" : "/welcome");
        setStatus("found");
        return true;
      }
    } catch {
      // Network error — keep polling
    }
    return false;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }

    setStatus("polling");

    intervalRef.current = setInterval(async () => {
      const found = await checkSession();
      if (found && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    }, POLL_INTERVAL);

    timeoutRef.current = setTimeout(() => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setStatus((prev) => (prev === "polling" ? "timeout" : prev));
    }, POLL_TIMEOUT);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled, checkSession]);

  const manualCheck = useCallback(async () => {
    const found = await checkSession();
    return found;
  }, [checkSession]);

  return { status, destination, manualCheck };
}

/**
 * Detects if the app is running as an installed PWA (standalone mode).
 */
export function useIsPwa(): boolean {
  const [isPwa, setIsPwa] = useState(false);
  useEffect(() => {
    setIsPwa(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  }, []);
  return isPwa;
}
