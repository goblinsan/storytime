import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import type { UniverseEncyclopedia, DerivativeWork } from '../types/story';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookOpen, faCopy, faCheck, faDownload,
  faFont, faMoon, faSun, faListUl,
} from '@fortawesome/free-solid-svg-icons';
import './StoryReader.css';

interface Props {
  storyId: string | null;
  onSelectTab?: (tabId: string, entityId?: string) => void;
  initialDerivativeId?: string | null;
}

type ReaderTheme = 'parchment' | 'dark' | 'light';
type ReaderFontSize = 'normal' | 'large' | 'xlarge';
type ReaderFontFamily = 'serif' | 'sans';

interface StorySection {
  id: string;
  title: string;
  subtitle?: string;
  kind: 'frontispiece' | 'prologue' | 'cast' | 'chapter' | 'epilogue' | 'appendix';
  content: string;
  beats?: Array<{ title: string; summary: string }>;
  tags?: string[];
}

export default function StoryReader({ storyId, initialDerivativeId }: Props) {
  const [encyclopedia, setEncyclopedia] = useState<UniverseEncyclopedia | null>(null);
  const [derivatives, setDerivatives] = useState<DerivativeWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeScope, setActiveScope] = useState<string>(initialDerivativeId || 'assembled_all');
  
  // Reading preferences
  const [theme, setTheme] = useState<ReaderTheme>('parchment');
  const [fontSize, setFontSize] = useState<ReaderFontSize>('normal');
  const [fontFamily, setFontFamily] = useState<ReaderFontFamily>('serif');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [activeSectionId, setActiveSectionId] = useState<string>('frontispiece');

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Load universe data and derivatives
  useEffect(() => {
    if (!storyId) return;
    setLoading(true);

    Promise.all([
      api.stories.getEncyclopedia(storyId),
      api.derivatives.list(storyId),
    ])
      .then(([ency, derivList]) => {
        setEncyclopedia(ency);
        setDerivatives(derivList);
        if (initialDerivativeId) {
          setActiveScope(initialDerivativeId);
        }
      })
      .catch((err) => console.error('Failed to load story reader data:', err))
      .finally(() => setLoading(false));
  }, [storyId, initialDerivativeId]);

  // Track reading scroll progress & active section
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll > 0) {
        setReadingProgress(Math.min(100, Math.max(0, Math.round((scrollTop / maxScroll) * 100))));
      }

      // Determine active section based on scroll offset
      const sectionElements = el.querySelectorAll<HTMLElement>('[data-section-id]');
      let current = 'frontispiece';
      for (const s of sectionElements) {
        const rect = s.getBoundingClientRect();
        if (rect.top <= 200) {
          current = s.getAttribute('data-section-id') || current;
        }
      }
      setActiveSectionId(current);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Assemble full story or scoped derivative into structured sections
  const assembledSections = useMemo((): StorySection[] => {
    if (!encyclopedia) return [];
    const story = encyclopedia.project;
    const catalog = encyclopedia.catalog || { characters: [], timelineEvents: [], bestiary: [] };

    // A. Single derivative mode
    if (activeScope !== 'assembled_all') {
      const selected = derivatives.find((d) => d.id === activeScope);
      if (selected) {
        const sections: StorySection[] = [
          {
            id: 'frontispiece',
            title: selected.title,
            subtitle: `${story?.title || 'Universe'} • ${selected.type.toUpperCase()}`,
            kind: 'frontispiece',
            content: selected.description || '',
          },
        ];

        const rawStructure = (selected.metadata as any)?.structure?.sections;
        if (Array.isArray(rawStructure) && rawStructure.length > 0) {
          rawStructure.forEach((s: any, idx: number) => {
            sections.push({
              id: `sec-${idx + 1}`,
              title: s.title || `Section ${idx + 1}`,
              kind: 'chapter',
              content: s.summary || '',
            });
          });
        } else if (selected.content) {
          // Parse markdown content by headers
          const chunks = selected.content.split(/\n(?=##?\s+)/);
          chunks.forEach((chunk, idx) => {
            const lines = chunk.trim().split('\n');
            const header = lines[0].replace(/^#+\s*/, '').trim();
            const body = lines.slice(1).join('\n').trim();
            sections.push({
              id: `part-${idx + 1}`,
              title: header || `Part ${idx + 1}`,
              kind: 'chapter',
              content: body || lines.join('\n'),
            });
          });
        }
        return sections;
      }
    }

    // B. Full Composite Assembled Story Mode
    const sections: StorySection[] = [];

    // 1. Frontispiece & Title Cover
    sections.push({
      id: 'frontispiece',
      title: story?.title || 'Chronicles of the Crossing',
      subtitle: 'The Vitriol Siphon: Tragedy of the Slime Queen',
      kind: 'frontispiece',
      content: story?.description || 'An assembled epic forged from canonical history, genealogical heirlooms, and subterranean chapter beats.',
    });

    // 2. Prologue: The Great Fracture & Toxic Drainage (Timeline Events)
    if (catalog.timelineEvents && catalog.timelineEvents.length > 0) {
      const genesisEvents = catalog.timelineEvents.filter(
        (e) =>
          e.title.toLowerCase().includes('fracture') ||
          e.title.toLowerCase().includes('drainage') ||
          e.title.toLowerCase().includes('slime') ||
          e.title.toLowerCase().includes('queen') ||
          e.title.toLowerCase().includes('vault') ||
          e.title.toLowerCase().includes('aquifer')
      );

      const eventsToRender = genesisEvents.length > 0 ? genesisEvents : catalog.timelineEvents.slice(0, 4);

      sections.push({
        id: 'prologue',
        title: 'Prologue: The Fractured Sub-Aquifer',
        subtitle: 'Genesis of the Vitriol Runoff (742 PF – 750 PF)',
        kind: 'prologue',
        content: `Before the harbor village knew peace, the great tectonic fracture of 742 PF shattered the deep granite foundations of the High Anvil. Subterranean alchemical vaults cracked under immense geological strain, allowing centuries of caustic vitriol to seep into the virgin Sub-Aquifer.\n\nDeep beneath the water table, the stagnant toxic pool did not merely decompose—it coalesced. A primordial colonial polyp absorbed the resonant minerals, quickened by ambient thermal energy, and began to filter the poisonous runoff. In the mines overhead, laborers began to report phantom acoustic vibrations: a subterranean hum that resonated with unrefined brass.`,
        beats: eventsToRender.map((e) => ({
          title: `${e.date || 'Era'}: ${e.title}`,
          summary: e.description || '',
        })),
      });
    }

    // 3. Dramatis Personae (Cast & Heirlooms)
    if (catalog.characters && catalog.characters.length > 0) {
      const castItems = catalog.characters.filter(
        (c) => c.background || c.motivation || c.role
      );

      sections.push({
        id: 'cast',
        title: 'Dramatis Personae',
        subtitle: 'The Alchemists, Divers, and Salvagers',
        kind: 'cast',
        content: 'Those whose lives, debts, and heirloom relics became irrevocably bound to the heartbeat of the Slime Queen.',
        beats: castItems.slice(0, 6).map((c) => ({
          title: `${c.name} — ${c.role || 'Key Persona'}`,
          summary: [
            c.motivation ? `• Drive: ${c.motivation}` : null,
            c.background ? `• Lineage: ${c.background}` : null,
            c.description ? `• Description: ${c.description}` : null,
          ].filter(Boolean).join('\n'),
        })),
      });
    }

    // 4. Chapters (Ordered: Chapter 1, Chapter 2, Chapter 3, etc.)
    const chapterDerivatives = derivatives.filter((d) => d.type === 'story');
    
    // Sort logic: Chapter 1 -> Chapter 2 -> Chapter 3 -> Narrative Braid -> Macro Arc
    const sortedChapters = [...chapterDerivatives].sort((a, b) => {
      const getNum = (t: string) => {
        const m = t.match(/Chapter\s*(\d+)/i);
        return m ? parseInt(m[1], 10) : 99;
      };
      const numA = getNum(a.title);
      const numB = getNum(b.title);
      if (numA !== numB) return numA - numB;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });

    sortedChapters.forEach((ch, idx) => {
      const struct = (ch.metadata as any)?.structure?.sections;
      const beats = Array.isArray(struct)
        ? struct.map((s: any) => ({
            title: s.title || 'Scene Beat',
            summary: s.summary || '',
          }))
        : undefined;

      sections.push({
        id: `chapter-${idx + 1}`,
        title: ch.title,
        subtitle: ch.description ? `${ch.description.slice(0, 120)}...` : undefined,
        kind: ch.title.toLowerCase().includes('braid') || ch.title.toLowerCase().includes('acoustic') ? 'epilogue' : 'chapter',
        content: ch.content || ch.description || '',
        beats,
      });
    });

    // 5. Appendix: Lore of the Slime Queen & The Basin
    if (catalog.bestiary && catalog.bestiary.length > 0) {
      const queenEntry = catalog.bestiary.find(
        (b) => b.id === 'beast-slime-queen-remn' || b.name.toLowerCase().includes('slime')
      );
      if (queenEntry) {
        sections.push({
          id: 'appendix',
          title: 'Appendix: The Slime Queen & Acidic Remnants',
          subtitle: 'Ecology, Sensory Lore & Tactical Notes',
          kind: 'appendix',
          content: `${queenEntry.description || ''}\n\n**In-Universe Backstory:**\n${queenEntry.inUniverseBackstory || 'A tragic relic of fractured alchemy and human greed.'}\n\n**Acoustic & Sensory Properties:**\nVibrates at 142 Hz harmonic frequency. Smells of ozone, boiling sea-brine, and caustic vitriol. Surfaces slick with translucent, luminescent jelly that responds defensively to sudden physical shock.`,
        });
      }
    }

    return sections;
  }, [encyclopedia, derivatives, activeScope]);

  // Export narrative as clean markdown
  const fullStoryMarkdown = useMemo(() => {
    return assembledSections
      .map((sec) => {
        let md = `\n\n# ${sec.title}\n`;
        if (sec.subtitle) md += `*${sec.subtitle}*\n\n`;
        if (sec.content) md += `${sec.content}\n\n`;
        if (sec.beats && sec.beats.length > 0) {
          sec.beats.forEach((b) => {
            md += `### ${b.title}\n\n${b.summary}\n\n`;
          });
        }
        return md;
      })
      .join('\n---\n');
  }, [assembledSections]);

  const handleCopy = () => {
    navigator.clipboard.writeText(fullStoryMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([fullStoryMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(encyclopedia?.project?.title || 'story').toLowerCase().replace(/\s+/g, '-')}-manuscript.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const scrollToSection = (secId: string) => {
    const el = scrollContainerRef.current?.querySelector(`[data-section-id="${secId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (loading) {
    return (
      <div className="reader-loading-state">
        <div className="reader-spinner" />
        <p>Assembling story manuscript from universe canon...</p>
      </div>
    );
  }

  return (
    <div className={`story-reader-wrapper theme-${theme} font-${fontFamily} size-${fontSize}`}>
      {/* Top Reading Progress Bar */}
      <div className="reader-progress-track">
        <div className="reader-progress-bar" style={{ width: `${readingProgress}%` }} />
      </div>

      {/* Reader Control Header */}
      <header className="reader-top-bar">
        <div className="reader-brand">
          <button
            className={`reader-icon-btn ${sidebarOpen ? 'active' : ''}`}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle Table of Contents"
          >
            <FontAwesomeIcon icon={faListUl} />
          </button>
          <div className="reader-title-meta">
            <span className="reader-universe-tag">
              <FontAwesomeIcon icon={faBookOpen} /> {encyclopedia?.project?.title || 'Universe Story'}
            </span>
            <span className="reader-progress-pct">{readingProgress}% read</span>
          </div>
        </div>

        {/* Scope Selector */}
        <div className="reader-scope-select-wrap">
          <label htmlFor="story-scope-select" className="reader-scope-label">Reading:</label>
          <select
            id="story-scope-select"
            className="reader-scope-select"
            value={activeScope}
            onChange={(e) => setActiveScope(e.target.value)}
          >
            <option value="assembled_all">📖 Full Assembled Story (All Chapters &amp; Lore)</option>
            <optgroup label="Derivative Works &amp; Outlines">
              {derivatives.map((d) => (
                <option key={d.id} value={d.id}>
                  [{d.type.toUpperCase()}] {d.title}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Reader Customization Controls */}
        <div className="reader-controls">
          {/* Font Size Toggle */}
          <div className="reader-pill-group">
            <button
              className={`reader-pill-btn ${fontSize === 'normal' ? 'active' : ''}`}
              onClick={() => setFontSize('normal')}
              title="Standard Font Size"
            >
              A
            </button>
            <button
              className={`reader-pill-btn ${fontSize === 'large' ? 'active' : ''}`}
              onClick={() => setFontSize('large')}
              title="Large Font Size"
            >
              A+
            </button>
            <button
              className={`reader-pill-btn ${fontSize === 'xlarge' ? 'active' : ''}`}
              onClick={() => setFontSize('xlarge')}
              title="Extra Large Font Size"
            >
              A++
            </button>
          </div>

          {/* Serif vs Sans Toggle */}
          <button
            className="reader-icon-btn"
            onClick={() => setFontFamily(fontFamily === 'serif' ? 'sans' : 'serif')}
            title={`Switch to ${fontFamily === 'serif' ? 'Sans-Serif' : 'Serif'} typography`}
          >
            <FontAwesomeIcon icon={faFont} />
          </button>

          {/* Theme Palette Toggle */}
          <div className="reader-pill-group">
            <button
              className={`reader-pill-btn theme-btn-parchment ${theme === 'parchment' ? 'active' : ''}`}
              onClick={() => setTheme('parchment')}
              title="Warm Parchment Theme"
            >
              📜
            </button>
            <button
              className={`reader-pill-btn theme-btn-dark ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
              title="Dark Obsidian Theme"
            >
              <FontAwesomeIcon icon={faMoon} />
            </button>
            <button
              className={`reader-pill-btn theme-btn-light ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
              title="Clean Light Theme"
            >
              <FontAwesomeIcon icon={faSun} />
            </button>
          </div>

          {/* Copy & Download Actions */}
          <button className="reader-action-btn" onClick={handleCopy} title="Copy full markdown text">
            <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          <button className="reader-action-btn" onClick={handleDownload} title="Download .md file">
            <FontAwesomeIcon icon={faDownload} />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Main Layout: ToC Sidebar + Reading Scroll Canvas */}
      <div className="reader-workspace">
        {/* Table of Contents Drawer */}
        {sidebarOpen && (
          <aside className="reader-toc-drawer">
            <div className="reader-toc-header">
              <h3>Table of Contents</h3>
              <span className="toc-count">{assembledSections.length} Sections</span>
            </div>
            <nav className="reader-toc-nav">
              {assembledSections.map((sec, idx) => {
                const isActive = activeSectionId === sec.id;
                return (
                  <button
                    key={sec.id}
                    className={`reader-toc-item ${isActive ? 'active' : ''} kind-${sec.kind}`}
                    onClick={() => scrollToSection(sec.id)}
                  >
                    <span className="toc-item-number">{idx === 0 ? '✦' : `${idx}.`}</span>
                    <span className="toc-item-label">{sec.title}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

        {/* Scrollable Reader Canvas */}
        <main className="reader-scroll-canvas" ref={scrollContainerRef}>
          <div className="reader-content-measure">
            {assembledSections.map((sec, idx) => (
              <article
                key={sec.id}
                data-section-id={sec.id}
                className={`reader-section-block kind-${sec.kind}`}
              >
                {/* Section Header */}
                {sec.kind === 'frontispiece' ? (
                  <div className="reader-frontispiece">
                    <div className="frontispiece-ornament">✦ ✦ ✦</div>
                    <h1 className="frontispiece-title">{sec.title}</h1>
                    {sec.subtitle && <h2 className="frontispiece-subtitle">{sec.subtitle}</h2>}
                    <div className="frontispiece-divider" />
                    <p className="frontispiece-epigraph">"{sec.content}"</p>
                    <div className="frontispiece-meta">
                      <span>Setting: <strong>{encyclopedia?.project?.title}</strong></span>
                      <span>Origin: <strong>GPU Lease on Papai (Mistral-Small-24B)</strong></span>
                      <span>Canon Status: <strong>Verified &amp; Promoted</strong></span>
                    </div>
                  </div>
                ) : (
                  <>
                    <header className="section-chapter-header">
                      <div className="chapter-label">
                        {sec.kind === 'prologue' && 'PROLOGUE'}
                        {sec.kind === 'cast' && 'CHARACTERS & HEIRLOOMS'}
                        {sec.kind === 'chapter' && `CHAPTER ${idx - (assembledSections.some(s => s.kind === 'cast') ? 2 : 1)}`}
                        {sec.kind === 'epilogue' && 'EPILOGUE & BRAIDING'}
                        {sec.kind === 'appendix' && 'CANON LORE APPENDIX'}
                      </div>
                      <h2 className="section-title">{sec.title}</h2>
                      {sec.subtitle && <p className="section-subtitle">{sec.subtitle}</p>}
                      <div className="section-header-rule">
                        <span>❦</span>
                      </div>
                    </header>

                    {/* Section Body Prose */}
                    {sec.content && (
                      <div className="reader-prose-block">
                        {sec.content.split('\n\n').map((paragraph, pIdx) => {
                          const isFirst = pIdx === 0 && sec.kind === 'chapter';
                          return (
                            <p key={pIdx} className={isFirst ? 'chapter-lead-paragraph' : ''}>
                              {paragraph}
                            </p>
                          );
                        })}
                      </div>
                    )}

                    {/* Structured Scene Beats / Character Cards */}
                    {sec.beats && sec.beats.length > 0 && (
                      <div className="reader-beats-flow">
                        {sec.beats.map((beat, bIdx) => (
                          <div key={bIdx} className="reader-beat-card">
                            <div className="beat-header-row">
                              <span className="beat-number">§ {bIdx + 1}</span>
                              <h3 className="beat-title">{beat.title}</h3>
                            </div>
                            <div className="beat-body">
                              {beat.summary.split('\n').map((line, lIdx) => (
                                <p key={lIdx}>{line}</p>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="chapter-end-ornament">⁂</div>
                  </>
                )}
              </article>
            ))}

            {/* Book Colophon */}
            <footer className="reader-colophon">
              <div className="colophon-ornament">❦</div>
              <p>End of Manuscript</p>
              <small>
                Rendered with publication ergonomics in StoryTime • Realm of the Crossing Universe
              </small>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
