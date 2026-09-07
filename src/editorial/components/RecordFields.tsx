import { useState } from 'react';
import { editorialApi } from '../api';
import type { CanonRow } from '../api';
import { CANON_FIELDS, gapsIn, isEmpty, readField, type FieldSpec } from '../canonFields';

/**
 * What the canon records about a person, including what it does not.
 *
 * The panel used to render only the fields that had something in them, which
 * on this universe meant prose and nothing else: motivation is written for
 * three characters in sixty-six, tendencies for none, traits for two, and core
 * skills, abilities and notable moments for nobody at all. A record that hides
 * its own gaps looks finished, and the reason none of it was filled in is that
 * nothing ever said it was missing.
 *
 * So absence is rendered. The empty fields are collected into one line rather
 * than eight empty headings, because eight headings of nothing is not honesty,
 * it is noise -- and each one is a button, because the point of naming a gap is
 * to be able to close it.
 */

function Editor({
  person, spec, onDone, onSaved,
}: {
  person: CanonRow; spec: FieldSpec; onDone: () => void; onSaved: () => void;
}) {
  const current = readField(person, spec);
  const [draft, setDraft] = useState(Array.isArray(current) ? current.join(', ') : current);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setFailed(null);
    try {
      const value = spec.kind === 'list'
        ? draft.split(',').map((s) => s.trim()).filter(Boolean)
        : draft.trim();
      await editorialApi.updateCharacter(String(person.id), { [spec.key]: value });
      onSaved();
      onDone();
    } catch (error) {
      // Said here rather than thrown away: a save that fails silently is how
      // somebody loses a paragraph they just wrote.
      setFailed(error instanceof Error ? error.message : String(error));
      setSaving(false);
    }
  };

  return (
    <div className="editorial-field__editor">
      <label className="editorial-field__hint" htmlFor={`field-${spec.key}`}>{spec.hint}</label>
      <textarea
        id={`field-${spec.key}`}
        className="editorial-field__input"
        value={draft}
        rows={spec.kind === 'prose' ? 5 : 2}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onDone(); }}
      />
      <div className="editorial-field__actions">
        <button type="button" className="editorial-button editorial-button--secondary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="editorial-link" onClick={onDone}>Cancel</button>
        {failed && <span className="editorial-field__failed" role="alert">Not saved: {failed}</span>}
      </div>
    </div>
  );
}

export function RecordFields({
  person, term, marked, onSaved,
}: {
  person: CanonRow;
  term: string;
  /** The record's own highlighter, so a search term still marks inside prose. */
  marked: (text: string) => React.ReactNode;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const written = CANON_FIELDS.filter((spec) => !isEmpty(person, spec));
  const gaps = gapsIn(person);
  void term;

  return (
    <>
      {written.map((spec) => {
        const value = readField(person, spec);
        return (
          <section className="editorial-record__section" key={spec.key}>
            <h3 className="editorial-record__label">
              {spec.label}
              <button
                type="button"
                className="editorial-link editorial-field__edit"
                onClick={() => setEditing(editing === spec.key ? null : spec.key)}
              >
                {editing === spec.key ? 'Close' : 'Edit'}
              </button>
            </h3>
            {editing === spec.key ? (
              <Editor person={person} spec={spec} onDone={() => setEditing(null)} onSaved={onSaved} />
            ) : (
              <p className="editorial-record__prose">
                {Array.isArray(value) ? value.join(', ') : marked(value)}
              </p>
            )}
          </section>
        );
      })}

      {gaps.length > 0 && (
        <section className="editorial-record__section editorial-record__gaps">
          <h3 className="editorial-record__label">Not recorded</h3>
          {editing && gaps.some((g) => g.key === editing) ? (
            <Editor
              person={person}
              spec={gaps.find((g) => g.key === editing)!}
              onDone={() => setEditing(null)}
              onSaved={onSaved}
            />
          ) : (
            <p className="editorial-record__prose">
              {gaps.map((spec, i) => (
                <span key={spec.key}>
                  {i > 0 && ', '}
                  <button
                    type="button"
                    className="editorial-link"
                    onClick={() => setEditing(spec.key)}
                  >
                    {spec.label}
                  </button>
                </span>
              ))}
              .
            </p>
          )}
        </section>
      )}
    </>
  );
}
