import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { editorialApi } from '../api';
import Surface from '../components/Surface';
import { universePath } from '../paths';

const GENRES = [
  'High fantasy', 'Space opera', 'Cyberpunk', 'Alternate history',
  'Weird west', 'Cosmic horror', 'Near future', 'Mythic',
];

const SETTINGS = [
  'Secondary world', 'Alternate history', 'Far future', 'Near future',
  'Contemporary hidden', 'Post-collapse',
];

const AUTONOMY = [
  { key: 'manual', label: 'Manual', help: 'Nothing is generated unless you ask for it.' },
  { key: 'assisted', label: 'Assisted', help: 'Agents propose; you approve before anything enters canon.' },
  { key: 'autonomous_explore', label: 'Autonomous explore', help: 'Agents fill gaps on their own, and protected records still require approval.' },
];

/**
 * Deliberately one calm page, not a multi-step wizard: the contract asks for an
 * editorial prompt that establishes a universe, and a questionnaire would put
 * five screens between an author and their first world.
 */
export default function UniverseCreate() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [premise, setPremise] = useState('');
  const [genre, setGenre] = useState('');
  const [setting, setSetting] = useState('');
  const [autonomy, setAutonomy] = useState('assisted');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const canSubmit = title.trim().length > 0 && !saving;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const description = [premise.trim(), genre && `Genre: ${genre}.`, setting && `Setting: ${setting}.`]
        .filter(Boolean).join(' ');
      const universe = await editorialApi.createUniverse({
        title: title.trim(), description, premise: premise.trim(),
      });
      navigate(universePath(universe.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setSaving(false);
    }
  };

  return (
    <Surface name="universe-create">
      <div className="editorial-section-header">
        <h1 className="editorial-section-title">A new universe</h1>
      </div>

      <p className="editorial-briefing__summary">
        A universe is a world and its canon. Name it and say what it is; the
        geography, factions, timeline and bestiary are built from here, and
        stories come out of it later.
      </p>

      <form className="editorial-form" onSubmit={submit}>
        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="universe-title">Name</label>
          <input
            id="universe-title"
            value={title}
            required
            autoFocus
            placeholder="Void Requiem"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="universe-premise">Premise</label>
          <textarea
            id="universe-premise"
            rows={5}
            value={premise}
            placeholder="What is true about this world, and what is at stake in it?"
            onChange={(e) => setPremise(e.target.value)}
          />
          <p className="editorial-form-help">
            Everything generated later is grounded in this. A few sentences is enough.
          </p>
        </div>

        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="universe-genre">Narrative classification</label>
          <select id="universe-genre" value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="">Unclassified</option>
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="universe-setting">Setting category</label>
          <select id="universe-setting" value={setting} onChange={(e) => setSetting(e.target.value)}>
            <option value="">Unclassified</option>
            {SETTINGS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <fieldset className="editorial-form-group">
          <legend className="editorial-form-label">Initial autonomy</legend>
          {AUTONOMY.map((mode) => (
            <label key={mode.key} className="editorial-form-help" htmlFor={`autonomy-${mode.key}`}>
              <input
                id={`autonomy-${mode.key}`}
                type="radio"
                name="autonomy"
                value={mode.key}
                checked={autonomy === mode.key}
                onChange={() => setAutonomy(mode.key)}
              />
              {' '}<strong>{mode.label}</strong> — {mode.help}
            </label>
          ))}
          <p className="editorial-form-help">
            Autonomy is not yet persisted; it becomes a stored guardrail when the
            editorial workspace tables land.
          </p>
        </fieldset>

        {error && (
          <div className="editorial-error-state" role="alert">
            <h2 className="editorial-error-state__title">Could not create the universe</h2>
            <p className="editorial-error-state__desc">{error.message}</p>
          </div>
        )}

        <button type="submit" className="editorial-button" disabled={!canSubmit}>
          {saving ? 'Creating…' : 'Create universe'}
        </button>
      </form>
    </Surface>
  );
}
