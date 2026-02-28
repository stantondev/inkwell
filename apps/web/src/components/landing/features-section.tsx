"use client";

import { motion, useReducedMotion } from "motion/react";
import { ThemeExplorer } from "./theme-explorer";

interface FeaturePageProps {
  title: string;
  description: string;
  index: number;
  children: React.ReactNode;
}

function FeaturePage({ title, description, index, children }: FeaturePageProps) {
  const prefersReducedMotion = useReducedMotion();
  const isEven = index % 2 === 0;

  return (
    <motion.div
      className={`landing-feature-page ${isEven ? "landing-feature-page-left" : "landing-feature-page-right"}`}
      initial={
        prefersReducedMotion
          ? false
          : { opacity: 0, y: 48, rotateZ: isEven ? -0.8 : 0.8 }
      }
      whileInView={{ opacity: 1, y: 0, rotateZ: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
    >
      <div className="landing-feature-paper">
        {/* Paper texture overlay */}
        <div className="landing-feature-texture" aria-hidden="true" />
        {/* Corner mark */}
        <div className="landing-feature-corner" aria-hidden="true" />

        <div className="landing-feature-inner">
          <div className="landing-feature-text">
            <h3 className="landing-feature-title">{title}</h3>
            <p className="landing-feature-desc">{description}</p>
          </div>
          <div className="landing-feature-visual">{children}</div>
        </div>
      </div>
    </motion.div>
  );
}

// Journal mockup visual for "Your Journal" feature
function JournalMockup() {
  return (
    <div className="landing-mockup-journal">
      {/* Ruled lines */}
      <div className="landing-mockup-lines" aria-hidden="true" />
      {/* Sample content */}
      <div className="landing-mockup-content">
        <div className="landing-mockup-date">February 27, 2026</div>
        <div className="landing-mockup-title">Morning reflections</div>
        <div className="landing-mockup-body">
          <div className="landing-mockup-line w-full" />
          <div className="landing-mockup-line w-11/12" />
          <div className="landing-mockup-line w-4/5" />
          <div className="landing-mockup-line w-full" />
          <div className="landing-mockup-line w-3/4" />
        </div>
      </div>
      {/* Stamps in corner */}
      <div className="landing-mockup-stamps">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stamps/felt.svg" alt="" className="landing-mockup-stamp" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stamps/beautifully-said.svg" alt="" className="landing-mockup-stamp" />
      </div>
    </div>
  );
}

// Federation visual for "Your Pen Pals" feature — ActivityPub hub-and-spoke diagram
const FEDIVERSE_NODES = [
  { name: "Mastodon", icon: "M", angle: -90 },
  { name: "Ghost", icon: "G", angle: -30 },
  { name: "WordPress", icon: "W", angle: 30 },
  { name: "Pixelfed", icon: "P", angle: 90 },
  { name: "Threads", icon: "T", angle: 150 },
  { name: "Lemmy", icon: "L", angle: 210 },
];

function FederationVisual() {
  const prefersReducedMotion = useReducedMotion();
  const cx = 200;
  const cy = 180;
  const radius = 130;

  return (
    <div className="landing-fedi-diagram" role="img" aria-label="Inkwell connects to Mastodon, Ghost, WordPress, Pixelfed, Threads, and Lemmy via ActivityPub">
      <svg viewBox="0 0 400 360" fill="none" className="landing-fedi-svg">
        {/* Outer orbit ring */}
        <circle cx={cx} cy={cy} r={radius} stroke="var(--accent)" strokeWidth="1" strokeDasharray="6 4" fill="none" opacity="0.15" />
        <circle cx={cx} cy={cy} r={radius - 30} stroke="var(--accent)" strokeWidth="0.5" strokeDasharray="3 6" fill="none" opacity="0.08" />

        {/* Connection lines from center to each node */}
        {FEDIVERSE_NODES.map((node) => {
          const rad = (node.angle * Math.PI) / 180;
          const nx = cx + radius * Math.cos(rad);
          const ny = cy + radius * Math.sin(rad);
          return (
            <motion.line
              key={node.name}
              x1={cx}
              y1={cy}
              x2={nx}
              y2={ny}
              stroke="var(--accent)"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.25"
              initial={prefersReducedMotion ? false : { pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 0.25 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.3 }}
            />
          );
        })}

        {/* Platform nodes */}
        {FEDIVERSE_NODES.map((node, i) => {
          const rad = (node.angle * Math.PI) / 180;
          const nx = cx + radius * Math.cos(rad);
          const ny = cy + radius * Math.sin(rad);
          return (
            <motion.g
              key={node.name}
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.5 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.4 + i * 0.08 }}
              style={{ transformOrigin: `${nx}px ${ny}px` }}
            >
              <circle cx={nx} cy={ny} r="22" fill="var(--surface)" stroke="var(--border)" strokeWidth="1" />
              <text x={nx} y={ny + 1} textAnchor="middle" dominantBaseline="central" fill="var(--muted)" fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif">
                {node.icon}
              </text>
              <text x={nx} y={ny + 34} textAnchor="middle" fill="var(--muted)" fontSize="9" fontFamily="system-ui, sans-serif" opacity="0.7">
                {node.name}
              </text>
            </motion.g>
          );
        })}

        {/* Center: Inkwell hub */}
        <motion.g
          initial={prefersReducedMotion ? false : { scale: 0.6, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
          <circle cx={cx} cy={cy} r="32" fill="var(--accent)" opacity="0.12" />
          <circle cx={cx} cy={cy} r="26" fill="var(--accent-light)" stroke="var(--accent)" strokeWidth="1.5" />
          {/* Pen nib icon */}
          <g transform={`translate(${cx - 10}, ${cy - 10}) scale(0.833)`}>
            <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </motion.g>

        {/* "ActivityPub" protocol label */}
        <text x={cx} y={cy + radius + 42} textAnchor="middle" fill="var(--accent)" fontSize="10" fontFamily="var(--font-lora, Georgia, serif)" fontStyle="italic" opacity="0.6" letterSpacing="0.05em">
          connected via ActivityPub
        </text>
      </svg>
    </div>
  );
}

// Privacy visual for "Your Rules" feature
function PrivacyVisual() {
  return (
    <div className="landing-privacy-visual">
      <div className="landing-privacy-shield">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" className="w-10 h-10" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>
      <div className="landing-privacy-list">
        {["No ads", "No algorithm", "No tracking", "Your data stays yours"].map((item) => (
          <div key={item} className="landing-privacy-item">
            <svg viewBox="0 0 16 16" fill="var(--accent)" className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true">
              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
            </svg>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeaturesSection() {
  return (
    <section className="landing-features" aria-label="Features">
      <div className="landing-features-inner">
        <motion.div
          className="landing-features-header"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5 }}
        >
          <p className="landing-section-eyebrow">What makes Inkwell different</p>
          <h2 className="landing-section-title">Everything you need to write, connect, and express</h2>
        </motion.div>

        <div className="landing-features-grid">
          <FeaturePage
            title="Your Journal"
            description="A rich text editor with moods, music, stamps, cover images, and distraction-free writing mode. Import from WordPress, Medium, or Substack."
            index={0}
          >
            <JournalMockup />
          </FeaturePage>

          <FeaturePage
            title="Your Space"
            description="Eight unique themes, custom colors, fonts, layouts, background images, music players, and custom HTML/CSS. Make your profile truly yours."
            index={1}
          >
            <ThemeExplorer />
          </FeaturePage>

          <FeaturePage
            title="Your Pen Pals"
            description="Follow writers on Inkwell — and across the fediverse. Your journal connects to Mastodon, Ghost, and the open social web via ActivityPub."
            index={2}
          >
            <FederationVisual />
          </FeaturePage>

          <FeaturePage
            title="Your Rules"
            description="No ads. No algorithm. No tracking. Per-entry privacy controls, friend filters, and complete data portability. You own your words."
            index={3}
          >
            <PrivacyVisual />
          </FeaturePage>
        </div>
      </div>
    </section>
  );
}
