import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { editorialApi } from '../api';
import { useAsync } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { WORK_FORMATS, formatLabel, isReadable } from '../workFormats';
import { readerPath } from '../paths';
import SurfaceMasthead from '../components/SurfaceMasthead';

export default function Works() {
  const { id = '' } = useParams();
  // The head carries the universe, like every other surface in this nav,
  // so the page has to know which universe it is on.
  const universe = useAsync((sig) => editorialApi.getUniverse(id, sig), [id]);
  const { status, data, error, retry } = useAsync(
    (signal) => editorialApi.listWorks(id, signal), [id],
  );
  const [format, setFormat] = useState('all');

  const works = useMemo(
    () => (data ?? []).filter((w) => format === 'all' || w.type === format),
    [data, format],
  );

  if (status === 'loading') {
    return <Surface name="works"><LoadingState label="Reading the library…" /></Surface>;
  }
  if (status === 'error') {
    return (
      <Surface name="works">
        <ErrorState title="Could not load works" error={error} onRetry={retry} />
      </Surface>
    );
  }

  return (
    <Surface name="works">
      <SurfaceMasthead
        title={universe.data?.title ?? 'Works'}
        action={(
          <div className="editorial-form-group">
            <label className="editorial-form-label" htmlFor="work-format">Format</label>
            <select id="work-format" value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="all">All formats</option>
              {WORK_FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
        )}
      />

      {works.length === 0 ? (
        <EmptyState
          title={format === 'all' ? 'No works yet' : `No ${formatLabel(format).toLowerCase()}`}
          description={format === 'all'
            ? 'Stories, novels, campaigns, screenplays and sequential art grounded in this universe will appear here.'
            : 'Try another format, or All formats.'}
        />
      ) : (
        <div className="editorial-works-library">
          {works.map((work) => (
            <div className="editorial-work-row" key={work.id}>
              <div className="editorial-action-row__detail">
                <span className="editorial-activity-row__title">{work.title || 'Untitled'}</span>
                {work.description && (
                  <span className="editorial-activity-row__time">
                    {work.description.slice(0, 200)}
                  </span>
                )}
                <span className="editorial-activity-row__time">
                  {formatLabel(work.type)}
                  {work.status && ` · ${work.status}`}
                </span>
              </div>
              {isReadable(work.type) && (
                <Link to={readerPath(id, work.id)}>Open Reader</Link>
              )}
            </div>
          ))}
        </div>
      )}
    </Surface>
  );
}
