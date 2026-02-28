"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

export function FinalCta() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="landing-final-cta" aria-label="Get started">
      {/* Ruled lines background */}
      <motion.div
        className="landing-final-lines"
        aria-hidden="true"
        initial={prefersReducedMotion ? false : { clipPath: "inset(0 100% 0 0)" }}
        whileInView={{ clipPath: "inset(0 0% 0 0)" }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
      />
      {/* Paper texture */}
      <div className="landing-final-texture" aria-hidden="true" />

      <motion.div
        className="landing-final-content"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.4 }}
      >
        <h2 className="landing-final-title">Ready to write?</h2>
        <p className="landing-final-subtitle">
          Join a community of writers who own their words.
        </p>
        <Link href="/get-started" className="landing-cta-primary ink-ripple">
          Pick up the pen
        </Link>
      </motion.div>
    </section>
  );
}
