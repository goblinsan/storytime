import { useState } from 'react';
import { editorialApi, type CanonRequest } from '../api';

/**
 * What an agent proposed, and the three things you can do about it.
 *
 * Five surfaces rendered this block and every one of them offered two:
 * put it in force, or refuse. Refusing throws the work away and tells whoever
 * wrote it nothing, so the only way to get a different answer was to ask again
 * from scratch and hope -- and the same objection came back, because nothing
 * had carried the objection.
 *
 * The cast has had the third one all along. `reviseCanonRequest` hands the
 * agent back its own proposal along with what was wrong with it, so the next
 * pass is a revision rather than a fresh guess. It was written once, on one
 * surface, and four later surfaces copied the two-button block beside it
 * without it.
 */
export default function Proposal({
  request, labelFor, orderedKeys, onAccept, onChanged, onSaid,
}: {
  request: CanonRequest;
  /** A field's key as the record's own reader would see it. */
  labelFor: (key: string) => string;
  /**
   * Keys whose lists are sequences -- an arc's beats -- and so are proposed
   * as numbered lists. Every other list is proposed as a plain one.
   */
  orderedKeys?: string[];
  /** Put the proposed fields into the record. */
  onAccept: (proposed: Record<string, string | string[]>) => Promise<void>;
  onChanged: () => void;
  onSaid: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [revising, setRevising] = useState(false);
  const [note, setNote] = useState('');

  const proposed = (request.payload as {
    proposed?: Record<string, string | string[]>;
  }).proposed ?? {};

  return (
    <article className="editorial-placeproposal">
      <dl className="editorial-placeproposal__fields">
        {Object.entries(proposed).map(([key, value]) => (
          <div key={key}>
            <dt>{labelFor(key)}</dt>
            {/* A list is proposed as a list. Joined with dots, sixteen beats
                became one 4,000-character paragraph -- the shape they were
                meant to replace -- and "Put it in force" asked you to accept
                something you could not read as beats. */}
            <dd>
              {Array.isArray(value) ? (
                orderedKeys?.includes(key) ? (
                  <ol className="editorial-placeproposal__list editorial-placeproposal__list--ordered">
                    {value.map((v, i) => <li key={`${i}-${v}`}>{v}</li>)}
                  </ol>
                ) : (
                  <ul className="editorial-placeproposal__list">
                    {value.map((v, i) => <li key={`${i}-${v}`}>{v}</li>)}
                  </ul>
                )
              ) : value}
            </dd>
          </div>
        ))}
      </dl>

      {revising ? (
        <div className="editorial-drawn__revise">
          <label className="editorial-drawn__label" htmlFor={`revise-${request.id}`}>
            {'What is wrong with it? The agent is sent this proposal back along with '
              + 'what you say, so the next pass answers you rather than guessing again.'}
          </label>
          <textarea
            id={`revise-${request.id}`}
            className="editorial-field__input"
            rows={3}
            value={note}
            autoFocus
            placeholder="Too grand. They are a small operation and should sound like one."
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setRevising(false); }}
          />
          <div className="editorial-field__actions">
            <button
              type="button"
              className="editorial-button editorial-button--secondary"
              disabled={busy || !note.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await editorialApi.reviseCanonRequest(request, note.trim());
                  setRevising(false);
                  setNote('');
                  onSaid('Asked again, with what you said. The next pass arrives here.');
                  onChanged();
                } catch (e) {
                  onSaid(`Not asked: ${e instanceof Error ? e.message : String(e)}`);
                } finally { setBusy(false); }
              }}
            >
              {busy ? 'Asking…' : 'Ask again'}
            </button>
            <button type="button" className="editorial-link" onClick={() => setRevising(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="editorial-field__actions">
          <button
            type="button"
            className="editorial-button editorial-button--secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onAccept(proposed);
                await editorialApi.resolveCanonRequest(request.id, 'accepted');
                onSaid('Put in force.');
                onChanged();
              } catch (e) {
                onSaid(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
              } finally { setBusy(false); }
            }}
          >
            Put it in force
          </button>
          {/* Between keeping it and throwing it away. Refusing is the only
              other answer this block used to have, and it is the one that
              loses the work AND the reason. */}
          <button type="button" className="editorial-link" onClick={() => setRevising(true)}>
            Ask for a revision
          </button>
          <button
            type="button"
            className="editorial-link editorial-link--discard"
            disabled={busy}
            onClick={async () => {
              await editorialApi.resolveCanonRequest(request.id, 'rejected');
              onChanged();
            }}
          >
            Refuse
          </button>
        </div>
      )}
    </article>
  );
}
