import { useEffect, useId, useRef, useState } from 'react';

/**
 * Asking an agent for something, with room to say what you want from it.
 *
 * Every Collaborate on every surface asked with nothing but the record: the
 * agent read what was written and wrote the rest as it saw fit. Somebody who
 * knew what they wanted -- "she should be older", "leave the war out of it" --
 * had to ask, wait, refuse, and send it back with a note, when the note could
 * have gone with the first ask.
 *
 * So Collaborate opens a small panel first. The instruction is optional:
 * asking with it empty is exactly the ask it always was. Whatever is typed
 * travels as the request's brief, which every agent already reads and holds
 * to. A panel beside the control rather than a dialog, because it is a
 * sentence, not a task.
 */
export default function Collaborate({
  onAsk, label = 'Collaborate', variant = 'link', disabled = false, placeholder,
}: {
  /** Given what was typed, trimmed; an empty string when nothing was. */
  onAsk: (brief: string) => unknown;
  /** What the control says when closed: a surface's own "Drafting…" included. */
  label?: string;
  /** A link beside a field or section, or a button in a record's heading. */
  variant?: 'link' | 'button';
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // A click anywhere else closes it, as a menu would. What was typed stays,
  // so reopening it does not lose a sentence.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const close = () => {
    setOpen(false);
    setFailed(null);
    trigger.current?.focus();
  };

  const ask = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await onAsk(brief.trim());
      setBrief('');
      setOpen(false);
    } catch (e) {
      setFailed(`Not asked: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="editorial-collaborate" ref={box}>
      <button
        ref={trigger}
        type="button"
        className={variant === 'button' ? 'editorial-button editorial-button--secondary' : 'editorial-link'}
        disabled={disabled || busy}
        aria-expanded={open}
        onClick={() => { setFailed(null); setOpen((was) => !was); }}
      >
        {busy ? 'Asking…' : label}
      </button>
      {open && (
        <form
          className="editorial-collaborate__panel"
          onSubmit={(e) => { e.preventDefault(); void ask(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
        >
          <label className="editorial-collaborate__label" htmlFor={id}>
            Anything to steer it? Optional: it works from the record either way.
          </label>
          <textarea
            id={id}
            className="editorial-field__input"
            rows={3}
            autoFocus
            value={brief}
            placeholder={placeholder ?? 'Keep it short, and leave the war out of it.'}
            onChange={(e) => setBrief(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void ask(); }
            }}
          />
          {failed && <p className="editorial-field__failed" role="alert">{failed}</p>}
          <div className="editorial-field__actions">
            <button type="submit" className="editorial-button editorial-button--secondary" disabled={busy}>
              {busy ? 'Asking…' : 'Ask'}
            </button>
            <button type="button" className="editorial-link" onClick={close}>Cancel</button>
          </div>
        </form>
      )}
    </span>
  );
}
