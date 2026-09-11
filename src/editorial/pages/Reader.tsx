import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faBars, faLink, faTextHeight, faXmark } from '@fortawesome/free-solid-svg-icons';
import { editorialApi } from '../api';
import { useAsync } from '../useAsync';
import { ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { passageAnchor, readingMinutes, toParagraphs } from '../readerText';
import { isReadable } from '../workFormats';
import { readerPath, universeSectionPath } from '../paths';
import { readingOrder } from '../workTree';

type ReadingTheme = 'light' | 'parchment' | 'dark';
const THEMES: ReadingTheme[] = ['light', 'parchment', 'dark'];
const SIZES = [15, 16, 17, 18, 20] as const;

const store = (key: string, value: string) => {
  try { window.localStorage.setItem(key, value); } catch { /* private window */ }
};
const read = (key: string, fallback: string) => {
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};

export default function Reader() {
  const { id: universeId = '', workId = '' } = useParams();

  const work = useAsync((signal) => editorialApi.getWork(workId, signal), [workId]);
  const tree = useAsync((signal) => editorialApi.listWorkTree(universeId, signal), [universeId]);
  const order = useMemo(
    () => (tree.data ? readingOrder(tree.data.works, workId) : null), [tree.data, workId],
  );

  /**
   * The reader keeps its own reading theme, because parchment is a preference
   * about reading rather than about the hour. But until somebody has expressed
   * one, the system has already said which way round the room is, and opening
   * a white page at night because nothing was stored ignores an answer they
   * gave once for everything.
   */
  const [theme, setTheme] = useState<ReadingTheme>(() => {
    const stored = read('reader.theme', '');
    if ((THEMES as string[]).includes(stored)) return stored as ReadingTheme;
    return typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [size, setSize] = useState(() => Number(read('reader.size', '17')) || 17);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState<number | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // A new chapter opens at its first line, not wherever the last one was left.
  useEffect(() => { window.scrollTo(0, 0); }, [workId]);

  useEffect(() => { store('reader.theme', theme); }, [theme]);
  useEffect(() => { store('reader.size', String(size)); }, [size]);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      setProgress(scrollable <= 0 ? 0 : Math.min(1, doc.scrollTop / scrollable));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [workId]);

  const copyPassageLink = useCallback(async (index: number) => {
    const url = `${window.location.origin}${window.location.pathname}#${passageAnchor(index)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard can be blocked; the anchor still works as a link.
    }
    setCopied(index);
    window.setTimeout(() => setCopied(null), 1600);
  }, []);

  const paragraphs = useMemo(
    () => toParagraphs(work.data?.content ?? ''), [work.data],
  );

  // Every branch renders inside the token root: tokens.css declares the
  // --editorial-* tokens on .editorial-app, and the reader sits outside the
  // shell, so a loading or error state without it falls back to raw UA styling.
  const frame = (children: React.ReactNode) => (
    <Surface name="reader">
      <div className={`editorial-app editorial-reader editorial-reader--theme-${theme}`}>
        {children}
      </div>
    </Surface>
  );

  if (work.status === 'loading') return frame(<LoadingState label="Opening…" />);
  if (work.status === 'error') {
    return frame(
      <ErrorState title="Could not open this work" error={work.error} onRetry={work.retry} />,
    );
  }

  // Opened on a work that is made of parts -- a story rather than a chapter --
  // read it from its first written part rather than show its empty page.
  if (order && order.at === -1 && order.pages.length) {
    const first = order.pages.find((p) => p.words > 0);
    if (first) return <Navigate to={readerPath(universeId, first.id)} replace />;
  }

  const inStory = Boolean(order && order.pages.length > 1);
  // The drawer is this story's contents. A work that stands alone has no
  // contents, so it lists the other works that can be read instead.
  const contents = inStory
    ? order!.pages
    : (tree.data?.works ?? []).filter((w) => !w.parentId && w.words > 0 && isReadable(w.type));
  const minutes = readingMinutes(work.data.content ?? '');

  return frame(
    <>
        <header className="editorial-reader-header">
          <button
            type="button"
            className="editorial-button editorial-button--icon editorial-reader-header__back-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open chapter list"
            aria-expanded={drawerOpen}
          >
            <FontAwesomeIcon icon={faBars} aria-hidden="true" />
          </button>

          <Link
            className="editorial-button editorial-button--icon editorial-reader-header__back-btn"
            to={universeSectionPath(universeId, 'works')}
            aria-label="Back to works"
          >
            <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          </Link>

          <div className="editorial-reader-header__title">{work.data.title}</div>

          <div className="editorial-reader-header__meta">{minutes} min</div>

          <div className="editorial-reader-header__actions">
            <button
              type="button"
              className="editorial-button editorial-button--icon editorial-reader-header__back-btn"
              onClick={() => setPanelOpen((v) => !v)}
              aria-label="Typography settings"
              aria-expanded={panelOpen}
            >
              <FontAwesomeIcon icon={faTextHeight} aria-hidden="true" />
            </button>
          </div>

          <div className="editorial-reader-progress">
            <div
              className="editorial-reader-progress__bar"
              style={{ transform: `scaleX(${progress})` }}
              role="progressbar"
              aria-label="Reading progress"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </header>

        {panelOpen && (
          <div className="editorial-reader-typography-panel">
            <div className="editorial-reader-typography-panel__row">
              <span className="editorial-reader-typography-panel__label">Size</span>
              <div className="editorial-reader-typography-panel__btn-group">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="editorial-button editorial-button--toggle"
                    onClick={() => setSize(s)}
                    aria-pressed={size === s}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="editorial-reader-typography-panel__row">
              <span className="editorial-reader-typography-panel__label">Page</span>
              <div className="editorial-reader-typography-panel__btn-group">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="editorial-button editorial-button--toggle"
                    onClick={() => setTheme(t)}
                    aria-pressed={theme === t}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="editorial-reader__viewport" ref={viewportRef}>
          <article
            className="editorial-reader__prose"
            style={{ ['--reader-font-size' as string]: `${size}px` }}
          >
            <h1 className="editorial-reader__chapter-title">{work.data.title}</h1>
            {work.data.description && (
              <p className="editorial-reader__chapter-subtitle">{work.data.description}</p>
            )}

            {paragraphs.length === 0 ? (
              <p>This work has no prose yet.</p>
            ) : (
              paragraphs.map((p) => (
                <p key={p.index} id={passageAnchor(p.index)}>
                  {p.text}
                  {' '}
                  <button
                    type="button"
                    className="editorial-link editorial-passage-link"
                    onClick={() => copyPassageLink(p.index)}
                    aria-label={`Copy a link to paragraph ${p.index + 1}`}
                    title="Copy link to this passage"
                  >
                    <FontAwesomeIcon icon={faLink} aria-hidden="true" />
                  </button>
                  {copied === p.index && (
                    <span className="editorial-copied-feedback" role="status">Link copied</span>
                  )}
                </p>
              ))
            )}

            {/* The way on from the last line. Without it, the end of Chapter 1
                was the end of the story as far as the page could tell. */}
            {order && paragraphs.length > 0 && (
              <nav className="editorial-reader__turn" aria-label="Turn the page">
                {order.previous && (
                  <Link className="editorial-reader__turn-link" to={readerPath(universeId, order.previous.id)}>
                    <span className="editorial-reader__turn-label">Previous</span>
                    <span className="editorial-reader__turn-title">{`← ${order.previous.title}`}</span>
                  </Link>
                )}
                {order.next ? (
                  <Link
                    className="editorial-reader__turn-link editorial-reader__turn-link--next"
                    to={readerPath(universeId, order.next.id)}
                  >
                    <span className="editorial-reader__turn-label">Next</span>
                    <span className="editorial-reader__turn-title">{`${order.next.title} →`}</span>
                  </Link>
                ) : inStory ? (
                  <p className="editorial-reader__turn-end">
                    {`The end of ${order.story.title}, as far as it is written. `}
                    <Link to={`${universeSectionPath(universeId, 'works')}?open=${encodeURIComponent(order.story.id)}`}>
                      Back to the work
                    </Link>
                  </p>
                ) : null}
              </nav>
            )}
          </article>

        </div>

        {drawerOpen && (
          <div
            className="editorial-sidebar-backdrop editorial-sidebar-backdrop--visible"
            role="presentation"
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
          />
        )}

        <nav
          className={`editorial-chapter-drawer ${drawerOpen ? 'editorial-chapter-drawer--open' : ''}`}
          aria-label="Chapters"
        >
          <div className="editorial-reader-header">
            <div className="editorial-reader-header__title">
              {inStory ? order!.story.title : 'In this universe'}
            </div>
            <button
              type="button"
              className="editorial-button editorial-button--icon editorial-reader-header__back-btn"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close chapter list"
            >
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          </div>
          {contents.map((w) => (w.words > 0 ? (
            <Link
              key={w.id}
              className={`editorial-chapter-drawer__item${w.id === workId ? ' editorial-chapter-drawer__item--active' : ''}`}
              to={readerPath(universeId, w.id)}
              onClick={() => setDrawerOpen(false)}
              aria-current={w.id === workId ? 'page' : undefined}
            >
              {inStory && w.partNumber != null && (
                <span className="editorial-chapter-drawer__item-num">{`Part ${w.partNumber}`}</span>
              )}
              {w.title}
            </Link>
          ) : (
            // In the contents, because it is part of the story; not a link,
            // because there is nothing on the other side of it yet.
            <span key={w.id} className="editorial-chapter-drawer__item editorial-chapter-drawer__item--unwritten">
              {w.partNumber != null && <span className="editorial-chapter-drawer__item-num">{`Part ${w.partNumber} · not written yet`}</span>}
              {w.title}
            </span>
          )))}
        </nav>
    </>,
  );
}
