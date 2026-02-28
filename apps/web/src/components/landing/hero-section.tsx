"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

// Calligraphic ink flourish path — a sweeping pen stroke
const INK_FLOURISH_PATH =
  "M40,50 C60,45 80,35 120,30 C160,25 200,28 240,35 C280,42 320,55 360,48 C400,41 440,25 480,30 C520,35 540,45 560,50";

// Pen nib simplified outline (derived from favicon.svg)
function PenNib({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M33.5 8C35 9 36.5 10.5 38.5 12.5C40.3 14.3 41.5 16 42 17L35.5 24C33.5 28 32 30.5 31.5 31.5C31.4 31.5 31.3 31.5 31.2 31.5C27.5 31.5 23.8 33 21 35L29 27C29.3 27.1 29.6 27.2 30 27.2C31 27.2 31.9 26.8 32.6 26.1C33.3 25.4 33.7 24.4 33.7 23.4C33.7 22.4 33.3 21.4 32.6 20.7C31.9 20 30.9 19.6 30 19.6C29 19.6 28 20 27.3 20.7C26.4 21.6 26 22.9 26.4 24.2L18 32.5C19.3 28.5 20.5 23.5 20.5 19C21.9 18.3 24.9 17 30 13.5C34.4 10.9 37.6 8.5 39 7.5"
        fill="var(--accent)"
        opacity="0.9"
      />
      <path
        d="M33 5.5C33 5.5 30 10.5 24 14.5C17 18 14.5 19.2 14.5 19.2C15 28.5 8.5 41 8.5 41C8.5 41 8.3 40.9 8 40.9C7.6 40.9 7 41 6.8 41.7C6.6 42.4 7 43.2 7.3 43.6L25 26C24.4 25.1 24.4 23.9 25.2 23C25.7 22.5 26.3 22.2 27 22.2C27.7 22.2 28.3 22.4 28.8 22.9C29.7 23.8 29.7 25.2 28.8 26.1C28.4 26.5 27.8 26.7 27.2 26.7C26.7 26.7 26.3 26.5 25.9 26.2L8.2 44C8.5 44.2 9 44.6 9.5 44.6C9.6 44.6 9.7 44.6 9.8 44.5C10.8 44.1 10.5 42.5 10.5 42.5C10.5 42.5 20 35.5 29.5 35.5C29.9 35.5 30.3 35.5 30.7 35.5C30.7 35.5 31.7 32.5 36.5 24.5C40 18.5 44 14 44 14C44 14 43 11.5 40.2 8.5C38 6.5 37 5.5 35.5 4.5L33 5.5Z"
        fill="var(--accent)"
        opacity="0.15"
      />
    </svg>
  );
}

// Ambient ink drops that drift slowly
function InkDrops() {
  const drops = [
    { x: "10%", y: "20%", size: 120, duration: 14, delay: 0, opacity: 0.04 },
    { x: "80%", y: "30%", size: 100, duration: 18, delay: 3, opacity: 0.03 },
    { x: "60%", y: "70%", size: 140, duration: 16, delay: 7, opacity: 0.035 },
    { x: "25%", y: "60%", size: 90, duration: 20, delay: 5, opacity: 0.03 },
  ];

  return (
    <div className="landing-ink-ambient" aria-hidden="true">
      {drops.map((drop, i) => (
        <motion.div
          key={i}
          className="landing-ink-drop"
          style={{
            left: drop.x,
            top: drop.y,
            width: drop.size,
            height: drop.size,
            opacity: drop.opacity,
          }}
          animate={{
            x: [0, 20, -10, 15, 0],
            y: [0, -15, 10, -20, 0],
          }}
          transition={{
            duration: drop.duration,
            repeat: Infinity,
            ease: "linear",
            delay: drop.delay,
          }}
        />
      ))}
    </div>
  );
}

export function HeroSection() {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const taglineWords = ["Your", "journal.", "Your", "pen\u00a0pals.", "Your", "space."];

  return (
    <section
      ref={containerRef}
      className="landing-hero"
      aria-label="Welcome to Inkwell"
    >
      {/* Paper texture + radial glow background */}
      <div className="landing-hero-bg" aria-hidden="true" />

      {/* Ambient ink drops — skipped on reduced motion */}
      {!prefersReducedMotion && <InkDrops />}

      <div className="landing-hero-content">
        {/* Badge pill — always visible immediately */}
        <div className="landing-badge">
          <span className="landing-badge-dot" aria-hidden="true" />
          Free forever &middot; federated &middot; no ads, ever
        </div>

        {/* Ink flourish SVG animation */}
        <div className="landing-flourish-wrapper" aria-hidden="true">
          {/* Pen nib */}
          <motion.div
            className="landing-pen-nib"
            initial={prefersReducedMotion ? false : { opacity: 0, x: 40, y: -20 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <PenNib className="w-10 h-10 sm:w-12 sm:h-12" />
          </motion.div>

          {/* Ink stroke that draws itself */}
          <svg
            className="landing-ink-stroke-svg"
            viewBox="0 0 600 80"
            fill="none"
            preserveAspectRatio="xMidYMid meet"
          >
            <motion.path
              d={INK_FLOURISH_PATH}
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity="0.3"
              initial={prefersReducedMotion ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, ease: [0.65, 0, 0.35, 1], delay: 0.4 }}
            />
          </svg>
        </div>

        {/* Tagline — word-by-word stagger */}
        <h1 className="landing-tagline">
          {taglineWords.map((word, i) => {
            // "pen pals." and "journal." and "space." are on specific lines
            const isAccent = word === "pen\u00a0pals.";
            const isLineBreak = i === 2 || i === 4;

            return (
              <span key={i}>
                {isLineBreak && <br />}
                <motion.span
                  className={`landing-tagline-word ${isAccent ? "landing-tagline-accent" : ""}`}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.5,
                    ease: "easeOut",
                    delay: prefersReducedMotion ? 0 : 0.8 + i * 0.12,
                  }}
                >
                  {word}{" "}
                </motion.span>
              </span>
            );
          })}
        </h1>

        {/* Subtitle */}
        <motion.p
          className="landing-subtitle"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            ease: "easeOut",
            delay: prefersReducedMotion ? 0 : 1.8,
          }}
        >
          A federated social journaling platform — the richness of LiveJournal,
          the creativity of early MySpace, rebuilt for 2026 on open standards
          with no algorithm and no ads.
        </motion.p>

        {/* CTA buttons */}
        <motion.div
          className="landing-cta-group"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            ease: "easeOut",
            delay: prefersReducedMotion ? 0 : 2.0,
          }}
        >
          <Link href="/get-started" className="landing-cta-primary ink-ripple">
            Start writing
          </Link>
          <Link href="/explore" className="landing-cta-secondary">
            Read the feed
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
