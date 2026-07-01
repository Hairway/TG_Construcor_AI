#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_TEMPLATE_DIR = "/Users/hairway/Documents/Codex/tap-gallery-constructor-research/playable-template-tested";
const DEFAULT_PLAYABLE_SRC_DIR = "/Users/hairway/Documents/Codex/tap-gallery-constructor-research/tap-gallery-example-src/src";

const args = parseArgs(process.argv.slice(2));

if (!args.input || !args.output) {
  console.error([
    "Usage:",
    "  node tools/export-impion-project.mjs --input <playable-project.json> --output <output-dir>",
    "",
    "Optional:",
    `  --template ${DEFAULT_TEMPLATE_DIR}`,
    `  --playable-src ${DEFAULT_PLAYABLE_SRC_DIR}`,
    "  --allow-blocked",
  ].join("\n"));
  process.exit(1);
}

const inputPath = path.resolve(args.input);
const outputDir = path.resolve(args.output);
const templateDir = path.resolve(args.template || DEFAULT_TEMPLATE_DIR);
const playableSrcDir = path.resolve(args.playableSrc || DEFAULT_PLAYABLE_SRC_DIR);
const project = normalizeProject(JSON.parse(fs.readFileSync(inputPath, "utf8")));

if (!args.allowBlocked && project.validation && project.validation.totalTiles > 0 && project.validation.solvable === false) {
  console.error(`Puzzle logic is blocked: ${project.validation.clearedTiles || 0}/${project.validation.totalTiles} tiles clear.`);
  console.error("Run Puzzle it / fix arrows first, or pass --allow-blocked for a debug export.");
  process.exit(2);
}

assertDir(templateDir, "template");
assertDir(playableSrcDir, "playable source");

fs.rmSync(outputDir, { recursive: true, force: true });
copyDir(templateDir, outputDir);
copyDir(playableSrcDir, path.join(outputDir, "src"));

writeJson(path.join(outputDir, "playable-constructor-project.json"), project);
writeText(path.join(outputDir, "playable-qa-report.md"), renderQaReport(project));
const exportedAssets = writeProjectAssets(outputDir, project);
writeText(
  path.join(outputDir, "src", "my_stuff", "tiles", "TileFieldPreset.mjs"),
  renderTileFieldPreset(project)
);
patchIndexHtml(path.join(outputDir, "index.html"), project);
patchCreateObjects2d(path.join(outputDir, "src", "CreateObjects2D.mjs"), project, exportedAssets);
patchItemMotion(path.join(outputDir, "src", "my_stuff", "tiles", "Item.mjs"), project, exportedAssets);
patchNodeFeedback(path.join(outputDir, "src", "my_stuff", "tiles", "Node.mjs"));
patchTileSet(path.join(outputDir, "src", "my_stuff", "tiles", "TileSet.mjs"));
patchGame(path.join(outputDir, "src", "Game.mjs"), project, exportedAssets);

console.log(`Exported Impion playable project: ${outputDir}`);
console.log(`Project: ${project.project?.code || "playable_project"}`);
console.log(`Grid: ${project.scene?.grid?.width || 0}x${project.scene?.grid?.height || 0}`);
console.log("Next: cd into the exported folder, run npm install if needed, then npm run build.");

function parseArgs(rawArgs) {
  const parsed = {};
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--input") parsed.input = rawArgs[++i];
    else if (arg === "--output") parsed.output = rawArgs[++i];
    else if (arg === "--template") parsed.template = rawArgs[++i];
    else if (arg === "--playable-src") parsed.playableSrc = rawArgs[++i];
    else if (arg === "--allow-blocked") parsed.allowBlocked = true;
  }
  return parsed;
}

function assertDir(dir, label) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Missing ${label} directory: ${dir}`);
  }
}

function normalizeProject(rawProject) {
  const project = rawProject && typeof rawProject === "object" ? rawProject : {};
  return {
    ...project,
    project: {
      ...(project.project || {}),
      game: normalizeGameName(project.project?.game),
    },
    tutorial: {
      enabled: true,
      targetMode: "first-available",
      targetX: 0,
      targetY: 0,
      text: "Tap the highlighted tile!",
      startDelay: 2,
      repeatDelay: 4,
      visibleDuration: 0,
      endCondition: "specific-tile",
      ...(project.tutorial || {}),
    },
    tileRendering: {
      useSharedTexture: true,
      tintSharedTexture: true,
      fallbackTint: "#ffffff",
      ...(project.tileRendering || {}),
    },
    layout: {
      centerCharacterX: 0,
      centerCharacterY: 0,
      centerCharacterScaleVertical: 0.48,
      centerCharacterScaleHorizontal: 0.42,
      taskTextY: -80,
      taskTextHorizontalX: -200,
      taskTextFontSize: 75,
      taskTextColor: "#f2f2f2",
      pointerOffsetX: 0,
      pointerOffsetY: 0,
      ...(project.layout || {}),
    },
  };
}

function normalizeGameName(gameName) {
  if (!gameName || /tap\s+(?:[a-z]+\s+)?gallery/i.test(gameName)) {
    return "Tap Gallery";
  }
  return gameName;
}

function renderQaReport(project) {
  const validation = project.validation || {};
  const scene = project.scene || {};
  const brief = project.brief || {};
  const gameplay = project.gameplay || {};
  const theme = project.theme || {};
  const motion = project.motion || {};
  const tutorial = project.tutorial || {};
  const tileRendering = project.tileRendering || {};
  const layout = project.layout || {};
  const assets = project.assets || {};
  const tiles = Array.isArray(project.tiles) ? project.tiles : [];
  const hasValidation = Number.isFinite(validation.totalTiles);
  const logicStatus = hasValidation ? (validation.solvable ? "SOLVABLE" : "BLOCKED") : "NOT CHECKED";
  const buildReady = hasValidation ? (validation.solvable ? "yes" : "no") : "unknown";
  const assetLines = Object.entries({
    backgroundImage: assets.backgroundImage,
    tileTexture: assets.tileTexture,
    trailTexture: assets.trailTexture,
    centerCharacter: assets.centerCharacter,
    storeButtonTexture: assets.storeButtonTexture,
    winButtonTexture: assets.winButtonTexture,
    ctaPanelTexture: assets.ctaPanelTexture,
    winBackgroundImage: assets.winBackgroundImage,
    musicTrack: assets.musicTrack,
    tapSound: assets.tapSound,
    badMoveSound: assets.badMoveSound,
    winSound: assets.winSound,
    warningSound: assets.warningSound,
  }).map(([slot, asset]) => `- ${assetSlotLabel(slot)}: ${asset?.filename || "not set"}`).join("\n");
  const firstMoves = (validation.firstMoves || [])
    .map((tile, index) => `${index + 1}. (${tile.x}, ${tile.y}) ${tile.direction}`)
    .join("\n") || "No moves";
  const stuckTiles = (validation.stuckTiles || [])
    .slice(0, 24)
    .map(tile => `- (${tile.x}, ${tile.y}) ${tile.direction}`)
    .join("\n") || "None";

  return `# ${project.project?.code || "playable_project"} QA Report

