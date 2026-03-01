Place your files here to import them into StoryTime.

## Supported Files

- **Markdown (.md)** — Imported as story content, character notes, or campaign notes.
  The filename becomes the title (e.g., `dragon-campaign.md` → "dragon-campaign").
  
- **Images (.png, .jpg, .jpeg, .gif, .webp, .svg)** — Stored as assets attached to a story.
  Can be referenced from characters, locations, or story content.

## How to Import

1. Copy or move your files into this `import/` directory
2. Open the app and go to **Create Story** or an existing story
3. Use the **Import** tab to scan this directory and pull files into your local database
4. Once imported, files are stored in the DB — you can remove them from this folder

## Directory Structure

You can organize files in subdirectories if you like — the importer will scan recursively.

```
import/
  campaign-notes.md
  characters/
    aragorn.md
    gandalf.md
  maps/
    middle-earth.png
    shire-detail.jpg
```
