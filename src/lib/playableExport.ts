export type Direction = 'up' | 'right' | 'down' | 'left';

export interface EditorTile {
  x: number;
  y: number;
  color: string;
  direction: Direction;
}

export interface PlayableProjectMeta {
  code: string;
  game: string;
  iteration: number;
  sourceTzUrl: string;
}

export interface PlayableBrief {
  rawText: string;
  summary: string;
  taskText: string;
  ctaText: string;
  androidUrl: string;
  iosUrl: string;
  notes: string[];
}

export interface PlayableSceneSettings {
  tileSize: number;
  gapX: number;
  gapY: number;
  offsetX: number;
  offsetY: number;
  verticalScale: number;
  horizontalScale: number;
  tileFlightDuration: number;
  tileFlightEase: string;
  trailTint: string;
  backgroundColor: string;
}

export interface PlayableAssetSlot {
  filename: string;
  mimeType: string;
  dataUrl: string;
}

export interface PlayableAssetLibrary {
  backgroundImage: PlayableAssetSlot | null;
  tileTexture: PlayableAssetSlot | null;
  trailTexture: PlayableAssetSlot | null;
  centerCharacter: PlayableAssetSlot | null;
  storeButtonTexture: PlayableAssetSlot | null;
  winButtonTexture: PlayableAssetSlot | null;
  ctaPanelTexture: PlayableAssetSlot | null;
  winBackgroundImage: PlayableAssetSlot | null;
  musicTrack: PlayableAssetSlot | null;
  tapSound: PlayableAssetSlot | null;
  badMoveSound: PlayableAssetSlot | null;
  winSound: PlayableAssetSlot | null;
  warningSound: PlayableAssetSlot | null;
}

export interface PlayableGameplaySettings {
  levelText: string;
  storeButtonText: string;
  winButtonText: string;
  redirectTapCount: number;
  selectedTileTint: string;
  wrongTapTint: string;
}

export type TutorialTargetMode = 'first-available' | 'tile' | 'center' | 'store-button' | 'win-button';
export type TutorialEndCondition = 'specific-tile' | 'any-tap' | 'screen-tap' | 'time' | 'manual';

export interface PlayableTutorialSettings {
  enabled: boolean;
  targetMode: TutorialTargetMode;
  targetX: number;
  targetY: number;
  text: string;
  startDelay: number;
  repeatDelay: number;
  visibleDuration: number;
  endCondition: TutorialEndCondition;
}

export interface PlayableTileRenderingSettings {
  useSharedTexture: boolean;
  tintSharedTexture: boolean;
  fallbackTint: string;
}

export interface PlayableLayoutSettings {
  centerCharacterX: number;
  centerCharacterY: number;
  centerCharacterScaleVertical: number;
  centerCharacterScaleHorizontal: number;
  taskTextY: number;
  taskTextHorizontalX: number;
  taskTextFontSize: number;
  taskTextColor: string;
  pointerOffsetX: number;
  pointerOffsetY: number;
}

export interface PlayableValidationMove {
  x: number;
  y: number;
  direction: Direction;
}

export interface PlayableProjectValidation {
  solvable: boolean;
  totalTiles: number;
  clearedTiles: number;
  availableMoves?: PlayableValidationMove[];
  firstMoves: PlayableValidationMove[];
  stuckTiles: PlayableValidationMove[];
  checkedAt: string;
}

export interface PlayableCanonicalProject {
  schemaVersion: 1;
  project: PlayableProjectMeta;
  brief: PlayableBrief;
  scene: {
    grid: { width: number; height: number };
    tileSize: number;
    tileGap: { x: number; y: number };
    offset: { x: number; y: number };
    scale: { vertical: number; horizontal: number };
  };
  motion: {
    tileFlightDuration: number;
    tileFlightEase: string;
  };
  theme: {
    backgroundColor: string;
    trailTint: string;
  };
  gameplay: PlayableGameplaySettings;
  tutorial: PlayableTutorialSettings;
  tileRendering: PlayableTileRenderingSettings;
  layout: PlayableLayoutSettings;
  assets: PlayableAssetLibrary;
  validation?: PlayableProjectValidation;
  tiles: Array<EditorTile & {
    impionColor: string | null;
    hidden: boolean;
    golden: boolean;
  }>;
}