## Project
- Game: ${project.project?.game || "Tap Gallery"}
- Iteration: ${project.project?.iteration || 1}
- Source TZ: ${project.project?.sourceTzUrl || "not set"}
- Grid: ${scene.grid?.width || 0}x${scene.grid?.height || 0}
- Tiles: ${tiles.length}

## Brief
- Task: ${brief.taskText || ""}
- CTA: ${brief.ctaText || ""}
- Android URL: ${brief.androidUrl || ""}
- iOS URL: ${brief.iosUrl || ""}

## Gameplay
- Level: ${gameplay.levelText || ""}
- Redirect tap count: ${gameplay.redirectTapCount || 0}
- Store button: ${gameplay.storeButtonText || ""}
- Win button: ${gameplay.winButtonText || ""}
- Tile flight: ${motion.tileFlightDuration || ""}s / ${motion.tileFlightEase || ""}
- Background: ${theme.backgroundColor || ""}
- Trail tint: ${theme.trailTint || ""}
- Shared tile texture: ${tileRendering.useSharedTexture ? "yes" : "no"}
- Tint shared texture: ${tileRendering.tintSharedTexture ? "yes" : "no"}

## Tutorial
- Enabled: ${tutorial.enabled ? "yes" : "no"}
- Target: ${tutorial.targetMode || "first-available"}${tutorial.targetMode === "tile" ? ` (${tutorial.targetX || 0}, ${tutorial.targetY || 0})` : ""}
- Text: ${tutorial.text || ""}
- Start / repeat / visible: ${tutorial.startDelay || 0}s / ${tutorial.repeatDelay || 0}s / ${tutorial.visibleDuration ? `${tutorial.visibleDuration}s` : "until action"}
- End condition: ${tutorial.endCondition || "specific-tile"}

## Layout
- Center character: x ${layout.centerCharacterX || 0}, y ${layout.centerCharacterY || 0}, scale ${layout.centerCharacterScaleVertical || 0.48}/${layout.centerCharacterScaleHorizontal || 0.42}
- Task text: y ${layout.taskTextY ?? -80}, horizontal x ${layout.taskTextHorizontalX ?? -200}, size ${layout.taskTextFontSize || 75}, color ${layout.taskTextColor || "#f2f2f2"}
- Pointer offset: x ${layout.pointerOffsetX || 0}, y ${layout.pointerOffsetY || 0}

## Assets
${assetLines}

## Puzzle Logic
- Status: ${logicStatus}
- Cleared: ${hasValidation ? validation.clearedTiles || 0 : "unknown"}/${hasValidation ? validation.totalTiles : tiles.length}
- Build ready: ${buildReady}

## First Moves
${firstMoves}

