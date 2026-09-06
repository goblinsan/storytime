import { Link } from 'react-router-dom';
import { dashboardPath, searchPath } from '../paths';

export default function NotFound() {
  return (
    <section className="editorial-empty-state">
      <h1 className="editorial-empty-state__title">No such page</h1>
      <p className="editorial-empty-state__desc">
        That address does not match anything in the editorial workspace. It may have
        been a link from an older version of the app.
      </p>
      <p className="editorial-empty-state__desc">
        <Link to={dashboardPath()}>Go to the dashboard</Link>
        {' · '}
        <Link to={searchPath()}>Search the canon</Link>
      </p>
    </section>
  );
}
