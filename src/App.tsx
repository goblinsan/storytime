import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import CreateStory from './pages/CreateStory';
import Stories from './pages/Stories';
import Tools from './pages/Tools';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateStory />} />
          <Route path="/stories" element={<Stories />} />
          <Route path="/tools" element={<Tools />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
