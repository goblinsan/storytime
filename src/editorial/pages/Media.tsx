import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { editorialApi, type MediaAsset } from '../api';
import { useAsync } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import SurfaceMasthead from '../components/SurfaceMasthead';

const KINDS = ['reference', 'generated', 'panel', 'cover', 'map'] as const;

const STATUS_LABEL: Record<MediaAsset['descriptionStatus'], string> = {
  none: 'No description',
  requested: 'Description requested',
  ready: 'Description ready for review',
  accepted: 'Description accepted into canon',
};

export default function Media() {
  const { id = '' } = useParams();
  // The head carries the universe, like every other surface in this nav,
  // so the page has to know which universe it is on.
  const universe = useAsync((sig) => editorialApi.getUniverse(id, sig), [id]);
  const { status, data, error, retry } = useAsync(
    (signal) => editorialApi.listMedia(id, signal), [id],
  );
  const [kind, setKind] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);

  if (status === 'loading') {
    return <Surface name="media"><LoadingState label="Reading the asset library…" /></Surface>;
  }
  if (status === 'error') {
    return (
      <Surface name="media">
        <ErrorState title="Could not load media" error={error} onRetry={retry} />
      </Surface>
    );
  }

  const assets = data.filter((a) => kind === 'all' || a.kind === kind);

  const describe = async (asset: MediaAsset) => {
    setBusy(asset.id);
    try {
      await editorialApi.requestVisualDescription(asset.id);
      retry();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Surface name="media">
      <SurfaceMasthead
        title={universe.data?.title ?? 'Media'}
        action={(
          <div className="editorial-form-group">
            <label className="editorial-form-label" htmlFor="media-kind">Kind</label>
            <select id="media-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">Everything</option>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        )}
      />

      <p className="editorial-briefing__summary">
        Reference art, generated imagery and sequential-art panels. Asking for a
        visual description queues a job that reads the image and writes a
        canon-grounded account of it, keeping what it can see separate from what
        it is guessing.
      </p>

      {assets.length === 0 ? (
        <EmptyState
          title={kind === 'all' ? 'No assets yet' : `No ${kind} assets`}
          description={kind === 'all'
            ? 'Illustrations, concept art, covers, maps and storyboard panels for this universe will appear here.'
            : 'Try another kind, or Everything.'}
        />
      ) : (
        <div className="editorial-media-studio">
          <div className="editorial-media-grid">
            {assets.map((asset) => (
              <figure className="editorial-media-card" key={asset.id}>
                <img src={asset.url} alt={asset.title || asset.caption || 'Reference asset'} loading="lazy" />
                <figcaption>
                  <span className="editorial-activity-row__title">{asset.title || 'Untitled'}</span>
                  <span className="editorial-activity-row__time">
                    {asset.kind}
                    {asset.subject && ` · ${asset.subject.type}`}
                    {` · ${STATUS_LABEL[asset.descriptionStatus]}`}
                  </span>

                  {asset.visualDescription && (
                    <p className="editorial-activity-row__time">{asset.visualDescription}</p>
                  )}

                  {asset.observableTraits.length > 0 && (
                    <p className="editorial-activity-row__time">
                      <strong>Seen:</strong> {asset.observableTraits.join(', ')}
                    </p>
                  )}
                  {asset.inferredTraits.length > 0 && (
                    <p className="editorial-activity-row__time">
                      <strong>Inferred:</strong> {asset.inferredTraits.join(', ')}
                    </p>
                  )}
                  {asset.uncertainties.length > 0 && (
                    <p className="editorial-activity-row__time">
                      <strong>Uncertain:</strong> {asset.uncertainties.join(', ')}
                    </p>
                  )}

                  {asset.descriptionStatus === 'none' && (
                    <button
                      type="button"
                      className="editorial-button editorial-button--secondary"
                      onClick={() => describe(asset)}
                      disabled={busy === asset.id}
                    >
                      {busy === asset.id ? 'Requesting…' : 'Describe this image'}
                    </button>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </Surface>
  );
}
