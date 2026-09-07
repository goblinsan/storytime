/**
 * The Contesora mark: a C, a star in its counter, and a sprig of leaves.
 *
 * Drawn rather than embedded as an image, for two reasons. It has to be crisp
 * at 24px in the sidebar and at 32px as a favicon, which a raster cannot do;
 * and it has to survive both appearances, which a fixed-colour asset cannot.
 * The C and the star take the theme's primary accent and the leaves its
 * tertiary, so the mark is lifted to stay legible at night by the same code
 * that keeps the rest of the surface legible -- and it is covered by the same
 * contrast test.
 *
 * The C is one path, not a stroked circle: its inner curve is struck from a
 * centre 1.5 units right of the outer one, which leaves the left wall thick
 * and the right thin. Its terminals are cut on a slant -- the outer arc stops
 * further round than the inner one -- because ending both on the same vertical
 * makes a ring somebody cropped rather than a letter somebody drew.
 *
 * The sprig stays inside the counter. Drawn crossing the ring it read as a
 * twig laid over a logo, and at 24px the overshoot was the only part of it you
 * could see.
 */
export function Mark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      className={`editorial-emblem${className ? ` ${className}` : ''}`}
      viewBox="0 0 48 48"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path
        className="editorial-emblem__letter"
        d="M34.07 7.89 A19 19 0 1 0 34.07 40.11 L35.46 32.36 A13 13 0 1 1 35.46 15.64 Z"
      />
      <g className="editorial-emblem__sprig">
        <path
          className="editorial-emblem__stem"
          d="M19.6 35.4 C21.6 31.9 24.1 28.4 27.1 25.6"
          fill="none"
        />        <path d="M0 0 C3 -0.8 5.2 -3.2 6 -6.8 C2.3 -6 0.3 -3.3 0 0 Z" transform="translate(20.4 33.9) rotate(-66)" />
        <path d="M0 0 C3 -0.8 5.2 -3.2 6 -6.8 C2.3 -6 0.3 -3.3 0 0 Z" transform="translate(22.6 30.9) rotate(24)" />
        <path d="M0 0 C3 -0.8 5.2 -3.2 6 -6.8 C2.3 -6 0.3 -3.3 0 0 Z" transform="translate(25.1 27.6) rotate(-50)" />
      </g>
      <path
        className="editorial-emblem__star"
        d="M30 15 Q31.1 18.9 35 20 Q31.1 21.1 30 25 Q28.9 21.1 25 20 Q28.9 18.9 30 15 Z"
      />
    </svg>
  );
}
