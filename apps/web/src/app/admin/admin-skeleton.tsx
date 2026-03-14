export function AdminSkeletonStats() {
  return (
    <div className="admin-stat-grid">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="admin-skeleton admin-skeleton-stat" />
      ))}
    </div>
  );
}

export function AdminSkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="admin-table-wrap">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="admin-skeleton admin-skeleton-row" />
      ))}
    </div>
  );
}

export function AdminSkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="admin-skeleton admin-skeleton-card" />
      ))}
    </div>
  );
}
