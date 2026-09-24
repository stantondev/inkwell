"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { signedInDestination, takeReturnTo } from "@/lib/return-to";

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
  // True once the emailed link has been opened somewhere other than this
  // screen — the only time the 4-digit code on this screen matters.
  const [awaitingCode, setAwaitingCode] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkSession = useCallback(async (): Promise<boolean> => {
    let handoffGone = false;

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
          setAwaitingCode(!!data.awaiting_code);
          // data.pending — keep polling
        } else if (res.status === 404) {
          // The handoff is gone. That is the NORMAL ending when the link was
          // opened in this same browser: nothing was ever handed over because
          // nothing needed to be. Falling straight to "timeout" here told
          // people who were already signed in that they weren't, and the
          // "I've clicked the link" button could never succeed afterwards.
          handoffGone = true;
        }
      } catch {
        // Network error — keep polling
      }
    }

    // Always fall through to the cookie check: it is what catches the common
    // same-browser sign-in.
    try {
      const res = await fetch("/api/session");
      if (res.ok) {
        const data = await res.json();
        const onboarded = data?.data?.settings?.onboarded;
        setDestination(signedInDestination(onboarded, takeReturnTo()));
        setStatus("found");
        return true;
      }
    } catch {
      // Network error — keep polling
      return false;
    }

    if (handoffGone) setStatus("timeout");
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

  return { status, destination, awaitingCode, manualCheck };
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
