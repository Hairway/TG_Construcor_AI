# Tap Gallery Constructor Export Pipeline

## App Export

In the Tap Gallery Constructor UI:

1. Fill `Project`. The `TG_playXX_YY` code is the studio naming convention for Tap Gallery playables.
2. Paste brief text into `TZ`, then press `Parse TZ`. For public links, fill `Notion URL` and press `Import TZ URL`. For PDF briefs, press `Import TZ PDF`.
3. Check and edit task text, CTA, Android URL, and iOS URL.
4. Upload and mask an image.
5. Edit grid colors and arrows. Use the `Arrow` tool for brush-based direction edits or right-click a tile to cycle its direction. For briefs that need a free center space, press `Center Hole`.
6. Press `Puzzle it!`, check `Puzzle Logic`, and use `Verify Logic` / `Logic Hints` to inspect the clearing order on the board.
7. Fill `Assets` with background, tile texture, trail texture, center character, UI button/panel textures, music, and SFX.
8. In `Engine`, tune shared tile texture mode, per-tile tinting, tile flight, trail color, labels, and redirect behavior.
9. In `Tutorial`, set the hand target, text, start/repeat timing, visible duration, and end condition. Use the `Target` tool to pick a tile directly on the board.
10. In `Layout`, tune center character placement, tutorial text size/color/position, and pointer offset.
11. Use `Playable Templates` to apply built-in behavior/layout presets without replacing the current grid.
12. Check `Build QA` before exporting.
13. Save reusable files through the asset `Save` buttons, save the visual setup through `Save Style Preset`, or save the whole playable draft through `Save to Library`.
14. Download `Playable JSON` and optionally `Export QA Report`.

The downloaded JSON is the canonical builder source. Keep it with the project.

Use `Import Playable JSON` in the `Project` panel to reopen a previously exported project and continue editing the grid, brief fields, engine settings, and asset slots.

The local `Playable Library` dropdown reopens browser-saved playable drafts. It uses the same canonical project shape as exported `Playable JSON`, but is intended for quick local iteration rather than permanent archival.

`Style Presets` restore scene settings, gameplay labels, tutorial setup, tile render mode, layout, palette, and asset slots without changing the current grid, tiles, project code, or brief text. Use `Center Board` after changing grid/gap values to recalculate centered Impion offsets.

Every exported `Playable JSON` includes a `validation` section with solvability status, cleared tile count, currently available moves, first moves, stuck tiles, and check time. `Build Impion Project` and `Build Playable ZIP` are disabled until the current board clears all tiles.

`Export QA Report` creates a markdown summary for handoff and review: project metadata, source brief link, store links, texts, gameplay settings, asset slots, first moves, stuck tiles, and build-ready status.

## Brief Parsing

PDF and URL parsing currently extract text through the local export API and map common Tap Gallery brief fields:

- project code and iteration, for example `TG_play093_15`;
- source Trello/Notion link;
- task text, CTA text, store/win button text;
- level label, for example `Level 99`;
- background color hints;
- redirect tap count from phrases such as "Любой тап переносит игрока в стор".

URL import supports public HTML/text/PDF pages. Private Notion/Trello links that return only a JavaScript app shell are rejected with a readable error; use exported PDF or pasted brief text for those until connector/token support is added.

## Local Libraries

The browser asset library stores reusable uploaded files locally:

- background image;
- tile texture;
- trail texture;
- center character image;
- store button texture;
- win button texture;
- CTA panel texture;
- win background image;
- music track;
- tap SFX;
- bad-move SFX;
- win SFX;
- warning SFX.

Browser libraries are local to the current browser profile and are not yet synced between machines.

## Local Impion Project Export

### From The App

Start the local exporter next to the Vite dev server:

```bash
npm run export:api
```

Then press one of the build buttons:

- `Build Impion Project` writes the editable source project.
- `Build Playable ZIP` writes the source project, runs `npm install`, runs `npm run build`, and returns the final zip path.

The exporter writes projects to:

```text
/Users/hairway/Documents/Codex/tap-gallery-constructor-exports/<PROJECT_CODE>
```

The app shows the exact output path. For zip builds, it also shows the archive path.

The local export API rejects project payloads with blocked `validation`, matching the UI build guard.

### From The CLI

Run:

```bash
npm run export:impion -- \
  --input /path/to/TG_play01_01.json \
  --output /Users/hairway/Documents/Codex/tap-gallery-constructor-exports/TG_play01_01
```

The exporter will:

- copy `PlayableTemplate_tested`;
- overlay the known Tap Gallery playable source layer from `src.zip`;
- write `playable-constructor-project.json` and `playable-qa-report.md` into the exported project;
- generate `src/my_stuff/tiles/TileFieldPreset.mjs`;
- patch `index.html` with task text, CTA text, store links, background color, and project code;
- patch gameplay parameters such as `modeClicks`, store button text, win button text, level label, selected tile tint, and wrong tap tint;
- patch selected-tile and wrong-tap feedback so the exported runtime uses the configured tints;
- patch tile settings and motion settings where supported;
- decode uploaded asset data URLs into `src/assets/textures` and `src/assets/sounds`;
- patch custom background, tile texture, trail texture, center character, store button, win button, CTA panel, win background, music, tap SFX, bad-move SFX, win SFX, and warning SFX references when those asset slots exist;
- save the canonical playable project JSON inside the exported project.

The CLI refuses blocked validation by default. For internal debugging only, pass `--allow-blocked`.

## Build Playable

Run:

```bash
cd /Users/hairway/Documents/Codex/tap-gallery-constructor-exports/TG_play01_01
npm install
npm run build
```

The Impion build outputs the playable zip in the exported project folder.

## Current Limits

- Full export is local API/CLI-based for now, not yet a hosted backend action inside Google AI Studio.
- Notion/Trello private-page reading still needs either a connector/backend token or pasted/exported page text.
