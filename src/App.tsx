import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import CreateProject from './pages/CreateStory';
import Projects from './pages/Stories';
import Tools from './pages/Tools';
import DraftReviews from './pages/DraftReviews';
import ErrorBoundary from './components/ErrorBoundary';
import EditorialApp from './editorial/EditorialApp';
import { EDITORIAL_BASE } from './editorial/paths';
import './App.css';

function LegacyApp() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateProject />} />
        <Route path="/create/:storyId" element={<CreateProject />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:storyId" element={<CreateProject />} />
        <Route path="/universes/:storyId" element={<CreateProject />} />
        {/* Backward compat */}
        <Route path="/stories" element={<Projects />} />
        <Route path="/drafts" element={<DraftReviews />} />
        <Route path="/drafts/:draftId" element={<DraftReviews />} />
        <Route path="/tools" element={<Tools />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ErrorBoundary>
        <Routes>
          {/* The editorial tree mounts outside Layout: the rebuild does not wrap,
              adapt or restyle the legacy shell. Cutover moves this mount and the
              legacy branch below is deleted with it. */}
          <Route path={`${EDITORIAL_BASE}/*`} element={<EditorialApp />} />
          <Route path="*" element={<LegacyApp />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
