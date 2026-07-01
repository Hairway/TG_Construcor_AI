# Tap Gallery Constructor

Constructor and engine workspace for Tap Gallery playable projects.

The app is based on the existing puzzle editor and the studio Impion playable template. It reads briefs, turns source images into editable tile fields, validates puzzle logic, manages reusable assets/styles, and exports ready Impion playable projects.

`TG_playXX_YY` is the studio project-code format for Tap Gallery playables.

## Run Locally

```bash
npm install
npm run dev -- --port=3007 --host=0.0.0.0
```

Open:

```text
http://localhost:3007/
```

To enable `Import TZ URL`, `Import TZ PDF`, `Build Impion Project`, and `Build Playable ZIP`, start the local exporter in a second terminal:

```bash
npm run export:api
```

The exporter listens on:

```text
http://localhost:8787/
```

## Main Features

- Brief import from pasted text, public URLs, and PDF files.
- Image upload, crop, mask, and tile-field generation.
- Editable grid, colors, arrows, brush tools, and center cutout for characters.
- Live puzzle solvability report, logic hints, and test mode.
- Asset slots for background, tiles, trails, center character, UI panels/buttons, music, and SFX.
- Local asset library, playable library, and reusable style presets.
- Store links, task text, CTA, level label, redirect taps, motion, colors, and feedback settings.
- Shared tile texture mode with optional per-tile color tinting.
- Tutorial controls for hand target, tutorial text, start/repeat timing, visible duration, and end condition.
- Click-to-pick tutorial target tool for selecting the guided tile directly on the board.
- Layout controls for center character placement, task text styling, and tutorial pointer offset.
- Built-in playable templates and a build-readiness QA checklist.
- Impion source export and playable ZIP build through the local API/CLI.
- QA report export for review and handoff.

Store links are editable in the `TZ` panel. The exporter injects Android and iOS URLs into the Impion template together with task text, CTA, level text, button labels, colors, motion, and asset references.

Use `Playable Templates` for built-in gameplay/layout starting points, and `Style Presets` to save reusable skins separately from full projects: engine sizing, motion, gameplay labels, tutorial setup, tile render mode, layout, palette, and all asset slots. Use `Center Board` in the `Engine` panel to recalculate Impion offsets from the current grid and tile gaps.

## Validate

```bash
npm run lint
npm run build
```

## Export

1. Build and validate the puzzle in the app.
2. Press `Build Impion Project` for editable source files, or `Build Playable ZIP` for the final archive.
3. Outputs are written under `/Users/hairway/Documents/Codex/tap-gallery-constructor-exports`.

You can also export `Playable JSON` and run the CLI manually:

```bash
npm run export:impion -- \
  --input /path/to/TG_play01_01.json \
  --output /Users/hairway/Documents/Codex/tap-gallery-constructor-exports/TG_play01_01
```

Then build the exported playable:

```bash
cd /Users/hairway/Documents/Codex/tap-gallery-constructor-exports/TG_play01_01
npm install
npm run build
```

More details: [EXPORT_PIPELINE.md](./EXPORT_PIPELINE.md).
