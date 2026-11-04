import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { UpvoteButton } from "./upvote-button";
import s from "./roadmap.module.css";
import {
  CATEGORY_LABELS,
  STAGES,
  STATUS_LABELS,
  excerpt,
  itemHref,
  shortDate,
  tiltOf,
  type FeedbackPost,
  type RoadmapContext,
} from "./roadmap-shared";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** A rubber stamp for open and declined items; a dated postmark for shipped ones. */
export function StatusMark({
  status,
  completedAt,
  big = false,
}: {
  status: string;
  completedAt?: string | null;
  big?: boolean;
}) {
  if (status === "done") return <Postmark date={completedAt} big={big} />;
  return (
    <span
      className={`${s.stamp} ${big ? s.stampBig : ""}`}
      data-status={status}
      aria-hidden={big ? undefined : true}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function Postmark({ date, big }: { date?: string | null; big: boolean }) {
  const d = date ? new Date(date) : null;
  const day = d ? String(d.getUTCDate()) : "";
  const mon = d ? MONTHS[d.getUTCMonth()] : "";
  const year = d ? String(d.getUTCFullYear()) : "";
  return (
    <span
      className={`${s.postmark} ${big ? s.postmarkBig : ""}`}
      role={big ? "img" : undefined}
      aria-label={big ? `Shipped${d ? ` ${shortDate(date)}` : ""}` : undefined}
      aria-hidden={big ? undefined : true}
    >
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="50" cy="50" r="33" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {/* Top arc text, drawn as letters around the ring */}
        {"SHIPPED".split("").map((ch, i, all) => {
          const angle = -62 + (i * 124) / (all.length - 1);
          const rad = ((angle - 90) * Math.PI) / 180;
          const x = 50 + 39.5 * Math.cos(rad);
          const y = 50 + 39.5 * Math.sin(rad);
          return (
            <text
              key={i}
              x={x}
              y={y}
              fill="currentColor"
              fontSize="9"
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="central"
              transform={`rotate(${angle} ${x} ${y})`}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {ch}
            </text>
          );
        })}
        {"INKWELL".split("").map((ch, i, all) => {
          const angle = 180 + 50 - (i * 100) / (all.length - 1);
          const rad = ((angle - 90) * Math.PI) / 180;
          const x = 50 + 39.5 * Math.cos(rad);
          const y = 50 + 39.5 * Math.sin(rad);
          return (
            <text
              key={i}
              x={x}
              y={y}
              fill="currentColor"
              fontSize="7.5"
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="central"
              transform={`rotate(${angle - 180} ${x} ${y})`}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {ch}
            </text>
          );
        })}
        <text x="50" y="42" fill="currentColor" fontSize="9" fontWeight="700" textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif">
          {mon}
        </text>
        <text x="50" y="58" fill="currentColor" fontSize="17" fontWeight="700" textAnchor="middle" fontFamily="Georgia, serif">
          {day}
        </text>
        <text x="50" y="69" fill="currentColor" fontSize="8" fontWeight="600" textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif">
          {year}
        </text>
      </svg>
    </span>
  );
}

/** Received → Reviewing → Planned → Building → Shipped, filled up to where the idea is. */
export function ProgressRail({ status, labelled = true }: { status: string; labelled?: boolean }) {
  const at = STAGES.findIndex((st) => st.status === status);
  if (at < 0) return null;
  const ink = `var(--rm-${status})`;
  return (
    <ol
      className={s.rail}
      style={{ ["--ink" as string]: ink }}
      aria-label={`Progress: ${STAGES[at].label}, step ${at + 1} of ${STAGES.length}`}
    >
      {STAGES.map((st, i) => (
        <li
          key={st.status}
          className={s.railStep}
          data-state={i < at ? "done" : i === at ? "current" : "todo"}
          aria-current={i === at ? "step" : undefined}
        >
          <span className={s.railDot} />
          {labelled && <span className={s.railLabel}>{st.label}</span>}
        </li>
      ))}
    </ol>
  );
}

export function CategoryLabel({ category }: { category: string }) {
  return (
    <span className={s.cat} data-cat={category}>
      <span className={s.dot} />
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

function CommentIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function RoadmapCard({
  post,
  number,
  ctx,
  isLoggedIn,
}: {
  post: FeedbackPost;
  number?: number;
  ctx: RoadmapContext;
  isLoggedIn: boolean;
}) {
  const shipped = post.status === "done";
  const open = !shipped && post.status !== "declined";
  const deleted = post.author.username === "[deleted]";

  return (
    <article
      className={s.card}
      data-shipped={shipped ? "" : undefined}
      style={{ ["--tilt" as string]: `${tiltOf(post.id)}deg` }}
    >
      <div className={s.cardHead}>
        <CategoryLabel category={post.category} />
        {number ? <span className={s.num}>No. {number}</span> : null}
      </div>

      <StatusMark status={post.status} completedAt={post.completed_at} />

      <h3 className={s.cardTitle}>
        <Link href={itemHref(post.id, ctx)}>{post.title}</Link>
      </h3>

      {shipped && post.release_note ? (
        <p className={s.cardNote}>{excerpt(post.release_note, 260)}</p>
      ) : post.status === "declined" && post.admin_response ? (
        <p className={s.cardNote}>{excerpt(post.admin_response, 260)}</p>
      ) : (
        <p className={s.cardBody}>{excerpt(post.body, 240)}</p>
      )}

      {open && <ProgressRail status={post.status} />}

      <div className={s.cardFoot}>
        <span className={s.byline}>
          {!deleted && <Avatar url={post.author.avatar_url} name={post.author.display_name} size={18} />}
          <span>
            {shipped ? "Asked by " : ""}@{post.author.username}
            {!shipped && <> · {shortDate(post.created_at)}</>}
          </span>
        </span>
        <span className={s.footRight}>
          <span className={s.count} title={`${post.comment_count} comments`}>
            <CommentIcon />
            {post.comment_count}
          </span>
          <span className={s.above}>
            <UpvoteButton
              postId={post.id}
              initialVoted={post.voted}
              initialCount={post.vote_count}
              isLoggedIn={isLoggedIn}
              variant="pill"
            />
          </span>
        </span>
      </div>
    </article>
  );
}
