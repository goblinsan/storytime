import { useState } from 'react';
import { editorialApi } from '../api';
import type { CanonRequest, CanonRow } from '../api';
import { CANON_FIELDS, gapsIn, isEmpty, readField, type FieldSpec } from '../canonFields';

/**
 * What the canon records about a person, including what it does not.
 *
 * The panel used to render only the fields that had something in them, which
 * on this universe meant prose and nothing else: motivation was written for
 * three characters in sixty-six, tendencies for none. A record that hides its
 * own gaps looks finished, and the reason none of it was filled in is that
 * nothing ever said it was missing.
 *
 * So absence is rendered, every field can be written in place, and every field
 * can be handed to an agent instead -- for the whole record, or for one section
 * at a time. Collaborating on a section that already says something is a
 * revision rather than a replacement: the agent is shown the current text, and
 * what comes back is shown against what it would displace, because a proposal
 * you cannot compare is a proposal you cannot judge.
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

const show = (value: string | string[]) => (Array.isArray(value) ? value.join(', ') : value);

/**
 * Asking somebody to work on this. Used beside the name for the whole record
 * and beside each Edit for one section, so the scope of the ask is the scope of
 * the control that was pressed and there is one definition of what it does.
 */
export function CollaborateButton({
  universeId, personId, fields, label, onAsked, subtle = false,
}: {
  universeId: string;
  personId: string;
  fields: string[];
  label: string;
  onAsked: () => void;
  /** A link beside a heading rather than a button in its own right. */
  subtle?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className={subtle ? 'editorial-link editorial-field__edit' : 'editorial-button editorial-button--secondary'}
        disabled={asking || fields.length === 0}
        onClick={async () => {
          setAsking(true);
          setFailed(null);
          try {
            await editorialApi.askForCanon(universeId, personId, fields);
            onAsked();
          } catch (error) {
            // Said out loud: a failed ask used to look exactly like a good one.
            setFailed(error instanceof Error ? error.message : String(error));
          } finally { setAsking(false); }
        }}
      >
        {asking ? 'Asking…' : label}
      </button>
      {failed && <span className="editorial-field__failed" role="alert">Not asked: {failed}</span>}
    </>
  );
}

/** One proposal, against whatever it would displace. */
function Proposal({
  person, request, onSaved, onAsked,
}: {
  person: CanonRow; request: CanonRequest; onSaved: () => void; onAsked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [directing, setDirecting] = useState(false);
  const [note, setNote] = useState('');
  const proposed = request.payload.proposed ?? {};
  const fields = CANON_FIELDS.filter((spec) => proposed[spec.key] !== undefined);

  const settle = async (accept: boolean) => {
    setBusy(true);
    try {
      if (accept) await editorialApi.updateCharacter(String(person.id), proposed);
      await editorialApi.resolveCanonRequest(request.id, accept ? 'accepted' : 'rejected');
      if (accept) onSaved();
      onAsked();
    } finally { setBusy(false); }
  };

  return (
    <div className="editorial-record__proposal">
      <h4 className="editorial-record__label">Drafted, not yet canon</h4>
      {fields.map((spec) => {
        const had = show(readField(person, spec));
        return (
          <div key={spec.key}>
            <h5 className="editorial-record__label">{spec.label}</h5>
            {had && (
              <p className="editorial-record__prose editorial-record__was">
                <span className="editorial-record__side">Now</span>
                {had}
              </p>
            )}
            <p className="editorial-record__prose">
              {had && <span className="editorial-record__side">Proposed</span>}
              {show(proposed[spec.key])}
            </p>
          </div>
        );
      })}
      {/* Reject was the only way to say no, which is not a collaboration --
          it throws away the attempt and tells whoever wrote it nothing. Saying
          what is wrong sends the draft back with that note and the attempt
          attached, so the next pass is a revision rather than a fresh guess. */}
      {directing ? (
        <div className="editorial-field__editor">
          <label className="editorial-field__hint" htmlFor={`revise-${request.id}`}>
            What is wrong with it, or what you want instead.
          </label>
          <textarea
            id={`revise-${request.id}`}
            className="editorial-field__input"
            rows={3}
            value={note}
            autoFocus
            placeholder="Too generic — tie it to the ghost transmission, and drop the invented dates."
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setDirecting(false); }}
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
                  setDirecting(false);
                  setNote('');
                  onAsked();
                } finally { setBusy(false); }
              }}
            >
              {busy ? 'Sending…' : 'Send it back'}
            </button>
            <button type="button" className="editorial-link" onClick={() => setDirecting(false)}>
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
            onClick={() => settle(true)}
          >
            {busy ? 'Working…' : 'Accept into canon'}
          </button>
          <button type="button" className="editorial-link" disabled={busy} onClick={() => setDirecting(true)}>
            Ask for a revision
          </button>
          <button type="button" className="editorial-link" disabled={busy} onClick={() => settle(false)}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

export function RecordFields({
  person, term, marked, onSaved, universeId, requests, onAsked,
}: {
  person: CanonRow;
  term: string;
  /** The record's own highlighter, so a search term still marks inside prose. */
  marked: (text: string) => React.ReactNode;
  onSaved: () => void;
  universeId: string;
  /** Every outstanding request for this person: one per collaboration. */
  requests: CanonRequest[];
  onAsked: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  void term;

  const written = CANON_FIELDS.filter((spec) => !isEmpty(person, spec));
  const gaps = gapsIn(person);
  const answered = requests.filter((r) => r.payload?.proposed);
  const pending = requests.filter((r) => !r.payload?.proposed);
  /** Fields somebody is already thinking about, so they are not asked twice. */
  const claimed = new Set(pending.flatMap((r) => r.payload?.fields ?? []));



  return (
    <>
      {answered.map((request) => (
        <Proposal key={request.id} person={person} request={request} onSaved={onSaved} onAsked={onAsked} />
      ))}

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
              <CollaborateButton
                universeId={universeId}
                personId={String(person.id)}
                fields={claimed.has(spec.key) ? [] : [spec.key]}
                label="Collaborate"
                onAsked={onAsked}
                subtle
              />
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
                  <button type="button" className="editorial-link" onClick={() => setEditing(spec.key)}>
                    {spec.label}
                  </button>
                </span>
              ))}
              . Write any of them, or collaborate above.
            </p>
          )}
        </section>
      )}

      {pending.length > 0 && (
        <p className="editorial-record__prose editorial-record__pending">
          Asked for:{' '}
          {[...claimed].map((f) => CANON_FIELDS.find((spec) => spec.key === f)?.label ?? f).join(', ')}.
          {' '}A draft will appear here to read, and nothing changes until you accept it.{' '}
          <button
            type="button"
            className="editorial-link"
            onClick={async () => {
              for (const row of pending) {
                await editorialApi.resolveCanonRequest(row.id, 'rejected');
              }
              onAsked();
            }}
          >
            Withdraw
          </button>
        </p>
      )}
    </>
  );
}
