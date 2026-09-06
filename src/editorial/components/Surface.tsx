import type { ReactNode } from 'react';

/**
 * Wraps one routed surface and names it.
 *
 * The route test asserts on this name rather than on whatever the surface
 * happens to render, so a route keeps proving it resolves as each placeholder
 * is replaced by a real component with loading and error states of its own.
 */
export default function Surface({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="editorial-surface" data-surface={name}>
      {children}
    </div>
  );
}
