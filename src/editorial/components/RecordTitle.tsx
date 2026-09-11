import { useEffect, useRef, useState, type Ref } from 'react';

/**
 * A record's name, which turns out to be the one field nothing could change.
 *
 * Every surface could rewrite what a record says and none could correct what
 * it is called. An event typed as "Malakor meets his wife" stayed that
 * forever, and the only ways out were to delete it and start again or to edit
 * the database. The name is the field most likely to be wrong, because it is
 * the one written first -- before you know what the thing is -- and it was the
 * only one with no editor.
 *
 * It keeps the heading it replaces, including `tabIndex={-1}`: the surfaces
 * move focus here when you follow a link into a record, and a heading that
 * cannot take focus sends the tab order back to the top of the page.
 */
export default function RecordTitle({
  name, what, onRename, onSaid, headingClass, headingId, headingRef,
}: {
  name: string;
  /** What is being renamed, for the label: "event", "place", "group". */
  what: string;
  onRename: (next: string) => Promise<void>;
  onSaid?: (s: string) => void;
  /**
   * The cast's record head has a heading class, an id and a focus ref of its
   * own that other parts of that page reach for. They are passed in rather
   * than the component being forked, because a second copy of this would be
   * the fifth thing this session to drift after being copied.
   */
  headingClass?: string;
  headingId?: string;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(name); }, [name]);
  useEffect(() => { if (editing) box.current?.select(); }, [editing]);

  const commit = async () => {
    const next = draft.trim();
    if (!next || busy) return;
    if (next === name) { setEditing(false); return; }
    setBusy(true);
    try {
      await onRename(next);
      setEditing(false);
      onSaid?.(`Now called ${next}.`);
    } catch (e) {
      onSaid?.(`Not renamed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  if (!editing) {
    return (
      <h2
        className={`${headingClass ?? 'editorial-section-title'} editorial-recordtitle`}
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
      >
        {name || 'Unnamed'}
        <button
          type="button"
          className="editorial-link editorial-recordtitle__rename"
          onClick={() => { setDraft(name); setEditing(true); }}
        >
          Rename
        </button>
      </h2>
    );
  }

  return (
    <form
      className="editorial-recordtitle__editor"
      onSubmit={(e) => { e.preventDefault(); void commit(); }}
    >
      <label className="editorial-newrecord__label" htmlFor="recordtitle-name">
        {`What should this ${what} be called?`}
      </label>
      <input
        id="recordtitle-name"
        ref={box}
        className="editorial-field__input editorial-provenance__field"
        value={draft}
        autoFocus
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(name); setEditing(false); } }}
      />
      <div className="editorial-field__actions">
        <button
          type="submit"
          className="editorial-button editorial-button--secondary"
          disabled={busy || !draft.trim()}
        >
          {busy ? 'Renaming…' : 'Rename'}
        </button>
        <button
          type="button"
          className="editorial-link"
          onClick={() => { setDraft(name); setEditing(false); }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
