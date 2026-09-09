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
  // The subject leads and the style trails, which is the same correction the
  // map prompt needed and which I did not carry over to this one.
  //
  // The reasoning was that a picture IS the work's illustration style, so the
  // style should lead. The evidence says otherwise: this universe's style is
  // "dramatic noir-style deep ink shadows and stark silhouette contrast", and
  // those are instructions about COMPOSITION, not about rendering. Leading
  // with them builds a dark silhouetted foreground framing a bright field,
  // which is a cave mouth or a tunnel, and it produced one for every place
  // asked about regardless of what the place was.
  //
  // Each part is clipped to its own budget and the whole is never truncated,
  // so nothing here can fall off the end the way the framing used to.
  const subject = [
    `${place.name}${place.regionType ? `, ${place.regionType.replace(/_/g, ' ')}` : ''}.`,
    clip(place.description, ROOM.description),
    clip(place.biome, ROOM.biome),
    clip(place.ecology, ROOM.ecology),
  ].filter(Boolean).join(' ');

  const positive = [
    // What it is, first.
    `An establishing view of ${subject}`,
    // The place fills the frame and is the subject. "A view from within, at
    // eye level, with a horizon" was the old instruction, and for a region of
    // vacuum whose own biome says "no ground, no weather, no horizon" it asks
    // for something incoherent -- so the model resolved it as an interior
    // looking out, which is the tunnel again.
    'The place itself is the subject and fills the frame, seen from a distance '
      + 'that shows what it is.',
    note?.trim() ? `Most importantly: ${note.trim()}` : '',
    // Last, where it tints the picture rather than deciding what is in it.
    style?.trim() ? `Painted in this manner: ${style.trim()}` : '',
  ].filter(Boolean).join(' ');

  return {
    positive,
    // The first four are the shape the silhouette style kept producing: a dark
    // foreground arch around a lit opening, read as a cave, a tunnel, or a
    // railway cutting. No people, because a figure in a picture of a place
    // becomes a character nobody wrote.
    // `top-down` used to be in here, to stop a picture coming out map-like.
    // It is too blunt: a view of a world from orbit is a top-down view, and
    // this quietly made "seen from space" unaskable. The cartographic case is
    // already covered by map, floor plan and blueprint, which name the kind of
    // drawing rather than the angle it is drawn from.
    //
    // The first four are the shape the silhouette style kept producing: a dark
    // foreground arch around a lit opening, read as a cave or a tunnel. No
    // people, because a figure in a picture of a place becomes a character
    // nobody wrote.
    negative: 'cave, cave mouth, tunnel, archway framing the view, railway, train tracks, '
      + 'interior looking outward, '
      + 'text, labels, lettering, words, captions, watermark, signature, '
      + 'map, floor plan, blueprint, people, crowd, portrait, '
      + 'blurry, low quality',
  };
}

/** Landscape, like a map, because a place is wider than it is tall. */
export const PLACE_IMAGE_SIZE = { width: 1216, height: 832 };
