import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Route-level error boundary.
 *
 * One lens throwing must not blank the whole workspace: the shell, the sidebar
 * and every other route stay usable, and the reader can navigate away rather
 * than reloading. Resets when the route key changes.
 */
export default class SurfaceBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('An editorial surface failed to render', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="editorial-error-state" role="alert">
        <h1 className="editorial-error-state__title">This view could not be drawn</h1>
        <p className="editorial-error-state__desc">{this.state.error.message}</p>
        <p className="editorial-error-state__desc">
          The rest of the workspace still works. Try another view, or reload this one.
        </p>
        <button
          type="button"
          className="editorial-button"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </div>
    );
  }
}
