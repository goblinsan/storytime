import { useMemo, useState } from 'react';
import { useEncyclopedia } from '../useEncyclopedia';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { CanonRowItem, ProtectedBadge } from '../components/CanonRows';
import { isProtected, text } from '../canonFields';
import type { CanonRow } from '../api';

/** Narrative importance, as the characters table records it. */
const IMPORTANCE = ['principal', 'supporting', 'minor'] as const;
type Importance = (typeof IMPORTANCE)[number] | 'unranked';

function importanceOf(row: CanonRow): Importance {
  const raw = text(row, 'narrativeImportance', 'narrative_importance', 'importance').toLowerCase();
  return (IMPORTANCE as readonly string[]).includes(raw) ? (raw as Importance) : 'unranked';
}

export default function Characters() {
  const { status, data, error, retry } = useEncyclopedia();
  const [tier, setTier] = useState<Importance | 'all'>('all');

  const cast = useMemo(() => {
    const rows = data?.catalog.characters ?? [];
    const filtered = tier === 'all' ? rows : rows.filter((r) => importanceOf(r) === tier);
    // Principals first, then alphabetical, so triage reads top-down.
    const rank = (r: CanonRow) => IMPORTANCE.indexOf(importanceOf(r) as never);
    return [...filtered].sort((a, b) =>
      (rank(a) < 0 ? 99 : rank(a)) - (rank(b) < 0 ? 99 : rank(b))
      || text(a, 'name').localeCompare(text(b, 'name')));
  }, [data, tier]);

  if (status === 'loading') {
    return <Surface name="characters"><LoadingState label="Reading the cast…" /></Surface>;
  }
  if (status === 'error') {
    return (
      <Surface name="characters">
        <ErrorState title="Could not load characters" error={error} onRetry={retry} />
      </Surface>
    );
  }

  return (
    <Surface name="characters">
      <div className="editorial-section-header">
        <h1 className="editorial-section-title">Characters</h1>
        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="cast-tier">Importance</label>
          <select id="cast-tier" value={tier} onChange={(e) => setTier(e.target.value as typeof tier)}>
            <option value="all">All</option>
            {IMPORTANCE.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value="unranked">Unranked</option>
          </select>
        </div>
      </div>

      {cast.length === 0 ? (
        <EmptyState
          title={tier === 'all' ? 'No characters yet' : `No ${tier} characters`}
          description={tier === 'all'
            ? 'Characters authored or generated for this universe will appear here.'
            : 'Try another importance tier, or All.'}
        />
      ) : (
        <div className="editorial-scanning-list">
          {cast.map((row) => (
            <CanonRowItem
              key={String(row.id)}
              title={text(row, 'name') || 'Unnamed'}
              detail={text(row, 'role', 'description').slice(0, 200)}
              badge={<ProtectedBadge on={isProtected(row)} />}
              meta={[
                importanceOf(row) !== 'unranked' ? importanceOf(row) : null,
                text(row, 'motivation') ? `motivation: ${text(row, 'motivation').slice(0, 90)}` : null,
                row.isSharedVariant === true ? 'shared variant' : null,
              ].filter(Boolean).join(' · ') || undefined}
            />
          ))}
        </div>
      )}
    </Surface>
  );
}
