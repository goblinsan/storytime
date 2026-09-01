# StoryTime Visual Design System

## Foundations

### Color Strategy: Restrained Product Palette
- Background Canvas: `oklch(0.14 0.015 255)` (#090d16) tinted deep navy/slate neutral
- Surface Container: `oklch(0.18 0.02 255)` (#0f172a)
- Surface High: `oklch(0.24 0.025 255)` (#1e293b)
- Surface Border: `oklch(0.32 0.03 255)` (#334155)
- Text High-Contrast: `oklch(0.96 0.01 255)` (#f8fafc)
- Text Medium: `oklch(0.78 0.02 255)` (#cbd5e1)
- Text Muted: `oklch(0.62 0.03 255)` (#94a3b8)
- Primary Accent: `oklch(0.68 0.16 230)` (#0284c7 to #38bdf8) - Azure/Cyan for interactive highlights
- Secondary Accent: `oklch(0.76 0.14 80)` (#f59e0b) - Warm amber/gold for canon & universe badges
- Variant Accent: `oklch(0.62 0.18 290)` (#7c3aed to #a855f7) - Violet for shared variants

### Typography
- Primary Font Stack: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
- Monospace / Keys: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace
- Body Measure: 65 to 75ch max width for readability
- Line Height: 1.5 for body, 1.25 for headings

### Spacing & Elevation
- Base unit: 4px / 0.25rem scale (4, 8, 12, 16, 24, 32, 48px)
- Cards & Panels: 1px solid `oklch(0.32 0.03 255)`, 8px border-radius (`0.5rem`)
- Subtle ambient shadows: `0 4px 16px -2px rgba(0, 0, 0, 0.45)`

### Components & Controls
- Buttons:
  - Primary: `oklch(0.60 0.18 230)`, text high-contrast, subtle border
  - Secondary: Surface High background, 1px border, hover elevation
  - Ghost: transparent, text medium, hover background tint
- Navigation:
  - Top Level: Branded navbar with route indicator
  - Universe Level: Segmented icon-labeled navigation tabs with active pill indicator
- Pills & Badges:
  - Shared: cyan tint with subtle border
  - Variant: purple tint with subtle border
  - Local: slate neutral with subtle border
