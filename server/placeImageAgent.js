/**
 * Asking for a picture of somewhere.
 *
 * The exact opposite of asking for a map, and deliberately so. A map is a
 * diagram: the cartographic framing has to lead or the model draws the place
 * instead of a plan of it, and the work's illustration style is demoted to a
 * tint. A picture is the other way round -- it IS the work's illustration
 * style, applied to a place, and what it wants is the view somebody standing
 * there would have.
 *
 * Both lessons came from the same failure. Asked for a map of a derelict
 * station with the style leading, the model returned a beautiful three-quarter
 * view of the station in space: useless as a map, and exactly right as a
 * picture. So it is not a bad prompt, it is the prompt for this instead.
 */
export const PLACE_IMAGE_REQUEST = 'location_image_request';

export function buildPlaceImagePrompt({ place, style, note }) {
  const said = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

  // What the place is comes first, because this is a picture OF something.
  // Setting and ecology are in here rather than the history: a drawing can
  // show salt flats and wire-grass, and cannot show a treaty.
  const subject = [
    `${place.name}${place.regionType ? `, ${place.regionType.replace(/_/g, ' ')}` : ''}.`,
    said(place.description),
    said(place.biome),
    said(place.ecology),
  ].filter(Boolean).join(' ');

  const positive = [
    style?.trim() ? `${style.trim()}.` : '',
    subject,
    // Without this it tends to a map-like overhead anyway, having been asked
    // for a place rather than a view of one.
    'A view from within the place at eye level, as somebody standing there '
      + 'would see it. Atmospheric, with depth and a horizon.',
    note?.trim() ? `Emphasise: ${note.trim()}` : '',
  ].filter(Boolean).join(' ');

  return {
    positive: positive.slice(0, 1800),
    // No people: this is a picture of a place, and a figure in it becomes a
    // character nobody wrote. Nothing about the map negative applies here --
    // perspective and a horizon are the point.
    negative: 'text, labels, lettering, words, captions, watermark, signature, '
      + 'map, floor plan, blueprint, top-down, people, crowd, portrait, '
      + 'blurry, low quality',
  };
}

/** Landscape, like a map, because a place is wider than it is tall. */
export const PLACE_IMAGE_SIZE = { width: 1216, height: 832 };