const COLOR_PALETTE: Record<string, string> = {
  YELLOW: '#f4cf3a',
  PINK: '#ec5e9d',
  PURPLE: '#7b55d9',
  GREEN: '#55b96f',
  BLUE: '#3b82f6',
};

export const defaultProjectMeta: PlayableProjectMeta = {
  code: 'TG_play01_01',
  game: 'Tap Gallery',
  iteration: 1,
  sourceTzUrl: '',
};

export const defaultBrief: PlayableBrief = {
  rawText: '',
  summary: '',
  taskText: 'Tap tiles in the right order!',
  ctaText: 'You win!',
  androidUrl: 'https://play.google.com/',
  iosUrl: 'https://www.apple.com/app-store/',
  notes: [],
};

export const defaultSceneSettings: PlayableSceneSettings = {
  tileSize: 82,
  gapX: 82,
  gapY: 82,
  offsetX: -1150,
  offsetY: -850,
  verticalScale: 0.25,
  horizontalScale: 0.35,
  tileFlightDuration: 1.2,
  tileFlightEase: 'expo.in',
  trailTint: '#fff000',
  backgroundColor: '#ffffff',
};

export const defaultAssets: PlayableAssetLibrary = {
  backgroundImage: null,
  tileTexture: null,
  trailTexture: null,
  centerCharacter: null,
  storeButtonTexture: null,
  winButtonTexture: null,
  ctaPanelTexture: null,
  winBackgroundImage: null,
  musicTrack: null,
  tapSound: null,
  badMoveSound: null,
  winSound: null,
  warningSound: null,
};

export const defaultGameplaySettings: PlayableGameplaySettings = {
  levelText: 'Level 99',
  storeButtonText: 'PLAY NOW',
  winButtonText: 'PLAY NOW',
  redirectTapCount: 0,
  selectedTileTint: '#36d66b',
  wrongTapTint: '#CDA5A5',
};

export const defaultTutorialSettings: PlayableTutorialSettings = {
  enabled: true,
  targetMode: 'first-available',
  targetX: 0,
  targetY: 0,
  text: 'Tap the highlighted tile!',
  startDelay: 2,
  repeatDelay: 4,
  visibleDuration: 0,
  endCondition: 'specific-tile',
};

export const defaultTileRenderingSettings: PlayableTileRenderingSettings = {
  useSharedTexture: true,
  tintSharedTexture: true,
  fallbackTint: '#ffffff',
};

export const defaultLayoutSettings: PlayableLayoutSettings = {
  centerCharacterX: 0,
  centerCharacterY: 0,
  centerCharacterScaleVertical: 0.48,
  centerCharacterScaleHorizontal: 0.42,
  taskTextY: -80,
  taskTextHorizontalX: -200,
  taskTextFontSize: 75,
  taskTextColor: '#f2f2f2',
  pointerOffsetX: 0,
  pointerOffsetY: 0,
};

export function parseBriefFromText(rawText: string, current: PlayableBrief): PlayableBrief {
  const text = rawText.trim();
  if (!text) return { ...current, rawText: '' };

  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const links = Array.from(text.matchAll(/https?:\/\/[^\s)]+/gi)).map(match => match[0]);
  const taskLine = findQuotedText(text, ['free', 'animal', 'poor', 'help', 'save'])
    || findValue(lines, ['task', 'цель', 'задача', 'tutorial', 'туториал'])
    || findGoalText(lines);
  const ctaLine = findButtonText(text)
    || findValue(lines, ['cta', 'end card', 'финал'])
    || findButtonText(text)
    || findQuotedText(text, ['play', 'now', 'install']);
  const gameLine = findLabeledValue(lines, ['game', 'игра', 'title', 'название']);

  return {
    ...current,
    rawText,
    summary: gameLine || findGoalText(lines) || lines.slice(0, 3).join(' '),
    taskText: taskLine || current.taskText,
    ctaText: ctaLine || current.ctaText,
    androidUrl: links.find(link => link.includes('play.google.com')) || current.androidUrl,
    iosUrl: links.find(link => link.includes('apps.apple.com') || link.includes('apple.com')) || current.iosUrl,
    notes: extractBriefNotes(lines),
  };
}

