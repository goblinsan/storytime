import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import CreateProject from './pages/CreateStory';
import Projects from './pages/Stories';
import Tools from './pages/Tools';
import './App.css';

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateProject />} />
          <Route path="/create/:storyId" element={<CreateProject />} />
          <Route path="/projects" element={<Projects />} />
          {/* Backward compat */}
          <Route path="/stories" element={<Projects />} />
          <Route path="/tools" element={<Tools />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
