"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

/**
 * Tells CSS where the visible screen is while the on-screen keyboard is open.
 *
 * iOS doesn't shrink the page for the keyboard; it slides the keyboard over
 * it, so anything pinned to the bottom (letter reply bar, comment sheet,
 * stationery Send button) ended up behind it. Sets on <html>:
 *   data-keyboard   while the keyboard is up
 *   --vvh           visible height
 *   --vv-top        how far iOS has panned the page to keep the field in view
 *   --kb            space the keyboard takes at the bottom
 * Android Chrome resizes the page itself (interactive-widget=resizes-content
 * in layout.tsx), so there --kb stays 0.
 */
/**
 * The keyboard-height guess above can be wrong: iPhone home-screen apps
 * report their viewport unreliably (WebKit bug 218983), and a sheet the
 * reader slid down sits lower than the guess assumes. So for a bottom sheet
 * marked `data-keyboard-lift`, measure where the field actually is against
 * the visible screen and lift the sheet by whatever is still hidden.
 * Reported by @rainbowdarling (2026-11-25): writing a footnote on a phone,
 * the keyboard covered the box.
 */
let lifted: HTMLElement | null = null;
let liftFrame = 0;

function keepFieldAboveKeyboard(field: HTMLElement | null) {
  const sheet = field?.closest<HTMLElement>("[data-keyboard-lift]") ?? null;
  if (lifted && lifted !== sheet) {
    lifted.style.removeProperty("--kb-lift");
    lifted.removeAttribute("data-keyboard-lifted");
    lifted = null;
  }
  const vv = window.visualViewport;
  if (!sheet || !field || !vv) return;
  lifted = sheet;
  sheet.setAttribute("data-keyboard-lifted", "");
  cancelAnimationFrame(liftFrame);
  // Two frames: the first lets the sheet take its keyboard size.
  liftFrame = requestAnimationFrame(() => {
    liftFrame = requestAnimationFrame(() => {
      const box = (field.closest<HTMLElement>(".comment-editor-wrap") ?? field).getBoundingClientRect();
      const visibleTop = vv.offsetTop;
      const visibleBottom = vv.offsetTop + vv.height;
      const current = parseFloat(sheet.style.getPropertyValue("--kb-lift")) || 0;
      // Lift so the box clears the keyboard, but never past the top of the screen.
      const want = current + (box.bottom + 8 - visibleBottom);
      const room = current + (sheet.getBoundingClientRect().top - (visibleTop + 8));
      const lift = Math.max(0, Math.min(want, room));
      sheet.style.setProperty("--kb-lift", `${Math.round(lift)}px`);
    });
  });
}

function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      // Pinch-zoom also shrinks the visual viewport; that isn't a keyboard.
      if (vv.scale > 1.05) {
        root.removeAttribute("data-keyboard");
        return;
      }
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--vvh", `${vv.height}px`);
      root.style.setProperty("--vv-top", `${vv.offsetTop}px`);
      root.style.setProperty("--kb", `${kb}px`);
      const active = document.activeElement as HTMLElement | null;
      const editing = active?.matches("input, textarea, select, [contenteditable='true']");
      root.toggleAttribute("data-keyboard", !!editing && kb > 120);
      keepFieldAboveKeyboard(editing ? active : null);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      root.removeAttribute("data-keyboard");
    };
  }, []);
}

/**
 * iOS zooms the whole page into any text field under 16px, and doesn't zoom
 * back out. Nearly every writing field on Inkwell was 13–15px. maximum-scale=1
 * stops that zoom; iOS has ignored it for pinch-zoom since iOS 10, so people
 * can still zoom by hand. Android does honour it for pinch, so it's iOS only.
 */
function useNoFocusZoomOnIOS() {
  const pathname = usePathname();
  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!ios) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (meta && !/maximum-scale/.test(meta.content)) meta.content += ", maximum-scale=1";
  }, [pathname]);
}

// Pages that already refresh themselves, or where pulling down means something else.
const NO_PULL = [/^\/feed/, /^\/explore/, /^\/editor/, /^\/letters\/[^/]+/, /^\/welcome/];

function GlobalPullToRefresh() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const enabled = !NO_PULL.some((re) => re.test(pathname));
  const { refreshing, pullDistance } = usePullToRefresh({
    onRefresh: () => router.refresh(),
    enabled,
  });
  if (!enabled || (pullDistance === 0 && !refreshing)) return null;
  return (
    <div className="global-ptr lg:hidden" style={{ height: pullDistance || 40 }} aria-hidden="true">
      {refreshing ? (
        <svg className="pull-to-refresh-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: `rotate(${Math.min(pullDistance / 40 * 180, 180)}deg)`, transition: "transform 0.1s" }}>
          <polyline points="7 13 12 18 17 13" /><line x1="12" y1="6" x2="12" y2="18" />
        </svg>
      )}
    </div>
  );
}

/** Mounted once in AppShell. */
export function MobileViewport({ signedIn }: { signedIn: boolean }) {
  useKeyboardInset();
  useNoFocusZoomOnIOS();
  return signedIn ? <GlobalPullToRefresh /> : null;
}