export function parseProjectMetaFromText(rawText: string, current: PlayableProjectMeta): PlayableProjectMeta {
  const text = rawText.trim();
  if (!text) return current;

  const projectCode = text.match(/\bTG_play\d+_\d+\b/i)?.[0] || current.code;
  const iteration = Number(projectCode.match(/_(\d+)$/)?.[1]) || current.iteration;
  const sourceTzUrl = Array.from(text.matchAll(/https?:\/\/[^\s)]+/gi))
    .map(match => match[0])
    .find(link => /notion\.|trello\.com|docs\.google\.com/i.test(link)) || current.sourceTzUrl;

  return {
    ...current,
    code: projectCode,
    game: /tap\s+(?:[a-z]+\s+)?gallery/i.test(text) ? 'Tap Gallery' : current.game,
    iteration,
    sourceTzUrl,
  };
}

export function deriveSceneSettingsFromText(rawText: string, current: PlayableSceneSettings): PlayableSceneSettings {
  const text = rawText.toLowerCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ');
  const next = { ...current };

  if (
    text.includes('темно-син') ||
    text.includes('тёмно-син') ||
    text.includes('близким к черному') ||
    text.includes('близким к чёрному')
  ) {
    next.backgroundColor = '#07111f';
  }

  if (text.includes('желтый') || text.includes('жёлтый')) {
    next.trailTint = '#fff000';
  } else if (text.includes('зеленый') || text.includes('зелёный')) {
    next.trailTint = '#80ff72';
  }

  return next;
}

export function deriveGameplaySettingsFromText(rawText: string, current: PlayableGameplaySettings): PlayableGameplaySettings {
  const text = rawText.replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  const next = { ...current };

  const levelMatch = text.match(/\bLevel\s+\d+\b/i);
  if (levelMatch) next.levelText = levelMatch[0].replace(/\s+/g, ' ');

  const buttonText = findButtonText(rawText);
  if (buttonText) {
    next.storeButtonText = buttonText;
    next.winButtonText = buttonText;
  }

  if (lower.includes('любой тап') && lower.includes('стор')) {
    next.redirectTapCount = 1;
  } else if (lower.includes('количеством тапов') || lower.includes('modeclicks')) {
    next.redirectTapCount = Math.max(next.redirectTapCount, 3);
  }

  if (lower.includes('выделяем') && (lower.includes('зелёным') || lower.includes('зеленым'))) {
    next.selectedTileTint = '#36d66b';
  }

  return next;
}

export function deriveTutorialSettingsFromText(rawText: string, current: PlayableTutorialSettings): PlayableTutorialSettings {
  const text = rawText.replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  const next = { ...current };
  const tutorialText = findValue(rawText.split(/\r?\n/).map(line => line.trim()).filter(Boolean), ['tutorial', 'туториал', 'подсказка', 'finger', 'палец']);

  if (tutorialText) next.text = tutorialText.slice(0, 80);

  if (lower.includes('без туториала') || lower.includes('no tutorial')) {
    next.enabled = false;
  } else if (lower.includes('туториал') || lower.includes('tutorial') || lower.includes('палец') || lower.includes('finger')) {
    next.enabled = true;
  }

  if (lower.includes('любой тап') || lower.includes('any tap')) {
    next.endCondition = 'any-tap';
  } else if (lower.includes('тап по экрану') || lower.includes('screen tap')) {
    next.endCondition = 'screen-tap';
  } else if (lower.includes('по таймеру') || lower.includes('timer')) {
    next.endCondition = 'time';
  }

  if (lower.includes('кнопк') || lower.includes('button')) {
    next.targetMode = 'store-button';
  } else if (lower.includes('центр') || lower.includes('center')) {
    next.targetMode = 'center';
  }

  const startMatch = lower.match(/(?:start|delay|старт|задержк)[^\d]{0,12}(\d+(?:[.,]\d+)?)/);
  if (startMatch?.[1]) next.startDelay = Number(startMatch[1].replace(',', '.')) || next.startDelay;

  const repeatMatch = lower.match(/(?:repeat|повтор)[^\d]{0,12}(\d+(?:[.,]\d+)?)/);
  if (repeatMatch?.[1]) next.repeatDelay = Number(repeatMatch[1].replace(',', '.')) || next.repeatDelay;

  return next;
}

