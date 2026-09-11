import { useEffect, useRef, useState } from 'react';

/**
 * Starting a record, on your own or with help.
 *
 * It began as a name field in the list column. Two things were wrong with
 * that. It sat inside the thing it adds to, so on a narrow screen it went away
 * with the list; and a name is the least of what somebody has in mind when
 * they decide a group or a creature should exist. What they have is usually a
 * sentence -- "a scavenger cult that worships the wreck" -- and a form that
 * takes only a name throws that sentence away and leaves them to retype it as
 * six separate fields afterwards.
 *
 * So it is the surface's one masthead control, and it opens a dialog offering
 * the choice geography already offers over open ground: name it yourself, or
 * say what it should be and have it written. That vocabulary is not new here.
 * It is the same two answers, in the same words, because they are the same two
 * answers.
 *
 * WHAT "HAVE IT WRITTEN" DOES
 * It creates the record, then asks for every field at once, carrying what you
 * typed as the brief. The proposals arrive in the record's own fields, with
 * the Put it in force / Refuse controls that every other proposal on every
 * other surface uses. Reviewing generated canon inside the dialog that made it
 * would be a second review interface for the thing this application already
 * does in one place.
 */
export default function NewRecord({
  label, prompt, placeholder, briefPrompt, briefPlaceholder, extra, parent,
  onCreate, onCreated, onWrite, onFailed,
}: {
  /** The masthead control, before it is opened. "New creature". */
  label: string;
  /** What the name field asks. "What is it called?" */
  prompt: string;
  placeholder: string;
  /** What the describe-it field asks, when this surface offers that. */
  briefPrompt?: string;
  briefPlaceholder?: string;
  /** One more field, for a record that cannot be ordered without it. */
  extra?: { label: string; placeholder: string };
  /**
   * Where the new record goes, when it can go inside another one.
   *
   * A place and an event both nest, and the one you are looking at is almost
   * always the one you mean -- so it is the default, and the rest of the list
   * is there for the times it is not. A surface whose records do not nest
   * passes nothing and the dialog does not ask.
   */
  parent?: {
    label: string;
    /** The record open right now, offered first and chosen by default. */
    selected: { id: string; name: string } | null;
    options: Array<{ id: string; name: string; depth?: number }>;
    /** What the empty choice means here: "Not inside anything". */
    none: string;
  };
  onCreate: (name: string, extra: string, parentId: string) => Promise<string>;
  /** `written` is true when the record was handed to an agent as well. */
  onCreated: (id: string, written: boolean) => void;
  /**
   * Ask for the whole record, carrying the author's brief. Absent on a surface
   * whose records have no fields an agent writes, and then the dialog offers
   * naming only rather than a control that would do nothing.
   */
  onWrite?: (id: string, brief: string) => Promise<void>;
  onFailed: (why: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'choose' | 'name' | 'describe'>('choose');
  const [name, setName] = useState('');
  const [other, setOther] = useState('');
  const [brief, setBrief] = useState('');
  const [parentId, setParentId] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  // showModal rather than the `open` attribute: it is what puts the dialog in
  // the top layer, traps focus inside it and closes it on Escape. Setting the
  // attribute renders the same box and does none of that.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const close = () => {
    setOpen(false);
    setMode('choose');
    setName('');
    setOther('');
    setBrief('');
    setParentId('');
    // Back to the control that opened it, or focus lands on the body and the
    // tab order restarts at the top of the page.
    opener.current?.focus();
  };

  useEffect(() => {
    if (open) setParentId(parent?.selected?.id ?? '');
  }, [open, parent?.selected?.id]);

  const create = async (withBrief: string) => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const id = await onCreate(name.trim(), other.trim(), parentId);
      if (withBrief && onWrite) await onWrite(id, withBrief);
      close();
      onCreated(id, Boolean(withBrief && onWrite));
    } catch (e) {
      onFailed(`Not created: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        className="editorial-button editorial-button--secondary"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      <dialog
        ref={box}
        className="editorial-newrecord"
        aria-label={label}
        onClose={close}
        onCancel={close}
      >
        {mode === 'choose' ? (
          <div className="editorial-newrecord__choices">
            <p className="editorial-newrecord__lead">{label}</p>
            <button
              type="button"
              className="editorial-button editorial-newrecord__choice"
              onClick={() => setMode('name')}
            >
              <span className="editorial-newrecord__choice-name">Name it</span>
              <span className="editorial-newrecord__choice-note">
                You know what this is, and will write it yourself.
              </span>
            </button>
            {onWrite && (
              <button
                type="button"
                className="editorial-button editorial-newrecord__choice"
                onClick={() => setMode('describe')}
              >
                <span className="editorial-newrecord__choice-name">Describe it</span>
                <span className="editorial-newrecord__choice-note">
                  {briefPrompt
                    ? 'Say what it should be and have the record written.'
                    : 'Say what it should be and have it written.'}
                </span>
              </button>
            )}
            <button type="button" className="editorial-link" onClick={close}>Never mind</button>
          </div>
        ) : (
          <form
            className="editorial-newrecord__form"
            onSubmit={(e) => {
              e.preventDefault();
              void create(mode === 'describe' ? brief.trim() : '');
            }}
          >
            <label className="editorial-newrecord__label" htmlFor="newrecord-name">{prompt}</label>
            <input
              id="newrecord-name"
              className="editorial-field__input"
              value={name}
              autoFocus
              placeholder={placeholder}
              onChange={(e) => setName(e.target.value)}
            />

            {extra && (
              <>
                <label className="editorial-newrecord__label" htmlFor="newrecord-extra">
                  {extra.label}
                </label>
                <input
                  id="newrecord-extra"
                  className="editorial-field__input"
                  value={other}
                  placeholder={extra.placeholder}
                  onChange={(e) => setOther(e.target.value)}
                />
              </>
            )}

            {parent && (
              <>
                <label className="editorial-newrecord__label" htmlFor="newrecord-parent">
                  {parent.label}
                </label>
                <select
                  id="newrecord-parent"
                  className="editorial-field__select"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                >
                  <option value="">{parent.none}</option>
                  {parent.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {`${'  '.repeat(o.depth ?? 0)}${o.name}`}
                      {o.id === parent.selected?.id ? '  (the one you have open)' : ''}
                    </option>
                  ))}
                </select>
              </>
            )}

            {mode === 'describe' && (
              <>
                <label className="editorial-newrecord__label" htmlFor="newrecord-brief">
                  {briefPrompt ?? 'What should it be?'}
                </label>
                <textarea
                  id="newrecord-brief"
                  className="editorial-field__input"
                  rows={4}
                  value={brief}
                  placeholder={briefPlaceholder}
                  onChange={(e) => setBrief(e.target.value)}
                />
                <p className="editorial-newrecord__note">
                  {'Every field is asked for at once, holding to what you wrote. The '
                    + 'proposals arrive in the record, to put in force or refuse.'}
                </p>
              </>
            )}

            <div className="editorial-field__actions">
              <button
                type="submit"
                className="editorial-button editorial-button--secondary"
                disabled={busy || !name.trim() || (mode === 'describe' && !brief.trim())}
              >
                {busy
                  ? (mode === 'describe' ? 'Asking…' : 'Creating…')
                  : (mode === 'describe' ? 'Create and write it' : 'Create')}
              </button>
              <button type="button" className="editorial-link" onClick={() => setMode('choose')}>
                Back
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
