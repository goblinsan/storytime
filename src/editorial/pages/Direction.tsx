import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { editorialApi, type UniverseDirectionResponse } from '../api';
import { useAsync } from '../useAsync';
import { ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';

const AUTONOMY: Array<{ key: UniverseDirectionResponse['autonomyMode']; label: string; help: string }> = [
  { key: 'manual', label: 'Manual', help: 'Nothing is generated unless you ask for it.' },
  { key: 'assisted', label: 'Assisted', help: 'Agents propose; you approve before anything enters canon.' },
  { key: 'autonomous_explore', label: 'Autonomous explore', help: 'Agents fill gaps on their own. Protected records still require approval.' },
];

export default function Direction() {
  const { id = '' } = useParams();
  const loaded = useAsync((signal) => editorialApi.getDirection(id, signal), [id]);

  const [goal, setGoal] = useState('');
  const [focus, setFocus] = useState('');
  const [guardrails, setGuardrails] = useState('');
  const [autonomy, setAutonomy] = useState<UniverseDirectionResponse['autonomyMode']>('assisted');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);

  useEffect(() => {
    if (loaded.status !== 'ready') return;
    setGoal(loaded.data.persistentGoal);
    setFocus(loaded.data.temporaryFocus);
    setGuardrails(loaded.data.guardrails.join('\n'));
    setAutonomy(loaded.data.autonomyMode);
  }, [loaded.status, loaded.data]);

  if (loaded.status === 'loading') {
    return <Surface name="direction"><LoadingState label="Reading the direction…" /></Surface>;
  }
  if (loaded.status === 'error') {
    return (
      <Surface name="direction">
        <ErrorState title="Could not load the direction" error={loaded.error} onRetry={loaded.retry} />
      </Surface>
    );
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await editorialApi.saveDirection(id, {
        persistentGoal: goal,
        temporaryFocus: focus,
        guardrails: guardrails.split('\n').map((g) => g.trim()).filter(Boolean),
        autonomyMode: autonomy,
      });
      setSaved(true);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface name="direction">
      <div className="editorial-section-header">
        <h1 className="editorial-section-title">Direction</h1>
      </div>

      <p className="editorial-briefing__summary">
        What this universe is for, and what agents may do inside it without asking.
        Everything generated here is grounded in what you write below.
      </p>

      <form className="editorial-form" onSubmit={save}>
        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="direction-goal">Standing direction</label>
          <textarea
            id="direction-goal"
            rows={4}
            value={goal}
            placeholder="The through-line this universe is always working toward."
            onChange={(e) => setGoal(e.target.value)}
          />
        </div>

        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="direction-focus">Current focus</label>
          <textarea
            id="direction-focus"
            rows={3}
            value={focus}
            placeholder="What matters right now. Change this often; the standing direction rarely."
            onChange={(e) => setFocus(e.target.value)}
          />
        </div>

        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="direction-guardrails">Guardrails</label>
          <textarea
            id="direction-guardrails"
            rows={5}
            value={guardrails}
            placeholder={'One per line.\nNo time travel.\nNo resurrection without cost.'}
            onChange={(e) => setGuardrails(e.target.value)}
          />
          <p className="editorial-form-help">
            One per line. These are prohibitions, and agents are held to them.
          </p>
        </div>

        <fieldset className="editorial-form-group">
          <legend className="editorial-form-label">Autonomy</legend>
          {AUTONOMY.map((mode) => (
            <label key={mode.key} className="editorial-form-help" htmlFor={`autonomy-${mode.key}`}>
              <input
                id={`autonomy-${mode.key}`}
                type="radio"
                name="autonomy"
                checked={autonomy === mode.key}
                onChange={() => setAutonomy(mode.key)}
              />
              {' '}<strong>{mode.label}</strong> — {mode.help}
            </label>
          ))}
        </fieldset>

        {saveError && (
          <div className="editorial-error-state" role="alert">
            <h2 className="editorial-error-state__title">Could not save</h2>
            <p className="editorial-error-state__desc">{saveError.message}</p>
          </div>
        )}

        <div className="editorial-action-row">
          <button type="submit" className="editorial-button" disabled={saving}>
            {saving ? 'Saving…' : 'Save direction'}
          </button>
          {saved && <span className="editorial-copied-feedback" role="status">Saved</span>}
        </div>
      </form>
    </Surface>
  );
}