export function buildCanonicalProject(args: {
  meta: PlayableProjectMeta;
  brief: PlayableBrief;
  settings: PlayableSceneSettings;
  gameplay?: PlayableGameplaySettings;
  tutorial?: PlayableTutorialSettings;
  tileRendering?: PlayableTileRenderingSettings;
  layout?: PlayableLayoutSettings;
  assets?: PlayableAssetLibrary;
  validation?: PlayableProjectValidation;
  tiles: EditorTile[];
  gridWidth: number;
  gridHeight: number;
}): PlayableCanonicalProject {
  return {
    schemaVersion: 1,
    project: args.meta,
    brief: args.brief,
    scene: {
      grid: { width: args.gridWidth, height: args.gridHeight },
      tileSize: args.settings.tileSize,
      tileGap: { x: args.settings.gapX, y: args.settings.gapY },
      offset: { x: args.settings.offsetX, y: args.settings.offsetY },
      scale: {
        vertical: args.settings.verticalScale,
        horizontal: args.settings.horizontalScale,
      },
    },
    motion: {
      tileFlightDuration: args.settings.tileFlightDuration,
      tileFlightEase: args.settings.tileFlightEase,
    },
    theme: {
      backgroundColor: args.settings.backgroundColor,
      trailTint: args.settings.trailTint,
    },
    gameplay: args.gameplay || defaultGameplaySettings,
    tutorial: args.tutorial || defaultTutorialSettings,
    tileRendering: args.tileRendering || defaultTileRenderingSettings,
    layout: args.layout || defaultLayoutSettings,
    assets: args.assets || defaultAssets,
    validation: args.validation,
    tiles: args.tiles.map(tile => ({
      ...tile,
      impionColor: nearestImpionColor(tile.color),
      hidden: false,
      golden: false,
    })),
  };
}

export function generateTileFieldPreset(project: PlayableCanonicalProject, seedName = 'seed0') {
  const cells = new Map(project.tiles.map(tile => [`${tile.x},${tile.y}`, tile]));
  const columns: string[] = [];

  for (let x = 0; x < project.scene.grid.width; x++) {
    const rows: string[] = [];
    for (let y = 0; y < project.scene.grid.height; y++) {
      const tile = cells.get(`${x},${y}`);
      const direction = directionToImpion(tile?.direction || 'right');
      const color = tile?.impionColor ? `IMPION.Color.${tile.impionColor}` : 'null';
      rows.push(`{direction: IMPION.TileDirection.${direction}, color: ${color}, hidden: ${Boolean(tile?.hidden)}, golden: ${Boolean(tile?.golden)}}`);
    }

    const comma = x < project.scene.grid.width - 1 ? ',' : '';
    columns.push(`\t\t[${rows.join(',\n\t\t')}]${comma} // column ${x + 1}`);
  }

  return `import * as IMPION from "#impion";

export default class TileFieldPreset {
\t${seedName} = [
${columns.join('\n\n')}
\t];
}
`;
}

