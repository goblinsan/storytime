import { useCallback, useEffect, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: Error };

/**
 * Load once per key, with cancellation and an explicit retry.
 *
 * Surfaces must be able to tell "empty" from "failed" -- the three states here
 * are what the loading, empty and error states in the stylesheet are for.
 */
export function useAsync<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): AsyncState<T> & { retry: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading', data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;

    setState({ status: 'loading', data: null, error: null });

    load(controller.signal)
      .then((data) => { if (live) setState({ status: 'ready', data, error: null }); })
      .catch((error: unknown) => {
        if (!live || controller.signal.aborted) return;
        setState({
          status: 'error',
          data: null,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });

    return () => { live = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  return { ...state, retry };
}

/**
 * Ask again, while there is something to wait for.
 *
 * Some answers arrive later and from somewhere else: a canon request is filed,
 * an agent writes a draft a minute afterwards, and the page that asked has no
 * way to hear about it. Without this the only way to see the answer is to
 * reload, which is how somebody clicks a button, sees nothing, and reasonably
 * concludes it did nothing.
 *
 * Stops the moment nothing is outstanding, so a settled page is not polling.
 */
export function useRefreshWhile(waiting: boolean, refresh: () => void, everyMs = 4000): void {
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(refresh, everyMs);
    return () => clearInterval(timer);
  }, [waiting, refresh, everyMs]);
}
