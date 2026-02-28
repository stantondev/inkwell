"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

interface CommunityEntry {
  id: string;
  title: string | null;
  excerpt: string | null;
  body_html: string;
  slug: string | null;
  word_count: number;
  category: string | null;
  cover_image_id: string | null;
  published_at: string;
  source: "local" | "remote";
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

function formatCategory(cat: string): string {
  return cat
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getReadingTime(wordCount: number): string {
  const minutes = Math.max(1, Math.ceil(wordCount / 250));
  return `${minutes} min read`;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function getExcerpt(entry: CommunityEntry): string {
  if (entry.excerpt) return decodeEntities(entry.excerpt);
  const text = decodeEntities(entry.body_html.replace(/<[^>]*>/g, "")).trim();
  if (text.length <= 120) return text;
  return text.slice(0, 120).trimEnd() + "\u2026";
}

interface Props {
  entries: CommunityEntry[];
}

export function CommunityEntries({ entries }: Props) {
  const prefersReducedMotion = useReducedMotion();

  if (entries.length === 0) return null;

  return (
    <section className="landing-community" aria-label="Community entries">
      <motion.div
        className="landing-community-header"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.5 }}
      >
        <p className="landing-section-eyebrow">Fresh from the community</p>
        <h2 className="landing-section-title">See what people are writing</h2>
      </motion.div>

      <div className="landing-community-grid">
        {entries.map((entry, i) => {
          const entryUrl = `/${entry.author.username}/${entry.slug ?? entry.id}`;
          return (
            <motion.div
              key={entry.id}
              initial={
                prefersReducedMotion
                  ? false
                  : { opacity: 0, y: 32, rotateZ: i % 2 === 0 ? -0.5 : 0.5 }
              }
              whileInView={{ opacity: 1, y: 0, rotateZ: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{
                duration: 0.5,
                ease: [0.25, 0.1, 0.25, 1],
                delay: prefersReducedMotion ? 0 : i * 0.08,
              }}
            >
              <Link href={entryUrl} className="landing-entry-card">
                {/* Paper texture */}
                <div className="landing-entry-texture" aria-hidden="true" />

                {entry.cover_image_id && (
                  <div className="landing-entry-cover">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/images/${entry.cover_image_id}`}
                      alt=""
                      className="w-full h-32 object-cover"
                      loading="lazy"
                    />
                  </div>
                )}

                <h3 className="landing-entry-title">{entry.title}</h3>

                <p className="landing-entry-excerpt">{getExcerpt(entry)}</p>

                <div className="landing-entry-footer">
                  {entry.author.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.author.avatar_url}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="landing-entry-avatar-fallback">
                      {(entry.author.display_name || entry.author.username)
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}
                  <span className="landing-entry-author">
                    {entry.author.display_name || entry.author.username}
                  </span>
                  <span className="landing-entry-meta">
                    {entry.word_count > 0 && getReadingTime(entry.word_count)}
                    {entry.word_count > 0 && entry.category && " \u00b7 "}
                    {entry.category && formatCategory(entry.category)}
                  </span>
                </div>

                {/* Corner mark */}
                <div className="landing-entry-corner" aria-hidden="true" />
              </Link>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        className="landing-community-cta"
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <Link href="/explore" className="landing-cta-secondary">
          Explore more entries &rarr;
        </Link>
      </motion.div>
    </section>
  );
}
