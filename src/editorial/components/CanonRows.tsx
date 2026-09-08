import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
/**
 * One canon entity as a scanning row: name, a line of detail, and whatever
 * metadata the lens wants under it. Unframed by design -- the rebuild reads as a
 * reference work, not a wall of cards.
 */
export function CanonRowItem({
  title, detail, meta, to, badge, open,
}: {
  title: string;
  detail?: string;
  meta?: ReactNode;
  to?: string;
  badge?: ReactNode;
  /** True when `?open=` names this row, so the lens can mark it. */
  open?: boolean;
}) {
  return (
    <div className="editorial-action-row" data-open={open ? 'true' : undefined}>
      <div className="editorial-action-row__detail">
        <span className="editorial-activity-row__title">
          {to ? <Link to={to}>{title}</Link> : title}
          {badge}
        </span>
        {detail && <span className="editorial-activity-row__time">{detail}</span>}
        {meta && <span className="editorial-activity-row__time">{meta}</span>}
      </div>
    </div>
  );
}

export function ProtectedBadge({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span className="editorial-activity-row__actor" title="Protected from automated changes">
      protected
    </span>
  );
}

export function CountsBar({ counts }: { counts: Array<[string, number]> }) {
  return (
    <div className="editorial-briefing__metrics">
      {counts.map(([label, value]) => (
        <div className="editorial-briefing__metric" key={label}>
          <div className="editorial-briefing__metric-value">{value.toLocaleString()}</div>
          <div className="editorial-briefing__metric-label">{label}</div>
        </div>
      ))}
    </div>
  );
}
