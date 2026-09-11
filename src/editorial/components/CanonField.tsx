import { useId, useState, type ReactNode } from 'react';

/**
 * One field of a record: read until somebody edits it, or hands it to an agent.
 *
 * This existed three times. Geography and Timeline each declared their own
 * `Field`, byte for byte the same apart from the id prefix on the label, and
 * Societies was about to be the third. Nothing was different on purpose; the
 * copies had simply drifted -- one used four rows, the other five -- and
 * nothing would ever bring them back together.
 *
 * TWO SHAPES, BECAUSE A FIELD IS TWO DIFFERENT THINGS
 * Empty, it is a prompt: the label, the hint saying what would go here, and a
 * way to write it. That row reads well and stays as it was.
 *
 * Written, it is a paragraph that can run to a dozen lines, and squeezing that
 * into the middle column of a three-column row gave it about half the pane and
 * made it the tallest thing on the page. So a written field keeps the prompt
 * row -- the hint stays, as a reminder of what the field is FOR -- and the text
 * gets its own row underneath, the full width of the record. And it folds,
 * under its label, because a record with five long fields is a record nobody
 * can find the fifth field in. Folded, it still shows its first line: a closed
 * field that hides what it holds reads as an empty one.
 */

/**
 * What a field looks like around its content. Shared by the prose and list
 * shapes so the fold, the prompt row and the actions cannot drift between
 * them -- which is the whole reason this file exists.
 */
function FieldShell({
  label, hint, written, drafting, editing, onEdit, onCollaborate, editor, display, preview, alone,
}: {
  /**
   * The only field in its section. The section's head already carries a
   * Collaborate and a fold for exactly this field, so the field does not
   * repeat them: two controls that do the same thing, one row apart, is a
   * question the reader should not have to answer.
   */
  alone?: boolean;
  label: string;
  hint: string;
  written: boolean;
  drafting: boolean;
  editing: boolean;
  onEdit: () => void;
  onCollaborate: () => void;
  editor: ReactNode;
  display: ReactNode;
  /** One line of what the field holds, for when it is folded. */
  preview: string;
}) {
  const [folded, setFolded] = useState(false);
  const bodyId = useId();

  return (
    <section className={`editorial-placefield${written ? ' editorial-placefield--written' : ''}`}>
      <div className="editorial-placefield__head">
        <h3 className="editorial-placefield__label">
          {written && !editing && !alone ? (
            // An inline text control, so it carries the link role the button
            // vocabulary requires, restyled back to a label. The heading stays
            // a heading; the control sits inside it rather than replacing it.
            <button
              type="button"
              className="editorial-link editorial-placefield__toggle"
              aria-expanded={!folded}
              aria-controls={bodyId}
              onClick={() => setFolded((f) => !f)}
            >
              {label}
            </button>
          ) : label}
        </h3>
        {!editing && (
          <span className="editorial-placefield__actions">
            <button type="button" className="editorial-link" onClick={onEdit}>
              {written ? 'Edit' : 'Write'}
            </button>
            {/* A greyed control says "you cannot" and leaves you to work out
                why. The reason is more useful than the button. */}
            {alone ? null : drafting ? (
              <span className="editorial-field__drafting">Drafting…</span>
            ) : (
              <button type="button" className="editorial-link" onClick={onCollaborate}>
                Collaborate
              </button>
            )}
          </span>
        )}
      </div>

      {/* The hint, in both shapes: standing in for the text when there is
          none, and beside the label as a reminder when there is. */}
      {!editing && (
        <p className={written ? 'editorial-placefield__guide' : 'editorial-placefield__absent'}>
          {hint}
        </p>
      )}

      {editing ? editor : written && (folded ? (
        <p id={bodyId} className="editorial-placefield__preview">{preview}</p>
      ) : (
        <div id={bodyId} className="editorial-placefield__body">{display}</div>
      ))}
    </section>
  );
}

export function CanonField({
  name, label, hint, value, rows = 5, onSave, onCollaborate, drafting, render, alone,
}: {
  alone?: boolean;
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
  /**
   * How the text is drawn once written. The cast marks a search term inside
   * the prose it matched; every other surface draws the text as it is.
   */
  render?: (value: string) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const id = `${name}-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const written = Boolean(value.trim());

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
    <FieldShell
      alone={alone}
      label={label}
      hint={hint}
      written={written}
      drafting={drafting}
      editing={editing}
      onEdit={() => { setDraft(value); setEditing(true); }}
      onCollaborate={onCollaborate}
      preview={value.replace(/\s+/g, ' ').trim()}
      display={(
        <p className="editorial-placefield__prose">{render ? render(value) : value}</p>
      )}
      editor={(
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
      )}
    />
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
  name, label, hint, values, onSave, onCollaborate, drafting, ordered, alone,
}: {
  alone?: boolean;
  name: string;
  label: string;
  hint: string;
  values: string[];
  /** Numbered, because the position of each entry is part of what it says. */
  ordered?: boolean;
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
    <FieldShell
      alone={alone}
      label={label}
      hint={hint}
      written={values.length > 0}
      drafting={drafting}
      editing={editing}
      onEdit={() => { setDraft(values.join('\n')); setEditing(true); }}
      onCollaborate={onCollaborate}
      preview={values.join(' · ')}
      display={ordered ? (
        <ol className="editorial-aims editorial-aims--ordered">
          {values.map((v, i) => <li className="editorial-aims__item" key={`${i}-${v}`}>{v}</li>)}
        </ol>
      ) : (
        <ul className="editorial-aims">
          {values.map((v, i) => <li className="editorial-aims__item" key={`${i}-${v}`}>{v}</li>)}
        </ul>
      )}
      editor={(
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
      )}
    />
  );
}
