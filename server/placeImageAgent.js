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

/**
 * How long a piece of the record may lead the prompt.
 *
 * Enough to place the picture and not enough to become the picture. A record
 * that has been collaborated on runs to thousands of characters, and handing
 * all of it over does not produce a richer image -- it produces whichever
 * paragraph happened to survive the truncation.
 */
const ROOM = { description: 320, biome: 260, ecology: 180 };

/**
 * The first whole sentences that fit, and failing that whole words.
 *
 * A prompt that ends "each side filing that the other is trespas" hands the
 * model a fragment to finish, which is a worse instruction than the sentence
 * it came from. Sentence first, word boundary second, never mid-word.
 */
function clip(text, room) {
  const said = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (said.length <= room) return said;
  const cut = said.slice(0, room);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  if (sentence > room * 0.4) return cut.slice(0, sentence + 1).trim();
  const word = cut.lastIndexOf(' ');
  return `${(word > 0 ? cut.slice(0, word) : cut).trim()}…`;
}

export function buildPlaceImagePrompt({ place, style, note }) {
  // Each part is clipped to its own budget, and the whole is not truncated
  // afterwards. It used to be built long and cut to 1800 characters at the
  // end, which is how the instruction that says what KIND of picture this is
  // -- the eye-level view, the note the author typed -- fell off the end of a
  // prompt for a place whose biome alone ran to two thousand characters. What
  // reached the model was several hundred words about narrow corridors and low
  // ceilings, so it drew tunnels. What leads dominates, and what is cut is
  // simply gone.
  const subject = [
    `${place.name}${place.regionType ? `, ${place.regionType.replace(/_/g, ' ')}` : ''}.`,
    clip(place.description, ROOM.description),
    clip(place.biome, ROOM.biome),
    clip(place.ecology, ROOM.ecology),
  ].filter(Boolean).join(' ');

  const positive = [
    style?.trim() ? `${style.trim()}.` : '',
    subject,
    // Never truncated away: this is the difference between a picture of a
    // place and a picture of some prose about a place.
    'A view from within the place at eye level, as somebody standing there '
      + 'would see it. Atmospheric, with depth and a horizon.',
    note?.trim() ? `Most importantly: ${note.trim()}` : '',
  ].filter(Boolean).join(' ');

  return {
    positive,
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
