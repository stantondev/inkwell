import s from "./roadmap.module.css";
import { monthLabel, type RoadmapSummary } from "./roadmap-shared";

export const EMPTY_SUMMARY: RoadmapSummary = {
  open: 0,
  shipped: 0,
  declined: 0,
  by_status: {},
  contributors: 0,
  since: null,
  shipped_by_month: [],
};

/** The last `n` months up to now, filled in where nothing shipped. */
function recentMonths(byMonth: { month: string; count: number }[], n: number) {
  const counts = new Map(byMonth.map((m) => [m.month, m.count]));
  const now = new Date();
  const out: { month: string; count: number }[] = [];
  const first = byMonth[0]?.month;
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (first && key < first) continue;
    out.push({ month: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

/** The ruled card in the roadmap masthead: the numbers and a shipped-each-month chart. */
export function RoadmapLedger({ summary }: { summary: RoadmapSummary }) {
  const months = recentMonths(summary.shipped_by_month, 10);
  const maxMonth = Math.max(1, ...months.map((m) => m.count));
  const thisMonth = months[months.length - 1]?.count ?? 0;

  return (
    <div className={s.ledger}>
      <div className={s.ledgerStats}>
        <div className={s.stat}>
          <div className={s.statNum}>{summary.open}</div>
          <div className={s.statLabel}>open now</div>
        </div>
        <div className={s.stat}>
          <div className={s.statNum}>{summary.shipped}</div>
          <div className={s.statLabel}>shipped</div>
        </div>
        <div className={s.stat}>
          <div className={s.statNum}>{summary.contributors}</div>
          <div className={s.statLabel}>people have asked for something</div>
        </div>
      </div>
      {months.length > 1 && (
        <figure style={{ margin: 0 }}>
          <figcaption className={s.chartTitle}>
            <span>Shipped each month</span>
            <span>{thisMonth} so far this month</span>
          </figcaption>
          <div
            className={s.bars}
            role="img"
            aria-label={`Shipped each month: ${months.map((m) => `${monthLabel(m.month, true)} ${m.count}`).join(", ")}`}
          >
            {months.map((m) => (
              <div key={m.month} className={s.barCol} title={`${monthLabel(m.month, true)}: ${m.count} shipped`}>
                <span className={s.barCount}>{m.count || ""}</span>
                <span className={s.bar} style={{ height: `${Math.max(3, (m.count / maxMonth) * 46)}px` }} />
              </div>
            ))}
          </div>
          <div className={s.barMonths} aria-hidden="true">
            {months.map((m) => (
              <span key={m.month}>{monthLabel(m.month)}</span>
            ))}
          </div>
        </figure>
      )}
    </div>
  );
}
