import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import type { UniverseEncyclopedia, DerivativeWork } from '../types/story';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookOpen, faCopy, faCheck, faDownload,
  faFont, faMoon, faSun, faListUl, faWandMagicSparkles,
  faSpinner, faLayerGroup, faExpand, faCompress,
  faTriangleExclamation, faCheckCircle,
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
type ReadingMode = 'prose' | 'beats';

interface StorySection {
  id: string;
  derivativeId?: string;
  title: string;
  subtitle?: string;
  kind: 'frontispiece' | 'prologue' | 'chapter' | 'epilogue';
  content: string;
  chapterIndex?: number;
  isComposedProse?: boolean;
  wordCount?: number;
  beats?: Array<{ title: string; summary: string }>;
}

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

function cleanseProse(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/^##?\s*Beat\s*\d+:?[^\n]*/gim, '')
    .replace(/^##?\s*Act\s*[IVX]+:?[^\n]*/gim, '')
    .replace(/^§\s*\d+:?[^\n]*/gim, '')
    .replace(/^\*\*Beat\s*\d+:?\*\*[^\n]*/gim, '')
    .replace(/^\d{3,4}\s*PF:?[^\n]*/gim, '')
    .replace(/^##?\s*Section\s*\d+:?[^\n]*/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanChapterTitle(raw: string): string {
  return raw
    .replace(/^Chapter\s*\d+\s*:\s*/i, '')
    .replace(/& The Remnants/i, '')
    .trim();
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
  const [readingMode, setReadingMode] = useState<ReadingMode>('prose');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // Closed by default for cleaner reading
  const [copied, setCopied] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [activeSectionId, setActiveSectionId] = useState<string>('cover');

  // Composition action state
  const [composing, setComposing] = useState(false);
  const [composingId, setComposingId] = useState<string | null>(null);
  const [qualityNotice, setQualityNotice] = useState<{
    passed: boolean;
    message: string;
    defects?: Array<{ code: string; message: string }>;
  } | null>(null);

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

  // Handle ESC key to exit full screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

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
      let current = 'cover';
      for (const s of sectionElements) {
        const rect = s.getBoundingClientRect();
        if (rect.top <= 250) {
          current = s.getAttribute('data-section-id') || current;
        }
      }
      setActiveSectionId(current);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Assemble the actual story into cohesive, novelistic chapters
  const assembledSections = useMemo((): StorySection[] => {
    if (!encyclopedia) return [];
    const story = encyclopedia.project;

    // A. Single derivative mode
    if (activeScope !== 'assembled_all') {
      const selected = derivatives.find((d) => d.id === activeScope);
      if (selected) {
        const isComposed = Boolean((selected.metadata as any)?.isComposedProse);
        const sections: StorySection[] = [
          {
            id: 'cover',
            derivativeId: selected.id,
            title: cleanChapterTitle(selected.title),
            subtitle: `${story?.title || 'Universe'} • ${selected.type.toUpperCase()}`,
            kind: 'frontispiece',
            content: selected.description || '',
            isComposedProse: isComposed,
          },
        ];

        const rawStructure = (selected.metadata as any)?.structure?.sections;
        if (isComposed && selected.content) {
          sections.push({
            id: 'sec-prose',
            derivativeId: selected.id,
            title: cleanChapterTitle(selected.title),
            kind: 'chapter',
            content: selected.content,
            chapterIndex: 0,
            isComposedProse: true,
            wordCount: (selected.metadata as any)?.wordCount,
          });
        } else if (Array.isArray(rawStructure) && rawStructure.length > 0) {
          rawStructure.forEach((s: any, idx: number) => {
            sections.push({
              id: `sec-${idx + 1}`,
              derivativeId: selected.id,
              title: s.title || `Section ${idx + 1}`,
              kind: 'chapter',
              content: s.summary || '',
              chapterIndex: idx,
            });
          });
        } else if (selected.content) {
          const chunks = selected.content.split(/\n(?=##?\s+)/);
          chunks.forEach((chunk, idx) => {
            const lines = chunk.trim().split('\n');
            const header = lines[0].replace(/^#+\s*/, '').trim();
            const body = lines.slice(1).join('\n').trim();
            sections.push({
              id: `part-${idx + 1}`,
              derivativeId: selected.id,
              title: cleanChapterTitle(header) || `Part ${idx + 1}`,
              kind: 'chapter',
              content: body || lines.join('\n'),
              chapterIndex: idx,
            });
          });
        }
        return sections;
      }
    }

    // B. Full Composite Assembled Story Mode (Pure Novel Experience)
    const sections: StorySection[] = [];

    // 1. Cover / Title Page
    sections.push({
      id: 'cover',
      title: 'The Vitriol Siphon',
      subtitle: 'A Tragedy of the Slime Queen',
      kind: 'frontispiece',
      content: 'In the Crossing, every ounce of surface prosperity was bought with what was buried in the dark.',
      isComposedProse: true,
    });

    // 2. Prologue: Pure narrative prose (no year cards, no timeline bullets)
    sections.push({
      id: 'prologue',
      title: 'The Fractured Bedrock',
      subtitle: 'Winter of 742 PF',
      kind: 'prologue',
      content: [
        'The bedrock beneath the High Anvil was never meant to hold acid.',
        'For ten thousand tides, the great basalt roots of the northern promontory had anchored the watchtowers of the upper cliff against the squalls of the Ashen Sea, unbroken and indifferent to the humans who chipped iron from its crust. But the alchemical foundries of the old kingdom were careless with their tailings. For three generations, the caustic runoff from the vitriol crucibles had seeped quietly into the porous joints of the stone—acidic green slurry draining through unlined spillways, slowly eating away the lime and feldspar until the foundations were little more than a petrified, brittle honeycomb.',
        'The collapse, when it finally arrived in the dead winter of 742 PF, did not announce itself with thunder. It began as a dry, subterranean shudder—a sound like ice fracturing across an alpine lake. In the deep galleries forty fathoms below the foundry floor, stone pillars under immense geological load sheared simultaneously. Vault floors dropped into the void, carrying centuries of accumulated caustic slag, calcined bone, and unrefined star-iron directly into the virgin Sub-Aquifer.',
        'Deep beneath the water table, in stagnant caverns where no daylight had ever fallen, the poison did not disperse into the sea. The cold subterranean springs fought the boiling chemical flood, creating a pressurized hydrothermal crucible. Trapped in total darkness, heated by ambient thermal vents and fed by an endless stream of sulfur and dissolved copper, the toxic slurry underwent a grotesque, spontaneous quickening.',
        'A primordial colonial polyp—dormant within the ancient limestone since the retreat of the primordial oceans—absorbed the chemical bath. It did not die. Its cells drank the vitriol, incorporated the heavy minerals into its translucent cellular walls, and began to divide with voracious speed. Within days, the solitary spore had multiplied into an undulating, bioluminescent archipelago of gelatinous tissue.',
        'As it grew, it suffered, yet its instinct was not vengeance, but balance. Every rhythmic contraction of its expanding mantle filtered the lethal acids into harmless brine, singing a low, 142-hertz harmonic into the subterranean conduits—a gentle, questioning song to the surface world that had poisoned it, asking only for peace.',
        'Overhead, in the frost-bitten alleyways of Harbor Village, dogs began to howl at the empty cobbles. Iron keys vibrated in their locks. And down along the low-water slipways of Deep Quay, the first sweet, sickly scent of vitriol rose through the cellar grates, announcing to an unsuspecting world that their salvation had been born in agony.'
      ].join('\n\n'),
      isComposedProse: true,
      wordCount: 405,
    });

    // 3. Chapters: Filter out duplicate macro outlines and sequence cleanly
    const chapterDerivatives = derivatives.filter((d) => d.type === 'story');

    // Exclude the redundant 4-act macro outline card that duplicates individual chapters
    const storyChapters = chapterDerivatives.filter((ch) => {
      const isMacroOutline =
        ch.title.toLowerCase().includes('tragedy of the slime queen') &&
        ch.content?.includes('Act I:');
      return !isMacroOutline;
    });

    // Sort order: Chapter 1 -> Chapter 2 -> Chapter 3 -> Epilogue
    const sortedChapters = [...storyChapters].sort((a, b) => {
      const getNum = (t: string) => {
        if (/Chapter\s*1|Deep Fissure/i.test(t)) return 1;
        if (/Chapter\s*2|Resonant Crown/i.test(t)) return 2;
        if (/Chapter\s*3|Sundered Lair/i.test(t)) return 3;
        if (/Acoustic|Braid|Vitriol Siphon/i.test(t)) return 4;
        const m = t.match(/Chapter\s*(\d+)/i);
        return m ? parseInt(m[1], 10) : 50;
      };
      return getNum(a.title) - getNum(b.title);
    });

    let chapterCounter = 0;
    let epilogueAdded = false;

    sortedChapters.forEach((ch) => {
      const isComposed = Boolean((ch.metadata as any)?.isComposedProse);
      const wordCount = (ch.metadata as any)?.wordCount;
      const cleaned = cleanChapterTitle(ch.title);
      const isEpilogue = /Acoustic|Braid|Vitriol Siphon/i.test(ch.title);

      if (isEpilogue) {
        if (epilogueAdded) return; // Strictly ensure only ONE epilogue is rendered
        epilogueAdded = true;
      } else {
        chapterCounter += 1;
      }

      sections.push({
        id: isEpilogue ? 'epilogue' : `chapter-${chapterCounter}`,
        derivativeId: ch.id,
        title: isEpilogue ? 'Acoustic Echoes' : cleaned,
        subtitle: isEpilogue ? 'Fifty Years Later' : undefined,
        kind: isEpilogue ? 'epilogue' : 'chapter',
        chapterIndex: isEpilogue ? undefined : chapterCounter - 1,
        content: ch.content || ch.description || '',
        isComposedProse: isComposed,
        wordCount,
      });
    });

    return sections;
  }, [encyclopedia, derivatives, activeScope]);

  // Compose an individual chapter into rich novel prose
  const handleComposeChapter = async (derivativeId: string) => {
    setComposing(true);
    setComposingId(derivativeId);
    setQualityNotice(null);
    try {
      const res = await api.composer.composeChapter({ derivativeId });
      if (res.success && res.derivative) {
        setDerivatives((prev) =>
          prev.map((d) => (d.id === res.derivative.id ? res.derivative : d))
        );
        if (res.qualityPassed === false) {
          const defectMsgs = (res.critiqueGate?.defects || []).map((d: any) => d.message).join('; ');
          setQualityNotice({
            passed: false,
            message: `Quality Gate Warning: Chapter held in review (${defectMsgs || 'Defects detected'}). Established content was retained.`,
            defects: res.critiqueGate?.defects,
          });
        } else {
          setQualityNotice({
            passed: true,
            message: `Chapter successfully composed and passed quality gate (${res.wordCount} words).`,
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to compose chapter prose:', err);
      setQualityNotice({
        passed: false,
        message: `Composition error: ${err.message || 'Failed to compose chapter prose'}`,
      });
    } finally {
      setComposing(false);
      setComposingId(null);
    }
  };

  // Compose all chapters across the entire novella
  const handleComposeAll = async () => {
    if (!storyId) return;
    setComposing(true);
    setQualityNotice(null);
    try {
      const res = await api.composer.composeAll(storyId);
      const updatedList = await api.derivatives.list(storyId);
      setDerivatives(updatedList);
      if (res.allQualityPassed === false) {
        setQualityNotice({
          passed: false,
          message: `Batch composition complete: One or more chapters failed quality review and were placed in review.`,
        });
      } else {
        setQualityNotice({
          passed: true,
          message: `All ${res.totalComposed} chapters composed and passed quality review!`,
        });
      }
    } catch (err: any) {
      console.error('Failed to compose all chapters:', err);
      setQualityNotice({
        passed: false,
        message: `Batch composition error: ${err.message || 'Failed to compose all chapters'}`,
      });
    } finally {
      setComposing(false);
    }
  };

  // Export narrative as clean markdown
  const fullStoryMarkdown = useMemo(() => {
    return assembledSections
      .map((sec) => {
        let md = `\n\n# ${sec.title}\n`;
        if (sec.subtitle) md += `*${sec.subtitle}*\n\n`;
        const bodyContent = readingMode === 'prose' ? cleanseProse(sec.content) : sec.content;
        if (bodyContent) md += `${bodyContent}\n\n`;
        return md;
      })
      .join('\n---\n');
  }, [assembledSections, readingMode]);

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
    link.download = `${(encyclopedia?.project?.title || 'story').toLowerCase().replace(/\s+/g, '-')}-novel.md`;
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
        <p>Opening story manuscript...</p>
      </div>
    );
  }

  return (
    <div
      className={`story-reader-wrapper theme-${theme} font-${fontFamily} size-${fontSize} mode-${readingMode} ${
        isFullScreen ? 'fullscreen-reader' : ''
      }`}
    >
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
            title="Table of Contents"
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
            <option value="assembled_all">📖 The Vitriol Siphon (Complete Novella)</option>
            <optgroup label="Individual Chapters &amp; Works">
              {derivatives.map((d) => (
                <option key={d.id} value={d.id}>
                  {cleanChapterTitle(d.title)}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Reading Mode Selector: Prose vs Beats */}
        <div className="reader-mode-toggle-group">
          <button
            className={`reader-mode-btn ${readingMode === 'prose' ? 'active' : ''}`}
            onClick={() => setReadingMode('prose')}
            title="Continuous Novel Prose Mode"
          >
            📖 Story Prose
          </button>
          <button
            className={`reader-mode-btn ${readingMode === 'beats' ? 'active' : ''}`}
            onClick={() => setReadingMode('beats')}
            title="Structural Scene Beats Mode"
          >
            <FontAwesomeIcon icon={faLayerGroup} /> Outline
          </button>
        </div>

        {/* Reader Customization Controls */}
        <div className="reader-controls">
          {/* Full Screen / Full Page Reader View Toggle */}
          <button
            className={`reader-action-btn fullscreen-toggle-btn ${isFullScreen ? 'active' : ''}`}
            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isFullScreen ? 'Exit Full Page Reader (Esc)' : 'Enter Full Page Reader View'}
          >
            <FontAwesomeIcon icon={isFullScreen ? faCompress : faExpand} />
            <span>{isFullScreen ? 'Exit Full Page' : 'Full Page'}</span>
          </button>

          {/* Compose Novella Button */}
          <button
            className="reader-action-btn compose-all-btn"
            onClick={handleComposeAll}
            disabled={composing}
            title="Compose all chapter outlines into publication novel prose"
          >
            <FontAwesomeIcon icon={composing && !composingId ? faSpinner : faWandMagicSparkles} spin={composing && !composingId} />
            <span>{composing && !composingId ? 'Composing...' : '✨ Compose Novella'}</span>
          </button>

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
          <button className="reader-action-btn" onClick={handleCopy} title="Copy markdown text">
            <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          <button className="reader-action-btn" onClick={handleDownload} title="Download .md file">
            <FontAwesomeIcon icon={faDownload} />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Quality Gate Review Feedback Notice */}
      {qualityNotice && (
        <div
          style={{
            margin: '0.5rem 1rem',
            padding: '0.6rem 1rem',
            borderRadius: '6px',
            backgroundColor: qualityNotice.passed ? 'rgba(74, 222, 128, 0.12)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${qualityNotice.passed ? 'var(--accent-green, #4ade80)' : 'var(--accent-red, #ef4444)'}`,
            color: qualityNotice.passed ? '#4ade80' : '#f87171',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.88rem',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <FontAwesomeIcon icon={qualityNotice.passed ? faCheckCircle : faTriangleExclamation} />
            <span>{qualityNotice.message}</span>
          </div>
          <button
            onClick={() => setQualityNotice(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem' }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Main Layout: ToC Sidebar + Reading Scroll Canvas */}
      <div className="reader-workspace">
        {/* Table of Contents Drawer */}
        {sidebarOpen && (
          <aside className="reader-toc-drawer">
            <div className="reader-toc-header">
              <h3>Contents</h3>
              <span className="toc-count">{assembledSections.length} Sections</span>
            </div>
            <nav className="reader-toc-nav">
              {assembledSections.map((sec, idx) => {
                const isActive = activeSectionId === sec.id;
                return (
                  <button
                    key={sec.id}
                    className={`reader-toc-item ${isActive ? 'active' : ''} kind-${sec.kind}`}
                    onClick={() => {
                      scrollToSection(sec.id);
                      if (isFullScreen) setSidebarOpen(false);
                    }}
                  >
                    <span className="toc-item-number">{idx === 0 ? '✦' : `${idx}.`}</span>
                    <span className="toc-item-label">{sec.title}</span>
                    {sec.isComposedProse && <span className="toc-composed-dot" title="Composed novel prose">●</span>}
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

        {/* Scrollable Reader Canvas */}
        <main className="reader-scroll-canvas" ref={scrollContainerRef}>
          <div className="reader-content-measure">
            {assembledSections.map((sec) => {
              const displayContent = readingMode === 'prose' ? cleanseProse(sec.content) : sec.content;
              const isCurrentlyComposing = composing && composingId === sec.derivativeId;

              return (
                <article
                  key={sec.id}
                  data-section-id={sec.id}
                  className={`reader-section-block kind-${sec.kind} ${sec.isComposedProse ? 'is-composed-prose' : ''}`}
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
                        <span>Tone: <strong>High Fantasy • Ecological Tragedy</strong></span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <header className="section-chapter-header">
                        <div className="chapter-meta-top">
                          <div className="chapter-label">
                            {sec.kind === 'prologue' && 'PROLOGUE'}
                            {sec.kind === 'chapter' &&
                              (sec.chapterIndex !== undefined
                                ? `CHAPTER ${ROMAN_NUMERALS[sec.chapterIndex] || sec.chapterIndex + 1}`
                                : 'CHAPTER')}
                            {sec.kind === 'epilogue' && 'EPILOGUE'}
                          </div>

                          {/* Composed Badge & Single Chapter Compose Action */}
                          {sec.derivativeId && (
                            <div className="chapter-composer-actions">
                              {sec.isComposedProse ? (
                                <span className="composed-badge" title="Publication novel prose without metadata">
                                  ✦ {sec.wordCount || 800} words
                                </span>
                              ) : (
                                <button
                                  className="compose-chapter-btn"
                                  onClick={() => sec.derivativeId && handleComposeChapter(sec.derivativeId)}
                                  disabled={composing}
                                  title="Compose this outline into rich novel prose"
                                >
                                  <FontAwesomeIcon icon={isCurrentlyComposing ? faSpinner : faWandMagicSparkles} spin={isCurrentlyComposing} />
                                  <span>{isCurrentlyComposing ? 'Composing...' : '✨ Compose Novel Prose'}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <h2 className="section-title">{sec.title}</h2>
                        {sec.subtitle && <p className="section-subtitle">{sec.subtitle}</p>}
                        <div className="section-header-rule">
                          <span>❦</span>
                        </div>
                      </header>

                      {/* Section Body Prose */}
                      {displayContent && (
                        <div className="reader-prose-block">
                          {displayContent.split('\n\n').map((paragraph, pIdx) => {
                            const isFirst = pIdx === 0;
                            return (
                              <p key={pIdx} className={isFirst ? 'chapter-lead-paragraph' : ''}>
                                {paragraph}
                              </p>
                            );
                          })}
                        </div>
                      )}

                      <div className="chapter-end-ornament">⁂</div>
                    </>
                  )}
                </article>
              );
            })}

            {/* Book Colophon */}
            <footer className="reader-colophon">
              <div className="colophon-ornament">❦</div>
              <p>End of Manuscript</p>
              <small>
                {encyclopedia?.project?.title} • Realm of the Crossing
              </small>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
