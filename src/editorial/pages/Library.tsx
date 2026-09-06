import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { editorialApi } from '../api';
import { useAsync } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { WORK_FORMATS, formatLabel, isReadable } from '../workFormats';
import { readerPath, universeSectionPath } from '../paths';

export default function Library() {
  const { status, data, error, retry } = useAsync(
    (signal) => editorialApi.listAllWorks(signal), [],
  );
  const [format, setFormat] = useState('all');
  const [universe, setUniverse] = useState('all');

  const universes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const work of data ?? []) seen.set(work.projectId, work.universeTitle);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const grouped = useMemo(() => {
    const rows = (data ?? []).filter((w) =>
      (format === 'all' || w.type === format) && (universe === 'all' || w.projectId === universe));
    const byFormat = new Map<string, typeof rows>();
    for (const work of rows) {
      const key = work.type || 'other';
      if (!byFormat.has(key)) byFormat.set(key, []);
      byFormat.get(key)!.push(work);
    }
    return [...byFormat.entries()];
  }, [data, format, universe]);

  if (status === 'loading') {
    return <Surface name="library"><LoadingState label="Reading every library…" /></Surface>;
  }
  if (status === 'error') {
    return (
      <Surface name="library">
        <ErrorState title="Could not load the library" error={error} onRetry={retry} />
      </Surface>
    );
  }

  const total = grouped.reduce((n, [, rows]) => n + rows.length, 0);

  return (
    <Surface name="library">
      <div className="editorial-section-header">
        <h1 className="editorial-section-title">Library</h1>
        <span className="editorial-activity-row__time">
          {total} {total === 1 ? 'work' : 'works'} across every universe
        </span>
      </div>

      <div className="editorial-encyclopedia-filter">
        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="library-format">Format</label>
          <select id="library-format" value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="all">All formats</option>
            {WORK_FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="library-universe">Universe</label>
          <select id="library-universe" value={universe} onChange={(e) => setUniverse(e.target.value)}>
            <option value="all">Every universe</option>
            {universes.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select>
        </div>
      </div>

      {total === 0 ? (
        <EmptyState
          title="No works yet"
          description="Every derivative work across all universes appears here, grouped by format. Nothing has been created yet."
        />
      ) : (
        grouped.map(([type, rows]) => (
          <section className="editorial-band" key={type}>
            <div className="editorial-section-header">
              <h2 className="editorial-section-title">
                {formatLabel(type)} <span className="editorial-activity-row__time">{rows.length}</span>
              </h2>
            </div>
            <div className="editorial-works-library">
              {rows.map((work) => (
                <div className="editorial-work-row" key={work.id}>
                  <div className="editorial-action-row__detail">
                    <span className="editorial-activity-row__title">{work.title || 'Untitled'}</span>
                    <span className="editorial-activity-row__time">
                      <Link to={universeSectionPath(work.projectId, 'works')}>{work.universeTitle}</Link>
                      {work.status && ` · ${work.status}`}
                    </span>
                  </div>
                  {isReadable(work.type) && (
                    <Link to={readerPath(work.projectId, work.id)}>Open Reader</Link>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </Surface>
  );
}
