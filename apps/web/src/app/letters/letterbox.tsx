"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import type { ConversationPreview } from "./page";

interface Props {
  initialConversations: ConversationPreview[];
}

function formatPostmarkDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function EnvelopeCard({
  conv,
  index,
  prefersReducedMotion,
}: {
  conv: ConversationPreview;
  index: number;
  prefersReducedMotion: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const isUnread = conv.unread_count > 0;

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: "easeOut" }}
    >
      <Link href={`/letters/${conv.id}`} style={{ display: "block", textDecoration: "none" }}>
        <motion.div
          onHoverStart={() => setHovered(true)}
          onHoverEnd={() => setHovered(false)}
          animate={prefersReducedMotion ? {} : { y: hovered ? -3 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{
            background: "var(--envelope-bg)",
            borderRadius: "8px",
            padding: "16px 20px",
            marginBottom: "12px",
            boxShadow: hovered
              ? `0 8px 24px var(--envelope-shadow-hover), 0 2px 8px var(--envelope-shadow)`
              : `0 2px 8px var(--envelope-shadow)`,
            transition: "box-shadow 0.2s ease",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          {/* Envelope flap decoration (top edge fold) */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "3px",
              background: `linear-gradient(90deg, var(--envelope-flap) 0%, var(--envelope-border) 50%, var(--envelope-flap) 100%)`,
              opacity: 0.6,
            }}
          />

          {/* Postage stamp: avatar */}
          <div
            style={{
              flexShrink: 0,
              width: "52px",
              height: "52px",
              borderRadius: "4px",
              border: "2px solid var(--envelope-border)",
              overflow: "hidden",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.3), 0 1px 3px var(--envelope-shadow)",
              background: "var(--envelope-stamp-bg)",
              position: "relative",
            }}
          >
            {conv.other_user.avatar_url ? (
              <img
                src={conv.other_user.avatar_url}
                alt={conv.other_user.display_name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  fontFamily: "var(--font-lora, Georgia, serif)",
                  color: "var(--envelope-stamp-initial)",
                  fontWeight: "600",
                }}
              >
                {conv.other_user.display_name[0]?.toUpperCase()}
              </div>
            )}
            {/* Stamp perforation dots */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                border: "2px dotted rgba(0,0,0,0.12)",
                borderRadius: "3px",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Letter content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
              <span
                style={{
                  fontFamily: "var(--font-lora, Georgia, serif)",
                  fontSize: "15px",
                  fontWeight: isUnread ? "700" : "500",
                  color: "var(--envelope-text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {conv.other_user.display_name}
              </span>

              {/* Postmark date */}
              <span
                style={{
                  flexShrink: 0,
                  fontSize: "11px",
                  color: "var(--envelope-text-muted)",
                  fontVariant: "small-caps",
                  letterSpacing: "0.05em",
                  border: "1px solid var(--envelope-border)",
                  borderRadius: "50%",
                  padding: "3px 7px",
                  lineHeight: "1",
                  whiteSpace: "nowrap",
                }}
              >
                {formatPostmarkDate(conv.last_message_at)}
              </span>
            </div>

            <div
              style={{
                fontSize: "13px",
                color: isUnread ? "var(--envelope-text)" : "var(--envelope-text-muted)",
                marginTop: "4px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontStyle: conv.last_message ? "normal" : "italic",
                fontWeight: isUnread ? "500" : "400",
              }}
            >
              {conv.last_message
                ? conv.last_message.body
                : "No letters yet. Say hello!"}
            </div>
          </div>

          {/* Unread seal: wax dot */}
          {isUnread && (
            <motion.div
              initial={prefersReducedMotion ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: index * 0.06 + 0.2, type: "spring", stiffness: 300, damping: 20 }}
              style={{
                flexShrink: 0,
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 6px rgba(45,74,138,0.4)",
                position: "relative",
              }}
              title={`${conv.unread_count} unread`}
            >
              {/* Wax seal emboss effect */}
              <div
                aria-hidden="true"
                style={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  border: "1.5px solid rgba(255,255,255,0.35)",
                }}
              />
              {conv.unread_count > 1 && (
                <span
                  style={{
                    position: "absolute",
                    fontSize: "9px",
                    fontWeight: "700",
                    color: "white",
                    lineHeight: "1",
                  }}
                >
                  {conv.unread_count > 9 ? "9+" : conv.unread_count}
                </span>
              )}
            </motion.div>
          )}
        </motion.div>
      </Link>
    </motion.div>
  );
}

export function Letterbox({ initialConversations }: Props) {
  const [conversations] = useState(initialConversations);
  const prefersReducedMotion = usePrefersReducedMotion();
  const router = useRouter();

  return (
    <div>
      <AnimatePresence mode="wait">
        {conversations.length === 0 ? (
          <motion.div
            key="empty"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              textAlign: "center",
              padding: "64px 24px",
              background: "var(--envelope-bg)",
              borderRadius: "12px",
              border: "1px dashed var(--envelope-border)",
            }}
          >
            <div
              style={{
                fontSize: "48px",
                marginBottom: "16px",
                filter: "grayscale(0.3)",
              }}
            >
              ✉
            </div>
            <h2
              style={{
                fontFamily: "var(--font-lora, Georgia, serif)",
                fontSize: "20px",
                fontWeight: "600",
                color: "var(--envelope-text)",
                marginBottom: "8px",
              }}
            >
              Your letterbox is empty
            </h2>
            <p style={{ fontSize: "14px", color: "var(--envelope-text-muted)", marginBottom: "24px" }}>
              Visit a pen pal&apos;s profile and write them a letter to get started.
            </p>
            <button
              onClick={() => router.push("/pen-pals")}
              style={{
                padding: "10px 20px",
                borderRadius: "9999px",
                background: "var(--accent)",
                color: "white",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "500",
              }}
            >
              Browse Pen Pals
            </button>
          </motion.div>
        ) : (
          <motion.div key="list">
            {conversations.map((conv, index) => (
              <EnvelopeCard
                key={conv.id}
                conv={conv}
                index={index}
                prefersReducedMotion={prefersReducedMotion}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