## Stuck Tiles
${stuckTiles}
`;
}

function assetSlotLabel(slot) {
  const labels = {
    backgroundImage: "Background",
    tileTexture: "Tile texture",
    trailTexture: "Trail texture",
    centerCharacter: "Center character",
    storeButtonTexture: "Store button",
    winButtonTexture: "Win button",
    ctaPanelTexture: "CTA panel",
    winBackgroundImage: "Win background",
    musicTrack: "Music",
    tapSound: "Tap SFX",
    badMoveSound: "Bad move SFX",
    winSound: "Win SFX",
    warningSound: "Warning SFX",
  };
  return labels[slot] || slot;
}

function copyDir(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else if (entry.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(sourcePath), targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function writeJson(filePath, data) {
  writeText(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeProjectAssets(outputDir, project) {
  const assets = project.assets || {};
  return {
    backgroundImage: writeAssetSlot(outputDir, "textures", "playable_background", assets.backgroundImage),
    tileTexture: writeAssetSlot(outputDir, "textures", "playable_tile", assets.tileTexture),
    trailTexture: writeAssetSlot(outputDir, "textures", "playable_trail", assets.trailTexture),
    centerCharacter: writeAssetSlot(outputDir, "textures", "playable_center_character", assets.centerCharacter),
    storeButtonTexture: writeAssetSlot(outputDir, "textures", "playable_store_button", assets.storeButtonTexture),
    winButtonTexture: writeAssetSlot(outputDir, "textures", "playable_win_button", assets.winButtonTexture),
    ctaPanelTexture: writeAssetSlot(outputDir, "textures", "playable_cta_panel", assets.ctaPanelTexture),
    winBackgroundImage: writeAssetSlot(outputDir, "textures", "playable_win_background", assets.winBackgroundImage),
    musicTrack: writeAssetSlot(outputDir, "sounds", "playable_music", assets.musicTrack),
    tapSound: writeAssetSlot(outputDir, "sounds", "playable_tap_sound", assets.tapSound),
    badMoveSound: writeAssetSlot(outputDir, "sounds", "playable_bad_move_sound", assets.badMoveSound),
    winSound: writeAssetSlot(outputDir, "sounds", "playable_win_sound", assets.winSound),
    warningSound: writeAssetSlot(outputDir, "sounds", "playable_warning_sound", assets.warningSound),
  };
}

function writeAssetSlot(outputDir, assetType, key, slot) {
  if (!slot?.dataUrl) return null;

  const parsed = parseDataUrl(slot.dataUrl);
  if (!parsed) return null;

  const ext = extensionForAsset(slot.filename, parsed.mimeType, assetType);
  const filePath = path.join(outputDir, "src", "assets", assetType, `${key}.${ext}`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, parsed.buffer);
  return { key, filePath, mimeType: parsed.mimeType };
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;

  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const body = match[3] || "";
  const buffer = isBase64
    ? Buffer.from(body, "base64")
    : Buffer.from(decodeURIComponent(body), "utf8");

  return { mimeType, buffer };
}

function extensionForAsset(filename, mimeType, assetType) {
  const original = path.extname(filename || "").replace(".", "").toLowerCase();
  if (original) return original;

  const byMime = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
  };

  return byMime[mimeType] || (assetType === "sounds" ? "mp3" : "png");
}

function patchIndexHtml(filePath, project) {
  let html = fs.readFileSync(filePath, "utf8");
  const gameplay = project.gameplay || {};
  const tutorial = project.tutorial || {};
  const tileRendering = project.tileRendering || {};
  const layout = project.layout || {};

  html = html.replace(
    /linkAndroid\s*:\s*\{value:\s*"[^"]*"/,
    `linkAndroid\t\t\t: {value: "${escapeJsString(project.brief?.androidUrl || "https://play.google.com/")}"`
  );
  html = html.replace(
    /linkIOS\s*:\s*\{value:\s*"[^"]*"/,
    `linkIOS\t\t\t\t: {value: "${escapeJsString(project.brief?.iosUrl || "https://www.apple.com/app-store/")}"`
  );
  html = html.replace(
    /modeClicks\s*:\s*\{value:\s*[^,]+,/,
    `modeClicks\t\t\t: {value: ${Number(gameplay.redirectTapCount || 0)},`
  );

  const customParams = [
    `\t\t\t\ttxt_task\t\t\t: { value: "${escapeJsString(tutorial.text || project.brief?.taskText || "Tap tiles in the right order!")}", type: "string", default: "", description: "Tutorial/task text" },`,
    `\t\t\t\ttxt_cta\t\t\t\t: { value: "${escapeJsString(project.brief?.ctaText || "You win!")}", type: "string", default: "", description: "CTA text" },`,
    `\t\t\t\ttxt_store_button\t: { value: "${escapeJsString(gameplay.storeButtonText || "PLAY NOW")}", type: "string", default: "", description: "Store button text" },`,
    `\t\t\t\ttxt_win_btn\t\t\t: { value: "${escapeJsString(gameplay.winButtonText || "PLAY NOW")}", type: "string", default: "", description: "Win button text" },`,
    `\t\t\t\ttxt_level\t\t\t: { value: "${escapeJsString(gameplay.levelText || "Level 99")}", type: "string", default: "", description: "Level label text" },`,
    `\t\t\t\tgameplay_bg_color\t: { value: ${hexToNumber(project.theme?.backgroundColor || "#ffffff")}, type: "color", default: 0xffffff, description: "Gameplay background color" },`,
    `\t\t\t\ttile_selected_tint\t: { value: ${hexToNumber(gameplay.selectedTileTint || "#36d66b")}, type: "color", default: 0x36d66b, description: "Selected tile tint" },`,
    `\t\t\t\twrong_tap_tint\t\t: { value: ${hexToNumber(gameplay.wrongTapTint || "#CDA5A5")}, type: "color", default: 0xCDA5A5, description: "Wrong tap tint" },`,
    `\t\t\t\ttime_till_game_over\t: { value: 999, type: "number", min: 0, max: 999, step: 1, description: "Seconds before auto gameover" },`,
    `\t\t\t\ttime_till_tip\t\t: { value: ${Number(tutorial.repeatDelay ?? 4)}, type: "number", min: 0, max: 60, step: 0.1, description: "Seconds before tip hand" },`,
    `\t\t\t\ttutorial_enabled\t: { value: ${Boolean(tutorial.enabled)}, type: "boolean", default: true, description: "Tutorial enabled" },`,
    `\t\t\t\ttutorial_target_mode\t: { value: "${escapeJsString(tutorial.targetMode || "first-available")}", type: "string", default: "first-available", description: "Tutorial target mode" },`,
    `\t\t\t\ttutorial_target_x\t: { value: ${Number(tutorial.targetX || 0)}, type: "number", min: 0, max: 200, step: 1, description: "Tutorial target tile X" },`,
    `\t\t\t\ttutorial_target_y\t: { value: ${Number(tutorial.targetY || 0)}, type: "number", min: 0, max: 200, step: 1, description: "Tutorial target tile Y" },`,
    `\t\t\t\ttutorial_start_delay\t: { value: ${Number(tutorial.startDelay ?? 2)}, type: "number", min: 0, max: 60, step: 0.1, description: "Tutorial start delay" },`,
    `\t\t\t\ttutorial_repeat_delay\t: { value: ${Number(tutorial.repeatDelay ?? 4)}, type: "number", min: 0, max: 60, step: 0.1, description: "Tutorial repeat delay" },`,
    `\t\t\t\ttutorial_visible_duration\t: { value: ${Number(tutorial.visibleDuration || 0)}, type: "number", min: 0, max: 60, step: 0.1, description: "Tutorial visible duration" },`,
    `\t\t\t\ttutorial_end_condition\t: { value: "${escapeJsString(tutorial.endCondition || "specific-tile")}", type: "string", default: "specific-tile", description: "Tutorial end condition" },`,
    `\t\t\t\ttile_shared_texture_enabled\t: { value: ${Boolean(tileRendering.useSharedTexture)}, type: "boolean", default: true, description: "Use one texture for all tiles" },`,
    `\t\t\t\ttile_texture_tint_enabled\t: { value: ${Boolean(tileRendering.tintSharedTexture)}, type: "boolean", default: true, description: "Tint shared tile texture" },`,
    `\t\t\t\ttile_texture_fallback_tint\t: { value: ${hexToNumber(tileRendering.fallbackTint || "#ffffff")}, type: "color", default: 0xffffff, description: "Shared tile fallback tint" },`,
    `\t\t\t\tlayout_center_x\t: { value: ${Number(layout.centerCharacterX || 0)}, type: "number", min: -1000, max: 1000, step: 1, description: "Center character X offset" },`,
    `\t\t\t\tlayout_center_y\t: { value: ${Number(layout.centerCharacterY || 0)}, type: "number", min: -1000, max: 1000, step: 1, description: "Center character Y offset" },`,
    `\t\t\t\tlayout_center_scale_v\t: { value: ${Number(layout.centerCharacterScaleVertical || 0.48)}, type: "number", min: 0.01, max: 5, step: 0.01, description: "Center character vertical scale" },`,
    `\t\t\t\tlayout_center_scale_h\t: { value: ${Number(layout.centerCharacterScaleHorizontal || 0.42)}, type: "number", min: 0.01, max: 5, step: 0.01, description: "Center character horizontal scale" },`,
    `\t\t\t\tlayout_task_text_y\t: { value: ${Number(layout.taskTextY ?? -80)}, type: "number", min: -1000, max: 1000, step: 1, description: "Task text vertical Y" },`,
    `\t\t\t\tlayout_task_text_x_h\t: { value: ${Number(layout.taskTextHorizontalX ?? -200)}, type: "number", min: -1000, max: 1000, step: 1, description: "Task text horizontal X" },`,
    `\t\t\t\tlayout_task_text_size\t: { value: ${Number(layout.taskTextFontSize || 75)}, type: "number", min: 8, max: 200, step: 1, description: "Task text font size" },`,
    `\t\t\t\tlayout_task_text_color\t: { value: ${hexToNumber(layout.taskTextColor || "#f2f2f2")}, type: "color", default: 0xf2f2f2, description: "Task text color" },`,
    `\t\t\t\tlayout_pointer_offset_x\t: { value: ${Number(layout.pointerOffsetX || 0)}, type: "number", min: -500, max: 500, step: 1, description: "Tutorial pointer X offset" },`,
    `\t\t\t\tlayout_pointer_offset_y\t: { value: ${Number(layout.pointerOffsetY || 0)}, type: "number", min: -500, max: 500, step: 1, description: "Tutorial pointer Y offset" },`,
    `\t\t\t\tplayable_project_code\t: { value: "${escapeJsString(project.project?.code || "playable_project")}", type: "string", default: "", description: "Playable project code" },`,
  ].join("\n");

  if (html.includes("playable_project_code")) {
    html = html.replace(/txt_task[\s\S]*?playable_project_code[\s\S]*?\},/, customParams);
  } else {
    html = html.replace(
      /(\t\t\t\tseparator_0\s*:\s*\{\s*type:\s*"separator"\s*\},)/,
      `$1\n\n${customParams}`
    );
  }

  fs.writeFileSync(filePath, html);
}

