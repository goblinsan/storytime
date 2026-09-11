import {
  useEffect, useId, useRef, useState, type ReactNode, type Ref,
} from 'react';

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
  name, what, onRename, onSaid, headingClass, headingId, headingRef, actions,
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
  /**
   * More things to do to the record itself, shown beside Rename and as quietly:
   * Delete. What is done WITH the record -- Collaborate, a picture -- stays in
   * the heading's own controls.
   */
  actions?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    // The heading holds the name alone, and the options sit beside it rather
    // than inside it: a heading's text is what it is called, and a dialog a
    // Delete opens must not become part of a heading.
    return (
      <div className="editorial-recordtitle">
        <h2
          className={headingClass ?? 'editorial-section-title'}
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
        >
          {name || 'Unnamed'}
        </h2>
        <span className="editorial-recordtitle__options">
          <button
            type="button"
            className="editorial-link editorial-recordtitle__rename"
            onClick={() => setEditing(true)}
          >
            Rename
          </button>
          {actions}
        </span>
      </div>
    );
  }

  return (
    <RenameForm name={name} what={what} onRename={onRename} onSaid={onSaid} onDone={() => setEditing(false)} />
  );
}

/**
 * Changing a name in place. Shared by a record's title and a part's heading --
 * an act is renamed from the heading it has on the arc's page, not from a
 * field under it that repeats what the heading already says.
 */
export function RenameForm({
  name, what, onRename, onSaid, onDone,
}: {
  name: string;
  what: string;
  onRename: (next: string) => Promise<void>;
  onSaid?: (s: string) => void;
  /** Finished, whether renamed or not. */
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  // Several can be open on one page -- the record's title and an act's -- so
  // the label cannot point at one fixed id.
  const id = useId();
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => { box.current?.select(); }, []);

  const commit = async () => {
    const next = draft.trim();
    if (!next || busy) return;
    if (next === name) { onDone(); return; }
    setBusy(true);
    try {
      await onRename(next);
      onDone();
      onSaid?.(`Now called ${next}.`);
    } catch (e) {
      onSaid?.(`Not renamed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  return (
    <form
      className="editorial-recordtitle__editor"
      onSubmit={(e) => { e.preventDefault(); void commit(); }}
    >
      <label className="editorial-newrecord__label" htmlFor={id}>
        {`What should this ${what} be called?`}
      </label>
      <input
        id={id}
        ref={box}
        className="editorial-field__input editorial-provenance__field"
        value={draft}
        autoFocus
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onDone(); }}
      />
      <div className="editorial-field__actions">
        <button
          type="submit"
          className="editorial-button editorial-button--secondary"
          disabled={busy || !draft.trim()}
        >
          {busy ? 'Renaming…' : 'Rename'}
        </button>
        <button type="button" className="editorial-link" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
