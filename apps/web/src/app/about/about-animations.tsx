"use client";

import { type ReactNode } from "react";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

interface FadeInSectionProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
  as?: "section" | "div";
}

export function FadeInSection({
  children,
  className,
  style,
  delay = 0,
  as = "div",
}: FadeInSectionProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (prefersReducedMotion) {
    const Tag = as;
    return (
      <Tag className={className} style={style}>
        {children}
      </Tag>
    );
  }

  const Component = motion.create(as);

  return (
    <Component
      className={className}
      style={style}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </Component>
  );
}

interface StaggerChildProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  index: number;
}

export function StaggerChild({
  children,
  className,
  style,
  index,
}: StaggerChildProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (prefersReducedMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.45, delay: index * 0.1, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
