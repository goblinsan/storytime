/**
 * A surface that is routed and reachable but not yet built.
 *
 * Every route in the editorial tree resolves to a real component from the day
 * the tree is mounted, so the build compiles this code and the tests render it.
 * Each surface task replaces its own page; this is what it replaces.
 */
import Surface from './Surface';

export default function PlaceholderSurface({
  name,
  title,
  description,
}: {
  name: string;
  title: string;
  description: string;
}) {
  return (
    <Surface name={name}>
      <section className="editorial-empty-state" data-placeholder="true">
        <h1 className="editorial-empty-state__title">{title}</h1>
        <p className="editorial-empty-state__desc">{description}</p>
        <p className="editorial-empty-state__desc">Not built yet.</p>
      </section>
    </Surface>
  );
}
