import { useMemo } from 'react';
import { useEncyclopedia } from '../useEncyclopedia';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { ProtectedBadge } from '../components/CanonRows';
import { useOpenTarget } from '../useOpenTarget';
import { isProtected, text } from '../canonFields';
import type { CanonRow } from '../api';
import SurfaceMasthead from '../components/SurfaceMasthead';

const idsOf = (row: CanonRow, ...keys: string[]): string[] => {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        return value.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
  }
  return [];
};

interface Paradox {
  eventId: string;
  message: string;
}

/**
 * Continuity checks over the causal graph the timeline_events table records.
 * These are the paradoxes the lens is for: an edge that points at nothing, and
 * a pair of events that each claim to precede the other.
 */
function findParadoxes(events: CanonRow[]): Paradox[] {
  const byId = new Map(events.map((e) => [String(e.id), e]));
  const paradoxes: Paradox[] = [];

  for (const event of events) {
    const id = String(event.id);
    const before = idsOf(event, 'beforeEventIds', 'before_event_ids');
    const after = idsOf(event, 'afterEventIds', 'after_event_ids');

    for (const ref of [...before, ...after]) {
      if (!byId.has(ref)) {
        paradoxes.push({ eventId: id, message: `references an event that does not exist (${ref})` });
      }
    }
    for (const ref of before) {
      const other = byId.get(ref);
      if (!other) continue;
      if (idsOf(other, 'beforeEventIds', 'before_event_ids').includes(id)) {
        paradoxes.push({
          eventId: id,
          message: `and "${text(other, 'title') || ref}" each claim to come before the other`,
        });
      }
    }
  }
  return paradoxes;
}

export default function Timeline() {
  const { status, data, error, retry } = useEncyclopedia();
  const { isOpen } = useOpenTarget();

  const { events, paradoxes, eras } = useMemo(() => {
    const rows = data?.catalog.timelineEvents ?? [];
    const byEra = new Map<string, CanonRow[]>();
    for (const row of rows) {
      const era = text(row, 'date') || 'Undated';
      if (!byEra.has(era)) byEra.set(era, []);
      byEra.get(era)!.push(row);
    }
    return { events: rows, paradoxes: findParadoxes(rows), eras: [...byEra.entries()] };
  }, [data]);

  if (status === 'loading') {
    return <Surface name="timeline"><LoadingState label="Reading the chronology…" /></Surface>;
  }
  if (status === 'error') {
    return (
      <Surface name="timeline">
        <ErrorState title="Could not load the timeline" error={error} onRetry={retry} />
      </Surface>
    );
  }

  if (events.length === 0) {
    return (
      <Surface name="timeline">
        <EmptyState
          title="No events yet"
          description="Historical events recorded for this universe will appear here as era lanes, with their causal order checked for paradoxes."
        />
      </Surface>
    );
  }

  return (
    <Surface name="timeline">
      <SurfaceMasthead
        title="Timeline"
        standfirst={`${events.length} events · ${paradoxes.length} continuity `
          + `${paradoxes.length === 1 ? 'flag' : 'flags'}`}
      />

      {paradoxes.length > 0 && (
        <section className="editorial-band">
          <div className="editorial-section-header">
            <h2 className="editorial-section-title">Continuity flags</h2>
          </div>
          <div className="editorial-scanning-list">
            {paradoxes.map((p, i) => (
              <div className="editorial-concern-row editorial-concern-row--warning" key={`${p.eventId}-${i}`}>
                <span className="editorial-concern-row__severity">paradox</span>
                <span className="editorial-activity-row__time">{p.eventId}</span>
                <span className="editorial-activity-row__title">{p.message}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* The lane is the vertical rule itself -- one absolutely positioned bar for
          the whole view, not a wrapper per era. Era headings sit in the flow
          beside it and the dots hang off each event. */}
      <div className="editorial-timeline-view">
        <div className="editorial-timeline-lane" aria-hidden="true" />

        {eras.map(([era, rows]) => (
          <section key={era}>
            <div className="editorial-section-header">
              <h2 className="editorial-section-title">{era}</h2>
              <span className="editorial-activity-row__time">
                {rows.length} {rows.length === 1 ? 'event' : 'events'}
              </span>
            </div>

            {rows.map((row) => {
              const after = idsOf(row, 'afterEventIds', 'after_event_ids');
              return (
                <article
                  className="editorial-timeline-event"
                  key={String(row.id)}
                  data-open={isOpen(String(row.id)) ? 'true' : undefined}
                >
                  <span className="editorial-timeline-dot" aria-hidden="true" />
                  <span className="editorial-activity-row__title">
                    {text(row, 'title') || 'Untitled event'}
                    <ProtectedBadge on={isProtected(row)} />
                  </span>
                  {text(row, 'description') && (
                    <p className="editorial-activity-row__time">
                      {text(row, 'description').slice(0, 240)}
                    </p>
                  )}
                  {after.length > 0 && (
                    <p className="editorial-activity-row__time">
                      follows {after.length} {after.length === 1 ? 'event' : 'events'}
                    </p>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </Surface>
  );
}
