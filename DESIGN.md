# StoryTime Visual Design System

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
- **Pills & Badges**: Soft warm tints with delicate borders, e.g. `rgba(154, 52, 18, 0.08)` with `#9a3412` text.
