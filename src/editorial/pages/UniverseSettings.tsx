import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { editorialApi } from '../api';
import { useAsync } from '../useAsync';
import { ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { THEME_PRESETS, getTheme, themeStyle } from '../themes';

const PRESETS = [
  { id: 'neutral-codex', label: 'Neutral codex', note: 'Calm, bookish, warm neutral paper.' },
  { id: 'editorial-fantasy', label: 'Editorial fantasy', note: 'Parchment, deep umber, terracotta.' },
  { id: 'science-fiction', label: 'Science fiction', note: 'Cool slate and precision blue.' },
  { id: 'speculative-mystery', label: 'Speculative mystery', note: 'Soft ash, midnight slate, brass.' },
  { id: 'historical-chronicle', label: 'Historical chronicle', note: 'Warm linen, sepia, burgundy.' },
];

export default function UniverseSettings() {
  const { id = '' } = useParams();
  const loaded = useAsync((signal) => editorialApi.getDirection(id, signal), [id]);

  const [themeId, setThemeId] = useState('neutral-codex');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);

  useEffect(() => {
    if (loaded.status === 'ready' && loaded.data.theme) setThemeId(loaded.data.theme.id);
  }, [loaded.status, loaded.data]);

  if (loaded.status === 'loading') {
    return <Surface name="universe-settings"><LoadingState label="Reading settings…" /></Surface>;
  }
  if (loaded.status === 'error') {
    return (
      <Surface name="universe-settings">
        <ErrorState title="Could not load settings" error={loaded.error} onRetry={loaded.retry} />
      </Surface>
    );
  }

  const apply = async (next: string) => {
    setThemeId(next);
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await editorialApi.saveTheme(id, { themeId: next });
      setSaved(true);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface name="universe-settings">
      <div className="editorial-section-header">
        <h1 className="editorial-section-title">Settings</h1>
        {saving && <span className="editorial-activity-row__time">Saving…</span>}
        {saved && !saving && <span className="editorial-copied-feedback" role="status">Saved</span>}
      </div>

      <section className="editorial-band editorial-settings-panel">
        <div className="editorial-section-header">
          <h2 className="editorial-section-title">Theme</h2>
        </div>
        <p className="editorial-briefing__summary">
          A theme changes colour and type only. Navigation geometry, layout and
          spacing stay the same in every universe, so moving between them never
          means relearning where things are.
        </p>

        {saveError && (
          <div className="editorial-error-state" role="alert">
            <h2 className="editorial-error-state__title">Could not save the theme</h2>
            <p className="editorial-error-state__desc">{saveError.message}</p>
          </div>
        )}

        <div className="editorial-scanning-list">
          {PRESETS.filter((p) => THEME_PRESETS[p.id]).map((preset) => {
            const tokens = getTheme(preset.id);
            return (
              <div className="editorial-action-row" key={preset.id}>
                <div className="editorial-action-row__detail">
                  <span className="editorial-activity-row__title">{preset.label}</span>
                  <span className="editorial-activity-row__time">{preset.note}</span>
                  {/* The swatches are the theme's own tokens, so the choice is
                      made by looking rather than by reading a name. */}
                  <span aria-hidden="true" style={{ display: 'inline-flex', gap: 4, marginTop: 6 }}>
                    {[tokens.canvas, tokens.surface, tokens.accentPrimary, tokens.accentSecondary].map((c, i) => (
                      <span
                        key={i}
                        style={{
                          width: 22, height: 22, borderRadius: 3,
                          background: c, border: '1px solid rgba(0,0,0,.12)',
                        }}
                      />
                    ))}
                  </span>
                </div>
                <button
                  type="button"
                  className={themeId === preset.id ? 'editorial-button' : 'editorial-button editorial-button--quiet'}
                  onClick={() => apply(preset.id)}
                  aria-pressed={themeId === preset.id}
                  disabled={saving}
                >
                  {themeId === preset.id ? 'Applied' : 'Apply'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="editorial-band" style={themeStyle(themeId)}>
          <p className="editorial-briefing__summary" style={{ color: 'var(--editorial-text-body)' }}>
            This paragraph is drawn with the selected theme, so you can read it
            before committing to it.
          </p>
        </div>
      </section>

      <section className="editorial-band editorial-settings-panel">
        <div className="editorial-section-header">
          <h2 className="editorial-section-title">Autonomy and guardrails</h2>
        </div>
        <p className="editorial-briefing__summary">
          Autonomy posture and the prohibitions agents are held to live on the
          Direction surface, next to the standing direction they qualify.
        </p>
        <p className="editorial-activity-row__time">
          Currently <strong>{loaded.data.autonomyMode.replace('_', ' ')}</strong>
          {loaded.data.guardrails.length > 0
            ? ` with ${loaded.data.guardrails.length} guardrail${loaded.data.guardrails.length === 1 ? '' : 's'}.`
            : ', with no guardrails set.'}
        </p>
      </section>
    </Surface>
  );
}
