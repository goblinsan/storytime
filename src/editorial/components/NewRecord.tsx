import { useState } from 'react';

/**
 * Starting a record.
 *
 * Four surfaces could read and improve what they held and none of them could
 * add to it. A universe with no creatures said "Creatures recorded for this
 * universe will appear here" and offered no way to record one, which is an
 * empty state that describes the problem and withholds the answer.
 *
 * IT ASKS FOR A NAME AND NOTHING ELSE
 * Everything a record holds can be written afterwards, in place, or handed to
 * an agent -- that is what the rest of the surface is for. A form that demands
 * a description and a category before it will let you write down a name is a
 * form that stops you at the moment you were trying to capture something. The
 * timeline takes a date as well, because an event with no date cannot be put
 * in order, and even that is optional.
 *
 * What it creates, it opens. Creating a record and leaving the reader on the
 * list means the next thing they do is hunt for what they just made.
 */
export default function NewRecord({
  label, prompt, placeholder, extra, onCreate, onCreated, onFailed,
}: {
  /** The control, before it is opened. "New creature". */
  label: string;
  /** What the name field asks. "What is it called?" */
  prompt: string;
  placeholder: string;
  /** One more optional field, for a record that cannot be ordered without it. */
  extra?: { label: string; placeholder: string };
  onCreate: (name: string, extra: string) => Promise<string>;
  onCreated: (id: string) => void;
  onFailed: (why: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => { setOpen(false); setName(''); setOther(''); };

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const id = await onCreate(name.trim(), other.trim());
      close();
      onCreated(id);
    } catch (e) {
      onFailed(`Not created: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button type="button" className="editorial-link" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <form
      className="editorial-newrecord"
      onSubmit={(e) => { e.preventDefault(); void create(); }}
    >
      <label className="editorial-newrecord__label" htmlFor="newrecord-name">{prompt}</label>
      <input
        id="newrecord-name"
        className="editorial-field__input"
        value={name}
        autoFocus
        placeholder={placeholder}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
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
            onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
          />
        </>
      )}
      <div className="editorial-field__actions">
        <button
          type="submit"
          className="editorial-button editorial-button--secondary"
          disabled={busy || !name.trim()}
        >
          {busy ? 'Creating…' : 'Create'}
        </button>
        <button type="button" className="editorial-link" onClick={close}>Cancel</button>
      </div>
    </form>
  );
}
