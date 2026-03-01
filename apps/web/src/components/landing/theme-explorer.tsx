"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { PROFILE_THEMES, PROFILE_FONTS } from "@/lib/profile-themes";

export function ThemeExplorer() {
  const [activeTheme, setActiveTheme] = useState(PROFILE_THEMES[0]);

  // Resolve CSS variables for the active theme
  const themeVars: Record<string, string> = {
    "--te-bg": activeTheme.vars["--profile-bg"] || "#fafaf9",
    "--te-surface": activeTheme.vars["--profile-surface"] || "#ffffff",
    "--te-accent": activeTheme.vars["--profile-accent"] || "#2d4a8a",
    "--te-accent-light": activeTheme.vars["--profile-accent-light"] || "#e8eef7",
    "--te-foreground": activeTheme.vars["--profile-foreground"] || "#1c1917",
    "--te-muted": activeTheme.vars["--profile-muted"] || "#78716c",
    "--te-border": activeTheme.vars["--profile-border"] || "#e7e5e4",
  };

  const fontFamily =
    PROFILE_FONTS.find((f) => f.id === (activeTheme.defaultFont || "lora"))
      ?.family || "var(--font-lora, Georgia, serif)";

  return (
    <div className="landing-theme-explorer">
      {/* Mock profile card */}
      <motion.div
        className="landing-theme-card"
        style={themeVars as React.CSSProperties}
        layout
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        <div className="landing-theme-card-inner">
          {/* Avatar + name */}
          <div className="landing-theme-avatar">
            <div
              className="landing-theme-avatar-circle"
              style={{
                background: `linear-gradient(135deg, ${themeVars["--te-accent"]}, ${themeVars["--te-accent-light"]})`,
              }}
            >
              <span style={{ color: themeVars["--te-bg"], fontFamily }}>Y</span>
            </div>
            <div>
              <div
                className="landing-theme-name"
                style={{ color: "var(--te-foreground)", fontFamily }}
              >
                Your Name Here
              </div>
              <div
                className="landing-theme-handle"
                style={{ color: "var(--te-muted)" }}
              >
                @yourname
              </div>
            </div>
          </div>
          {/* Bio */}
          <p
            className="landing-theme-bio"
            style={{ color: "var(--te-muted)", fontFamily }}
          >
            Writer, dreamer, collector of moments.
          </p>
          {/* Mini entry list */}
          <div className="landing-theme-entries">
            {["Morning reflections", "Letters to the sea"].map((title) => (
              <div
                key={title}
                className="landing-theme-entry"
                style={{
                  borderColor: "var(--te-border)",
                  background: "var(--te-surface)",
                }}
              >
                <span style={{ color: "var(--te-foreground)", fontFamily, fontSize: "13px", fontWeight: 600 }}>
                  {title}
                </span>
                <span style={{ color: "var(--te-muted)", fontSize: "11px" }}>3 min read</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Theme swatch buttons */}
      <div className="landing-theme-swatches">
        {PROFILE_THEMES.map((theme) => (
          <button
            key={theme.id}
            className={`landing-theme-swatch ${activeTheme.id === theme.id ? "landing-theme-swatch-active" : ""}`}
            style={{ background: theme.preview }}
            onClick={() => setActiveTheme(theme)}
            aria-pressed={activeTheme.id === theme.id}
            aria-label={theme.name}
            title={theme.name}
          />
        ))}
      </div>
      <p className="landing-theme-label" style={{ color: "var(--muted)" }}>
        {activeTheme.name}
      </p>
    </div>
  );
}
