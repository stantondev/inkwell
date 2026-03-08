"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CircleCard from "./circle-card";

interface Circle {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  member_count: number;
  discussion_count: number;
  is_starter: boolean;
  last_activity_at: string | null;
  inserted_at: string;
  is_member?: boolean;
  owner: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    avatar_frame: string | null;
    subscription_tier: string;
  } | null;
}

interface Props {
  initialCircles: Circle[];
  initialTotal: number;
  initialPage: number;
  myCircles: Circle[];
  categories: { value: string; label: string }[];
  currentCategory: string;
  currentSearch: string;
  isLoggedIn: boolean;
  isPlus: boolean;
}

export default function CircleBrowseClient({
  initialCircles,
  initialTotal,
  initialPage,
  myCircles,
  categories,
  currentCategory,
  currentSearch,
  isLoggedIn,
  isPlus,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(currentSearch);
  const perPage = 20;
  const totalPages = Math.ceil(initialTotal / perPage);

  const navigate = useCallback(
    (params: Record<string, string>) => {
      const sp = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v) sp.set(k, v);
      });
      router.push(`/circles?${sp.toString()}`);
    },
    [router]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ search, category: currentCategory });
  };

  return (
    <>
      {/* My Circles */}
      {myCircles.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h2 className="circle-section-heading">My Circles</h2>
          <div className="circle-my-circles-scroll">
            {myCircles.map((circle) => (
              <Link
                key={circle.id}
                href={`/circles/${circle.slug}`}
                style={{
                  flex: "0 0 220px",
                  textDecoration: "none",
                }}
              >
                <div className="circle-card" style={{ padding: "0.875rem" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--foreground)", marginBottom: "0.25rem" }}>
                    {circle.name}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    {circle.member_count} member{circle.member_count !== 1 ? "s" : ""}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Actions row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "0.5rem", flex: 1, maxWidth: 320 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search circles..."
            style={{
              flex: 1,
              padding: "0.375rem 0.75rem",
              fontSize: "0.8125rem",
              border: "1px solid var(--border)",
              borderRadius: "9999px",
              background: "var(--surface)",
              color: "var(--foreground)",
              outline: "none",
            }}
          />
        </form>

        {isLoggedIn && (
          <Link
            href={isPlus ? "/circles/new" : "/settings/billing"}
            className="circle-btn"
            style={{ textDecoration: "none", fontSize: "0.8125rem" }}
          >
            {isPlus ? "+ Found a Circle" : "✦ Plus to Create"}
          </Link>
        )}
      </div>

      {/* Category filter pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "1.5rem" }}>
        <button
          onClick={() => navigate({ search, category: "" })}
          className="circle-category-pill"
          style={{
            cursor: "pointer",
            border: "none",
            background: !currentCategory ? "var(--accent)" : "color-mix(in srgb, var(--accent) 10%, var(--surface))",
            color: !currentCategory ? "#fff" : "var(--accent)",
          }}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.value}
            onClick={() => navigate({ search, category: cat.value })}
            className="circle-category-pill"
            style={{
              cursor: "pointer",
              border: "none",
              background: currentCategory === cat.value ? "var(--accent)" : "color-mix(in srgb, var(--accent) 10%, var(--surface))",
              color: currentCategory === cat.value ? "#fff" : "var(--accent)",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Circle grid */}
      {initialCircles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)" }}>
          <p style={{ fontSize: "1.125rem", fontStyle: "italic", fontFamily: "var(--font-lora, Georgia, serif)" }}>
            No circles found
          </p>
          <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
            {currentSearch || currentCategory ? "Try adjusting your filters" : "Be the first to create a circle"}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))", gap: "1rem" }}>
          {initialCircles.map((circle) => (
            <CircleCard key={circle.id} circle={circle} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "2rem" }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => navigate({ search, category: currentCategory, page: String(p) })}
              style={{
                padding: "0.25rem 0.75rem",
                fontSize: "0.8125rem",
                borderRadius: "0.375rem",
                border: "1px solid var(--border)",
                background: p === initialPage ? "var(--accent)" : "var(--surface)",
                color: p === initialPage ? "#fff" : "var(--foreground)",
                cursor: "pointer",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
