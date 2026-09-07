import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import type { UniverseEncyclopedia, DerivativeWork } from '../types/story';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBook, faGlobe, faCopy, faCheck, faDownload,
  faFont, faMoon, faSun, faListUl, faWandMagicSparkles,
  faSpinner, faLayerGroup, faExpand, faCompress,
  faTriangleExclamation, faCheckCircle, faChevronRight,
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

export interface StoryGroup {
  id: string; // The parent story derivative ID or unique identifier
  title: string;
  subtitle?: string;
  description?: string;
  parentWork?: DerivativeWork;
  chapters: DerivativeWork[]; // Ordered chapters belonging to this story
  totalWordCount: number;
  isMultiChapter: boolean;
}

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
  acts?: Array<{ title?: string; summary?: string; actNumber?: number }>;
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

  // Multi-story selection state
  const [selectedStoryId, setSelectedStoryId] = useState<string>('');
  const [activeChapterScope, setActiveChapterScope] = useState<string>('all_chapters');

  // Reading preferences
  const [theme, setTheme] = useState<ReaderTheme>('parchment');
  const [fontSize, setFontSize] = useState<ReaderFontSize>('normal');
  const [fontFamily, setFontFamily] = useState<ReaderFontFamily>('serif');
  const [readingMode, setReadingMode] = useState<ReadingMode>('prose');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      })
      .catch((err) => console.error('Failed to load story reader data:', err))
      .finally(() => setLoading(false));
  }, [storyId]);

  // Group derivatives into distinct stories within this universe
  const storyGroups = useMemo((): StoryGroup[] => {
    const storyDerivs = derivatives.filter((d) => d.type === 'story');
    if (storyDerivs.length === 0) return [];

    const parentIds = new Set(
      storyDerivs.map((d) => (d.metadata as any)?.parentStoryId).filter(Boolean)
    );

    const groups: StoryGroup[] = [];
    const assignedChapterIds = new Set<string>();

    // 1. Explicit parent stories with child chapters
    for (const d of storyDerivs) {
      if (parentIds.has(d.id)) {
        const children = storyDerivs.filter((c) => (c.metadata as any)?.parentStoryId === d.id);
        if (children.length > 0) {
          children.forEach((c) => assignedChapterIds.add(c.id));
          assignedChapterIds.add(d.id);

          const sorted = [...children].sort((a, b) => {
            const numA =
              Number((a.metadata as any)?.chapterNumber) ||
              (a.title.match(/Chapter\s*(\d+)/i) ? parseInt(a.title.match(/Chapter\s*(\d+)/i)![1], 10) : 99);
            const numB =
              Number((b.metadata as any)?.chapterNumber) ||
              (b.title.match(/Chapter\s*(\d+)/i) ? parseInt(b.title.match(/Chapter\s*(\d+)/i)![1], 10) : 99);
            return numA - numB;
          });

          const totalWords = sorted.reduce(
            (acc, c) => acc + (Number((c.metadata as any)?.wordCount) || (c.content ? c.content.trim().split(/\s+/).length : 0)),
            0
          );

          groups.push({
            id: d.id,
            title: d.title,
            description: d.description,
            parentWork: d,
            chapters: sorted,
            totalWordCount: totalWords,
            isMultiChapter: true,
          });
        }
      }
    }

    // 2. Remaining story derivatives that weren't assigned as children
    const unassigned = storyDerivs.filter((d) => !assignedChapterIds.has(d.id));

    // Check if unassigned are legacy chapters sharing a story in Crossing
    const isCrossingUniverse = Boolean(
      encyclopedia?.project?.id === '3763a3f2-7fcc-40f7-bd2d-973845d3d03f' ||
      /Realm of the Crossing/i.test(encyclopedia?.project?.title || '')
    );

    if (isCrossingUniverse && unassigned.length > 0) {
      const siphon = unassigned.find((d) => d.title.includes('Vitriol Siphon')) || unassigned[0];
      const rest = unassigned.filter((d) => d.id !== siphon.id);
      const sorted = [...rest].sort((a, b) => {
        const getNum = (t: string) => {
          if (/Chapter\s*1|Deep Fissure/i.test(t)) return 1;
          if (/Chapter\s*2|Resonant Crown/i.test(t)) return 2;
          if (/Chapter\s*3|Sundered Lair/i.test(t)) return 3;
          const m = t.match(/Chapter\s*(\d+)/i);
          return m ? parseInt(m[1], 10) : 50;
        };
        return getNum(a.title) - getNum(b.title);
      });

      const totalWords = sorted.reduce(
        (acc, c) => acc + (Number((c.metadata as any)?.wordCount) || (c.content ? c.content.trim().split(/\s+/).length : 0)),
        0
      );

      groups.push({
        id: siphon.id,
        title: siphon.title || 'The Vitriol Siphon',
        description: siphon.description,
        parentWork: siphon,
        chapters: sorted.length > 0 ? sorted : [siphon],
        totalWordCount: totalWords,
        isMultiChapter: sorted.length > 0,
      });
    } else {
      // Treat remaining standalone stories as individual stories in this universe
      for (const s of unassigned) {
        groups.push({
          id: s.id,
          title: s.title,
          description: s.description,
          parentWork: s,
          chapters: [s],
          totalWordCount: Number((s.metadata as any)?.wordCount) || (s.content ? s.content.trim().split(/\s+/).length : 0),
          isMultiChapter: false,
        });
      }
    }

    return groups;
  }, [derivatives, encyclopedia]);

  // Sync selected story and chapter scope from initialDerivativeId or defaults
  useEffect(() => {
    if (storyGroups.length === 0) return;

    if (initialDerivativeId) {
      // 1. Direct match with a story group
      const matchingStory = storyGroups.find((g) => g.id === initialDerivativeId);
      if (matchingStory) {
        setSelectedStoryId(matchingStory.id);
        setActiveChapterScope('all_chapters');
        return;
      }
      // 2. Match with a chapter inside a story group
      const parentGroup = storyGroups.find((g) =>
        g.chapters.some((c) => c.id === initialDerivativeId)
      );
      if (parentGroup) {
        setSelectedStoryId(parentGroup.id);
        setActiveChapterScope(initialDerivativeId);
        return;
      }
    }

    // Default to the first story if selectedStoryId is empty or not in storyGroups
    if (!selectedStoryId || !storyGroups.some((g) => g.id === selectedStoryId)) {
      setSelectedStoryId(storyGroups[0].id);
      setActiveChapterScope('all_chapters');
    }
  }, [storyGroups, initialDerivativeId, selectedStoryId]);

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

  // Currently active story group
  const activeStoryGroup = useMemo(() => {
    if (storyGroups.length === 0) return null;
    return storyGroups.find((g) => g.id === selectedStoryId) || storyGroups[0];
  }, [storyGroups, selectedStoryId]);

  // Assemble the active story into cohesive, novelistic chapters
  const assembledSections = useMemo((): StorySection[] => {
    if (!encyclopedia || !activeStoryGroup) return [];
    const story = encyclopedia.project;
    const isCrossing = Boolean(
      story?.id === '3763a3f2-7fcc-40f7-bd2d-973845d3d03f' ||
      /Realm of the Crossing/i.test(story?.title || '')
    );

    const sections: StorySection[] = [];

    // Mode 1: Single specific chapter selected
    if (activeChapterScope !== 'all_chapters') {
      const selected =
        activeStoryGroup.chapters.find((c) => c.id === activeChapterScope) ||
        derivatives.find((d) => d.id === activeChapterScope);

      if (selected) {
        const isComposed = Boolean((selected.metadata as any)?.isComposedProse);
        sections.push({
          id: 'cover',
          derivativeId: selected.id,
          title: cleanChapterTitle(selected.title),
          subtitle: `${activeStoryGroup.title} • ${selected.type.toUpperCase()}`,
          kind: 'frontispiece',
          content: selected.description || '',
          isComposedProse: isComposed,
        });

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

    // Mode 2: Full Story Mode for activeStoryGroup
    // A. Frontispiece / Cover Page for THIS story
    const acts = (activeStoryGroup.parentWork?.metadata as any)?.acts;
    sections.push({
      id: 'cover',
      derivativeId: activeStoryGroup.parentWork?.id,
      title: activeStoryGroup.title,
      subtitle: `${activeStoryGroup.title} • A ${story?.title || 'Universe'} Story`,
      kind: 'frontispiece',
      content: activeStoryGroup.description || activeStoryGroup.parentWork?.description || 'A unified chronicle of composed narrative works.',
      isComposedProse: true,
      acts: Array.isArray(acts) && acts.length > 0 ? acts : undefined,
    });

    // Special Prologue for Crossing if this is Crossing's main story
    if (isCrossing && activeStoryGroup.title.includes('Vitriol Siphon')) {
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
    }

    // B. Chapters belonging STRICTLY to this story
    let chapterCounter = 0;
    let epilogueAdded = false;

    activeStoryGroup.chapters.forEach((ch) => {
      const isComposed = Boolean((ch.metadata as any)?.isComposedProse);
      const wordCount = (ch.metadata as any)?.wordCount;
      const cleaned = cleanChapterTitle(ch.title);
      const isEpilogue = /Acoustic|Braid|Vitriol Siphon/i.test(ch.title) && isCrossing;

      if (isEpilogue) {
        if (epilogueAdded) return;
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
  }, [encyclopedia, activeStoryGroup, activeChapterScope, derivatives]);

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

  // Compose all chapters across the active story
  const handleComposeAll = async () => {
    if (!storyId) return;
    setComposing(true);
    setQualityNotice(null);
    try {
      const res = await api.composer.composeAll(storyId, activeStoryGroup?.id);
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
          message: `All ${res.totalComposed} chapters of "${activeStoryGroup?.title || 'story'}" composed and passed quality review!`,
        });
      }
    } catch (err: any) {
      console.error('Failed to compose story novella:', err);
      setQualityNotice({
        passed: false,
        message: `Story composition error: ${err.message || 'Failed to compose all chapters'}`,
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
    const downloadTitle = activeStoryGroup?.title || encyclopedia?.project?.title || 'story';
    link.download = `${downloadTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-novel.md`;
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
            title="Table of Contents & Story Switcher"
          >
            <FontAwesomeIcon icon={faListUl} />
          </button>
          <div className="reader-title-meta">
            <span className="reader-universe-tag" title={encyclopedia?.project?.title}>
              <FontAwesomeIcon icon={faGlobe} /> {encyclopedia?.project?.title || 'Universe'}
            </span>
            <span className="reader-progress-pct">{readingProgress}% read</span>
          </div>
        </div>

        {/* Story Selector & Scope Selector */}
        <div className="reader-nav-selectors">
          {storyGroups.length > 0 && (
            <div className="reader-story-select-wrap">
              <label htmlFor="story-scope-select" className="reader-scope-label">
                <FontAwesomeIcon icon={faBook} /> Story:
              </label>
              <select
                id="story-scope-select"
                className="reader-story-select"
                value={selectedStoryId}
                onChange={(e) => {
                  setSelectedStoryId(e.target.value);
                  setActiveChapterScope('all_chapters');
                }}
              >
                {storyGroups.map((sg) => (
                  <option key={sg.id} value={sg.id}>
                    {sg.title} ({sg.chapters.length} {sg.chapters.length === 1 ? 'ch' : 'chs'} • {sg.totalWordCount.toLocaleString()} w)
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeStoryGroup && activeStoryGroup.isMultiChapter && (
            <div className="reader-scope-select-wrap">
              <label htmlFor="chapter-scope-select" className="reader-scope-label">Section:</label>
              <select
                id="chapter-scope-select"
                className="reader-scope-select"
                value={activeChapterScope}
                onChange={(e) => setActiveChapterScope(e.target.value)}
              >
                <option value="all_chapters">
                  📚 Full Story (All {activeStoryGroup.chapters.length} Chapters)
                </option>
                <optgroup label="Chapters">
                  {activeStoryGroup.chapters.map((ch, idx) => (
                    <option key={ch.id} value={ch.id}>
                      {idx + 1}. {cleanChapterTitle(ch.title)} {((ch.metadata as any)?.wordCount ? `(${Number((ch.metadata as any)?.wordCount).toLocaleString()} w)` : '')}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}
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

          {/* Compose Story Button */}
          <button
            className="reader-action-btn compose-all-btn"
            onClick={handleComposeAll}
            disabled={composing}
            title="Compose all chapter outlines into publication novel prose"
          >
            <FontAwesomeIcon icon={composing && !composingId ? faSpinner : faWandMagicSparkles} spin={composing && !composingId} />
            <span>{composing && !composingId ? 'Composing...' : '✨ Compose Story'}</span>
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

            {/* Current Story Badge */}
            {activeStoryGroup && (
              <div className="reader-toc-current-story">
                <span className="toc-current-story-label">Active Story:</span>
                <span className="toc-current-story-name">{activeStoryGroup.title}</span>
              </div>
            )}

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

            {/* Other Stories in this Universe Switcher */}
            {storyGroups.length > 1 && (
              <div className="reader-toc-other-stories">
                <h4>Other Stories in Universe</h4>
                {storyGroups
                  .filter((g) => g.id !== activeStoryGroup?.id)
                  .map((g) => (
                    <button
                      key={g.id}
                      className="toc-other-story-btn"
                      onClick={() => {
                        setSelectedStoryId(g.id);
                        setActiveChapterScope('all_chapters');
                      }}
                      title={`Switch to "${g.title}"`}
                    >
                      <FontAwesomeIcon icon={faBook} />
                      <div className="toc-other-story-info">
                        <span className="toc-other-story-title">{g.title}</span>
                        <span className="toc-other-story-count">
                          {g.chapters.length} {g.chapters.length === 1 ? 'chapter' : 'chapters'} • {g.totalWordCount.toLocaleString()} w
                        </span>
                      </div>
                      <FontAwesomeIcon icon={faChevronRight} className="toc-chevron-icon" />
                    </button>
                  ))}
              </div>
            )}
          </aside>
        )}

        {/* Scrollable Reader Canvas */}
        <main className="reader-scroll-canvas" ref={scrollContainerRef}>
          <div className="reader-content-measure">
            {assembledSections.length === 0 ? (
              <div className="reader-empty-manuscript">
                <div className="empty-manuscript-ornament">❦</div>
                <h2>Manuscript Awaiting Composition</h2>
                <p className="empty-manuscript-message">
                  <strong>{encyclopedia?.project?.title || 'This universe'}</strong> has established worldbuilding canon, but no continuous story chapters or manuscripts have been composed for it yet.
                </p>
                <div className="empty-manuscript-note">
                  Chapters can be outlined and drafted in the <strong>Derivatives &amp; Table Play</strong> studio or generated via the autonomous harness.
                </div>
              </div>
            ) : (
              <>
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
                          {sec.content && <p className="frontispiece-epigraph">"{sec.content}"</p>}

                          {/* Story Acts / Macro Narrative Overview */}
                          {sec.acts && sec.acts.length > 0 && (
                            <div className="story-acts-summary">
                              <h4>Narrative Acts &amp; Overview</h4>
                              <div className="story-acts-grid">
                                {sec.acts.map((act, aIdx) => (
                                  <div key={aIdx} className="story-act-card">
                                    <div className="story-act-header">{act.title || `Act ${act.actNumber || aIdx + 1}`}</div>
                                    <p>{act.summary}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="frontispiece-meta">
                            <span>Universe: <strong>{encyclopedia?.project?.title}</strong></span>
                            <span>Story: <strong>{activeStoryGroup?.title}</strong></span>
                            <span>Length: <strong>{activeStoryGroup?.chapters.length} {activeStoryGroup?.chapters.length === 1 ? 'Chapter' : 'Chapters'} ({activeStoryGroup?.totalWordCount.toLocaleString()} words)</strong></span>
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
                          </header>

                          {/* Chapter Prose Body */}
                          <div className="chapter-prose-body">
                            {displayContent
                              .split(/\n\n+/)
                              .filter((p) => p.trim())
                              .map((para, pIdx) => {
                                const isLead = pIdx === 0 && (sec.kind === 'prologue' || sec.kind === 'chapter');
                                return (
                                  <p key={pIdx} className={isLead ? 'chapter-lead-paragraph' : ''}>
                                    {para}
                                  </p>
                                );
                              })}
                          </div>

                          <div className="chapter-end-ornament">⁂</div>
                        </>
                      )}
                    </article>
                  );
                })}

                {/* Book Colophon */}
                <footer className="reader-colophon">
                  <div className="colophon-ornament">❦</div>
                  <p>End of Story</p>
                  <small>
                    {activeStoryGroup?.title || encyclopedia?.project?.title || 'Contesora Manuscript'} • {encyclopedia?.project?.title}
                  </small>
                </footer>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
