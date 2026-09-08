import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { editorialApi, type IndexRow } from '../api';
import { useAsync } from '../useAsync';
import { useOpenTarget } from '../useOpenTarget';
import { ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { universeSectionPath } from '../paths';

/**
 * A lens for a kind that had none.
 *
 * Arcs and technologies were only ever visible on the encyclopedia, in a band
 * called "kept only here", which was honest and was not a home: their detail
 * was clamped to two lines with nothing to open, so a six-hundred-character
 * technology was eighteen per cent readable and the rest was unreachable
 * anywhere in the app.
 *
 * They are the same shape as each other -- a name and a body of prose -- so
 * they are one component with two routes rather than two files that would drift
 * apart. When either grows fields of its own it should get its own lens and
 * this should keep the other.
 */
export function UnfiledLens({
  kind, title, blurb, empty,
}: {
  kind: string;
  title: string;
  blurb: string;
  empty: string;
}) {
  const { id: universeId = '' } = useParams();
  const index = useAsync((signal) => editorialApi.getIndex(universeId, signal), [universeId]);
  const { isOpen } = useOpenTarget();

  if (index.status === 'loading') {
    return <Surface name={kind}><LoadingState label={`Reading the ${title.toLowerCase()}…`} /></Surface>;
  }
  if (index.status === 'error') {
    return (
      <Surface name={kind}>
        <ErrorState title={`Could not load the ${title.toLowerCase()}`} error={index.error} onRetry={index.retry} />
      </Surface>
    );
  }

  const rows = [...index.data.dated, ...index.data.undated].filter((r) => r.kind === kind);

  return (
    <Surface name={kind}>
      <header className="editorial-masthead">
        <div className="editorial-masthead__line">
          <h1 className="editorial-masthead__title">{title}</h1>
        </div>
        <p className="editorial-register__standfirst">{blurb}</p>
      </header>

      {rows.length === 0 ? (
        <p className="editorial-register__note">{empty}</p>
      ) : (
        <div className="editorial-band">
          {rows.map((row: IndexRow) => (
            <article
              className="editorial-unfiled"
              key={row.id}
              data-open={isOpen(row.id) ? 'true' : undefined}
            >
              <h2 className="editorial-unfiled__name">
                {row.title || 'Untitled'}
                {row.isProtected && (
                  <span className="editorial-register__flag" title="Protected from automated changes">
                    protected
                  </span>
                )}
              </h2>
              {/* In full. This is the only surface that shows these at all, so
                  clamping here would leave the text unreadable everywhere. */}
              {row.detail && <p className="editorial-unfiled__body">{row.detail}</p>}
            </article>
          ))}
        </div>
      )}

      <p className="editorial-register__note">
        <Link to={universeSectionPath(universeId, 'encyclopedia')}>Everything in this universe</Link>
      </p>
    </Surface>
  );
}

export function Arcs() {
  return (
    <UnfiledLens
      kind="arc"
      title="Arcs"
      blurb="The shapes a story takes through this universe: what is set in motion, and what it costs."
      empty="No arcs recorded yet."
    />
  );
}

export function Technologies() {
  return (
    <UnfiledLens
      kind="technology"
      title="Technologies"
      blurb="What this universe can build, and the principles and limits it is built on."
      empty="No technologies recorded yet."
    />
  );
}
