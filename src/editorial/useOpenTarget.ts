import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Opening one record in a lens that shows many.
 *
 * The index could name every entity in a universe and had nowhere to send you:
 * ninety-three rows resolved to five destinations, so clicking a person landed
 * you in the lens holding all sixty-six of them, to find them again by eye.
 * Only the cast lens had any notion of a selected record.
 *
 * `?open=<id>` is that notion, in one shape for every lens. It is a URL and not
 * component state on purpose: a record somebody navigated to is an address they
 * can send to themselves, keep in a tab, or reach with the back button.
 *
 * The lens keeps its own arrangement. This only says which row was asked for,
 * brings it into view once, and moves focus there, so arriving by link and
 * arriving by scrolling leave you in the same place.
 */
export function useOpenTarget() {
  const [params] = useSearchParams();
  const wanted = params.get('open');
  const done = useRef<string | null>(null);

  useEffect(() => { done.current = null; }, [wanted]);

  /**
   * Put this on the row that matches. Scrolls once per id, so re-renders from
   * a filter or a refetch do not drag the page back.
   */
  const mark = useCallback((id: string) => (node: HTMLElement | null) => {
    if (!node || !wanted || id !== wanted || done.current === wanted) return;
    done.current = wanted;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Focusable only for this: arriving by link should leave the keyboard where
    // the eye is, and the row is not otherwise a control.
    node.setAttribute('tabindex', '-1');
    node.focus({ preventScroll: true });
  }, [wanted]);

  return { open: wanted, mark, isOpen: (id: string) => id === wanted };
}
