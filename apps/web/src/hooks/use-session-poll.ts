"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type SessionPollStatus = "polling" | "found" | "timeout" | "idle";

const POLL_INTERVAL = 3000; // 3 seconds
const POLL_TIMEOUT = 10 * 60 * 1000; // 10 minutes

/**
 * Polls to detect when auth completes in another context.
 *
 * When loginSessionId is provided (PWA flow), polls the claim-session endpoint
 * which doesn't require cookies — works even when the PWA has an isolated
 * cookie jar from the browser.
 *
 * Falls back to cookie-based /api/session polling when no loginSessionId.
 */
export function useSessionPoll(enabled: boolean, loginSessionId?: string) {
  const [status, setStatus] = useState<SessionPollStatus>(enabled ? "polling" : "idle");
  const [destination, setDestination] = useState<string>("/feed");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkSession = useCallback(async (): Promise<boolean> => {
    // Primary: claim-session polling (works across isolated cookie jars)
    if (loginSessionId) {
      try {
        const res = await fetch(`/api/auth/claim-session?id=${encodeURIComponent(loginSessionId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            // Cookie was set by the claim-session route handler in our context
            setDestination(data.destination || "/feed");
            setStatus("found");
            return true;
          }
          // data.pending — keep polling
        } else if (res.status === 404) {
          // Handoff expired — stop polling
          setStatus("timeout");
          return false;
        }
      } catch {
        // Network error — keep polling
      }
    }

    // Fallback: cookie-based session check (works when contexts share cookies)
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
  }, [loginSessionId]);

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
