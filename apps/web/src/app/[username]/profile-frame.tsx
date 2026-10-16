import { ProfileEffects } from "@/components/profile-effects";
import type { ProfileStyles, ProfileUser } from "./profile-types";

export interface ProfileFrameProps {
  profile: ProfileUser;
  styles: ProfileStyles;
  isPlus: boolean;
  hasCustomBackground: boolean;
  fontFamily?: string;
  customCssStyles: string | null;
  scopeId: string;
}

/**
 * The writer's themed surroundings: colours, background picture, effects
 * and custom CSS, with the page's container inside (its breakpoints are
 * container queries, so a page looks the same whatever else is on screen).
 */
export function ProfileFrame({
  frame,
  containerClassName,
  children,
  before,
}: {
  frame: ProfileFrameProps;
  containerClassName: string;
  children: React.ReactNode;
  before?: React.ReactNode;
}) {
  const { profile, styles, isPlus, hasCustomBackground } = frame;
  return (
    <div className={`min-h-screen relative ${styles.themeClass}`} data-profile-wrapper style={{
      ...styles.page,
      ...(hasCustomBackground ? { background: "transparent" } : {}),
    }}>
      {before}
      {hasCustomBackground && (
        <div className="fixed inset-0 -z-10" style={{
          backgroundImage: `url(${profile.profile_background_url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
          backgroundColor: styles.page.background || "var(--background)",
        }} />
      )}

      {/* Profile particle effects (Plus only) */}
      {profile.profile_effect && isPlus && (
        <ProfileEffects
          effect={profile.profile_effect}
          intensity={profile.profile_effect_intensity ?? "subtle"}
        />
      )}

      {/* Custom CSS from profile_css field */}
      {frame.customCssStyles && (
        <style dangerouslySetInnerHTML={{ __html: frame.customCssStyles }} />
      )}

      <div id={frame.scopeId} className={`@container mx-auto ${containerClassName} overflow-hidden`}
        style={{ fontFamily: frame.fontFamily }}>
        {children}
      </div>
    </div>
  );
}