function patchCreateObjects2d(filePath, project, exportedAssets) {
  let source = fs.readFileSync(filePath, "utf8");
  const scene = project.scene || {};
  const grid = scene.grid || {};
  const gap = scene.tileGap || {};
  const offset = scene.offset || {};
  const scale = scene.scale || {};
  const layout = project.layout || {};
  const betweenX = Number(gap.x || project.scene?.tileSize || 82);
  const betweenY = Number(gap.y || project.scene?.tileSize || 82);
  const tileScale = Number(project.scene?.tileScale || 0.7);
  const offsetX = Number(offset.x || -Math.round((Number(grid.width || 30) * betweenX) / 2));
  const offsetY = Number(offset.y || -Math.round((Number(grid.height || 30) * betweenY) / 2));
  const verticalScale = Number(scale.vertical || 0.25);
  const horizontalScale = Number(scale.horizontal || 0.35);

  source = source.replace(
    /scaleAbsolute:\s*\{vertical:\s*\{x:\s*0\.25,\s*y:\s*0\.25\},\s*horizontal:\s*\{x:\s*0\.35,\s*y:\s*0\.35\}\}/,
    `scaleAbsolute: {vertical: {x: ${verticalScale}, y: ${verticalScale}}, horizontal: {x: ${horizontalScale}, y: ${horizontalScale}}}`
  );
  source = source.replace(
    /new IMPION\.TileSet\(this\.\#app, this\.\#gameComponent, this\.components\["TilesContainer0"\], preset\.seed0, 82, 88, 0\.7, -1150, -850\)/,
    `new IMPION.TileSet(this.#app, this.#gameComponent, this.components["TilesContainer0"], preset.seed0, ${betweenX}, ${betweenY}, ${tileScale}, ${offsetX}, ${offsetY})`
  );
  source = removeBlock(
    source,
    'this.components["TilesContainer1"] = new IMPION.Empty2d',
    'this.components["TilesContainer1"].shakeD = 0;'
  );

  if (exportedAssets.backgroundImage) {
    source = source.replace(
      /\/\/ texture:\s*this\.#app\.assets\.textures\.pixi\["bm_bg"\],\s*\n\s*fill\s*:\s*this\.#app\.params\.gameplay_bg_color\.value,/,
      `texture\t: this.#app.assets.textures.pixi["${exportedAssets.backgroundImage.key}"],\n\t\t\t// fill\t: this.#app.params.gameplay_bg_color.value,`
    );
  }

  if (exportedAssets.ctaPanelTexture) {
    source = source.replaceAll(
      'this.#app.assets.textures.pixi["bm_cta_bg"]',
      `this.#app.assets.textures.pixi["${exportedAssets.ctaPanelTexture.key}"]`
    );
  }

  if (exportedAssets.storeButtonTexture) {
    source = source.replaceAll(
      'this.#app.assets.textures.pixi["bm_store_button"]',
      `this.#app.assets.textures.pixi["${exportedAssets.storeButtonTexture.key}"]`
    );
  }

  if (exportedAssets.winButtonTexture) {
    source = source.replaceAll(
      'this.#app.assets.textures.pixi["bm_win_btn"]',
      `this.#app.assets.textures.pixi["${exportedAssets.winButtonTexture.key}"]`
    );
  }

  if (exportedAssets.winBackgroundImage) {
    source = source.replaceAll(
      'this.#app.assets.textures.pixi["bm_win_bg"]',
      `this.#app.assets.textures.pixi["${exportedAssets.winBackgroundImage.key}"]`
    );
  }

  if (exportedAssets.centerCharacter && !source.includes('this.components["CenterCharacter"]')) {
    const centerX = Number(layout.centerCharacterX || 0);
    const centerY = Number(layout.centerCharacterY || 0);
    const centerScaleV = Number(layout.centerCharacterScaleVertical || 0.48);
    const centerScaleH = Number(layout.centerCharacterScaleHorizontal || 0.42);
    source = insertBeforeNeedle(
      source,
      "\t\tconst preset = new IMPION.TileFieldPreset();",
      `
\t\tthis.components["CenterCharacter"] = new IMPION.SpriteText({
\t\t\ttexture: this.#app.assets.textures.pixi["${exportedAssets.centerCharacter.key}"],
\t\t\tpositionRelative: { vertical: { x: 0, y: 0 }, horizontal: { x: 0, y: 0 } },
\t\t\tpositionAbsolute: { vertical: { x: ${centerX}, y: ${centerY} }, horizontal: { x: ${centerX}, y: ${centerY} } },
\t\t\tscaleAbsolute: { vertical: { x: ${centerScaleV}, y: ${centerScaleV} }, horizontal: { x: ${centerScaleH}, y: ${centerScaleH} } },
\t\t\trotationAbsolute: { vertical: 0, horizontal: 0 }
\t\t});

`
    );
  }

  source = patchTaskTextLayout(source, layout);

  if (!source.includes('this.components["LevelTxt"]')) {
    source = insertBeforeNeedle(
      source,
      '\t\tthis.components["StoreButtonShadow"] = new IMPION.SpriteText',
      `
\t\tthis.components["LevelTxt"] = new IMPION.SpriteText({
\t\t\ttext: this.#app.params.txt_level.value,
\t\t\ttextStyle: {
\t\t\t\tfontFamily: "LilitaOne-Regular",
\t\t\t\tfontSize: 42,
\t\t\t\tfontWeight: "normal",
\t\t\t\tfill: "#f2f2f2",
\t\t\t\talign: "center",
\t\t\t\tvalign: "center",
\t\t\t\tletterSpacing: 0.5,
\t\t\t\tlineHeight: 0,
\t\t\t\twordWrapWidth: 500,
\t\t\t\twordWrapHeight: 1000,
\t\t\t\twordWrap: false,
\t\t\t\tautoWordWrap: false,
\t\t\t\tstroke: "#4b3a79",
\t\t\t\tstrokeThickness: 4,
\t\t\t\tdropShadow: false,
\t\t\t\tx: 0,
\t\t\t\ty: 0,
\t\t\t},
\t\t\tasBitmap: false,
\t\t\tborderBitmap: 30,
\t\t\tpositionRelative: {vertical: {x: 0, y: 0}, horizontal: {x: 0, y: 0}},
\t\t\tpositionAbsolute: {vertical: {x: 0, y: 72}, horizontal: {x: 0, y: 62}},
\t\t\tscaleAbsolute: {vertical: {x: 1, y: 1}, horizontal: {x: 1, y: 1}},
\t\t\trotationAbsolute: {vertical: 0, horizontal: 0}
\t\t});
\t\tthis.components["TaskTxt"].animationContainer.addChild(this.components["LevelTxt"]);
\n\n`
    );
  }

  fs.writeFileSync(filePath, source);
}

function patchTaskTextLayout(source, layout) {
  const taskTextY = Number(layout.taskTextY ?? -80);
  const taskTextHorizontalX = Number(layout.taskTextHorizontalX ?? -200);
  const fontSize = Number(layout.taskTextFontSize || 75);
  const color = layout.taskTextColor || "#f2f2f2";

  source = source.replace(
    /(this\.components\["TaskTxt"\][\s\S]*?fontSize:\s*)75(,)/,
    `$1${fontSize}$2`
  );
  source = source.replace(
    /(this\.components\["TaskTxt"\][\s\S]*?fill:\s*)"#[0-9a-fA-F]{6}"/,
    `$1"${color}"`
  );
  source = source.replace(
    "positionAbsolute: {vertical: {x: 0, y: -80}, horizontal: {x: -200, y: -80}},",
    `positionAbsolute: {vertical: {x: 0, y: ${taskTextY}}, horizontal: {x: ${taskTextHorizontalX}, y: ${taskTextY}}},`
  );

  return source;
}

function patchTileSet(filePath) {
  let source = fs.readFileSync(filePath, "utf8");
  source = source.replace("#random_gen = true;", "#random_gen = false;");
  source = source.replace(
    /\n\s*\/\/ small cheat for correct tip position\s*\n\s*if \(i === 27 && j === 0\) dir = IMPION\.TileDirection\.UP;\s*\n/,
    "\n"
  );
  fs.writeFileSync(filePath, source);
}

function patchNodeFeedback(filePath) {
  let source = fs.readFileSync(filePath, "utf8");

  source = source.replace(
    "this.tap_vfx.alpha = 1;",
    "this.tap_vfx.alpha = 1;\n\t\tthis.tap_vfx.tint = this.#app.params.tile_selected_tint.value;"
  );

  source = source.replace(
    "const start_delay_l = this.left.item ? 0 : duration;",
    "const start_delay_l = this.left.item ? 0 : duration;\n\t\t\t\t\tthis.#FlashBlockedTile(blocker);"
  );
  source = source.replace(
    "const start_delay_r = this.right.item ? 0 : duration;",
    "const start_delay_r = this.right.item ? 0 : duration;\n\t\t\t\t\tthis.#FlashBlockedTile(blocker);"
  );
  source = source.replace(
    "const start_delay_u = this.up.item ? 0 : duration;",
    "const start_delay_u = this.up.item ? 0 : duration;\n\t\t\t\t\tthis.#FlashBlockedTile(blocker);"
  );
  source = source.replace(
    "const start_delay_d = this.down.item ? 0 : duration;",
    "const start_delay_d = this.down.item ? 0 : duration;\n\t\t\t\t\tthis.#FlashBlockedTile(blocker);"
  );

  if (!source.includes("#FlashBlockedTile(node)")) {
    source = source.replace(
      "\n\tisOpen() {",
      `
\t#FlashBlockedTile(node) {
\t\tconst target = node?.item?.sprite?.bgObject || node?.item?.sprite;
\t\tif (!target) return;

\t\tgsap.killTweensOf(target);
\t\tgsap.to(target, {
\t\t\tduration: 0.08,
\t\t\ttint: this.#app.params.wrong_tap_tint.value,
\t\t\trepeat: 1,
\t\t\tyoyo: true,
\t\t\tease: "none"
\t\t});
\t}

\tisOpen() {`
    );
  }

  fs.writeFileSync(filePath, source);
}

function removeBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  if (start === -1) return source;

  const lineStart = source.lastIndexOf("\n", start);
  const end = source.indexOf(endNeedle, start);
  if (end === -1) return source;

  const lineEnd = source.indexOf("\n", end);
  const sliceStart = lineStart === -1 ? start : lineStart;
  const sliceEnd = lineEnd === -1 ? end + endNeedle.length : lineEnd + 1;
  return `${source.slice(0, sliceStart)}${source.slice(sliceEnd)}`;
}

