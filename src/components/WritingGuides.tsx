import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import type { StoryArc, Character, DerivativeWork, BestiaryEntry } from '../types/story';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRoute, faUsers, faStopwatch, faComments, faEye,
  faPlus, faCheck, faPenNib, faBookOpen,
} from '@fortawesome/free-solid-svg-icons';
import './WritingGuides.css';

interface Props {
  storyId: string | null;
  ensureStory: () => Promise<string>;
}

type GuideKey = 'plot_structure' | 'character_arcs' | 'pacing' | 'dialogue' | 'sensory';

export default function WritingGuides({ storyId, ensureStory }: Props) {
  const [content, setContent] = useState('');
  const [activeGuide, setActiveGuide] = useState<GuideKey>('plot_structure');
  const [arcs, setArcs] = useState<StoryArc[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [derivatives, setDerivatives] = useState<DerivativeWork[]>([]);
  const [bestiary, setBestiary] = useState<BestiaryEntry[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<Array<{ id: string; title: string; date?: string; summary?: string }>>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing story manuscript and universe composition elements
  useEffect(() => {
    if (!storyId) return;

    api.stories.get(storyId).then((story) => {
      setContent(story.content || '');
      if (Array.isArray(story.arcs)) setArcs(story.arcs);
      if (Array.isArray(story.bestiary)) setBestiary(story.bestiary);
      if (Array.isArray(story.timelineEvents)) {
        setTimelineEvents(story.timelineEvents as Array<{ id: string; title: string; date?: string; summary?: string }>);
      }
    }).catch(console.error);

    api.arcs.list(storyId).then(setArcs).catch(console.error);
    api.characters.list(storyId).then(setCharacters).catch(console.error);
    api.derivatives.list(storyId).then(setDerivatives).catch(console.error);
    api.bestiary.list(storyId).then(setBestiary).catch(console.error);
  }, [storyId]);

  // Auto-save manuscript with debounce
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setSaveStatus('saving');

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const id = await ensureStory();
        await api.stories.update(id, { content: newContent });
        setSaveStatus('saved');
      } catch (err) {
        console.error('Auto-save failed:', err);
        setSaveStatus('saved');
      }
    }, 800);
  };

  const appendToManuscript = (textToAppend: string) => {
    const updated = content ? `${content}\n\n${textToAppend}` : textToAppend;
    handleContentChange(updated);
  };

  const guideTabs: Array<{ id: GuideKey; title: string; icon: typeof faRoute; count?: number; description: string }> = [
    {
      id: 'plot_structure',
      title: 'Plot Structure',
      icon: faRoute,
      count: arcs.length + derivatives.filter(d => d.type === 'story' || d.type === 'campaign').length,
      description: 'Multi-act narrative arcs, premises, and outline sections.',
    },
    {
      id: 'character_arcs',
      title: 'Character Arcs',
      icon: faUsers,
      count: characters.length,
      description: 'Internal motivations, dramatic needs, flaws, and stakes.',
    },
    {
      id: 'pacing',
      title: 'Pacing & Beats',
      icon: faStopwatch,
      count: timelineEvents.length,
      description: 'Scene rhythm, tension escalation, and chronological turning points.',
    },
    {
      id: 'dialogue',
      title: 'Dialogue & Idioms',
      icon: faComments,
      description: 'Regional accents, faction oaths, and dialect conventions.',
    },
    {
      id: 'sensory',
      title: 'Sensory World Lore',
      icon: faEye,
      count: bestiary.length,
      description: 'Atmospheric textures, sounds, smells, and ecological presence.',
    },
  ];

  return (
    <div className="writing-studio">
      {/* Studio Header */}
      <div className="writing-studio-header">
        <div>
          <h2><FontAwesomeIcon icon={faPenNib} /> Storycraft Studio &amp; Composition</h2>
          <p>Compose stories directly from your universe’s plot structures, character arcs, and scene pacing beats.</p>
        </div>
        <div className="save-badge">
          {saveStatus === 'saving' ? (
            <span className="badge-saving">Saving manuscript...</span>
          ) : (
            <span className="badge-saved"><FontAwesomeIcon icon={faCheck} /> Manuscript Synced</span>
          )}
        </div>
      </div>

      <div className="writing-studio-grid">
        {/* Left Column: Live Composed Elements */}
        <div className="elements-sidebar">
          <div className="element-tabs">
            {guideTabs.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`element-tab-btn ${activeGuide === g.id ? 'active' : ''}`}
                onClick={() => setActiveGuide(g.id)}
              >
                <div className="tab-btn-title">
                  <FontAwesomeIcon icon={g.icon} />
                  <span>{g.title}</span>
                </div>
                {g.count !== undefined && <span className="tab-btn-count">{g.count}</span>}
              </button>
            ))}
          </div>

          {/* Active Guide Panel */}
          <div className="element-panel">
            {/* 1. Plot Structure */}
            {activeGuide === 'plot_structure' && (
              <div className="element-section">
                <div className="section-head">
                  <h4><FontAwesomeIcon icon={faRoute} /> Composed Plot Structure</h4>
                  <p>Narrative arcs and derivative outlines defined for this universe.</p>
                </div>

                {arcs.length === 0 && derivatives.length === 0 ? (
                  <div className="empty-element-hint">
                    No plot arcs or derivative story outlines populated yet.
                    Run an outline task or create a Story Arc in the Arcs &amp; Beats tab.
                  </div>
                ) : (
                  <div className="composed-cards-stack">
                    {derivatives.map((d) => (
                      <div key={d.id} className="composed-card">
                        <div className="composed-card-top">
                          <span className="card-tag">[{d.type}]</span>
                          <h5>{d.title}</h5>
                        </div>
                        {d.description && <p className="card-desc">{d.description}</p>}
                        {d.content && (
                          <div className="card-beats-preview">
                            <pre>{d.content.slice(0, 240)}...</pre>
                          </div>
                        )}
                        <button
                          type="button"
                          className="btn-append-element"
                          onClick={() => appendToManuscript(`## Plot Arc: ${d.title}\n${d.description}\n\n${d.content || ''}`)}
                        >
                          <FontAwesomeIcon icon={faPlus} /> Append Outline to Manuscript
                        </button>
                      </div>
                    ))}

                    {arcs.map((a) => (
                      <div key={a.id} className="composed-card">
                        <div className="composed-card-top">
                          <span className="card-tag">Arc {a.arcNumber}</span>
                          <h5>{a.title}</h5>
                        </div>
                        {a.description && <p className="card-desc">{a.description}</p>}
                        {a.details && a.details.length > 0 && (
                          <ul className="card-detail-list">
                            {a.details.map((beat, idx) => (
                              <li key={idx}><strong>Act {idx + 1}:</strong> {beat}</li>
                            ))}
                          </ul>
                        )}
                        <button
                          type="button"
                          className="btn-append-element"
                          onClick={() => appendToManuscript(`### Arc: ${a.title}\n${a.description}\n\n${a.details.map((d, i) => `${i + 1}. ${d}`).join('\n')}`)}
                        >
                          <FontAwesomeIcon icon={faPlus} /> Append Arc Beats
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 2. Character Arcs */}
            {activeGuide === 'character_arcs' && (
              <div className="element-section">
                <div className="section-head">
                  <h4><FontAwesomeIcon icon={faUsers} /> Cast &amp; Character Arcs</h4>
                  <p>Internal motivations, flaws, and transformation arcs from the universe roster.</p>
                </div>

                {characters.length === 0 ? (
                  <div className="empty-element-hint">
                    No characters registered in this universe. Author personas in the Cast tab.
                  </div>
                ) : (
                  <div className="composed-cards-stack">
                    {characters.map((c) => (
                      <div key={c.id} className="composed-card">
                        <div className="composed-card-top">
                          <h5>{c.name}</h5>
                          {c.role && <span className="card-role">{c.role}</span>}
                        </div>
                        {c.motivation && (
                          <div className="character-arc-box">
                            <strong>🎯 Internal Motivation &amp; Need:</strong>
                            <p>{c.motivation}</p>
                          </div>
                        )}
                        {(c.description || c.background) && (
                          <p className="card-desc">{c.description || c.background}</p>
                        )}
                        <button
                          type="button"
                          className="btn-append-element"
                          onClick={() => appendToManuscript(`> **${c.name}** (${c.role || 'Operative'})\n> *Motivation:* ${c.motivation || 'Guarding personal secrets'}\n\n`)}
                        >
                          <FontAwesomeIcon icon={faPlus} /> Insert Character Arc Cue
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. Pacing & Beats */}
            {activeGuide === 'pacing' && (
              <div className="element-section">
                <div className="section-head">
                  <h4><FontAwesomeIcon icon={faStopwatch} /> Pacing &amp; Scene Beats</h4>
                  <p>Chronological turning points and narrative rhythm.</p>
                </div>

                <div className="pacing-curve-box">
                  <div className="pacing-stage">
                    <span className="stage-num">Act I</span>
                    <span className="stage-name">The Hook</span>
                    <span className="stage-pace">Atmospheric / Steady</span>
                  </div>
                  <div className="pacing-stage">
                    <span className="stage-num">Act II</span>
                    <span className="stage-name">Escalation</span>
                    <span className="stage-pace">Tension Rising</span>
                  </div>
                  <div className="pacing-stage">
                    <span className="stage-num">Act III</span>
                    <span className="stage-name">Crisis &amp; Climax</span>
                    <span className="stage-pace">High Kinetic Velocity</span>
                  </div>
                  <div className="pacing-stage">
                    <span className="stage-num">Act IV</span>
                    <span className="stage-name">Resolution</span>
                    <span className="stage-pace">Haunting Consequence</span>
                  </div>
                </div>

                <h5 style={{ margin: '1rem 0 0.5rem', fontSize: '0.86rem', color: 'var(--text-heading)' }}>
                  Chronological Turning Points:
                </h5>
                {timelineEvents.length === 0 ? (
                  <div className="empty-element-hint">No timeline events defined in this universe.</div>
                ) : (
                  <div className="composed-cards-stack">
                    {timelineEvents.map((t) => (
                      <div key={t.id} className="composed-card">
                        <div className="composed-card-top">
                          <span className="card-tag">{t.date || 'Era'}</span>
                          <h5>{t.title}</h5>
                        </div>
                        {t.summary && <p className="card-desc">{t.summary}</p>}
                        <button
                          type="button"
                          className="btn-append-element"
                          onClick={() => appendToManuscript(`### Beat [${t.date || 'Time'}]: ${t.title}\n${t.summary || ''}\n`)}
                        >
                          <FontAwesomeIcon icon={faPlus} /> Insert Scene Beat
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4. Dialogue & Dialect */}
            {activeGuide === 'dialogue' && (
              <div className="element-section">
                <div className="section-head">
                  <h4><FontAwesomeIcon icon={faComments} /> Dialogue &amp; Cultural Idioms</h4>
                  <p>Voice textures, greetings, and sacred taboos.</p>
                </div>
                <div className="composed-card">
                  <h5>Maritime / Harbor Syndicate</h5>
                  <p className="card-desc">Short clipped jargon, salinity metaphors, risk assessments, and references to tidal shifts.</p>
                  <blockquote className="dialogue-example">
                    "Low tide takes what high tide carried. Don't sign your name on wet sand."
                  </blockquote>
                </div>
                <div className="composed-card">
                  <h5>High Anvil / Alchemical Scholastics</h5>
                  <p className="card-desc">Measured, rhythmic cadence, pH metaphors, harmonic resonance, and strict oaths.</p>
                  <blockquote className="dialogue-example">
                    "By the third precipitate, truth clarifies. Keep your flask sealed until the fumes cool."
                  </blockquote>
                </div>
              </div>
            )}

            {/* 5. Sensory World Lore */}
            {activeGuide === 'sensory' && (
              <div className="element-section">
                <div className="section-head">
                  <h4><FontAwesomeIcon icon={faEye} /> Sensory World Lore</h4>
                  <p>In-universe smells, textures, and biological acoustics from the Bestiary.</p>
                </div>

                <div className="composed-cards-stack">
                  {bestiary.map((b) => (
                    <div key={b.id} className="composed-card">
                      <div className="composed-card-top">
                        <h5>{b.name}</h5>
                        <span className="card-tag">{b.category}</span>
                      </div>
                      {b.inUniverseBackstory && (
                        <div className="character-arc-box">
                          <strong>🌍 Origin:</strong>
                          <p>{b.inUniverseBackstory}</p>
                        </div>
                      )}
                      {b.description && <p className="card-desc">{b.description}</p>}
                      <button
                        type="button"
                        className="btn-append-element"
                        onClick={() => appendToManuscript(`> *Sensory Texture (${b.name}):* ${b.description}\n`)}
                      >
                        <FontAwesomeIcon icon={faPlus} /> Insert Sensory Detail
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Writing & Manuscript Workspace */}
        <div className="manuscript-workspace">
          <div className="workspace-toolbar">
            <span className="workspace-title">
              <FontAwesomeIcon icon={faBookOpen} /> Story Manuscript &amp; Scene Draft
            </span>
            <div className="workspace-meta">
              <span>Words: {content.split(/\s+/).filter(Boolean).length}</span>
              <span>Characters: {content.length}</span>
            </div>
          </div>

          <textarea
            className="manuscript-editor"
            placeholder="Write your story here... Use the composed elements on the left to pull in plot structure acts, character arcs, and scene pacing beats."
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
