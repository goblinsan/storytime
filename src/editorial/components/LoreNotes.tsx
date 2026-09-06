import { useState } from 'react';

const PREVIEW_PARAGRAPHS = 3;

/**
 * The universe's own notes.
 *
 * Held in the stories content column since before any canon rows existed, and
 * unreachable anywhere in the rebuilt frontend until now. Long by nature, so it
 * opens on an excerpt rather than dominating the overview.
 */
export default function LoreNotes({ notes }: { notes: string }) {
  const [expanded, setExpanded] = useState(false);

  const paragraphs = notes.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return null;

  const shown = expanded ? paragraphs : paragraphs.slice(0, PREVIEW_PARAGRAPHS);
  const hidden = paragraphs.length - shown.length;

  return (
    <section className="editorial-band">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title">Notes</h2>
        <span className="editorial-activity-row__time">
          {paragraphs.length} {paragraphs.length === 1 ? 'paragraph' : 'paragraphs'}
        </span>
      </div>

      <div className="editorial-lore-notes">
        {shown.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          className="editorial-button editorial-button--quiet"
          onClick={() => setExpanded(true)}
        >
          Read the remaining {hidden} {hidden === 1 ? 'paragraph' : 'paragraphs'}
        </button>
      )}
      {expanded && paragraphs.length > PREVIEW_PARAGRAPHS && (
        <button
          type="button"
          className="editorial-button editorial-button--quiet"
          onClick={() => setExpanded(false)}
        >
          Show less
        </button>
      )}
    </section>
  );
}