function insertBeforeNeedle(source, needle, insertion) {
  const index = source.indexOf(needle);
  if (index === -1) return source;
  return `${source.slice(0, index)}${insertion}${source.slice(index)}`;
}

function patchGame(filePath, project, exportedAssets) {
  let source = fs.readFileSync(filePath, "utf8");
  source = source.replace(
    "this.#numClicks++;",
    `this.#numClicks++;
\t\tif (["any-tap", "screen-tap"].includes(this.#app.params.tutorial_end_condition?.value)) {
\t\t\tthis.HideTutorial();
\t\t}`
  );
  source = source.replace(
    "this.#hand_delay = this.#app.params.time_till_tip.value;",
    'this.#hand_delay = this.#app.params.tutorial_repeat_delay?.value ?? this.#app.params.time_till_tip.value;'
  );
  source = source.replace(
    "gsap.delayedCall(3.7, () => {",
    "gsap.delayedCall(1.7 + Math.max(0, Number(this.#app.params.tutorial_start_delay?.value ?? 2)), () => {"
  );
  source = source.replace(
    'this.#ShowTutorialHand("tapnhold", this.components["TileSet0"].nodes[27][0].item.sprite);',
    'this.#ShowConfiguredTutorialHand();'
  );
  source = source.replace(
    'this.components["TaskTxt"].show(0.3, 0.1).playAnimation("bounce", 0.4);\n\n\t\t\tthis.#ShowConfiguredTutorialHand();',
    `if (this.#app.params.tutorial_enabled?.value) {
\t\t\t\tthis.components["TaskTxt"].show(0.3, 0.1).playAnimation("bounce", 0.4);
\t\t\t\tthis.#ShowConfiguredTutorialHand();
\t\t\t} else {
\t\t\t\tthis.components["TaskTxt"].hide();
\t\t\t}`
  );
  source = source.replace(
    'const globalPos = this.components["TilesContainer" + this.#curr_lvl_id].toGlobal(this.#curr_tipped_tile.position);\n\t\t\tconst tilePos = this.#app.view2d.scene.toLocal(globalPos);',
    `const parent = this.#curr_tipped_tile?.parent || this.components["TilesContainer" + this.#curr_lvl_id];
\t\t\tconst globalPos = parent?.toGlobal ? parent.toGlobal(this.#curr_tipped_tile.position) : this.components["TilesContainer" + this.#curr_lvl_id].toGlobal(this.#curr_tipped_tile.position);
\t\t\tconst tilePos = this.#app.view2d.scene.toLocal(globalPos);`
  );
  source = source.replace(
    'this.#ShowTutorialHand("tapnhold");\n\t\t\t\tthis.#hand_timer = -1;',
    'this.#ShowConfiguredTutorialHand();\n\t\t\t\tthis.#hand_timer = -1;'
  );
  source = source.replaceAll(
    'this.components["Pointer"].x = tilePos.x;',
    'this.components["Pointer"].x = tilePos.x + Number(this.#app.params.layout_pointer_offset_x?.value || 0);'
  );
  source = source.replaceAll(
    'this.components["Pointer"].y = tilePos.y;',
    'this.components["Pointer"].y = tilePos.y + Number(this.#app.params.layout_pointer_offset_y?.value || 0);'
  );

  if (!source.includes("#FindTutorialNode(tileSet)")) {
    source = source.replace(
      "\n\treloadParams(){",
      `
    //------------------------------------------------------------------------

\t#FindTutorialNode(tileSet) {
\t\tif (!tileSet?.nodes) return null;
\t\tfor (let i = 0; i < tileSet.nodes.length; i++) {
\t\t\tfor (let j = 0; j < tileSet.nodes[i].length; j++) {
\t\t\t\tconst node = tileSet.nodes[i][j];
\t\t\t\tif (node?.item?.sprite) return node;
\t\t\t}
\t\t}
\t\treturn null;
\t}

\t#FindTutorialNodeByCoords(tileSet, x, y) {
\t\tconst node = tileSet?.nodes?.[x]?.[y];
\t\treturn node?.item?.sprite ? node : null;
\t}

\t#FindCenterTutorialNode(tileSet) {
\t\tif (!tileSet?.nodes?.length) return null;
\t\tconst centerX = Math.floor(tileSet.nodes.length * 0.5);
\t\tconst centerY = Math.floor((tileSet.nodes[centerX]?.length || 0) * 0.5);
\t\treturn this.#FindTutorialNodeByCoords(tileSet, centerX, centerY) || this.#FindTutorialNode(tileSet);
\t}

\t#ResolveTutorialTarget() {
\t\tconst mode = this.#app.params.tutorial_target_mode?.value || "first-available";
\t\tconst tileSet = this.components["TileSet" + this.#curr_lvl_id];

\t\tif (mode === "tile") {
\t\t\tconst x = Number(this.#app.params.tutorial_target_x?.value || 0);
\t\t\tconst y = Number(this.#app.params.tutorial_target_y?.value || 0);
\t\t\treturn this.#FindTutorialNodeByCoords(tileSet, x, y)?.item?.sprite || this.#FindTutorialNode(tileSet)?.item?.sprite || null;
\t\t}

\t\tif (mode === "center") return this.#FindCenterTutorialNode(tileSet)?.item?.sprite || null;
\t\tif (mode === "store-button") return this.components["StoreButton"] || this.#FindTutorialNode(tileSet)?.item?.sprite || null;
\t\tif (mode === "win-button") return this.components["WinButton"] || this.#FindTutorialNode(tileSet)?.item?.sprite || null;
\t\treturn this.#FindTutorialNode(tileSet)?.item?.sprite || null;
\t}

\t#ShowConfiguredTutorialHand() {
\t\tif (!this.#app.params.tutorial_enabled?.value) return;
\t\tconst target = this.#ResolveTutorialTarget();
\t\tthis.#ShowTutorialHand("tapnhold", target);

\t\tconst visibleDuration = Number(this.#app.params.tutorial_visible_duration?.value || 0);
\t\tif (visibleDuration > 0) {
\t\t\tgsap.delayedCall(visibleDuration, () => {
\t\t\t\tif (this.#app.params.tutorial_end_condition?.value === "time") this.HideTutorial();
\t\t\t});
\t\t}
\t}

    //------------------------------------------------------------------------

\treloadParams(){`
    );
  }

  if (exportedAssets.musicTrack) {
    source = source.replaceAll('"bg"', `"${exportedAssets.musicTrack.key}"`);
  }

  if (exportedAssets.badMoveSound) {
    source = source.replaceAll('"bad_move"', `"${exportedAssets.badMoveSound.key}"`);
  }

  if (exportedAssets.winSound) {
    source = source.replaceAll('"level_completed"', `"${exportedAssets.winSound.key}"`);
  }

  if (exportedAssets.warningSound) {
    source = source.replaceAll('"moves_warning"', `"${exportedAssets.warningSound.key}"`);
  }

  source = source.replace(
    'gsap.to(this.components["FullscreenOverlay"].bgObject, { duration: 0.2, tint: "#CDA5A5", ease: "none" });',
    'gsap.to(this.components["FullscreenOverlay"].bgObject, { duration: 0.2, tint: this.#app.params.wrong_tap_tint.value, ease: "none" });'
  );
  source = source.replace(
    "target.stopAnimation();\n\t\t\ttarget.animationContainer.scale.set(1);\n\t\t\ttarget.playAnimation(\"click\", 0.5, 0.5);",
    "target.stopAnimation?.();\n\t\t\tif (target.animationContainer?.scale) target.animationContainer.scale.set(1);\n\t\t\ttarget.playAnimation?.(\"click\", 0.5, 0.5);"
  );
  source = source.replace(
    "this.#curr_tipped_tile.stopAnimation();\n\t\t\tthis.#curr_tipped_tile.animationContainer.scale.set(1);",
    "this.#curr_tipped_tile.stopAnimation?.();\n\t\t\tif (this.#curr_tipped_tile.animationContainer?.scale) this.#curr_tipped_tile.animationContainer.scale.set(1);"
  );

  fs.writeFileSync(filePath, source);
}

