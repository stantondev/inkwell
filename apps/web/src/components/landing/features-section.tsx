"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ThemeExplorer } from "./theme-explorer";

const CARD_COUNT = 4;
const ROMAN = ["I", "II", "III", "IV"];

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
          <div className="landing-mockup-line w-full" />
          <div className="landing-mockup-line w-11/12" />
          <div className="landing-mockup-line w-2/3" />
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

// Federation visual for "Your Pen Pals" feature — letter-network constellation
const FEDIVERSE_NODES = [
  { name: "Mastodon", icon: "M", angle: -90 },
  { name: "Ghost", icon: "G", angle: -30 },
  { name: "WordPress", icon: "W", angle: 30 },
  { name: "Pixelfed", icon: "P", angle: 90 },
  { name: "Threads", icon: "T", angle: 150 },
  { name: "Lemmy", icon: "L", angle: 210 },
];

function FederationVisual() {
  const cx = 200;
  const cy = 150;
  const radius = 110;

  // Pre-compute node positions
  const nodes = FEDIVERSE_NODES.map((node) => {
    const rad = (node.angle * Math.PI) / 180;
    return {
      ...node,
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  });

  return (
    <div className="landing-fedi-diagram" role="img" aria-label="Inkwell connects to Mastodon, Ghost, WordPress, Pixelfed, Threads, and Lemmy via ActivityPub">
      <svg viewBox="0 0 400 330" fill="none" className="landing-fedi-svg">
        <defs>
          {/* Subtle radial glow behind center hub */}
          <radialGradient id="fedi-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          {/* Animated dash for connection lines */}
          <style>{`
            .fedi-line { animation: fedi-dash 30s linear infinite; }
            @keyframes fedi-dash { to { stroke-dashoffset: -80; } }
            @media (prefers-reduced-motion: reduce) { .fedi-line { animation: none; } }
          `}</style>
        </defs>

        {/* Ambient glow */}
        <circle cx={cx} cy={cy} r={radius + 20} fill="url(#fedi-glow)" />

        {/* Outer orbit rings — dotted constellation lines */}
        <circle cx={cx} cy={cy} r={radius} stroke="var(--accent)" strokeWidth="0.75" strokeDasharray="2 6" fill="none" opacity="0.12" />
        <circle cx={cx} cy={cy} r={radius * 0.65} stroke="var(--accent)" strokeWidth="0.5" strokeDasharray="1.5 8" fill="none" opacity="0.06" />

        {/* Connection lines from center to each node — flowing dashes */}
        {nodes.map((node) => (
          <line
            key={`line-${node.name}`}
            x1={cx}
            y1={cy}
            x2={node.x}
            y2={node.y}
            stroke="var(--accent)"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.2"
            className="fedi-line"
          />
        ))}

        {/* Cross-connections between adjacent nodes — subtle web effect */}
        {nodes.map((node, i) => {
          const next = nodes[(i + 1) % nodes.length];
          return (
            <line
              key={`cross-${node.name}`}
              x1={node.x}
              y1={node.y}
              x2={next.x}
              y2={next.y}
              stroke="var(--accent)"
              strokeWidth="0.5"
              strokeDasharray="3 8"
              opacity="0.08"
            />
          );
        })}

        {/* Platform nodes */}
        {nodes.map((node) => (
          <g key={node.name}>
            {/* Node glow */}
            <circle cx={node.x} cy={node.y} r="24" fill="var(--accent)" opacity="0.04" />
            {/* Node circle */}
            <circle cx={node.x} cy={node.y} r="20" fill="var(--surface)" stroke="var(--border)" strokeWidth="1" />
            {/* Letter icon */}
            <text
              x={node.x}
              y={node.y + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--accent)"
              fontSize="12"
              fontWeight="600"
              fontFamily="var(--font-lora, Georgia, serif)"
            >
              {node.icon}
            </text>
            {/* Name label */}
            <text
              x={node.x}
              y={node.y + 30}
              textAnchor="middle"
              fill="var(--muted)"
              fontSize="9"
              fontFamily="system-ui, sans-serif"
              opacity="0.7"
              letterSpacing="0.02em"
            >
              {node.name}
            </text>
          </g>
        ))}

        {/* Center: Inkwell hub — larger and more prominent */}
        <g>
          <circle cx={cx} cy={cy} r="34" fill="var(--accent)" opacity="0.08" />
          <circle cx={cx} cy={cy} r="28" fill="var(--accent-light)" stroke="var(--accent)" strokeWidth="1.5" />
          {/* Pen nib icon */}
          <g transform={`translate(${cx - 10}, ${cy - 10}) scale(0.82)`}>
            <path
              d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>

        {/* Protocol label */}
        <text
          x={cx}
          y={cy + radius + 48}
          textAnchor="middle"
          fill="var(--accent)"
          fontSize="10"
          fontFamily="var(--font-lora, Georgia, serif)"
          fontStyle="italic"
          opacity="0.5"
          letterSpacing="0.06em"
        >
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
            <svg viewBox="0 0 16 16" fill="var(--accent)" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
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
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Track scroll position to update active card index
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    const maxScroll = scrollWidth - clientWidth;
    if (maxScroll <= 0) return;
    const progress = scrollLeft / maxScroll;
    const index = Math.round(progress * (CARD_COUNT - 1));
    setActiveIndex(Math.max(0, Math.min(CARD_COUNT - 1, index)));
  }, []);

  // Programmatic scroll to a specific card
  const scrollToCard = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container || index < 0 || index >= CARD_COUNT) return;
    const card = container.children[index] as HTMLElement;
    if (!card) return;
    const targetLeft = card.offsetLeft - (container.clientWidth - card.offsetWidth) / 2;
    container.scrollTo({
      left: targetLeft,
      behavior: prefersReducedMotion ? "instant" : "smooth",
    });
  }, [prefersReducedMotion]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      scrollToCard(activeIndex + 1);
      e.preventDefault();
    }
    if (e.key === "ArrowLeft") {
      scrollToCard(activeIndex - 1);
      e.preventDefault();
    }
  }, [activeIndex, scrollToCard]);

  // One-time peek animation to hint at scrollability
  useEffect(() => {
    if (prefersReducedMotion) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            container.scrollTo({ left: 40, behavior: "smooth" });
            setTimeout(() => container.scrollTo({ left: 0, behavior: "smooth" }), 600);
          }, 400);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  return (
    <section className="landing-features" aria-label="Features" onKeyDown={handleKeyDown} tabIndex={0}>
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

        <div className="landing-features-grid" ref={containerRef} onScroll={handleScroll}>
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

        {/* Page Folio Navigation */}
        <div className="landing-features-nav" aria-label="Feature navigation">
          <button
            className="landing-features-arrow"
            onClick={() => scrollToCard(activeIndex - 1)}
            disabled={activeIndex === 0}
            aria-label="Previous feature"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div className="landing-features-folio">
            <span className="landing-features-counter">
              {ROMAN[activeIndex]} of IV
            </span>
            <div className="landing-features-track">
              <div
                className="landing-features-track-fill"
                style={{ transform: `translateX(${activeIndex * 100}%)` }}
              />
            </div>
          </div>

          <button
            className="landing-features-arrow"
            onClick={() => scrollToCard(activeIndex + 1)}
            disabled={activeIndex === CARD_COUNT - 1}
            aria-label="Next feature"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
