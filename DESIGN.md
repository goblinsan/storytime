# Contesora Visual Design System

## Foundations

### Color Strategy: Warm Literary Paper (Adaptive Dual Theme)

#### Light Mode (Default — Warm Editorial Codex)
- **Canvas / Page Background**: `oklch(0.985 0.008 85)` (`#fbfaf7`) - warm ivory paper
- **Surface Container**: `oklch(1.0 0 0)` (`#ffffff`) - crisp card & editor paper
- **Surface Elevated**: `oklch(0.96 0.012 85)` (`#f4f1ea`) - soft linen tint
- **Hairline Borders**: `oklch(0.91 0.012 85)` (`#e7e3da`) - subtle paper dividing rule
- **Text High Contrast**: `oklch(0.20 0.015 60)` (`#1c1917`) - deep warm ink / stone 900
- **Text Body**: `oklch(0.35 0.02 60)` (`#44403c`) - legible reading tone / stone 700
- **Text Muted / Captions**: `oklch(0.55 0.02 60)` (`#78716c`) - stone 500
- **Primary Accent**: `oklch(0.52 0.16 45)` (`#9a3412`) - burnt terracotta / sealing wax
- **Secondary Accent**: `oklch(0.65 0.14 75)` (`#b45309`) - warm antique amber
- **Tertiary Accent**: `oklch(0.50 0.12 185)` (`#0f766e`) - deep antique teal for cross-references

#### Dark Mode (Adaptive Obsidian Night)
- **Canvas**: `oklch(0.12 0.01 60)` (`#0c0a09`) - warm deep obsidian
- **Surface Container**: `oklch(0.18 0.015 60)` (`#1c1917`) - stone 900
- **Surface Elevated**: `oklch(0.24 0.018 60)` (`#292524`) - stone 800
- **Hairline Borders**: `oklch(0.32 0.015 60)` (`#44403c`) - stone 700
- **Text High Contrast**: `oklch(0.96 0.008 85)` (`#f5f5f4`)
- **Text Body**: `oklch(0.82 0.012 85)` (`#d6d3d1`)
- **Text Muted**: `oklch(0.62 0.015 85)` (`#a8a29e`)
- **Primary Accent**: `oklch(0.72 0.14 45)` (`#ea580c`)
- **Secondary Accent**: `oklch(0.78 0.12 75)` (`#d97706`)

### Typography
- **Heading Font Stack**: `'Lora', 'Newsreader', 'Charter', 'Iowan Old Style', 'Georgia', serif`
  - High editorial character, distinctive serifs, graceful letterforms
- **Body Font Stack**: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  - Neutral, crystal-clear, effortless reading
- **Monospace Stack**: `'SFMono-Regular', Menlo, Consolas, monospace`
- **Scale**:
  - H1 / Hero: 2.25rem (36px), 1.2 line-height, letter-spacing -0.02em, serif
  - H2 / Section: 1.5rem (24px), 1.25 line-height, letter-spacing -0.015em, serif
  - H3 / Card: 1.15rem (18.4px), 1.3 line-height, serif
  - Body: 0.95rem (15.2px), 1.6 line-height, sans-serif
  - Small / Meta: 0.82rem (13.1px), 1.4 line-height, sans-serif

### Spacing

Spacing comes from a scale or it does not come from anywhere. Two scales,
because there are two jobs.

- **`--editorial-space-1..16`** (4px grid: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64)
  positions layout. Fixed at every type size. Use it for padding, margin, gap
  and inset.
- **`--editorial-em-1..8`** (0.15, 0.25, 0.4, 0.5, 0.75, 1em) tracks the type it
  sits in, for things set inside a line of text: a chip in a paragraph, the gap
  between a label and its count.

No raw `rem`, `px` or `em` in a spacing or radius declaration. A declaration
that genuinely cannot come from either scale (optical alignment of a
decoration, clearance for chrome whose height is measured rather than chosen)
carries its reason on the line: `/* scale-exempt: why */`.

This is enforced, not encouraged: `server/__tests__/editorialSpacingScale.test.js`
fails the build and names the file and line. The scale existed from the start
and was followed about half the time, which is worse than having none, because
the result looks deliberate.

### Controls

The rule, before the roles.

1. **Geometry is not a free parameter.** One control height
   (`--editorial-control-height`, 32px), one dense height (24px), one padding
   pair (`--editorial-control-pad-y/x`, 8/12px), one radius
   (`--editorial-radius-control`, 6px). No role invents a size.
2. **Selection is terracotta ink plus one structural mark.** The mark is a 2px
   rule where the set is horizontal (a tab row) and a ground where it is a list
   (a rail). Two cues, so selection never rests on hue alone.
3. **Hover only ever changes the ground**, and never reaches the selected
   state's ink. If hovering an unselected item reads louder than the selected
   one, the state is decoration.
4. **A role may change ground, border and ink.** Something that also has to
   change type, alignment and geometry is not a button wearing a modifier; it
   is a link. `.editorial-link` is built from nothing rather than by
   subtracting a button.

### Elevation & Spatial Rhythm
- **Border Radius**: 6px for pills and inputs, 8px for containers. Never bubbly or exaggerated.
- **Dividers**: 1px solid `var(--border-subtle)`
- **Shadows**: Soft natural ambient diffusion:
  - Card: `0 1px 3px rgba(28, 25, 23, 0.04), 0 4px 12px rgba(28, 25, 23, 0.02)`
  - Elevated modal: `0 12px 36px rgba(28, 25, 23, 0.15)`

### UI Components
- **Navbar**: Clean editorial header with publication masthead feel, hairline rule, theme toggle icon.
- **Buttons**:
  - Primary: Burnt terracotta background `#9a3412`, white text, subtle hover darken.
  - Secondary: Surface elevated background `#f4f1ea`, 1px border `#e7e3da`, text `#1c1917`.
  - Ghost: transparent, text muted, hover linen tint.
  - Toggle: no ground, muted text, a 2px transparent rule beneath. Selected takes terracotta ink and a terracotta rule.
  - Row: full width, left aligned, selected takes `--editorial-row-selected` as a ground.
- **Pills & Badges**: Soft warm tints with delicate borders. The tint carries the
  label, never the state: `rgba(154, 52, 18, 0.08)` computes **1.14:1** against
  the canvas, which is not a state, and using it as one is how the cast filters
  ended up invisible. A selected control is identified by ink and a structural
  mark, per the Controls rules above.
- **Muted text**: `--editorial-text-muted` must clear 4.5:1 on every ground it
  lands on, including `--surface-muted` and `--surface-active`, in every theme
  preset. Guarded by `server/__tests__/editorialThemeContrast.test.js`.
