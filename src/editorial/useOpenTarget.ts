import { useCallback, useEffect } from 'react';
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

  /**
   * Waits for the row rather than assuming it. The lens is still fetching when
   * this first runs, so the row does not exist yet; and scrolling from the ref
   * callback scrolled a node the next render had already replaced, which is why
   * the one lens long enough to need scrolling never moved.
   *
   * Frames rather than a timer, and a bounded number of them: if the record is
   * not there after this long it is not coming, and a stale link should fail
   * quietly rather than hunt forever.
   */
  useEffect(() => {
    if (!wanted) return undefined;

    const reveal = (el: HTMLElement) => {
      el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
      // Not smooth. A smooth scroll starts an animation that the lens's next
      // render interrupts, so the page ended up back at the top with the row
      // focused off screen; the instant one lands. It also respects anyone who
      // has asked for less motion, without asking.
      el.scrollIntoView({ block: 'center' });
    };

    const find = () => document.querySelector<HTMLElement>('[data-open="true"]');

    const already = find();
    if (already) {
      reveal(already);
      return undefined;
    }

    // Wait for the row to arrive rather than counting frames at it. The lens is
    // still fetching when this first runs, and a fixed budget of frames expired
    // before the list existed -- so the page never moved and focus never left
    // the body. An observer waits exactly as long as it takes.
    const observer = new MutationObserver(() => {
      const el = find();
      if (!el) return;
      observer.disconnect();
      reveal(el);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // And gives up eventually: a link to a record that has been deleted should
    // fail quietly rather than watch the document forever.
    const abandon = setTimeout(() => observer.disconnect(), 15_000);
    return () => {
      observer.disconnect();
      clearTimeout(abandon);
    };
  }, [wanted]);

  /**
   * Marks the row. Deliberately does nothing but set the attribute, via the
   * component's own render: a ref that changes identity every render is called
   * again every render, so anything stateful in here is a loop.
   */
  const isOpen = useCallback((id: string) => id === wanted, [wanted]);

  return { open: wanted, isOpen, mark: () => undefined };
}
