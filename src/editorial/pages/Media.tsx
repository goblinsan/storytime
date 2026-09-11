import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { editorialApi, type MediaAsset } from '../api';
import { useAsync } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import SurfaceMasthead from '../components/SurfaceMasthead';

/**
 * Every picture this universe holds, at a size you can look across.
 *
 * It rendered each image at its own height inside a 240px column, so a
 * 1216-pixel portrait became an eight-hundred-pixel strip and four of them
 * filled the screen. The 16:9 preview box that was meant to hold them existed
 * in the stylesheet and nothing used it. Below each strip sat the whole visual
 * description, traits and all, so the page was as long as its longest essay.
 *
 * A library is for finding a picture, and finding one is a matter of seeing
 * many at once. So it is a grid of the same-sized crops, and everything about
 * one picture -- the full image, what it is of, what has been read out of it --
 * lives in a viewer that opens on it.
 */

const KINDS = ['reference', 'generated', 'panel', 'cover', 'map'] as const;

const STATUS_LABEL: Record<MediaAsset['descriptionStatus'], string> = {
  none: 'No description yet',
  requested: 'Description requested',
  ready: 'Description ready for review',
  accepted: 'Description accepted into canon',
};

const inWords = (raw: string) => raw.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * What a picture is called. Almost nothing here has a title, and a grid of
 * "Untitled" says nothing twelve times; what it is OF and what KIND of picture
 * it is are recorded for every one, so that is the name when there is no other.
 */
const nameOf = (a: MediaAsset) => a.title?.trim()
  || a.caption?.trim()
  || [a.subject ? inWords(a.subject.type) : null, a.kind].filter(Boolean).join(' ');

/**
 * One picture, in full.
 *
 * A dialog opened with showModal, like every other dialog in this app: it takes
 * the top layer, keeps focus inside, closes on Escape, and hands focus back to
 * the tile that opened it. Left and right step through the pictures in the
 * order the grid shows them, because looking at a picture and then the next
 * one is most of what anybody does in a library.
 */
function Viewer({
  assets, index, busy, onStep, onClose, onDescribe,
}: {
  assets: MediaAsset[];
  index: number;
  busy: string | null;
  onStep: (next: number) => void;
  onClose: () => void;
  onDescribe: (asset: MediaAsset) => void;
}) {
  const box = useRef<HTMLDialogElement>(null);
  const asset = assets[index];

  useEffect(() => {
    const el = box.current;
    if (el && !el.open) el.showModal();
  }, []);

  if (!asset) return null;
  const has = (list: string[]) => list.length > 0;

  return (
    <dialog
      ref={box}
      className="editorial-viewer"
      aria-label={nameOf(asset)}
      onClose={onClose}
      onCancel={onClose}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' && index < assets.length - 1) onStep(index + 1);
        if (e.key === 'ArrowLeft' && index > 0) onStep(index - 1);
      }}
    >
      <div className="editorial-viewer__stage">
        <img className="editorial-viewer__image" src={asset.url} alt={nameOf(asset)} />
      </div>

      <div className="editorial-viewer__detail">
        <div className="editorial-viewer__head">
          <h2 className="editorial-viewer__title">{nameOf(asset)}</h2>
          <button type="button" className="editorial-link" onClick={onClose}>Close</button>
        </div>
        <p className="editorial-viewer__meta">
          {[inWords(asset.kind), asset.subject ? inWords(asset.subject.type) : null,
            STATUS_LABEL[asset.descriptionStatus]].filter(Boolean).join(' · ')}
        </p>

        {asset.visualDescription && (
          <p className="editorial-viewer__description">{asset.visualDescription}</p>
        )}
        {(has(asset.observableTraits) || has(asset.inferredTraits) || has(asset.uncertainties)) && (
          <dl className="editorial-viewer__traits">
            {has(asset.observableTraits) && (
              <div><dt>Seen</dt><dd>{asset.observableTraits.join(', ')}</dd></div>
            )}
            {has(asset.inferredTraits) && (
              <div><dt>Inferred</dt><dd>{asset.inferredTraits.join(', ')}</dd></div>
            )}
            {has(asset.uncertainties) && (
              <div><dt>Uncertain</dt><dd>{asset.uncertainties.join(', ')}</dd></div>
            )}
          </dl>
        )}

        <div className="editorial-field__actions">
          {asset.descriptionStatus === 'none' && (
            <button
              type="button"
              className="editorial-button editorial-button--secondary"
              onClick={() => onDescribe(asset)}
              disabled={busy === asset.id}
            >
              {busy === asset.id ? 'Requesting…' : 'Describe this image'}
            </button>
          )}
          <span className="editorial-viewer__count">{`${index + 1} of ${assets.length}`}</span>
          <button
            type="button"
            className="editorial-link"
            disabled={index === 0}
            onClick={() => onStep(index - 1)}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="editorial-link"
            disabled={index === assets.length - 1}
            onClick={() => onStep(index + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </dialog>
  );
}

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
  const [viewing, setViewing] = useState<number | null>(null);
  const tiles = useRef<Array<HTMLButtonElement | null>>([]);

  // Focus goes back to the tile that is now showing, which is not always the
  // one that was clicked -- stepping through with the arrows moves it.
  const close = useCallback((at: number) => {
    setViewing(null);
    requestAnimationFrame(() => tiles.current[at]?.focus());
  }, []);

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
        standfirst={`${data.length} pictures. Open one to see it in full, or to have what is in it described.`}
        action={(
          <div className="editorial-form-group">
            <label className="editorial-form-label" htmlFor="media-kind">Kind</label>
            <select
              id="media-kind"
              className="editorial-field__select"
              value={kind}
              onChange={(e) => { setKind(e.target.value); setViewing(null); }}
            >
              <option value="all">Everything</option>
              {KINDS.map((k) => <option key={k} value={k}>{inWords(k)}</option>)}
            </select>
          </div>
        )}
      />

      {assets.length === 0 ? (
        <EmptyState
          title={kind === 'all' ? 'No pictures yet' : `No ${kind} pictures`}
          description={kind === 'all'
            ? 'Illustrations, concept art, covers, maps and storyboard panels for this universe will appear here.'
            : 'Try another kind, or Everything.'}
        />
      ) : (
        <ul className="editorial-thumbs">
          {assets.map((asset, i) => (
            <li key={asset.id}>
              <button
                type="button"
                ref={(el) => { tiles.current[i] = el; }}
                className="editorial-button editorial-thumb"
                onClick={() => setViewing(i)}
              >
                <img
                  className="editorial-thumb__image"
                  src={asset.url}
                  alt=""
                  loading="lazy"
                />
                <span className="editorial-thumb__caption">{nameOf(asset)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {viewing !== null && (
        <Viewer
          assets={assets}
          index={viewing}
          busy={busy}
          onStep={setViewing}
          onClose={() => close(viewing)}
          onDescribe={describe}
        />
      )}
    </Surface>
  );
}