function patchItemMotion(filePath, project, exportedAssets) {
  let source = fs.readFileSync(filePath, "utf8");
  const duration = Number(project.motion?.tileFlightDuration || 1.2);
  const ease = project.motion?.tileFlightEase || "expo.in";
  const trailTint = project.theme?.trailTint || "#fff000";
  const tileRendering = project.tileRendering || {};

  source = source.replace(/this\.trail\.bgObject\.tint = "#[0-9a-fA-F]{6}";/, `this.trail.bgObject.tint = "${trailTint}";`);
  source = source.replace(/const duration = 1\.2;/, `const duration = ${duration};`);
  source = source.replaceAll('ease: "expo.in"', `ease: "${ease}"`);

  if (exportedAssets.trailTexture) {
    source = source.replaceAll(
      'this.#app.assets.textures.pixi["bm_trail"]',
      `this.#app.assets.textures.pixi["${exportedAssets.trailTexture.key}"]`
    );
  }

  if (exportedAssets.tileTexture && tileRendering.useSharedTexture !== false) {
    source = source.replace(
      /texture:\s*this\.#app\.assets\.textures\.pixi\[spriteName\],/,
      `texture: this.#app.assets.textures.pixi["${exportedAssets.tileTexture.key}"],`
    );

    source = source.replace(
      /(container\.addChild\(this\.sprite\);\s*)(this\.initSpritePos\.x = this\.sprite\.x;)/,
      `$1\t\t\tif (this.#app.params.tile_texture_tint_enabled?.value) {
\t\t\t\tthis.sprite.bgObject.tint = this.#TileTint(this.color, this.#app.params.tile_texture_fallback_tint?.value ?? 0xffffff);
\t\t\t}
\t\t\t$2`
    );

    if (!source.includes("#TileTint(color")) {
      source = source.replace(
        "\n\tmove() {",
        `
\t#TileTint(color, fallbackTint = 0xffffff) {
\t\tconst colors = {
\t\t\tyellow: 0xf4cf3a,
\t\t\tpink: 0xec5e9d,
\t\t\tpurple: 0x7b55d9,
\t\t\tblue_light: 0x60a5fa,
\t\t\tblue: 0x3b82f6,
\t\t\tblue_dark: 0x1d4ed8,
\t\t\tblue_dark_plus: 0x1e3a8a,
\t\t\tgreen: 0x55b96f,
\t\t\tgreen_dark: 0x15803d,
\t\t};
\t\treturn colors[color] ?? fallbackTint;
\t}

\tmove() {`
      );
    }
  }

  if (exportedAssets.tapSound) {
    source = source.replace(
      /this\.\#app\.soundManager\.play\("tap_" \+ Math\.randomInteger\(0, this\.\#number_of_tap_sfx - 1\), 0\.15, 0\.9 \+ 0\.2 \* Math\.random\(\)\);/,
      `this.#app.soundManager.play("${exportedAssets.tapSound.key}", 0.15, 0.9 + 0.2 * Math.random());`
    );
  }

  fs.writeFileSync(filePath, source);
}

