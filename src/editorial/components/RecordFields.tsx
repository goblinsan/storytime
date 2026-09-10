import { useState } from 'react';
import { editorialApi } from '../api';
import { IMAGE_REQUEST } from '../api';
import type { CanonRequest, CanonRow } from '../api';
import { CANON_FIELDS, CANON_PARTS, gapsIn, isEmpty, readField, text, type FieldSpec } from '../canonFields';
import { Section } from './RecordSections';

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
  universeId, personId, fields, label, onAsked, subtle = false, drafting = false,
}: {
  universeId: string;
  personId: string;
  fields: string[];
  label: string;
  onAsked: () => void;
  /** A link beside a heading rather than a button in its own right. */
  subtle?: boolean;
  /** Something is already being written for this. */
  drafting?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // A greyed-out control says "you cannot" and leaves you to work out why. The
  // reason is more useful than the button, so it takes its place.
  if (drafting) return <span className="editorial-field__drafting">Drafting…</span>;

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

/**
 * Asking for pictures of somebody, in the style the active work asked for.
 *
 * Separate from Collaborate because they answer different questions -- one is
 * about what the canon says, the other about what somebody looks like -- and
 * because drawing takes the better part of a minute, which is worth saying
 * rather than leaving as a dead control.
 */
export function IllustrateButton({
  universeId, personId, onAsked, drawing, fromAppearance,
}: {
  universeId: string; personId: string; onAsked: () => void; drawing: boolean;
  /** Whether Appearance is written. When it is not, the drawing uses History. */
  fromAppearance: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  if (drawing) return <span className="editorial-field__drafting">Drawing…</span>;

  // Not disabled when Appearance is missing: greying it out would say "you
  // cannot" and leave somebody to work out why, two thousand pixels below the
  // button. The label says which field it will draw from instead, because that
  // is the one thing worth knowing before spending a minute of somebody's GPU
  // -- and a portrait drawn from a history comes back as the siege rather than
  // the face.
  const label = fromAppearance ? 'Illustrate' : 'Illustrate from History';

  return (
    <>
      <button
        type="button"
        className="editorial-button editorial-button--secondary"
        title={fromAppearance
          ? 'Drawn from Appearance, in the active work\'s style.'
          : 'Appearance is not recorded, so this draws from History. Write Appearance for a closer likeness.'}
        disabled={asking}
        onClick={async () => {
          setAsking(true);
          setFailed(null);
          try {
            await editorialApi.askForImages(universeId, personId);
            onAsked();
          } catch (error) {
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

/**
 * Pictures, before any of them is a reference image.
 *
 * A batch is previews to choose between, which is why keeping one is a click on
 * that one rather than a single Accept: the others were never candidates for
 * the record, they were candidates for the choice. Asking again with a note is
 * the same revision loop the prose uses, and worth having for the same reason:
 * "not this" tells whoever drew it nothing.
 */
function ImageProposal({
  person, request, universeId, onSaved, onAsked,
}: {
  person: CanonRow; request: CanonRequest; universeId: string;
  onSaved: () => void; onAsked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [directing, setDirecting] = useState(false);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const images = (request.payload.proposed?.images ?? []) as string[];

  return (
    <div className="editorial-record__proposal">
      <h4 className="editorial-record__label">Drawn, not yet kept</h4>
      <div className="editorial-previews">
        {images.map((url, i) => (
          <figure className="editorial-preview" key={url}>
            <img
              className="editorial-preview__image"
              src={url}
              // What it is a picture of, which is the only thing a reader who
              // cannot see it needs. "Preview 1" describes its position in a
              // row they are not looking at.
              alt={`${text(person, 'name')}, drawn (${i + 1} of ${images.length})`}
              loading="lazy"
            />
            <figcaption>
              <button
                type="button"
                className="editorial-button editorial-button--secondary"
                aria-label={`Keep drawing ${i + 1} of ${images.length} as the reference for ${text(person, 'name')}`}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setFailed(null);
                  // Keeping copies the bytes onto storage, so it can fail on a
                  // machine being unreachable. The request stays open when it
                  // does: a preview nobody managed to keep is still a preview
                  // to choose from.
                  let kept;
                  try {
                    kept = await editorialApi.keepImage(
                      universeId, String(person.id), url, `${text(person, 'name')} reference`,
                    );
                  } catch (error) {
                    setFailed(`Not kept: ${error instanceof Error ? error.message : String(error)}`);
                    setBusy(false);
                    return;
                  }
                  // Past here the picture IS kept, so nothing may say it was
                  // not. The two calls are separate failures and used to share
                  // one message, which meant a resolve that failed reported
                  // "Not kept" about an image sitting safely in the catalog.
                  try {
                    await editorialApi.resolveCanonRequest(request.id, 'accepted');
                  } catch (error) {
                    setFailed(`Kept, but the request is still open: ${
                      error instanceof Error ? error.message : String(error)}`);
                    setBusy(false);
                    onSaved();
                    return;
                  }
                  if (!kept.stored) {
                    // The server says the bytes were not copied. Saying so is
                    // the whole reason it answers with `stored`: the difference
                    // is invisible until the render machine clears its output
                    // folder and the portrait becomes a broken image.
                    setFailed('Kept, but not copied to storage. It still lives only on the '
                      + 'machine that drew it, and will go when that clears.');
                  }
                  setBusy(false);
                  onSaved();
                  onAsked();
                }}
              >
                Keep this one
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
      {failed && <span className="editorial-field__failed" role="alert">{failed}</span>}

      {directing ? (
        <div className="editorial-field__editor">
          <label className="editorial-field__hint" htmlFor={`redraw-${request.id}`}>
            What to change. The style comes from the work; this is about the subject.
          </label>
          <textarea
            id={`redraw-${request.id}`}
            className="editorial-field__input"
            rows={3}
            value={note}
            autoFocus
            placeholder="Older than the last one. Plainer clothes. No weapon."
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
                setFailed(null);
                try {
                  await editorialApi.resolveCanonRequest(request.id, 'rejected');
                  await editorialApi.askForImages(universeId, String(person.id), note.trim());
                  setDirecting(false);
                  setNote('');
                  onAsked();
                } catch (error) {
                  // This throws the current batch away before asking for the
                  // next one, so failing silently loses the previews and leaves
                  // the note sitting in a box that looks like it did nothing.
                  setFailed(`Not asked: ${error instanceof Error ? error.message : String(error)}`);
                } finally { setBusy(false); }
              }}
            >
              {busy ? 'Asking…' : 'Draw it again'}
            </button>
            <button type="button" className="editorial-link" onClick={() => setDirecting(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="editorial-field__actions">
          <button type="button" className="editorial-link" disabled={busy} onClick={() => setDirecting(true)}>
            Ask for a revision
          </button>
          <button
            type="button"
            className="editorial-link editorial-link--discard"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setFailed(null);
              try {
                await editorialApi.resolveCanonRequest(request.id, 'rejected');
                onAsked();
              } catch (error) {
                setFailed(`Not discarded: ${error instanceof Error ? error.message : String(error)}`);
              } finally { setBusy(false); }
            }}
          >
            {`Discard ${images.length === 1 ? 'it' : `all ${images.length}`}`}
          </button>
        </div>
      )}
    </div>
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
  const [failed, setFailed] = useState<string | null>(null);
  const proposed = request.payload.proposed ?? {};
  const fields = CANON_FIELDS.filter((spec) => proposed[spec.key] !== undefined);

  const settle = async (accept: boolean) => {
    setBusy(true);
    setFailed(null);
    try {
      if (accept) await editorialApi.updateCharacter(String(person.id), proposed);
      await editorialApi.resolveCanonRequest(request.id, accept ? 'accepted' : 'rejected');
      if (accept) onSaved();
      onAsked();
    } catch (error) {
      // Accepting writes canon and then closes the request. Either can fail,
      // and silence here reads as a click that did nothing -- which is exactly
      // what it looks like when the write went through and the close did not.
      setFailed(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  };

  return (
    <div className="editorial-record__proposal">
      <h4 className="editorial-record__label">Drafted, not yet canon</h4>
      {fields.map((spec) => {
        const had = show(readField(person, spec));
        return (
          <div className="editorial-proposal__pair" key={spec.key}>
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
                } catch (error) {
                  setFailed(`Not sent: ${error instanceof Error ? error.message : String(error)}`);
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
          <button
            type="button"
            className="editorial-link editorial-link--discard"
            disabled={busy}
            onClick={() => settle(false)}
          >
            Discard it
          </button>
        </div>
      )}
      {failed && <span className="editorial-field__failed" role="alert">{failed}</span>}
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
  const drawing = pending.some((r) => r.artifactType === IMAGE_REQUEST);



  return (
    <>
      {answered.map((request) => (request.artifactType === IMAGE_REQUEST ? (
        <ImageProposal
          key={request.id}
          person={person}
          request={request}
          universeId={universeId}
          onSaved={onSaved}
          onAsked={onAsked}
        />
      ) : (
        <Proposal key={request.id} person={person} request={request} onSaved={onSaved} onAsked={onAsked} />
      )))}

      {/* The same parts every other record folds into, and always all of
          them. What is missing sits inside the part it belongs to rather than
          in one bucket at the end: a reader looking at "What they can do" is
          owed the answer that nobody has written it, in the place they looked.
          A part is open when it holds something and folds to a single line
          when it does not, which is the rule on every other surface. */}
      {CANON_PARTS.map((part) => {
        const inPart = (spec: FieldSpec) => part.keys.includes(spec.key);
        const here = written.filter(inPart);
        const missing = gaps.filter(inPart);
        const beingWritten = missing.find((g) => g.key === editing);
        return (
          <Section
            key={`${person.id}-${part.title}`}
            title={part.title}
            written={here.length}
            total={part.keys.length}
          >
            {here.map((spec) => {
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
                      fields={[spec.key]}
                      label="Collaborate"
                      onAsked={onAsked}
                      subtle
                      drafting={claimed.has(spec.key)}
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

            {missing.length > 0 && (
              <section className="editorial-record__section editorial-record__gaps">
                {beingWritten ? (
                  <Editor
                    person={person}
                    spec={beingWritten}
                    onDone={() => setEditing(null)}
                    onSaved={onSaved}
                  />
                ) : (
                  /* Each gap says what would go in it. The list used to be
                     labels alone, which is fine until two of them are
                     near-synonyms: a reader looking at "Appearance" under a
                     paragraph that is nothing but appearance concludes the app
                     is broken rather than that the physical facts are filed
                     under Bearing. The hint was written already; it was only
                     ever shown inside the editor, which is after the decision
                     rather than before it. */
                  <dl className="editorial-record__gaplist">
                    {missing.map((spec) => (
                      <div className="editorial-record__gap" key={spec.key}>
                        <dt>
                          <button
                            type="button"
                            className="editorial-link"
                            onClick={() => setEditing(spec.key)}
                          >
                            {spec.label}
                          </button>
                        </dt>
                        <dd>{spec.hint}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            )}
          </Section>
        );
      })}

      {pending.length > 0 && (
        <p className="editorial-record__prose editorial-record__pending">
          {/* Two different things can be outstanding and they do not read the
              same. An image request carries no `fields`, so the list was empty
              and this said "Asked for: . A draft will appear here to read" --
              an unfinished sentence, about reading, attached to a picture. */}
          {claimed.size > 0 && (
            <>
              Asked for:{' '}
              {[...claimed].map((f) => CANON_FIELDS.find((spec) => spec.key === f)?.label ?? f).join(', ')}.
              {' '}A draft will appear here to read, and nothing changes until you accept it.{' '}
            </>
          )}
          {drawing && (
            <>
              Drawing {text(person, 'name')}. Pictures usually take about a minute, and appear
              here to choose between; nothing about the record changes until you keep one.{' '}
            </>
          )}
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
            {claimed.size > 0 ? 'Withdraw' : 'Stop waiting'}
          </button>
        </p>
      )}
    </>
  );
}
