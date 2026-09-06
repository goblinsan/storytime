import { useState, useEffect, useRef, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch,
  faUsers,
  faMap,
  faLandmark,
  faDragon,
  faRoute,
  faScroll,
  faWandMagicSparkles,
  faPenNib,
  faGlobe,
  faXmark,
  faArrowRight,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import type { UniverseEncyclopedia } from '../types/story';
import './CommandPalette.css';

interface Props {
  projectId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (tabId: string, entityId?: string) => void;
}

interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Factions' | 'Characters' | 'Places' | 'Bestiary' | 'Timeline' | 'Workspace Tabs';
  tabId: string;
  entityId?: string;
  icon: any;
}

export default function CommandPalette({ projectId, isOpen, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [encyclopedia, setEncyclopedia] = useState<UniverseEncyclopedia | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && projectId) {
      api.stories.getEncyclopedia(projectId)
        .then(setEncyclopedia)
        .catch((err) => console.error('Failed to load encyclopedia for search:', err));
    }
  }, [isOpen, projectId]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const items = useMemo(() => {
    const list: PaletteItem[] = [
      // Quick tab destinations
      { id: 'tab-overview', title: 'Encyclopedia Home', subtitle: 'Overview & dimension stats', category: 'Workspace Tabs', tabId: 'overview', icon: faGlobe },
      { id: 'tab-characters', title: 'Cast & Personas', subtitle: 'Characters, NPCs & parties', category: 'Workspace Tabs', tabId: 'characters', icon: faUsers },
      { id: 'tab-world', title: 'World & Map', subtitle: 'Regions, nodes & geography', category: 'Workspace Tabs', tabId: 'world', icon: faMap },
      { id: 'tab-culture', title: 'Factions & Culture', subtitle: 'Political blocs, religions & languages', category: 'Workspace Tabs', tabId: 'culture', icon: faLandmark },
      { id: 'tab-bestiary', title: 'Universe Bestiary', subtitle: 'Creatures, threats & variants', category: 'Workspace Tabs', tabId: 'bestiary', icon: faDragon },
      { id: 'tab-derivatives', title: 'Derivatives & Table Play', subtitle: 'Campaigns, stories & session packets', category: 'Workspace Tabs', tabId: 'derivatives', icon: faScroll },
      { id: 'tab-drafts', title: 'Generated Drafts', subtitle: 'Harness outputs & promotion queue', category: 'Workspace Tabs', tabId: 'drafts', icon: faWandMagicSparkles },
      { id: 'tab-notes', title: 'Lore Notes', subtitle: 'Scratchpads & worldbuilding notes', category: 'Workspace Tabs', tabId: 'notes', icon: faPenNib },
    ];

    if (encyclopedia?.catalog) {
      const { factions, characters, locations, bestiary, timelineEvents } = encyclopedia.catalog;

      if (factions) {
        for (const f of factions) {
          list.push({
            id: `fac-${f.id}`,
            title: f.name,
            subtitle: f.description ? f.description.slice(0, 60) : 'Faction record',
            category: 'Factions',
            tabId: 'culture',
            entityId: f.id,
            icon: faLandmark,
          });
        }
      }

      if (characters) {
        for (const c of characters) {
          list.push({
            id: `char-${c.id}`,
            title: c.name,
            subtitle: c.role || c.background ? `${c.role || ''} • ${c.background || ''}` : 'Character persona',
            category: 'Characters',
            tabId: 'characters',
            entityId: c.id,
            icon: faUsers,
          });
        }
      }

      if (locations) {
        for (const l of locations) {
          list.push({
            id: `loc-${l.id}`,
            title: l.name,
            subtitle: l.regionType || 'Geographic place',
            category: 'Places',
            tabId: 'world',
            entityId: l.id,
            icon: faMap,
          });
        }
      }

      if (bestiary) {
        for (const b of bestiary) {
          list.push({
            id: `beast-${b.id}`,
            title: b.name,
            subtitle: b.category ? `${b.category} • ${b.status}` : 'Bestiary creature',
            category: 'Bestiary',
            tabId: 'bestiary',
            entityId: b.id,
            icon: faDragon,
          });
        }
      }

      if (timelineEvents) {
        for (const t of timelineEvents) {
          list.push({
            id: `time-${t.id}`,
            title: t.title,
            subtitle: t.date || 'Historical Era',
            category: 'Timeline',
            tabId: 'timeline',
            entityId: t.id,
            icon: faRoute,
          });
        }
      }
    }

    if (!query.trim()) {
      return list;
    }

    const q = query.toLowerCase();
    return list.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        item.category.toLowerCase().includes(q)
    );
  }, [encyclopedia, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('.palette-item.active') as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIndex]) {
        const item = items[selectedIndex];
        onSelect(item.tabId, item.entityId);
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="palette-search-bar">
          <FontAwesomeIcon icon={faSearch} className="palette-search-icon" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search factions, characters, places, bestiary, or tabs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="palette-input"
          />
          <button onClick={onClose} className="palette-close-btn" title="Close (Esc)">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="palette-results" ref={listRef}>
          {items.length === 0 ? (
            <div className="palette-empty">No matching lore entries found.</div>
          ) : (
            items.map((item, index) => (
              <div
                key={item.id}
                className={`palette-item ${index === selectedIndex ? 'active' : ''}`}
                onClick={() => {
                  onSelect(item.tabId, item.entityId);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="palette-item-icon">
                  <FontAwesomeIcon icon={item.icon} />
                </div>
                <div className="palette-item-details">
                  <div className="palette-item-title">{item.title}</div>
                  {item.subtitle && <div className="palette-item-subtitle">{item.subtitle}</div>}
                </div>
                <div className="palette-item-meta">
                  <span className="palette-category-badge">{item.category}</span>
                  <FontAwesomeIcon icon={faArrowRight} className="palette-arrow" />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="palette-footer">
          <span><kbd>↑</kbd> <kbd>↓</kbd> to navigate</span>
          <span><kbd>↵</kbd> to select</span>
          <span><kbd>esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