function renderTileFieldPreset(project) {
  const grid = project.scene?.grid || { width: 0, height: 0 };
  const tiles = Array.isArray(project.tiles) ? project.tiles : [];
  const cells = new Map(tiles.map(tile => [`${tile.x},${tile.y}`, tile]));
  const seed = renderSeed("seed0", grid, cells);
  const seed1 = renderSeed("seed1", grid, cells);

  return `import * as IMPION from "#impion";

export default class TileFieldPreset {
${seed}

${seed1}
}
`;
}

function renderSeed(name, grid, cells) {
  const columns = [];
  for (let x = 0; x < Number(grid.width || 0); x++) {
    const rows = [];
    for (let y = 0; y < Number(grid.height || 0); y++) {
      const tile = cells.get(`${x},${y}`);
      const direction = directionToImpion(tile?.direction || "right");
      const impionColor = tile?.impionColor || nearestImpionColor(tile?.color || tile?.hex);
      const color = impionColor ? `IMPION.Color.${impionColor}` : "null";
      rows.push(`{direction: IMPION.TileDirection.${direction}, color: ${color}, hidden: ${Boolean(tile?.hidden)}, golden: ${Boolean(tile?.golden)}}`);
    }
    const comma = x < Number(grid.width || 0) - 1 ? "," : "";
    columns.push(`\t\t[${rows.join(",\n\t\t")}]${comma} // column ${x + 1}`);
  }

  return `\t${name} = [
${columns.join("\n\n")}
\t];`;
}

function directionToImpion(direction) {
  const map = {
    up: "UP",
    right: "RIGHT",
    down: "DOWN",
    left: "LEFT",
  };
  return map[direction] || "RIGHT";
}

function nearestImpionColor(hex) {
  if (!hex) return null;
  const rgb = parseHex(hex);
  if (!rgb) {
    const key = String(hex).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    return key || null;
  }

  const palette = {
    YELLOW: "#f4cf3a",
    PINK: "#ec5e9d",
    PURPLE: "#7b55d9",
    GREEN: "#55b96f",
    BLUE: "#3b82f6",
  };

  let bestName = "YELLOW";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [name, paletteHex] of Object.entries(palette)) {
    const candidate = parseHex(paletteHex);
    const distance = ((rgb.r - candidate.r) ** 2) + ((rgb.g - candidate.g) ** 2) + ((rgb.b - candidate.b) ** 2);
    if (distance < bestDistance) {
      bestName = name;
      bestDistance = distance;
    }
  }
  return bestName;
}

function parseHex(hex) {
  const clean = String(hex).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function hexToNumber(hex) {
  const clean = String(hex).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return "0xffffff";
  return `0x${clean}`;
}

function escapeJsString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
}
