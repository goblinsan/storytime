import { useState } from 'react';
import { editorialApi, type GeneratedDraft } from '../api';
import { useAsync } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from './StateViews';

const STATUS_ORDER: Record<GeneratedDraft['status'], number> = {
  generated: 0, rejected: 1, accepted: 2,
};

/**
 * What the harness has produced and what it is waiting on.
 *
 * A draft that failed its consistency gate is shown with the violations that
 * failed it, because "rejected" on its own tells an author nothing about what
 * to change.
 */
export default function DraftQueue({ universeId }: { universeId: string }) {
  const { status, data, error, retry } = useAsync(
    (signal) => editorialApi.listDrafts(universeId, signal), [universeId],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);

  if (status === 'loading') return <LoadingState label="Reading the generation queue…" />;
  if (status === 'error') {
    return <ErrorState title="Could not load generated drafts" error={error} onRetry={retry} />;
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title="Nothing generated yet"
        description="Drafts produced by the harness appear here with the result of their consistency gate, to be accepted into canon or rejected."
      />
    );
  }

  const drafts = [...data].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
  );

  const act = async (draft: GeneratedDraft, action: 'accept' | 'reject') => {
    setBusy(draft.id);
    setActionError(null);
    try {
      if (action === 'accept') {
        await editorialApi.promoteDraft(draft.id);
      } else {
        await editorialApi.setDraftStatus(draft.id, 'rejected');
      }
      retry();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBusy(null);
    }
  };

  const pending = drafts.filter((d) => d.status === 'generated').length;
  const failing = drafts.filter((d) => d.gateResult?.ok === false).length;

  return (
    <>
      <p className="editorial-activity-row__time">
        {drafts.length} drafts · {pending} awaiting review
        {failing > 0 && ` · ${failing} failed the consistency gate`}
      </p>

      {actionError && (
        <div className="editorial-error-state" role="alert">
          <h3 className="editorial-error-state__title">That did not go through</h3>
          <p className="editorial-error-state__desc">{actionError.message}</p>
        </div>
      )}

      <div className="editorial-scanning-list">
        {drafts.slice(0, 40).map((draft) => {
          const violations = draft.gateResult?.violations ?? [];
          const failed = draft.gateResult?.ok === false;
          return (
            <div className="editorial-action-row" key={draft.id}>
              <div className="editorial-action-row__detail">
                <span className="editorial-activity-row__title">
                  {draft.artifactType}
                  <span className="editorial-activity-row__actor">{draft.status}</span>
                </span>
                <span className="editorial-activity-row__time">
                  {draft.modelName ?? 'unknown model'}
                  {draft.dashboardTaskId && ` · task ${draft.dashboardTaskId}`}
                  {draft.createdAt && ` · ${new Date(draft.createdAt).toLocaleDateString()}`}
                </span>

                {failed && (
                  <span className="editorial-activity-row__time">
                    Gate failed: {violations.slice(0, 3).map((v) => v.message ?? v.code).join(' · ')}
                    {violations.length > 3 && ` (+${violations.length - 3} more)`}
                  </span>
                )}
              </div>

              {draft.status === 'generated' && (
                <span style={{ display: 'inline-flex', gap: 8 }}>
                  <button
                    type="button"
                    className="editorial-button"
                    onClick={() => act(draft, 'accept')}
                    disabled={busy === draft.id}
                  >
                    {busy === draft.id ? 'Working…' : 'Accept into canon'}
                  </button>
                  <button
                    type="button"
                    className="editorial-button editorial-button--quiet"
                    onClick={() => act(draft, 'reject')}
                    disabled={busy === draft.id}
                  >
                    Reject
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
