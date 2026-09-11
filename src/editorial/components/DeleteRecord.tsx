import { useEffect, useRef, useState } from 'react';
import { editorialApi, type RecordKind } from '../api';

/**
 * Deleting something, with what else it takes said first.
 *
 * Nothing on these surfaces could be deleted. The server could delete almost
 * everything and no page asked it to, so a mistaken record -- a character
 * created twice, a draft nobody wants -- stayed for good.
 *
 * It asks before it acts, because it cannot be taken back, and it says what
 * else changes: a place's own places moving up a level, the pictures that stop
 * pointing at anything. "Are you sure?" with nothing after it asks somebody to
 * be sure about something they have not been told.
 */
export default function DeleteRecord({
  what, name, label = 'Delete', consequences, onDelete, onDeleted, onSaid,
}: {
  /** What kind of thing this is, for the button: "draft", "character". */
  what: string;
  /** What it is called, for the question. */
  name: string;
  /** The control before it is opened. */
  label?: string;
  /**
   * What else changes, asked for when the dialog opens. `blocked` says why it
   * cannot be deleted at all -- a protected record -- and the dialog then
   * offers no delete.
   */
  consequences?: () => Promise<string[] | { effects: string[]; blocked?: string }>;
  onDelete: () => Promise<unknown>;
  onDeleted: () => void;
  onSaid?: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [effects, setEffects] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const box = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  // showModal, as the New dialog does: the top layer, a focus trap, Escape.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

  const show = async () => {
    setError(null);
    setBlocked(null);
    setEffects(null);
    setOpen(true);
    if (!consequences) { setEffects([]); return; }
    try {
      const said = await consequences();
      if (Array.isArray(said)) {
        setEffects(said);
      } else {
        setEffects(said.effects);
        setBlocked(said.blocked ?? null);
      }
    } catch (e) {
      // Not knowing what else it touches is worth saying; it is not a reason
      // to refuse the delete somebody asked for.
      setEffects([]);
      setError(`Could not check what else it touches: ${why(e)}`);
    }
  };

  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete();
      setOpen(false);
      onSaid?.(`Deleted ${name}.`);
      onDeleted();
    } catch (e) {
      setError(`Not deleted: ${why(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        className="editorial-link editorial-link--discard"
        onClick={() => void show()}
      >
        {label}
      </button>

      <dialog
        ref={box}
        className="editorial-newrecord"
        aria-label={`Delete ${name}`}
        onClose={close}
        onCancel={close}
      >
        <div className="editorial-newrecord__form">
          <p className="editorial-newrecord__lead">{`Delete ${name}?`}</p>
          {effects === null ? (
            <p className="editorial-rail__note">Checking what else it touches…</p>
          ) : effects.length > 0 && (
            <ul className="editorial-deleterecord__effects">
              {effects.map((effect) => <li key={effect}>{effect}</li>)}
            </ul>
          )}
          {blocked
            ? <p className="editorial-field__failed" role="alert">{blocked}</p>
            : <p className="editorial-rail__note">This cannot be undone.</p>}
          {error && <p className="editorial-field__failed" role="alert">{error}</p>}
          <div className="editorial-field__actions">
            <button
              type="button"
              className="editorial-button editorial-button--danger"
              disabled={busy || effects === null || Boolean(blocked)}
              onClick={() => void confirm()}
            >
              {busy ? 'Deleting…' : `Delete this ${what}`}
            </button>
            <button type="button" className="editorial-link" onClick={close}>Keep it</button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/**
 * Delete for a record: the server says what else it takes, refuses what is
 * protected, and tidies what pointed at it. The one control every record
 * surface shows.
 */
export function DeleteCanon({
  kind, id, what, name, label, onDeleted, onSaid,
}: {
  kind: RecordKind;
  id: string;
  what: string;
  name: string;
  label?: string;
  onDeleted: () => void;
  onSaid?: (s: string) => void;
}) {
  return (
    <DeleteRecord
      what={what}
      name={name}
      label={label}
      consequences={async () => {
        const said = await editorialApi.recordConsequences(kind, id);
        return {
          effects: said.effects,
          blocked: said.protected
            ? `${said.name} is protected from changes and cannot be deleted. Lift the protection first.`
            : undefined,
        };
      }}
      onDelete={() => editorialApi.deleteRecord(kind, id)}
      onDeleted={onDeleted}
      onSaid={onSaid}
    />
  );
}
