import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { legacyTargetPath, type LegacyTarget } from './legacyRoutes';

/** Legacy URLs, mapped into the rebuilt information architecture. See section 2.3. */
export default function LegacyRedirect({ target }: { target: LegacyTarget }) {
  const params = useParams();
  const [search] = useSearchParams();
  const id = params.id ?? params.storyId ?? '';
  return <Navigate to={legacyTargetPath(target, id, search.get('tab'))} replace />;
}
