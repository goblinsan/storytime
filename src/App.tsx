import { BrowserRouter } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import EditorialApp from './editorial/EditorialApp';

/**
 * StoryTime is the editorial workspace.
 *
 * The legacy shell was retired at cutover; old URLs are handled by
 * LegacyRedirect inside EditorialApp, so there is one navigation system, not
 * two.
 */
function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ErrorBoundary>
        <EditorialApp />
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
