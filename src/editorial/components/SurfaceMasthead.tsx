import type { ReactNode } from 'react';

/**
 * The head of a universe surface, in one place.
 *
 * Six surfaces hand-rolled this markup, in two variants: some wrapped it in
 * `editorial-surface__fixed` with `--tight` and some did not, so half the nav
 * had a hairline rule under the title and 44px beneath it and the other half
 * had no rule and 28px. Nobody chose that. Each page re-decided the structure
 * on its way to solving a different problem, and the spacing came along with
 * whatever it copied.
 *
 * The variants were the bug, not a feature. There is one head now: title,
 * whatever single control belongs to the whole surface, the sentence that says
 * what you are looking at, and a live region for what just happened. A page
 * that needs something else puts it in the page, not in the masthead.
 *
 * `editorialSurfaceMasthead.test.js` fails the build if a page writes this
 * markup itself, because a shared component that anybody may bypass is a
 * convention again, and a convention is what this was.
 */
export default function SurfaceMasthead({
  title, standfirst, action, status, children,
}: {
  title: ReactNode;
  /** One sentence on what this surface is showing. */
  standfirst?: ReactNode;
  /**
   * Anything the surface puts under its head that is not one sentence: the
   * cast's census with its work picker, a row of filters. It sits inside the
   * masthead, above the rule that closes the head, so it reads as part of the
   * head rather than as the first thing after it.
   */
  children?: ReactNode;
  /** The single control that belongs to the whole surface, if there is one. */
  action?: ReactNode;
  /**
   * What just happened, announced. Rendered even when empty: a live region
   * that appears and gains text in the same frame is a mutation many screen
   * readers never see, which is the one thing it exists to do.
   */
  status?: string | null;
}) {
  return (
    <header className="editorial-surface__fixed">
      <div className="editorial-masthead">
        <div className="editorial-masthead__line">
          <h1 className="editorial-masthead__title">{title}</h1>
          {action}
        </div>
        {standfirst && <p className="editorial-register__standfirst">{standfirst}</p>}
        {status !== undefined && (
          <p className="editorial-masthead__status" role="status">{status ?? ''}</p>
        )}
        {/* Inside the masthead, not after it. The masthead carries the rule
            that closes the head, so anything rendered below it appeared under
            that rule -- which on the cast page drew a line between the title
            and the sentence describing it, as if the header had ended halfway
            through itself. */}
        {children}
      </div>
    </header>
  );
}
