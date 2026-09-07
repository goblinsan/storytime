import { useState } from 'react';
import { Link } from 'react-router-dom';
import { editorialApi } from '../api';
import type { CanonRequest, CanonRow } from '../api';
import { CANON_FIELDS } from '../canonFields';
import { universeSectionPath } from '../paths';
import { useAsync } from '../useAsync';

/**
 * Everything waiting to be let into canon, in one place.
 *
 * A proposal already shows on the record it belongs to, which is where it is
 * best judged -- against the prose above it. But that only works if you are
 * already looking at that character, and nothing told you there was anything to
 * look at. Sixty-six records is too many to check one at a time to find the two
 * that have something pending.
 *
 * So the same proposals are gathered here as a batch. Not a different review:
 * the same rows, the same accept, the same reject, reached from the other end.
 */
export function ProposedChanges({ universeId }: { universeId: string }) {
  const requests = useAsync(
    (signal) => editorialApi.listCanonRequests(universeId, signal), [universeId],
  );
  const cast = useAsync(
    (signal) => editorialApi.listCharacters(universeId, signal), [universeId],
  );
  const [busy, setBusy] = useState<string | null>(null);

  const rows = requests.data ?? [];
  if (requests.status === 'loading' || rows.length === 0) return null;

  const byId = new Map((cast.data ?? []).map((c: CanonRow) => [String(c.id), c]));
  const drafted = rows.filter((r) => r.payload?.proposed);
  const waiting = rows.filter((r) => !r.payload?.proposed);

  const nameOf = (row: CanonRequest) =>
    String(byId.get(String(row.payload?.characterId))?.name ?? row.payload?.characterId ?? 'someone');

  const settle = async (row: CanonRequest, accept: boolean) => {
    setBusy(row.id);
    try {
      if (accept && row.payload.proposed) {
        await editorialApi.updateCharacter(String(row.payload.characterId), row.payload.proposed);
      }
      await editorialApi.resolveCanonRequest(row.id, accept ? 'accepted' : 'rejected');
      requests.retry();
      cast.retry();
    } finally { setBusy(null); }
  };

  return (
    <section className="editorial-band">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title">Proposed changes</h2>
        <p className="editorial-section-note">
          {drafted.length > 0 && `${drafted.length} waiting to be read`}
          {drafted.length > 0 && waiting.length > 0 && ', '}
          {waiting.length > 0 && `${waiting.length} asked for and not yet drafted`}
          .
        </p>
      </div>

      {drafted.map((row) => (
        <article className="editorial-proposal" key={row.id}>
          <h3 className="editorial-proposal__who">
            <Link to={`${universeSectionPath(universeId, 'characters')}?cast=all&who=${encodeURIComponent(String(row.payload.characterId))}`}>
              {nameOf(row)}
            </Link>
          </h3>
          {/* In reading order, so a batch reads the same way a record does. */}
          {CANON_FIELDS.filter((spec) => row.payload.proposed?.[spec.key] !== undefined).map((spec) => {
            const value = row.payload.proposed![spec.key];
            return (
              <div className="editorial-proposal__field" key={spec.key}>
                <h4 className="editorial-record__label">{spec.label}</h4>
                <p className="editorial-record__prose">
                  {Array.isArray(value) ? value.join(', ') : value}
                </p>
              </div>
            );
          })}
          <div className="editorial-field__actions">
            <button
              type="button"
              className="editorial-button editorial-button--secondary"
              disabled={busy === row.id}
              onClick={() => settle(row, true)}
            >
              {busy === row.id ? 'Working…' : 'Accept into canon'}
            </button>
            <button
              type="button"
              className="editorial-link"
              disabled={busy === row.id}
              onClick={() => settle(row, false)}
            >
              Reject
            </button>
          </div>
        </article>
      ))}

      {waiting.length > 0 && (
        <p className="editorial-record__prose editorial-proposal__waiting">
          Asked for, nothing drafted yet:{' '}
          {waiting.map((row, i) => (
            <span key={row.id}>
              {i > 0 && ', '}
              <Link to={`${universeSectionPath(universeId, 'characters')}?cast=all&who=${encodeURIComponent(String(row.payload.characterId))}`}>
                {nameOf(row)}
              </Link>
              {' '}({(row.payload.fields ?? []).length})
            </span>
          ))}
          .
        </p>
      )}
    </section>
  );
}
