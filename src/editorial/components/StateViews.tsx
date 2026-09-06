export function LoadingState({ label }: { label: string }) {
  return (
    <div className="editorial-loading-state" role="status" aria-live="polite">
      <div className="editorial-loading-state__spinner" aria-hidden="true" />
      <p className="editorial-empty-state__desc">{label}</p>
    </div>
  );
}

export function ErrorState({
  title, error, onRetry,
}: { title: string; error: Error; onRetry: () => void }) {
  return (
    <div className="editorial-error-state" role="alert">
      <h2 className="editorial-error-state__title">{title}</h2>
      <p className="editorial-error-state__desc">{error.message}</p>
      <button type="button" className="editorial-button" onClick={onRetry}>Try again</button>
    </div>
  );
}

export function EmptyState({
  title, description, children,
}: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="editorial-empty-state">
      <h2 className="editorial-empty-state__title">{title}</h2>
      <p className="editorial-empty-state__desc">{description}</p>
      {children}
    </div>
  );
}
