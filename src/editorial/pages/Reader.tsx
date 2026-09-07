import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faBars, faLink, faTextHeight, faXmark } from '@fortawesome/free-solid-svg-icons';
import { editorialApi } from '../api';
import { useAsync } from '../useAsync';
import { ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { passageAnchor, readingMinutes, toParagraphs } from '../readerText';
import { isReadable } from '../workFormats';
import { readerPath, universeSectionPath } from '../paths';

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
  const siblings = useAsync((signal) => editorialApi.listWorks(universeId, signal), [universeId]);

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

  const readable = (siblings.data ?? []).filter((w) => isReadable(w.type));
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
            <div className="editorial-reader-header__title">In this universe</div>
            <button
              type="button"
              className="editorial-button editorial-button--icon editorial-reader-header__back-btn"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close chapter list"
            >
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          </div>
          {readable.map((w) => (
            <Link
              key={w.id}
              className="editorial-chapter-drawer__item"
              to={readerPath(universeId, w.id)}
              onClick={() => setDrawerOpen(false)}
              aria-current={w.id === workId ? 'page' : undefined}
            >
              {w.title}
            </Link>
          ))}
        </nav>
    </>,
  );
}
