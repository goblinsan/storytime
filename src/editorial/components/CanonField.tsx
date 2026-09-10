import { useState } from 'react';

/**
 * One field of a record: read until somebody edits it, or hands it to an agent.
 *
 * This existed three times. Geography and Timeline each declared their own
 * `Field`, byte for byte the same apart from the id prefix on the label, and
 * Societies was about to be the third. That is the shape of the complaint that
 * every tab looks different: nothing was different on purpose, the copies had
 * simply drifted -- one used four rows, the other five -- and nothing would
 * ever bring them back together.
 *
 * `name` distinguishes the copies on a page so `htmlFor` still points at one
 * textarea. It is the only thing a caller has to say that is about markup
 * rather than about the record.
 */
export function CanonField({
  name, label, hint, value, rows = 5, onSave, onCollaborate, drafting,
}: {
  name: string;
  label: string;
  hint: string;
  value: string;
  rows?: number;
  onSave: (next: string) => Promise<void>;
  /** Ask an agent for this one field. */
  onCollaborate: () => void;
  /** Something is already being written for it. */
  drafting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const id = `${name}-${label.replace(/\W+/g, '-').toLowerCase()}`;

  const commit = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (e) {
      setFailed(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  return (
    <section className="editorial-placefield">
      <div className="editorial-placefield__head">
        <h3 className="editorial-placefield__label">{label}</h3>
        {!editing && (
          <span className="editorial-placefield__actions">
            <button
              type="button"
              className="editorial-link"
              onClick={() => { setDraft(value); setEditing(true); }}
            >
              {value.trim() ? 'Edit' : 'Write'}
            </button>
            {/* A greyed control says "you cannot" and leaves you to work out
                why. The reason is more useful than the button. */}
            {drafting ? (
              <span className="editorial-field__drafting">Drafting…</span>
            ) : (
              <button type="button" className="editorial-link" onClick={onCollaborate}>
                Collaborate
              </button>
            )}
          </span>
        )}
      </div>

      {editing ? (
        <div className="editorial-placefield__editor">
          <label className="editorial-placefield__hint" htmlFor={id}>{hint}</label>
          <textarea
            id={id}
            className="editorial-field__input"
            rows={rows}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
          />
          <div className="editorial-field__actions">
            <button
              type="button"
              className="editorial-button editorial-button--secondary"
              disabled={busy}
              onClick={commit}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="editorial-link" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          {failed && <span className="editorial-field__failed" role="alert">{failed}</span>}
        </div>
      ) : (
        <p className={value.trim() ? 'editorial-placefield__prose' : 'editorial-placefield__absent'}>
          {value.trim() || hint}
        </p>
      )}
    </section>
  );
}

/**
 * The same field, when what it holds is a list of short things.
 *
 * One per line rather than comma-separated, because the entries here are
 * phrases -- "Enforce planetary patent debt" -- and a comma inside one of them
 * would silently split it in two.
 */
export function CanonListField({
  name, label, hint, values, onSave, onCollaborate, drafting,
}: {
  name: string;
  label: string;
  hint: string;
  values: string[];
  onSave: (next: string[]) => Promise<void>;
  onCollaborate: () => void;
  drafting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(values.join('\n'));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const id = `${name}-${label.replace(/\W+/g, '-').toLowerCase()}`;

  const commit = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await onSave(draft.split('\n').map((s) => s.trim()).filter(Boolean));
      setEditing(false);
    } catch (e) {
      setFailed(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  return (
    <section className="editorial-placefield">
      <div className="editorial-placefield__head">
        <h3 className="editorial-placefield__label">{label}</h3>
        {!editing && (
          <span className="editorial-placefield__actions">
            <button
              type="button"
              className="editorial-link"
              onClick={() => { setDraft(values.join('\n')); setEditing(true); }}
            >
              {values.length ? 'Edit' : 'Write'}
            </button>
            {drafting ? (
              <span className="editorial-field__drafting">Drafting…</span>
            ) : (
              <button type="button" className="editorial-link" onClick={onCollaborate}>
                Collaborate
              </button>
            )}
          </span>
        )}
      </div>

      {editing ? (
        <div className="editorial-placefield__editor">
          <label className="editorial-placefield__hint" htmlFor={id}>{`${hint} One per line.`}</label>
          <textarea
            id={id}
            className="editorial-field__input"
            rows={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
          />
          <div className="editorial-field__actions">
            <button
              type="button"
              className="editorial-button editorial-button--secondary"
              disabled={busy}
              onClick={commit}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="editorial-link" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          {failed && <span className="editorial-field__failed" role="alert">{failed}</span>}
        </div>
      ) : values.length ? (
        <ul className="editorial-aims">
          {values.map((v) => <li className="editorial-aims__item" key={v}>{v}</li>)}
        </ul>
      ) : (
        <p className="editorial-placefield__absent">{hint}</p>
      )}
    </section>
  );
}
