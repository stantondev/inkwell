"use client";

import { useState, useEffect, use } from "react";
import { FAQ_CATEGORIES, FAQ_ITEMS } from "@/lib/faq-data";

export function FaqAccordion({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ category?: string }>;
}) {
  const searchParams = use(searchParamsPromise);
  const [activeCategory, setActiveCategory] = useState<string | null>(
    searchParams.category ?? null
  );
  const [openId, setOpenId] = useState<string | null>(null);

  // Sync with URL hash for deep linking (e.g. /help/faq#stamps)
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const item = FAQ_ITEMS.find((f) => f.id === hash);
      if (item) {
        setActiveCategory(item.category);
        setOpenId(item.id);
        setTimeout(() => {
          document.getElementById(`faq-${hash}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    }
  }, []);

  const filtered = activeCategory
    ? FAQ_ITEMS.filter((f) => f.category === activeCategory)
    : FAQ_ITEMS;

  return (
    <>
      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setActiveCategory(null)}
          className="faq-pill rounded-full border px-3 py-1 text-xs transition-colors"
          style={{
            borderColor: !activeCategory ? "var(--accent)" : "var(--border)",
            background: !activeCategory ? "var(--accent)" : "transparent",
            color: !activeCategory ? "white" : "var(--foreground)",
          }}
        >
          All
        </button>
        {FAQ_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id === activeCategory ? null : cat.id)}
            className="faq-pill rounded-full border px-3 py-1 text-xs transition-colors"
            style={{
              borderColor: cat.id === activeCategory ? "var(--accent)" : "var(--border)",
              background: cat.id === activeCategory ? "var(--accent)" : "transparent",
              color: cat.id === activeCategory ? "white" : "var(--foreground)",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* FAQ items */}
      <div className="space-y-3">
        {filtered.map((item) => {
          const isOpen = openId === item.id;

          return (
            <div
              key={item.id}
              id={`faq-${item.id}`}
              className="rounded-xl border overflow-hidden scroll-mt-24"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <button
                onClick={() => setOpenId(isOpen ? null : item.id)}
                className="w-full flex items-center justify-between gap-4 p-5 text-left transition-colors"
                style={{ background: isOpen ? "var(--surface-hover, var(--surface))" : undefined }}
              >
                <span
                  className="text-sm font-semibold"
                  style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
                >
                  {item.question}
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-shrink-0 transition-transform"
                  style={{
                    color: "var(--muted)",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {isOpen && (
                <div
                  className="px-5 pb-5 text-sm leading-relaxed faq-answer"
                  style={{ color: "var(--foreground)" }}
                  dangerouslySetInnerHTML={{ __html: item.answer }}
                />
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
          No questions in this category yet.
        </p>
      )}
    </>
  );
}
