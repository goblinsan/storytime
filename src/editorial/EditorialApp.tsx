import { Route, Routes, useLocation } from 'react-router-dom';
import EditorialShell from './EditorialShell';
import NotFound from './components/NotFound';
import SurfaceBoundary from './components/SurfaceBoundary';
import LegacyRedirect from './LegacyRedirect';
import Dashboard from './pages/Dashboard';
import Universes from './pages/Universes';
import Library from './pages/Library';
import Search from './pages/Search';
import Compendium from './pages/Compendium';
import UniverseCreate from './pages/UniverseCreate';
import UniverseDashboard from './pages/UniverseDashboard';
import Direction from './pages/Direction';
import Encyclopedia from './pages/Encyclopedia';
import Characters from './pages/Characters';
import Geography from './pages/Geography';
import Timeline from './pages/Timeline';
import Societies from './pages/Societies';
import Bestiary from './pages/Bestiary';
import Arcs from './pages/Arcs';
import Technologies from './pages/Technologies';
import Works from './pages/Works';
import Media from './pages/Media';
import UniverseSettings from './pages/UniverseSettings';
import Reader from './pages/Reader';

/**
 * The editorial route tree.
 *
 * Paths are relative to wherever this tree is mounted, which is the single
 * place the /editorial prefix is applied (see src/editorial/paths.ts and
 * docs/editorial-ux-rebuild.md section 2.2.2). Cutover moves the mount; nothing
 * in this file changes.
 */
export default function EditorialApp() {
  const location = useLocation();
  return (
    <Routes>
      {/* The reader is full-viewport with its own minimal header, so it sits
          outside the shell rather than inside the content region. */}
      <Route
        path="universes/:id/read/:workId"
        element={<SurfaceBoundary key={location.pathname}><Reader /></SurfaceBoundary>}
      />

      <Route element={<SurfaceBoundary key={location.pathname}><EditorialShell /></SurfaceBoundary>}>
        <Route index element={<Dashboard />} />
        <Route path="universes" element={<Universes />} />
        <Route path="universes/new" element={<UniverseCreate />} />
        <Route path="library" element={<Library />} />
        <Route path="search" element={<Search />} />
        <Route path="compendium" element={<Compendium />} />

        <Route path="universes/:id" element={<UniverseDashboard />} />
        <Route path="universes/:id/direction" element={<Direction />} />
        <Route path="universes/:id/encyclopedia" element={<Encyclopedia />} />
        <Route path="universes/:id/characters" element={<Characters />} />
        <Route path="universes/:id/geography" element={<Geography />} />
        <Route path="universes/:id/timeline" element={<Timeline />} />
        <Route path="universes/:id/societies" element={<Societies />} />
        <Route path="universes/:id/bestiary" element={<Bestiary />} />
        <Route path="universes/:id/arcs" element={<Arcs />} />
        <Route path="universes/:id/technologies" element={<Technologies />} />
        <Route path="universes/:id/works" element={<Works />} />
        <Route path="universes/:id/media" element={<Media />} />
        <Route path="universes/:id/settings" element={<UniverseSettings />} />

        {/* Legacy URLs, kept working across cutover. See section 2.3. */}
        <Route path="stories" element={<LegacyRedirect target="dashboard" />} />
        <Route path="stories/:id" element={<LegacyRedirect target="universe" />} />
        <Route path="create" element={<LegacyRedirect target="universe-new" />} />
        <Route path="reader/:id" element={<LegacyRedirect target="reader" />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
