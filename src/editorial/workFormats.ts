/**
 * Derivative formats, in a neutral order.
 *
 * A campaign is one format among several here, never the organising structure:
 * the product model is universe-first and the library must not re-impose a
 * campaign-first hierarchy.
 */
export const WORK_FORMATS = [
  { key: 'story', label: 'Stories' },
  { key: 'novel', label: 'Novels' },
  { key: 'screenplay', label: 'Screenplays' },
  { key: 'campaign', label: 'Campaigns' },
  { key: 'game_concept', label: 'Game concepts' },
  { key: 'storyboard', label: 'Storyboards' },
  { key: 'graphic_novel', label: 'Graphic novels' },
] as const;

const LABELS = new Map<string, string>(WORK_FORMATS.map((f) => [f.key, f.label]));

export const formatLabel = (type?: string): string => {
  if (!type) return 'Other';
  return LABELS.get(type) ?? type.replace(/_/g, ' ');
};

export const isReadable = (type?: string): boolean =>
  type === 'story' || type === 'novel' || type === 'screenplay' || type === 'graphic_novel';
