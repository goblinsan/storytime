# Brand assets

`contesora-mark.png` — the Contesora mark: the C with the star and the sprig.

The sidebar loads this by path and hides it if it is not there, so the app runs
without it: the brand falls back to the wordmark alone. Drop the artwork in
under exactly that name and it appears, no code change.

It is a raster on purpose, for now. A redrawn approximation of a real mark
reads as the mark done badly, so the artwork stands in until somebody builds a
proper SVG of it. When that exists, replace this file and switch the favicon in
`index.html` at the same time.
