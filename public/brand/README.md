# Brand assets

- **`contesora-mark.png`** — the artwork as delivered. Untouched. Its ground is
  a flat cream baked into the image.
- **`contesora-mark-transparent.png`** — the same artwork with that ground
  keyed out. This is what the app shows.
- **`contesora-icon.png`** — the transparent mark padded to a square, for the
  favicon, which browsers letterbox or squash otherwise.

Both derived files are generated from the original, so the original is the one
to replace when the artwork changes. Nothing about the mark's own colours is
altered: pixels within a distance of 10 of the ground colour (249, 247, 242)
become transparent, past 34 stay fully opaque, and the band between is ramped
so the edges do not fringe. The counter of the C keys out with the rest, which
is what makes it a mark rather than a tile.

The reason for the keying is dark mode. An opaque cream rectangle on a
near-black sidebar reads as a lit plate, not a logo. Filtering or blending the
image instead would have altered the brand's colours to solve a problem that is
really "this wants to be an SVG".

## Still to do

These are raster stand-ins. A proper SVG build of the mark replaces all three,
at which point the favicon can go back to being vector and the wordmark can be
set from the real letterforms rather than the product's body serif.