export function downloadTextFile(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function findValue(lines: string[], keys: string[]) {
  const index = lines.findIndex(line => keys.some(key => line.toLowerCase().includes(key)));
  if (index === -1) return '';

  const found = lines[index];
  const [, value] = found.split(/:|—|-/);
  const cleanValue = (value || '').trim();
  if (cleanValue) return stripWrappingQuotes(cleanValue);

  return findContinuation(lines, index + 1);
}

function findLabeledValue(lines: string[], keys: string[]) {
  const pattern = new RegExp(`^(${keys.join('|')})\\s*[:—-]\\s*(.+)$`, 'i');
  const found = lines.find(line => pattern.test(line));
  return found ? stripWrappingQuotes(found.replace(pattern, '$2')) : '';
}

function findGoalText(lines: string[]) {
  const goalIndex = lines.findIndex(line => /^(цель|goal)\s*:?$/i.test(line) || /^цель\s*:/i.test(line));
  if (goalIndex === -1) return '';

  const currentValue = lines[goalIndex].replace(/^цель\s*:?/i, '').trim();
  if (currentValue) return currentValue;

  return findContinuation(lines, goalIndex + 1);
}

function findContinuation(lines: string[], startIndex: number) {
  return lines.slice(startIndex, startIndex + 5)
    .filter(line => !isBriefMetadataLine(line))
    .filter(line => !/^TG_play\d+_\d+$/i.test(line))
    .filter(line => !/^\d+$/.test(line))
    .join(' ')
    .trim();
}

function isBriefMetadataLine(line: string) {
  const lower = line.toLowerCase().trim();
  return [
    'client level',
    'дизайнер',
    'разработчик',
    'сроки',
    'store links',
    'ассеты',
  ].some(prefix => lower.startsWith(prefix));
}

function findButtonText(text: string) {
  const normalized = text.replace(/\s+/g, ' ');
  const buttonMatch = normalized.match(/(?:кнопка|button)\s+[“"']([^”"']{2,40})[”"']/i);
  if (buttonMatch?.[1]) return stripWrappingQuotes(buttonMatch[1]).toUpperCase();

  const playNow = normalized.match(/\bPLAY\s+NOW\b/i);
  return playNow ? 'PLAY NOW' : '';
}

function findQuotedText(text: string, words: string[]) {
  const quoted = Array.from(text.replace(/\s+/g, ' ').matchAll(/[“"']([^”"']{3,80})[”"']/g))
    .map(match => match[1].trim());

  const found = quoted.find(value => {
    const lower = value.toLowerCase();
    return words.some(word => lower.includes(word));
  });

  return found ? stripWrappingQuotes(found) : '';
}

function extractBriefNotes(lines: string[]) {
  const importantIndex = lines.findIndex(line => line.includes('Важно') || line.includes('‼'));
  const uiIndex = lines.findIndex(line => line.includes('UI') || line.includes('🖼'));
  const sceneIndex = lines.findIndex(line => line.toLowerCase().includes('scene'));

  const notes = [
    ...lines.slice(0, 10),
    ...lines.slice(sceneIndex === -1 ? 0 : sceneIndex, sceneIndex === -1 ? 0 : sceneIndex + 12),
    ...lines.slice(importantIndex === -1 ? 0 : importantIndex, importantIndex === -1 ? 0 : importantIndex + 8),
    ...lines.slice(uiIndex === -1 ? 0 : uiIndex, uiIndex === -1 ? 0 : uiIndex + 6),
  ].filter(Boolean);

  return Array.from(new Set(notes)).slice(0, 36);
}

function stripWrappingQuotes(value: string) {
  return value
    .replace(/^[“"'«\s]+|[”"'»\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function directionToImpion(direction: Direction) {
  const map: Record<Direction, string> = {
    up: 'UP',
    right: 'RIGHT',
    down: 'DOWN',
    left: 'LEFT',
  };
  return map[direction];
}

function nearestImpionColor(hex: string) {
  const rgb = parseHex(hex);
  if (!rgb) return null;

  let bestName = 'YELLOW';
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [name, paletteHex] of Object.entries(COLOR_PALETTE)) {
    const candidate = parseHex(paletteHex);
    if (!candidate) continue;

    const distance = ((rgb.r - candidate.r) ** 2) + ((rgb.g - candidate.g) ** 2) + ((rgb.b - candidate.b) ** 2);
    if (distance < bestDistance) {
      bestName = name;
      bestDistance = distance;
    }
  }

  return bestName;
}

function parseHex(hex: string) {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;

  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}
