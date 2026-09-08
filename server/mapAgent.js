/**
 * Asking for a map of somewhere.
 *
 * The same shape as asking for a portrait, and for the same reason: what comes
 * back is candidates to choose between, in the style the active work asked for,
 * and nothing about the universe changes until somebody keeps one.
 *
 * WHAT A MAP IS HERE
 * A drawing, and never a fact. The coastline it invents is not canon and no
 * record is written from it; the only thing a kept map carries is a picture for
 * places to be pinned on. That distinction is the whole reason this can be
 * generated at all -- a made-up bay nobody approved is a backdrop, whereas a
 * made-up harbour town in the records would be a lie.
 */
export const MAP_REQUEST = 'location_map_request';

/**
 * What to draw.
 *
 * A map prompt is not a portrait prompt with the word "map" in it. It has to
 * ask for a plan view and say what is on it, and it has to be told what NOT to
 * draw: a model given place names will happily label them, and a label is a
 * claim about position that nobody made. Pins carry the names.
 */
export function buildMapPrompt({ place, children, style, note, previousPrompt }) {
  const named = children.filter((c) => c.name).slice(0, 12).map((c) => c.name);

  const subject = [
    `of ${place.name}${place.regionType ? `, ${place.regionType.replace(/_/g, ' ')}` : ''}.`,
    String(place.description ?? '').replace(/\s+/g, ' ').trim(),
    named.length
      ? `It contains ${named.length} named places, so leave open ground for them: ${named.join(', ')}.`
      : '',
  ].filter(Boolean).join(' ');

  // The cartographic framing leads, and the work's illustration style does not.
  // That order was found the hard way: asked for a map of a derelict station
  // with the work's style first -- "warm painted storybook illustration with
  // watercolour and gouache" -- the model returned a beautiful three-quarter
  // view of the station in space. Gorgeous, and nothing you can pin a place on.
  // The style is written for portraits; a map is a diagram, and it has to be
  // asked for as one.
  const positive = [
    'a top-down map, orthographic overhead view seen directly from above,',
    'flat two-dimensional plan, hand-drawn cartography, ink linework on aged parchment,',
    `a plan ${subject}`,
    // Kept, but last, where it tints the drawing instead of deciding what kind
    // of drawing it is.
    style?.trim() ? `Drawn in this manner: ${style.trim()}` : '',
    note?.trim() ? `Emphasise: ${note.trim()}` : '',
  ].filter(Boolean).join(' ');

  return {
    positive: positive.slice(0, 1800),
    // Text on a generated map is always wrong and always looks authoritative,
    // which is the exact combination this surface must not produce; the pins
    // carry the names. The perspective terms matter as much: without them the
    // model draws the place rather than a plan of it.
    negative: 'text, labels, lettering, words, captions, legend, compass rose, '
      + 'perspective, three-quarter view, horizon, sky, photorealistic, '
      + 'watermark, signature, blurry, low quality',
    previousPrompt: previousPrompt ?? null,
  };
}

/** A map wants a landscape frame far more often than a portrait does. */
export const MAP_SIZE = { width: 1216, height: 832 };
