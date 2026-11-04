// Shared types and helpers for the roadmap pages.

export interface FeedbackAuthor {
  id: string | null;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface FeedbackPost {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  admin_response: string | null;
  release_note: string | null;
  completed_at: string | null;
  vote_count: number;
  comment_count: number;
  priority: string | null;
  value_score: number | null;
  weighted_score: number | null;
  attachment_ids?: string[];
  voted: boolean;
  author: FeedbackAuthor;
  created_at: string;
  updated_at: string;
  number?: number;
}

/** One row of GET /api/feedback/outline: enough to flip from item to item. */
export interface OutlineItem {
  id: string;
  number: number;
  title: string;
  status: string;
  category: string;
  vote_count: number;
  comment_count: number;
  username: string;
  created_at: string;
  completed_at: string | null;
}

export interface RoadmapSummary {
  open: number;
  shipped: number;
  declined: number;
  by_status: Record<string, number>;
  contributors: number;
  since: string | null;
  shipped_by_month: { month: string; count: number }[];
}

export type RoadmapGroup = "open" | "shipped" | "declined";

export const OPEN_STATUSES = ["new", "under_review", "planned", "in_progress"];

export function groupOf(status: string): RoadmapGroup {
  if (status === "done") return "shipped";
  if (status === "declined") return "declined";
  return "open";
}

export const STATUS_LABELS: Record<string, string> = {
  new: "Received",
  under_review: "Under review",
  planned: "Planned",
  in_progress: "Being built",
  done: "Shipped",
  declined: "Declined",
};

/** The steps an idea goes through, in order. */
export const STAGES = [
  { status: "new", label: "Received" },
  { status: "under_review", label: "Reviewing" },
  { status: "planned", label: "Planned" },
  { status: "in_progress", label: "Building" },
  { status: "done", label: "Shipped" },
];

export const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  feature: "Feature",
  idea: "Idea",
  question: "Question",
};

export const SORTS = [
  { value: "most_voted", label: "Most voted" },
  { value: "newest", label: "Newest" },
  { value: "recently_updated", label: "Recently updated" },
  { value: "priority_score", label: "Priority" },
];

/** Where a reader came from, carried to item pages so ← → flip through the same list. */
export interface RoadmapContext {
  group?: RoadmapGroup;
  category?: string;
  sort?: string;
  q?: string;
}

export function readContext(params: Record<string, string | undefined>): RoadmapContext {
  const group = params.in;
  return {
    group: group === "open" || group === "shipped" || group === "declined" ? group : undefined,
    category: params.category && CATEGORY_LABELS[params.category] ? params.category : undefined,
    sort: params.sort && SORTS.some((s) => s.value === params.sort) ? params.sort : undefined,
    q: params.q?.trim() ? params.q.trim().slice(0, 100) : undefined,
  };
}

export function contextQuery(ctx: RoadmapContext): string {
  const p = new URLSearchParams();
  if (ctx.group) p.set("in", ctx.group);
  if (ctx.category) p.set("category", ctx.category);
  if (ctx.sort && ctx.sort !== "most_voted") p.set("sort", ctx.sort);
  if (ctx.q) p.set("q", ctx.q);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function itemHref(id: string, ctx: RoadmapContext): string {
  return `/roadmap/${id}${contextQuery(ctx)}`;
}

/** The roadmap page with the same filters, for "back". */
export function roadmapHref(ctx: RoadmapContext): string {
  const p = new URLSearchParams();
  if (ctx.group === "shipped" || ctx.group === "declined") p.set("view", ctx.group);
  if (ctx.category) p.set("category", ctx.category);
  if (ctx.sort && ctx.sort !== "most_voted") p.set("sort", ctx.sort);
  if (ctx.q) p.set("q", ctx.q);
  const s = p.toString();
  return `/roadmap${s ? `?${s}` : ""}`;
}

/** A small, stable tilt from an id, so cards sit on the board a little askew. */
export function tiltOf(id: string, range = 1.2): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const unit = ((h >>> 0) % 1000) / 1000; // 0..1
  return Math.round((unit * 2 - 1) * range * 100) / 100;
}

export function excerpt(text: string | null | undefined, max = 220): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max * 0.6 ? space : max).replace(/[,.;:\s]+$/, "")}…`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03" → "Mar" (and the year when asked). UTC, so server and client agree. */
export function monthLabel(month: string, withYear = false): string {
  const [y, m] = month.split("-").map(Number);
  const name = MONTHS[(m || 1) - 1];
  return withYear ? `${name} ${y}` : name;
}

/** A UTC date as "Nov 3, 2026". */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** A UTC month key "2026-11" for grouping. */
export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
