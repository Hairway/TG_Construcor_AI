/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { 
  Upload, 
  Download, 
  ArrowUp, 
  ArrowRight, 
  ArrowDown, 
  ArrowLeft, 
  Plus, 
  Minus, 
  RotateCcw, 
  Eraser,
  ZoomIn,
  Loader2,
  ZoomOut,
  Maximize,
  Palette,
  Eye,
  EyeOff,
  Settings2,
  Pencil,
  X,
  Undo2,
  Redo2,
  Play,
  Gamepad2,
  Trophy,
  CheckCircle2,
  Lock,
  Unlock,
  FolderOpen,
  Save,
  FilePlus,
  Trash2,
  Image as ImageIcon,
  Music,
  Package,
  History as HistoryIcon,
  MousePointer2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { 
  db, 
  handleFirestoreError, 
  OperationType 
} from './lib/firebase';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs, 
  query, 
  orderBy, 
  serverTimestamp,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import {
  buildCanonicalProject,
  defaultAssets,
  defaultBrief,
  defaultGameplaySettings,
  defaultLayoutSettings,
  defaultProjectMeta,
  defaultSceneSettings,
  defaultTileRenderingSettings,
  defaultTutorialSettings,
  deriveGameplaySettingsFromText,
  deriveTutorialSettingsFromText,
  downloadTextFile,
  deriveSceneSettingsFromText,
  generateTileFieldPreset,
  parseBriefFromText,
  parseProjectMetaFromText,
  type PlayableAssetLibrary,
  type PlayableAssetSlot,
  type PlayableBrief,
  type PlayableCanonicalProject,
  type PlayableGameplaySettings,
  type PlayableLayoutSettings,
  type PlayableProjectMeta,
  type PlayableProjectValidation,
  type PlayableSceneSettings,
  type PlayableTileRenderingSettings,
  type PlayableTutorialSettings,
} from './lib/playableExport';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Direction = 'up' | 'right' | 'down' | 'left';

interface Tile {
  x: number;
  y: number;
  color: string;
  direction: Direction;
}

const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];
const ASSET_LIBRARY_STORAGE_KEY = 'tap-gallery-constructor.asset-library.v1';
const PROJECT_LIBRARY_STORAGE_KEY = 'tap-gallery-constructor.project-library.v1';
const STYLE_PRESET_STORAGE_KEY = 'tap-gallery-constructor.style-presets.v1';

interface StoredAssetItem {
  id: string;
  slot: keyof PlayableAssetLibrary;
  name: string;
  asset: PlayableAssetSlot;
}

interface StoredProjectItem {
  id: string;
  name: string;
  savedAt: string;
  project: PlayableCanonicalProject;
}

interface StoredStylePreset {
  id: string;
  name: string;
  savedAt: string;
  sceneSettings: PlayableSceneSettings;
  gameplaySettings: PlayableGameplaySettings;
  tutorialSettings?: PlayableTutorialSettings;
  tileRenderingSettings?: PlayableTileRenderingSettings;
  layoutSettings?: PlayableLayoutSettings;
  assets: PlayableAssetLibrary;
  palette: string[];
}

interface PlayableTemplatePreset {
  id: string;
  name: string;
  sceneSettings?: Partial<PlayableSceneSettings>;
  gameplaySettings?: Partial<PlayableGameplaySettings>;
  tutorialSettings?: Partial<PlayableTutorialSettings>;
  tileRenderingSettings?: Partial<PlayableTileRenderingSettings>;
  layoutSettings?: Partial<PlayableLayoutSettings>;
}

const BUILT_IN_PLAYABLE_TEMPLATES: PlayableTemplatePreset[] = [
  {
    id: 'center-rescue',
    name: 'Center Object Rescue',
    tutorialSettings: {
      enabled: true,
      targetMode: 'first-available',
      text: 'Tap the free tile!',
      startDelay: 1.8,
      repeatDelay: 4,
      visibleDuration: 0,
      endCondition: 'specific-tile',
    },
    layoutSettings: {
      centerCharacterX: 0,
      centerCharacterY: 0,
      centerCharacterScaleVertical: 0.48,
      centerCharacterScaleHorizontal: 0.42,
      taskTextY: -80,
      taskTextHorizontalX: -200,
      taskTextFontSize: 75,
    },
  },
  {
    id: 'fast-tutorial',
    name: 'Fast Tutorial CTA',
    gameplaySettings: {
      redirectTapCount: 1,
    },
    tutorialSettings: {
      enabled: true,
      targetMode: 'tile',
      targetX: 0,
      targetY: 0,
      text: 'Tap here!',
      startDelay: 1,
      repeatDelay: 2.5,
      visibleDuration: 2,
      endCondition: 'any-tap',
    },
    layoutSettings: {
      taskTextY: -110,
      taskTextHorizontalX: -160,
      taskTextFontSize: 68,
      pointerOffsetX: 12,
      pointerOffsetY: 18,
    },
  },
  {
    id: 'shared-texture-skin',
    name: 'Shared Texture Skin',
    tileRenderingSettings: {
      useSharedTexture: true,
      tintSharedTexture: true,
      fallbackTint: '#ffffff',
    },
    sceneSettings: {
      tileFlightDuration: 1.05,
      tileFlightEase: 'expo.in',
      trailTint: '#fff000',
    },
  },
  {
    id: 'calm-logic',
    name: 'Calm Logic Puzzle',
    gameplaySettings: {
      redirectTapCount: 0,
    },
    tutorialSettings: {
      enabled: true,
      targetMode: 'first-available',
      text: 'Choose the tile with a clear path',
      startDelay: 2.5,
      repeatDelay: 5,
      visibleDuration: 0,
      endCondition: 'specific-tile',
    },
    sceneSettings: {
      tileFlightDuration: 1.35,
      tileFlightEase: 'power2.in',
    },
  },
];

interface PuzzleLogicReport {
  total: number;
  cleared: number;
  solvable: boolean;
  availableMoves: Tile[];
  firstMoves: Tile[];
  stuckTiles: Tile[];
}

function canTileExit(tile: Tile, board: Map<string, Tile>, gridWidth: number, gridHeight: number) {
  let x = tile.x;
  let y = tile.y;

  while (true) {
    if (tile.direction === 'up') y--;
    else if (tile.direction === 'down') y++;
    else if (tile.direction === 'left') x--;
    else if (tile.direction === 'right') x++;

    if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return true;
    if (board.has(`${x},${y}`)) return false;
  }
}

function analyzePuzzleLogic(tiles: Map<string, Tile>, gridWidth: number, gridHeight: number): PuzzleLogicReport {
  const board = new Map(tiles);
  const firstMoves: Tile[] = [];
  const total = board.size;
  const availableMoves = Array.from(board.values())
    .filter(tile => canTileExit(tile, board, gridWidth, gridHeight))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  while (board.size > 0) {
    const available = Array.from(board.values())
      .filter(tile => canTileExit(tile, board, gridWidth, gridHeight))
      .sort((a, b) => a.y - b.y || a.x - b.x);

    if (available.length === 0) break;

    const next = available[0];
    if (firstMoves.length < 12) firstMoves.push(next);
    board.delete(`${next.x},${next.y}`);
  }

  return {
    total,
    cleared: total - board.size,
    solvable: total > 0 && board.size === 0,
    availableMoves,
    firstMoves,
    stuckTiles: Array.from(board.values()).sort((a, b) => a.y - b.y || a.x - b.x),
  };
}

function nextDirection(direction: Direction): Direction {
  const index = DIRECTIONS.indexOf(direction);
  return DIRECTIONS[(index + 1) % DIRECTIONS.length];
}

function normalizeUrlInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeAssetLibrary(assets?: Partial<PlayableAssetLibrary> | null): PlayableAssetLibrary {
  return {
    ...defaultAssets,
    ...(assets || {}),
  };
}

function normalizeTutorialSettings(settings?: Partial<PlayableTutorialSettings> | null): PlayableTutorialSettings {
  return {
    ...defaultTutorialSettings,
    ...(settings || {}),
  };
}

function normalizeTileRenderingSettings(settings?: Partial<PlayableTileRenderingSettings> | null): PlayableTileRenderingSettings {
  return {
    ...defaultTileRenderingSettings,
    ...(settings || {}),
  };
}

function normalizeLayoutSettings(settings?: Partial<PlayableLayoutSettings> | null): PlayableLayoutSettings {
  return {
    ...defaultLayoutSettings,
    ...(settings || {}),
  };
}

export default function App() {
  const [tiles, setTiles] = useState<Map<string, Tile>>(new Map());
  const [history, setHistory] = useState<Map<string, Tile>[]>([]);
  const [redoStack, setRedoStack] = useState<Map<string, Tile>[]>([]);
  const tilesRef = useRef(tiles);

  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);

  const MAX_HISTORY = 50;

  const pushToHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-(MAX_HISTORY - 1)), new Map(tilesRef.current)]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const newHistory = [...prev];
      const previous = newHistory.pop()!;
      setRedoStack(redo => [...redo, new Map(tilesRef.current)]);
      setTiles(previous);
      setIsPuzzleGenerated(false);
      return newHistory;
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const newRedo = [...prev];
      const next = newRedo.pop()!;
      setHistory(hist => [...hist, new Map(tilesRef.current)]);
      setTiles(next);
      setIsPuzzleGenerated(false);
      return newRedo;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const lastInteractedTile = useRef<string | null>(null);
  const [selectedColor, setSelectedColor] = useState('#3b82f6');
  const [selectedDirection, setSelectedDirection] = useState<Direction>('up');
  const [tool, setTool] = useState<'add' | 'erase' | 'paint' | 'arrow' | 'tutorial'>('add');
  const [brushSize, setBrushSize] = useState<1 | 2 | 3 | 4>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [gridWidth, setGridWidth] = useState(30);
  const [gridHeight, setGridHeight] = useState(30);
  const [isAspectRatioLocked, setIsAspectRatioLocked] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [showArrows, setShowArrows] = useState(true);
  const [showLogicHints, setShowLogicHints] = useState(true);
  const [palette, setPalette] = useState<string[]>(['#3b82f6', '#ef4444', '#ffffff', '#000000']);
  const [lastImage, setLastImage] = useState<string | null>(null);
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPuzzleGenerated, setIsPuzzleGenerated] = useState(false);
  const [isTestModeOpen, setIsTestModeOpen] = useState(false);
  const [showBackground, setShowBackground] = useState(true);
  const [backgroundOpacity, setBackgroundOpacity] = useState(1);
  const [cursorPos, setCursorPos] = useState<{x: number, y: number} | null>(null);

  // --- Puzzle Persistence ---
  const [currentPuzzleId, setCurrentPuzzleId] = useState<string | null>(null);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [puzzleName, setPuzzleName] = useState('Untitled Puzzle');
  const [projectMeta, setProjectMeta] = useState<PlayableProjectMeta>(defaultProjectMeta);
  const [brief, setBrief] = useState<PlayableBrief>(defaultBrief);
  const [sceneSettings, setSceneSettings] = useState<PlayableSceneSettings>(defaultSceneSettings);
  const [gameplaySettings, setGameplaySettings] = useState<PlayableGameplaySettings>(defaultGameplaySettings);
  const [tutorialSettings, setTutorialSettings] = useState<PlayableTutorialSettings>(defaultTutorialSettings);
  const [tileRenderingSettings, setTileRenderingSettings] = useState<PlayableTileRenderingSettings>(defaultTileRenderingSettings);
  const [layoutSettings, setLayoutSettings] = useState<PlayableLayoutSettings>(defaultLayoutSettings);
  const [assetLibrary, setAssetLibrary] = useState<PlayableAssetLibrary>(defaultAssets);
  const [tzDraft, setTzDraft] = useState('');
  const [isExportingProject, setIsExportingProject] = useState(false);
  const [exportApiStatus, setExportApiStatus] = useState('');
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [isImportingTzUrl, setIsImportingTzUrl] = useState(false);
  const [storedAssets, setStoredAssets] = useState<StoredAssetItem[]>([]);
  const [selectedStoredAssetId, setSelectedStoredAssetId] = useState('');
  const [storedProjects, setStoredProjects] = useState<StoredProjectItem[]>([]);
  const [selectedStoredProjectId, setSelectedStoredProjectId] = useState('');
  const [storedStylePresets, setStoredStylePresets] = useState<StoredStylePreset[]>([]);
  const [selectedStylePresetId, setSelectedStylePresetId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState(BUILT_IN_PLAYABLE_TEMPLATES[0]?.id || '');

  // --- Custom Dialog State ---
  const [dialog, setDialog] = useState<{
    type: 'confirm' | 'prompt';
    title: string;
    message: string;
    defaultValue?: string;
    onResponse: (response: string | boolean | null) => void;
  } | null>(null);

  const clearTiles = useCallback(() => {
    if (tiles.size === 0) return;
    pushToHistory();
    setTiles(new Map());
    setIsPuzzleGenerated(false);
  }, [tiles.size, pushToHistory]);

  const clearCenterHole = useCallback(() => {
    if (tiles.size === 0) return;

    pushToHistory();
    const holeWidth = Math.min(5, Math.max(3, Math.round(gridWidth * 0.14)));
    const holeHeight = Math.min(5, Math.max(3, Math.round(gridHeight * 0.14)));
    const minX = Math.floor((gridWidth - holeWidth) / 2);
    const minY = Math.floor((gridHeight - holeHeight) / 2);
    const maxX = minX + holeWidth - 1;
    const maxY = minY + holeHeight - 1;

    setTiles(prev => {
      const next = new Map<string, Tile>(prev);
      for (const [key, tile] of next.entries()) {
        if (tile.x >= minX && tile.x <= maxX && tile.y >= minY && tile.y <= maxY) {
          next.delete(key);
        }
      }
      return next;
    });
    setIsPuzzleGenerated(false);
  }, [tiles.size, gridWidth, gridHeight, pushToHistory]);

  // --- Persistence Methods ---
  const generateThumbnail = (): Promise<string> => {
    console.log('Generating thumbnail...');
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve('');

        const size = 200;
        canvas.width = size;
        canvas.height = size;
        
        const boardW = gridWidth * 24;
        const boardH = gridHeight * 24;
        const scale = Math.min(size / boardW, size / boardH) * 0.9;
        
        ctx.fillStyle = '#0f0f0f';
        ctx.fillRect(0, 0, size, size);
        
        ctx.translate((size - boardW * scale) / 2, (size - boardH * scale) / 2);
        ctx.scale(scale, scale);

        tiles.forEach((tile) => {
          ctx.fillStyle = tile.color;
          ctx.beginPath();
          ctx.rect(tile.x * 24, tile.y * 24, 22, 22);
          ctx.fill();
        });
        
        const dataUrl = canvas.toDataURL('image/png', 0.5);
        console.log('Thumbnail generated successfully');
        resolve(dataUrl);
      } catch (err) {
        console.error('Thumbnail generation failed:', err);
        resolve('');
      }
    });
  };

  const handleNew = () => {
    setDialog({
      type: 'confirm',
      title: 'New Puzzle',
      message: 'Create a new puzzle? Current unsaved changes will be lost.',
      onResponse: (confirmed) => {
        if (confirmed) {
          setTiles(new Map());
          setHistory([]);
          setRedoStack([]);
          setCurrentPuzzleId(null);
          setPuzzleName('Untitled Puzzle');
          setProjectMeta(defaultProjectMeta);
          setBrief(defaultBrief);
          setSceneSettings(defaultSceneSettings);
          setGameplaySettings(defaultGameplaySettings);
          setTutorialSettings(defaultTutorialSettings);
          setTileRenderingSettings(defaultTileRenderingSettings);
          setLayoutSettings(defaultLayoutSettings);
          setAssetLibrary(defaultAssets);
          setTzDraft('');
          setIsPuzzleGenerated(false);
        }
        setDialog(null);
      }
    });
  };

  const handleSave = async (asNew = false) => {
    console.log('handleSave called', { asNew, tilesSize: tiles.size, currentPuzzleId });
    if (tiles.size === 0) {
      console.warn('Cannot save empty puzzle');
      return;
    }
    
    if (asNew || !currentPuzzleId) {
      setDialog({
        type: 'prompt',
        title: 'Save Puzzle',
        message: 'Enter puzzle name:',
        defaultValue: puzzleName,
        onResponse: (name) => {
          if (name !== null) {
            const finalName = (name as string) || 'Untitled Puzzle';
            setPuzzleName(finalName);
            performSave(asNew, finalName);
          }
          setDialog(null);
        }
      });
    } else {
      performSave(asNew, puzzleName);
    }
  };

  const performSave = async (asNew: boolean, name: string) => {
    setIsSaving(true);
    try {
      console.log('Starting save process...');
      const previewUrl = await generateThumbnail();
      const serializableTiles: Record<string, any> = {};
      tiles.forEach((v, k) => {
        serializableTiles[k] = v;
      });

      const puzzleData = {
        name,
        gridWidth,
        gridHeight,
        tiles: serializableTiles,
        projectMeta,
        brief,
        sceneSettings,
        gameplaySettings,
        tutorialSettings,
        tileRenderingSettings,
        layoutSettings,
        assetLibrary,
        previewUrl,
        updatedAt: serverTimestamp(),
      };

      if (!asNew && currentPuzzleId) {
        try {
          await updateDoc(doc(db, 'puzzles', currentPuzzleId), puzzleData);
        } catch (err: any) {
          // If the document was deleted in the background, fallback to creating a new one
          if (err?.code === 'not-found' || (err instanceof Error && err.message.includes('No document to update'))) {
            const docRef = await addDoc(collection(db, 'puzzles'), {
              ...puzzleData,
              createdAt: serverTimestamp(),
            });
            setCurrentPuzzleId(docRef.id);
          } else {
            throw err;
          }
        }
      } else {
        const docRef = await addDoc(collection(db, 'puzzles'), {
          ...puzzleData,
          createdAt: serverTimestamp(),
        });
        setCurrentPuzzleId(docRef.id);
      }
      console.log('Save operation completed successfully');
      // Toast or simple non-blocking feedback would be better, but we'll use our dialog for success too
      setDialog({
        type: 'confirm',
        title: 'Success',
        message: 'Puzzle saved successfully!',
        onResponse: () => setDialog(null)
      });
    } catch (err) {
      console.error('Critical save error:', err);
      handleFirestoreError(err, asNew || !currentPuzzleId ? OperationType.CREATE : OperationType.UPDATE, currentPuzzleId ? `puzzles/${currentPuzzleId}` : 'puzzles');
    } finally {
      setIsSaving(false);
    }
  };

  const loadPuzzle = (id: string, data: any) => {
    const newTiles = new Map<string, Tile>();
    Object.entries(data.tiles).forEach(([k, v]: [string, any]) => {
      newTiles.set(k, v as Tile);
    });
    
    setGridWidth(data.gridWidth);
    setGridHeight(data.gridHeight);
    setTiles(newTiles);
    setPuzzleName(data.name);
    setProjectMeta(data.projectMeta || defaultProjectMeta);
    setBrief(data.brief || defaultBrief);
    setSceneSettings(data.sceneSettings || defaultSceneSettings);
    setGameplaySettings(data.gameplaySettings || data.gameplay || defaultGameplaySettings);
    setTutorialSettings(normalizeTutorialSettings(data.tutorialSettings || data.tutorial));
    setTileRenderingSettings(normalizeTileRenderingSettings(data.tileRenderingSettings || data.tileRendering));
    setLayoutSettings(normalizeLayoutSettings(data.layoutSettings || data.layout));
    setAssetLibrary(normalizeAssetLibrary(data.assetLibrary || data.assets));
    setTzDraft(data.brief?.rawText || '');
    setCurrentPuzzleId(id);
    setIsPuzzleGenerated(true); 
    setIsGalleryOpen(false);
    
    // Reset view
    setTimeout(resetView, 100);
  };

  const containerRef = useRef<HTMLDivElement>(null);

  // --- Image Processing ---
  const processImage = useCallback((imageSrc: string) => {
    setIsProcessing(true);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = gridWidth;
      const height = gridHeight;

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const newTiles = new Map<string, Tile>();

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const r = imageData.data[idx];
          const g = imageData.data[idx + 1];
          const b = imageData.data[idx + 2];
          const a = imageData.data[idx + 3];

          if (a > 50) {
            const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
            const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
            newTiles.set(`${x},${y}`, { x, y, color: hex, direction });
          }
        }
      }

      pushToHistory();
      setTiles(newTiles);
      setIsPuzzleGenerated(false);
      setIsProcessing(false);
    };
    img.src = imageSrc;
  }, [gridWidth, gridHeight]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      setRawImage(src);
      setIsEditorOpen(true);
      // We will reset view after editor confirms and sets dimensions
      // Reset input value
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (lastImage) {
      processImage(lastImage);
    }
  }, [gridWidth, gridHeight, processImage, lastImage]);

  // --- Interaction Handlers ---
  const removeTopRow = () => {
    if (tiles.size === 0) return;
    pushToHistory();
    const minY = Math.min(...Array.from(tiles.values()).map((t: Tile) => t.y));
    const newTiles = new Map(tiles);
    for (const [key, tile] of newTiles.entries()) {
      if ((tile as Tile).y === minY) newTiles.delete(key);
    }
    setTiles(newTiles);
    setIsPuzzleGenerated(false);
  };

  const removeBottomRow = () => {
    if (tiles.size === 0) return;
    pushToHistory();
    const maxY = Math.max(...Array.from(tiles.values()).map((t: Tile) => t.y));
    const newTiles = new Map(tiles);
    for (const [key, tile] of newTiles.entries()) {
      if ((tile as Tile).y === maxY) newTiles.delete(key);
    }
    setTiles(newTiles);
    setIsPuzzleGenerated(false);
  };

  const removeLeftCol = () => {
    if (tiles.size === 0) return;
    pushToHistory();
    const minX = Math.min(...Array.from(tiles.values()).map((t: Tile) => t.x));
    const newTiles = new Map(tiles);
    for (const [key, tile] of newTiles.entries()) {
      if ((tile as Tile).x === minX) newTiles.delete(key);
    }
    setTiles(newTiles);
    setIsPuzzleGenerated(false);
  };

  const removeRightCol = () => {
    if (tiles.size === 0) return;
    pushToHistory();
    const maxX = Math.max(...Array.from(tiles.values()).map((t: Tile) => t.x));
    const newTiles = new Map(tiles);
    for (const [key, tile] of newTiles.entries()) {
      if ((tile as Tile).x === maxX) newTiles.delete(key);
    }
    setTiles(newTiles);
    setIsPuzzleGenerated(false);
  };

  const generateSolvablePuzzle = useCallback(() => {
    const silhouette = Array.from(tiles.values()) as Tile[];
    if (silhouette.length === 0) return;

    setIsProcessing(true);
    
    // Heuristic: calculate depth (distance to nearest boundary)
    const getDepth = (t: Tile) => {
      return Math.min(t.x, t.y, gridWidth - 1 - t.x, gridHeight - 1 - t.y);
    };

    setTimeout(() => {
      let resultTiles = new Map<string, Tile>();
      let success = false;
      let attempts = 0;

      while (attempts < 50 && !success) {
        attempts++;
        // Sort by depth descending: place inner tiles first in reverse process
        const remaining = [...silhouette].sort((a, b) => {
          const depthA = getDepth(a);
          const depthB = getDepth(b);
          if (depthA !== depthB) return depthB - depthA;
          return Math.random() - 0.5;
        });
        
        const currentResult = new Map<string, Tile>();
        let stuck = false;

        while (remaining.length > 0) {
          let placedInThisStep = false;

          for (let i = 0; i < remaining.length; i++) {
            const pos = remaining[i];
            const shuffledDirs = [...DIRECTIONS].sort(() => Math.random() - 0.5);
            const validDirections: { dir: Direction, penalty: number }[] = [];

            for (const dir of shuffledDirs) {
              let isPathClear = true;
              let curX = pos.x;
              let curY = pos.y;

              while (true) {
                if (dir === 'up') curY--;
                else if (dir === 'down') curY++;
                else if (dir === 'left') curX--;
                else if (dir === 'right') curX++;

                if (curX < 0 || curX >= gridWidth || curY < 0 || curY >= gridHeight) break;

                if (currentResult.has(`${curX},${curY}`)) {
                  isPathClear = false;
                  break;
                }
              }

              if (isPathClear) {
                let penalty = 0;
                // Check neighbors for same direction to avoid clustering
                const neighbors = [
                  { x: pos.x, y: pos.y - 1 },
                  { x: pos.x, y: pos.y + 1 },
                  { x: pos.x - 1, y: pos.y },
                  { x: pos.x + 1, y: pos.y }
                ];

                for (const n of neighbors) {
                  const nKey = `${n.x},${n.y}`;
                  if (currentResult.has(nKey)) {
                    const neighbor = currentResult.get(nKey);
                    if (neighbor && neighbor.direction === dir) {
                      penalty++;
                    }
                  }
                }
                validDirections.push({ dir, penalty });
              }
            }

            if (validDirections.length > 0) {
              // Find minimum penalty
              const minPenalty = Math.min(...validDirections.map(d => d.penalty));
              // Filter candidates with minimum penalty
              const bestCandidates = validDirections.filter(d => d.penalty === minPenalty);
              // Pick random one from best candidates
              const chosen = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
              
              currentResult.set(`${pos.x},${pos.y}`, { ...pos, direction: chosen.dir });
              remaining.splice(i, 1);
              placedInThisStep = true;
              // We placed a tile, let's restart the loop to respect the depth priority
              break;
            }
          }

          if (!placedInThisStep) {
            stuck = true;
            break;
          }
        }

        if (!stuck) {
          resultTiles = currentResult;
          success = true;
        }
      }

      if (success) {
        pushToHistory();
        setTiles(resultTiles);
        setIsPuzzleGenerated(true);
      } else {
        alert("Could not generate a solvable puzzle. Try making the shape less 'trapped' or smaller.");
      }
      setIsProcessing(false);
    }, 100);
  }, [tiles, gridWidth, gridHeight, pushToHistory]);

  const getGridCoordinates = (clientX: number, clientY: number) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - pan.x) / zoom;
    const y = (clientY - rect.top - pan.y) / zoom;
    return {
      gridX: Math.floor(x / 24),
      gridY: Math.floor(y / 24)
    };
  };

  const handleTileInteraction = useCallback((x: number, y: number) => {
    const key = `${x},${y}`;
    if (lastInteractedTile.current === key) return;
    lastInteractedTile.current = key;

    setTiles(prevTiles => {
      const newTiles = new Map(prevTiles);
      const offset = Math.floor(brushSize / 2);

      for (let i = 0; i < brushSize; i++) {
        for (let j = 0; j < brushSize; j++) {
          const targetX = x - offset + i;
          const targetY = y - offset + j;
          
          // Check bounds
          if (targetX < 0 || targetX >= gridWidth || targetY < 0 || targetY >= gridHeight) {
            continue;
          }

          const targetKey = `${targetX},${targetY}`;

          if (tool === 'erase') {
            newTiles.delete(targetKey);
          } else if (tool === 'paint') {
            const tile = newTiles.get(targetKey) as Tile | undefined;
            if (tile) {
              newTiles.set(targetKey, { ...tile, color: selectedColor });
            }
          } else if (tool === 'arrow') {
            const tile = newTiles.get(targetKey) as Tile | undefined;
            if (tile) {
              newTiles.set(targetKey, { ...tile, direction: selectedDirection });
            }
          } else if (tool === 'add') {
            if (!newTiles.has(targetKey)) {
              newTiles.set(targetKey, { x: targetX, y: targetY, color: selectedColor, direction: selectedDirection });
            }
          }
        }
      }
      setIsPuzzleGenerated(false);
      return newTiles;
    });
  }, [tool, selectedColor, selectedDirection, brushSize, gridWidth, gridHeight]);

  const cycleTileDirection = useCallback((x: number, y: number) => {
    const key = `${x},${y}`;
    if (!tilesRef.current.has(key)) return;

    pushToHistory();
    setTiles(prevTiles => {
      const tile = prevTiles.get(key);
      if (!tile) return prevTiles;

      const nextTiles = new Map(prevTiles);
      nextTiles.set(key, { ...tile, direction: nextDirection(tile.direction) });
      setIsPuzzleGenerated(false);
      return nextTiles;
    });
  }, [pushToHistory]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault();
      const coords = getGridCoordinates(e.clientX, e.clientY);
      if (coords) {
        cycleTileDirection(coords.gridX, coords.gridY);
      }
    } else if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle click or Alt+Left click to pan
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
    } else if (e.button === 0) {
      const coords = getGridCoordinates(e.clientX, e.clientY);
      if (tool === 'tutorial') {
        if (coords && coords.gridX >= 0 && coords.gridX < gridWidth && coords.gridY >= 0 && coords.gridY < gridHeight) {
          setTutorialTileTarget(coords.gridX, coords.gridY);
        }
        return;
      }

      pushToHistory();
      setIsDrawing(true);
      lastInteractedTile.current = null;
      if (coords) {
        handleTileInteraction(coords.gridX, coords.gridY);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    } else {
      const coords = getGridCoordinates(e.clientX, e.clientY);
      
      if (coords && coords.gridX >= 0 && coords.gridX < gridWidth && coords.gridY >= 0 && coords.gridY < gridHeight) {
        setCursorPos({ x: coords.gridX, y: coords.gridY });
        if (isDrawing) {
          handleTileInteraction(coords.gridX, coords.gridY);
        }
      } else {
        setCursorPos(null);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsDrawing(false);
    lastInteractedTile.current = null;
  };

  const handleMouseLeave = () => {
    setCursorPos(null);
    handleMouseUp();
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      const delta = -e.deltaY * 0.001;
      setZoom(prev => Math.min(Math.max(prev + delta, 0.1), 5));
      e.preventDefault();
    } else {
      setPan(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  };

  const puzzleLogicReport = useMemo(
    () => analyzePuzzleLogic(tiles, gridWidth, gridHeight),
    [tiles, gridWidth, gridHeight]
  );

  const canonicalProject = useMemo(() => buildCanonicalProject({
    meta: projectMeta,
    brief,
    settings: sceneSettings,
    gameplay: gameplaySettings,
    tutorial: tutorialSettings,
    tileRendering: tileRenderingSettings,
    layout: layoutSettings,
    assets: assetLibrary,
    validation: {
      solvable: puzzleLogicReport.solvable,
      totalTiles: puzzleLogicReport.total,
      clearedTiles: puzzleLogicReport.cleared,
      firstMoves: puzzleLogicReport.firstMoves.map(tile => ({
        x: tile.x,
        y: tile.y,
        direction: tile.direction,
      })),
      availableMoves: puzzleLogicReport.availableMoves.map(tile => ({
        x: tile.x,
        y: tile.y,
        direction: tile.direction,
      })),
      stuckTiles: puzzleLogicReport.stuckTiles.map(tile => ({
        x: tile.x,
        y: tile.y,
        direction: tile.direction,
      })),
      checkedAt: new Date().toISOString(),
    } satisfies PlayableProjectValidation,
    tiles: Array.from(tiles.values()),
    gridWidth,
    gridHeight,
  }), [projectMeta, brief, sceneSettings, gameplaySettings, tutorialSettings, tileRenderingSettings, layoutSettings, assetLibrary, puzzleLogicReport, tiles, gridWidth, gridHeight]);

  const qaChecklist = useMemo(() => {
    const targetKey = `${tutorialSettings.targetX},${tutorialSettings.targetY}`;
    return [
      {
        label: 'Project code',
        ok: /^TG_play\d+_\d+$/i.test(projectMeta.code) || projectMeta.code.trim().length > 0,
      },
      {
        label: 'Store links',
        ok: /^https?:\/\//i.test(brief.androidUrl) && /^https?:\/\//i.test(brief.iosUrl),
      },
      {
        label: 'Puzzle tiles',
        ok: tiles.size > 0,
      },
      {
        label: 'Solvable logic',
        ok: puzzleLogicReport.total > 0 && puzzleLogicReport.solvable,
      },
      {
        label: 'Tutorial configured',
        ok: !tutorialSettings.enabled || tutorialSettings.text.trim().length > 0,
      },
      {
        label: 'Tutorial target',
        ok: !tutorialSettings.enabled
          || tutorialSettings.targetMode !== 'tile'
          || tiles.has(targetKey),
      },
      {
        label: 'Tile render',
        ok: !tileRenderingSettings.useSharedTexture || Boolean(assetLibrary.tileTexture),
      },
      {
        label: 'CTA text',
        ok: brief.ctaText.trim().length > 0 && gameplaySettings.storeButtonText.trim().length > 0 && gameplaySettings.winButtonText.trim().length > 0,
      },
    ];
  }, [assetLibrary.tileTexture, brief.androidUrl, brief.ctaText, brief.iosUrl, gameplaySettings.storeButtonText, gameplaySettings.winButtonText, projectMeta.code, puzzleLogicReport.solvable, puzzleLogicReport.total, tileRenderingSettings.useSharedTexture, tiles, tutorialSettings.enabled, tutorialSettings.targetMode, tutorialSettings.targetX, tutorialSettings.targetY, tutorialSettings.text]);

  const handleParseBrief = () => {
    const parsed = parseBriefFromText(tzDraft, brief);
    setBrief(parsed);
    setProjectMeta(prev => parseProjectMetaFromText(tzDraft, prev));
    setSceneSettings(prev => deriveSceneSettingsFromText(tzDraft, prev));
    setGameplaySettings(prev => deriveGameplaySettingsFromText(tzDraft, prev));
    setTutorialSettings(prev => deriveTutorialSettingsFromText(tzDraft, {
      ...prev,
      text: parsed.taskText || prev.text,
    }));

    if (parsed.summary && projectMeta.game === defaultProjectMeta.game) {
      setProjectMeta(prev => ({ ...prev, game: parsed.summary.slice(0, 80) }));
    }
  };

  const applyBriefText = (text: string) => {
    setTzDraft(text);
    const parsed = parseBriefFromText(text, brief);
    setBrief(parsed);
    setProjectMeta(prev => {
      const meta = parseProjectMetaFromText(text, prev);
      return parsed.summary && meta.game === defaultProjectMeta.game
        ? { ...meta, game: parsed.summary.slice(0, 80) }
        : meta;
    });
    setSceneSettings(prev => deriveSceneSettingsFromText(text, prev));
    setGameplaySettings(prev => deriveGameplaySettingsFromText(text, prev));
    setTutorialSettings(prev => deriveTutorialSettingsFromText(text, {
      ...prev,
      text: parsed.taskText || prev.text,
    }));
  };

  const handleTzPdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingPdf(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const response = await fetch('http://localhost:8787/api/parse-tz-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            dataUrl: String(reader.result),
          }),
        });

        const result = await response.json() as {
          ok?: boolean;
          text?: string;
          error?: string;
        };

        if (!response.ok || !result.ok || !result.text) {
          throw new Error(result.error || 'Could not read PDF text.');
        }

        applyBriefText(result.text);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'PDF parser is unavailable.';
        setDialog({
          type: 'confirm',
          title: 'PDF import failed',
          message: `${message}\n\nStart the local exporter with: npm run export:api`,
          onResponse: () => setDialog(null)
        });
      } finally {
        setIsParsingPdf(false);
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleTzUrlImport = async () => {
    const url = projectMeta.sourceTzUrl.trim();
    if (!url || isImportingTzUrl) return;

    setIsImportingTzUrl(true);
    try {
      const response = await fetch('http://localhost:8787/api/import-tz-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const result = await response.json() as {
        ok?: boolean;
        text?: string;
        error?: string;
      };

      if (!response.ok || !result.ok || !result.text) {
        throw new Error(result.error || 'Could not import URL text.');
      }

      applyBriefText(result.text);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'URL importer is unavailable.';
      setDialog({
        type: 'confirm',
        title: 'URL import failed',
        message: `${message}\n\nThe page may be private. Start the local exporter with: npm run export:api`,
        onResponse: () => setDialog(null)
      });
    } finally {
      setIsImportingTzUrl(false);
    }
  };

  const exportData = () => {
    downloadTextFile(
      `${projectMeta.code || 'playable_project'}.json`,
      JSON.stringify(canonicalProject, null, 2),
      'application/json'
    );
  };

  const exportTileFieldPreset = () => {
    downloadTextFile(
      'TileFieldPreset.mjs',
      generateTileFieldPreset(canonicalProject),
      'text/javascript'
    );
  };

  const exportQaReport = () => {
    const assetLines = (Object.entries(assetLibrary) as Array<[keyof PlayableAssetLibrary, PlayableAssetSlot | null]>)
      .map(([slot, asset]) => `- ${assetSlotLabel(slot as keyof PlayableAssetLibrary)}: ${asset?.filename || 'not set'}`)
      .join('\n');
    const firstMoves = puzzleLogicReport.firstMoves
      .map((tile, index) => `${index + 1}. (${tile.x}, ${tile.y}) ${tile.direction}`)
      .join('\n') || 'No moves';
    const stuckTiles = puzzleLogicReport.stuckTiles
      .slice(0, 24)
      .map(tile => `- (${tile.x}, ${tile.y}) ${tile.direction}`)
      .join('\n') || 'None';

    const report = `# ${projectMeta.code} QA Report

## Project
- Game: ${projectMeta.game}
- Iteration: ${projectMeta.iteration}
- Source TZ: ${projectMeta.sourceTzUrl || 'not set'}
- Grid: ${gridWidth}x${gridHeight}
- Tiles: ${tiles.size}

## Brief
- Task: ${brief.taskText}
- CTA: ${brief.ctaText}
- Android URL: ${brief.androidUrl}
- iOS URL: ${brief.iosUrl}

## Gameplay
- Level: ${gameplaySettings.levelText}
- Redirect tap count: ${gameplaySettings.redirectTapCount}
- Store button: ${gameplaySettings.storeButtonText}
- Win button: ${gameplaySettings.winButtonText}
- Tile flight: ${sceneSettings.tileFlightDuration}s / ${sceneSettings.tileFlightEase}
- Background: ${sceneSettings.backgroundColor}
- Trail tint: ${sceneSettings.trailTint}
- Shared tile texture: ${tileRenderingSettings.useSharedTexture ? 'yes' : 'no'}
- Tint shared texture: ${tileRenderingSettings.tintSharedTexture ? 'yes' : 'no'}

## Tutorial
- Enabled: ${tutorialSettings.enabled ? 'yes' : 'no'}
- Target: ${tutorialSettings.targetMode}${tutorialSettings.targetMode === 'tile' ? ` (${tutorialSettings.targetX}, ${tutorialSettings.targetY})` : ''}
- Text: ${tutorialSettings.text}
- Start / repeat / visible: ${tutorialSettings.startDelay}s / ${tutorialSettings.repeatDelay}s / ${tutorialSettings.visibleDuration ? `${tutorialSettings.visibleDuration}s` : 'until action'}
- End condition: ${tutorialSettings.endCondition}

## Layout
- Center character: x ${layoutSettings.centerCharacterX}, y ${layoutSettings.centerCharacterY}, scale ${layoutSettings.centerCharacterScaleVertical}/${layoutSettings.centerCharacterScaleHorizontal}
- Task text: y ${layoutSettings.taskTextY}, horizontal x ${layoutSettings.taskTextHorizontalX}, size ${layoutSettings.taskTextFontSize}, color ${layoutSettings.taskTextColor}
- Pointer offset: x ${layoutSettings.pointerOffsetX}, y ${layoutSettings.pointerOffsetY}

## Assets
${assetLines}

## Puzzle Logic
- Status: ${puzzleLogicReport.solvable ? 'SOLVABLE' : 'BLOCKED'}
- Cleared: ${puzzleLogicReport.cleared}/${puzzleLogicReport.total}
- Build ready: ${puzzleLogicReport.solvable ? 'yes' : 'no'}

## First Moves
${firstMoves}

## Stuck Tiles
${stuckTiles}
`;

    downloadTextFile(
      `${projectMeta.code || 'playable_project'}_QA.md`,
      report,
      'text/markdown'
    );
  };

  const buildImpionProject = async (buildZip = false) => {
    if (tiles.size === 0 || isExportingProject) return;

    if (!puzzleLogicReport.solvable) {
      setDialog({
        type: 'confirm',
        title: 'Puzzle logic blocked',
        message: `The current puzzle clears ${puzzleLogicReport.cleared}/${puzzleLogicReport.total} tiles. Run Puzzle it or fix arrow directions before building a playable.`,
        onResponse: () => setDialog(null)
      });
      return;
    }

    setIsExportingProject(true);
    setExportApiStatus(buildZip ? 'Building playable ZIP...' : 'Exporting Impion project...');

    try {
      const response = await fetch('http://localhost:8787/api/export-impion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: canonicalProject, buildZip }),
      });

      const result = await response.json() as {
        ok?: boolean;
        outputDir?: string;
        zipPath?: string | null;
        next?: string;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Impion export failed.');
      }

      setExportApiStatus(buildZip && result.zipPath ? `ZIP: ${result.zipPath}` : `Exported: ${result.outputDir}`);
      setDialog({
        type: 'confirm',
        title: buildZip ? 'Playable ZIP built' : 'Impion project exported',
        message: buildZip && result.zipPath
          ? `${result.outputDir}\n\nZIP: ${result.zipPath}`
          : `${result.outputDir}\n\nNext: ${result.next}`,
        onResponse: () => setDialog(null)
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export API is unavailable.';
      setExportApiStatus('Export API unavailable');
      setDialog({
        type: 'confirm',
        title: 'Build unavailable',
        message: `${message}\n\nStart the local exporter with: npm run export:api`,
        onResponse: () => setDialog(null)
      });
    } finally {
      setIsExportingProject(false);
    }
  };

  const verifyPuzzleLogic = () => {
    if (puzzleLogicReport.total === 0) return;

    const previewMoves = puzzleLogicReport.firstMoves
      .map((tile, index) => `${index + 1}. ${tile.x},${tile.y} ${tile.direction}`)
      .join('\n');
    const stuckPreview = puzzleLogicReport.stuckTiles
      .slice(0, 12)
      .map(tile => `${tile.x},${tile.y} ${tile.direction}`)
      .join('\n');
    const availablePreview = puzzleLogicReport.availableMoves
      .slice(0, 12)
      .map(tile => `${tile.x},${tile.y} ${tile.direction}`)
      .join('\n');

    setDialog({
      type: 'confirm',
      title: puzzleLogicReport.solvable ? 'Puzzle logic passed' : 'Puzzle logic blocked',
      message: puzzleLogicReport.solvable
        ? `Clears ${puzzleLogicReport.cleared}/${puzzleLogicReport.total} tiles.\n\nAvailable now:\n${availablePreview || 'No moves'}\n\nFirst sequence:\n${previewMoves || 'No moves'}`
        : `Clears ${puzzleLogicReport.cleared}/${puzzleLogicReport.total} tiles, then gets stuck.\n\nAvailable now:\n${availablePreview || 'No moves'}\n\nBlocked tiles:\n${stuckPreview || 'No stuck tiles'}`,
      onResponse: () => setDialog(null)
    });
  };

  const importProjectFromJson = (project: PlayableCanonicalProject) => {
    if (project.schemaVersion !== 1 || !project.scene?.grid || !Array.isArray(project.tiles)) {
      throw new Error('Unsupported playable project JSON');
    }

    const importedTiles = new Map<string, Tile>();
    project.tiles.forEach((tile) => {
      if (!Number.isFinite(tile.x) || !Number.isFinite(tile.y)) return;
      importedTiles.set(`${tile.x},${tile.y}`, {
        x: tile.x,
        y: tile.y,
        color: tile.color || '#3b82f6',
        direction: DIRECTIONS.includes(tile.direction as Direction) ? tile.direction as Direction : 'right',
      });
    });

    setHistory([]);
    setRedoStack([]);
    setGridWidth(project.scene.grid.width);
    setGridHeight(project.scene.grid.height);
    setTiles(importedTiles);
    setProjectMeta(project.project || defaultProjectMeta);
    setBrief(project.brief || defaultBrief);
    setTzDraft(project.brief?.rawText || '');
    setSceneSettings({
      ...defaultSceneSettings,
      tileSize: project.scene.tileSize || defaultSceneSettings.tileSize,
      gapX: project.scene.tileGap?.x || defaultSceneSettings.gapX,
      gapY: project.scene.tileGap?.y || defaultSceneSettings.gapY,
      offsetX: project.scene.offset?.x || defaultSceneSettings.offsetX,
      offsetY: project.scene.offset?.y || defaultSceneSettings.offsetY,
      verticalScale: project.scene.scale?.vertical || defaultSceneSettings.verticalScale,
      horizontalScale: project.scene.scale?.horizontal || defaultSceneSettings.horizontalScale,
      tileFlightDuration: project.motion?.tileFlightDuration || defaultSceneSettings.tileFlightDuration,
      tileFlightEase: project.motion?.tileFlightEase || defaultSceneSettings.tileFlightEase,
      trailTint: project.theme?.trailTint || defaultSceneSettings.trailTint,
      backgroundColor: project.theme?.backgroundColor || defaultSceneSettings.backgroundColor,
    });
    setGameplaySettings(project.gameplay || defaultGameplaySettings);
    setTutorialSettings(normalizeTutorialSettings(project.tutorial));
    setTileRenderingSettings(normalizeTileRenderingSettings(project.tileRendering));
    setLayoutSettings(normalizeLayoutSettings(project.layout));
    setAssetLibrary(normalizeAssetLibrary(project.assets));
    setCurrentPuzzleId(null);
    setPuzzleName(project.project?.code || 'Imported playable puzzle');
    setIsPuzzleGenerated(true);
    setTimeout(resetView, 100);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROJECT_LIBRARY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setStoredProjects(parsed);
    } catch (err) {
      console.warn('Could not load project library', err);
    }
  }, []);

  const persistStoredProjects = (items: StoredProjectItem[]) => {
    setStoredProjects(items);
    localStorage.setItem(PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify(items));
  };

  const saveProjectToLibrary = () => {
    try {
      const name = projectMeta.code || puzzleName || 'Untitled playable project';
      const item: StoredProjectItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        savedAt: new Date().toISOString(),
        project: canonicalProject,
      };
      persistStoredProjects([item, ...storedProjects].slice(0, 20));
      setSelectedStoredProjectId(item.id);
    } catch (err) {
      setDialog({
        type: 'confirm',
        title: 'Project library unavailable',
        message: err instanceof Error ? err.message : 'Could not save project in browser storage.',
        onResponse: () => setDialog(null)
      });
    }
  };

  const loadProjectFromLibrary = () => {
    const item = storedProjects.find(project => project.id === selectedStoredProjectId);
    if (!item) return;
    importProjectFromJson(item.project);
  };

  const deleteProjectFromLibrary = () => {
    if (!selectedStoredProjectId) return;
    const next = storedProjects.filter(project => project.id !== selectedStoredProjectId);
    persistStoredProjects(next);
    setSelectedStoredProjectId(next[0]?.id || '');
  };

  const handleProjectJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        importProjectFromJson(JSON.parse(String(reader.result)) as PlayableCanonicalProject);
      } catch (err) {
        console.error(err);
        setDialog({
          type: 'confirm',
          title: 'Import failed',
          message: err instanceof Error ? err.message : 'Could not import playable project JSON.',
          onResponse: () => setDialog(null)
        });
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleAssetUpload = (slot: keyof PlayableAssetLibrary, file: File | undefined) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAssetLibrary(prev => ({
        ...prev,
        [slot]: {
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataUrl: String(reader.result),
        }
      }));
    };
    reader.readAsDataURL(file);
  };

  const clearAsset = (slot: keyof PlayableAssetLibrary) => {
    setAssetLibrary(prev => ({ ...prev, [slot]: null }));
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ASSET_LIBRARY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setStoredAssets(parsed);
    } catch (err) {
      console.warn('Could not load asset library', err);
    }
  }, []);

  const persistStoredAssets = (items: StoredAssetItem[]) => {
    setStoredAssets(items);
    localStorage.setItem(ASSET_LIBRARY_STORAGE_KEY, JSON.stringify(items));
  };

  const saveAssetToLibrary = (slot: keyof PlayableAssetLibrary) => {
    const asset = assetLibrary[slot];
    if (!asset) return;

    const item: StoredAssetItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      slot,
      name: asset.filename || slot,
      asset,
    };
    persistStoredAssets([item, ...storedAssets].slice(0, 40));
    setSelectedStoredAssetId(item.id);
  };

  const loadStoredAsset = () => {
    const item = storedAssets.find(asset => asset.id === selectedStoredAssetId);
    if (!item) return;
    setAssetLibrary(prev => ({ ...prev, [item.slot]: item.asset }));
  };

  const deleteStoredAsset = () => {
    if (!selectedStoredAssetId) return;
    const next = storedAssets.filter(asset => asset.id !== selectedStoredAssetId);
    persistStoredAssets(next);
    setSelectedStoredAssetId(next[0]?.id || '');
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STYLE_PRESET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setStoredStylePresets(parsed.map(item => ({
        ...item,
        tutorialSettings: normalizeTutorialSettings(item.tutorialSettings),
        tileRenderingSettings: normalizeTileRenderingSettings(item.tileRenderingSettings),
        layoutSettings: normalizeLayoutSettings(item.layoutSettings),
        assets: normalizeAssetLibrary(item.assets),
      })));
    } catch (err) {
      console.warn('Could not load style presets', err);
    }
  }, []);

  const persistStylePresets = (items: StoredStylePreset[]) => {
    setStoredStylePresets(items);
    localStorage.setItem(STYLE_PRESET_STORAGE_KEY, JSON.stringify(items));
  };

  const saveStylePreset = () => {
    const name = `${projectMeta.code || 'Playable'} style`;
    const item: StoredStylePreset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      savedAt: new Date().toISOString(),
      sceneSettings,
      gameplaySettings,
      tutorialSettings,
      tileRenderingSettings,
      layoutSettings,
      assets: assetLibrary,
      palette,
    };
    persistStylePresets([item, ...storedStylePresets].slice(0, 20));
    setSelectedStylePresetId(item.id);
  };

  const loadStylePreset = () => {
    const item = storedStylePresets.find(preset => preset.id === selectedStylePresetId);
    if (!item) return;
    setSceneSettings({ ...defaultSceneSettings, ...item.sceneSettings });
    setGameplaySettings({ ...defaultGameplaySettings, ...item.gameplaySettings });
    setTutorialSettings(normalizeTutorialSettings(item.tutorialSettings));
    setTileRenderingSettings(normalizeTileRenderingSettings(item.tileRenderingSettings));
    setLayoutSettings(normalizeLayoutSettings(item.layoutSettings));
    setAssetLibrary(normalizeAssetLibrary(item.assets));
    setPalette(item.palette?.length ? item.palette : ['#3b82f6', '#ef4444', '#ffffff', '#000000']);
  };

  const deleteStylePreset = () => {
    if (!selectedStylePresetId) return;
    const next = storedStylePresets.filter(preset => preset.id !== selectedStylePresetId);
    persistStylePresets(next);
    setSelectedStylePresetId(next[0]?.id || '');
  };

  const applyPlayableTemplate = () => {
    const template = BUILT_IN_PLAYABLE_TEMPLATES.find(item => item.id === selectedTemplateId);
    if (!template) return;

    if (template.sceneSettings) {
      setSceneSettings(prev => ({ ...prev, ...template.sceneSettings }));
    }
    if (template.gameplaySettings) {
      setGameplaySettings(prev => ({ ...prev, ...template.gameplaySettings }));
    }
    if (template.tutorialSettings) {
      setTutorialSettings(prev => normalizeTutorialSettings({ ...prev, ...template.tutorialSettings }));
    }
    if (template.tileRenderingSettings) {
      setTileRenderingSettings(prev => normalizeTileRenderingSettings({ ...prev, ...template.tileRenderingSettings }));
    }
    if (template.layoutSettings) {
      setLayoutSettings(prev => normalizeLayoutSettings({ ...prev, ...template.layoutSettings }));
    }
  };

  const centerBoardForImpion = () => {
    setSceneSettings(prev => ({
      ...prev,
      offsetX: -Math.round(((gridWidth - 1) * prev.gapX) / 2),
      offsetY: -Math.round(((gridHeight - 1) * prev.gapY) / 2),
    }));
  };

  const useCursorAsTutorialTarget = () => {
    if (!cursorPos) return;
    setTutorialSettings(prev => ({
      ...prev,
      targetMode: 'tile',
      targetX: cursorPos.x,
      targetY: cursorPos.y,
    }));
  };

  const setTutorialTileTarget = useCallback((x: number, y: number) => {
    setTutorialSettings(prev => ({
      ...prev,
      enabled: true,
      targetMode: 'tile',
      targetX: Math.max(0, Math.min(gridWidth - 1, x)),
      targetY: Math.max(0, Math.min(gridHeight - 1, y)),
    }));
  }, [gridWidth, gridHeight]);

  const resetView = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    
    // Grid tile size is 24px
    const boardWidth = gridWidth * 24;
    const boardHeight = gridHeight * 24;
    
    // We want at least 20% margins on each side.
    // This means the board should occupy at most 60% of the viewport width and 60% of height.
    const targetWidth = clientWidth * 0.6;
    const targetHeight = clientHeight * 0.6;
    
    const scale = Math.min(targetWidth / boardWidth, targetHeight / boardHeight);
    
    setZoom(scale);
    setPan({
      x: (clientWidth - boardWidth * scale) / 2,
      y: (clientHeight - boardHeight * scale) / 2
    });
  }, [gridWidth, gridHeight]);

  useEffect(() => {
    // Small delay to ensure container is measured correctly after initial render
    const timer = setTimeout(() => {
      resetView();
    }, 100);
    return () => clearTimeout(timer);
  }, []); // Only on mount

  // --- Render Helpers ---
  const getDirectionIcon = (dir: Direction) => {
    switch (dir) {
      case 'up': return <ArrowUp className="w-full h-full" />;
      case 'right': return <ArrowRight className="w-full h-full" />;
      case 'down': return <ArrowDown className="w-full h-full" />;
      case 'left': return <ArrowLeft className="w-full h-full" />;
    }
  };

  const logicHintKeys = useMemo(() => ({
    available: new Set(puzzleLogicReport.availableMoves.map(tile => `${tile.x},${tile.y}`)),
    stuck: new Set(puzzleLogicReport.stuckTiles.map(tile => `${tile.x},${tile.y}`)),
  }), [puzzleLogicReport]);

  return (
    <div className="flex h-screen w-full bg-[#0a0a0a] text-zinc-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[340px] border-r border-zinc-800 bg-[#0f0f0f] flex flex-col p-4 gap-5 z-20 overflow-y-auto">
        <div>
          <h1 className="text-xl font-bold tracking-tight mb-0.5 bg-gradient-to-r from-sky-300 to-lime-300 bg-clip-text text-transparent flex items-baseline gap-2">
            Tap Gallery Constructor <span className="text-[10px] font-medium text-zinc-500 tracking-normal">MVP</span>
          </h1>
          <p className="text-zinc-500 text-[11px]">Playable engine and constructor for Tap Gallery</p>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">Project</span>
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-2 space-y-2">
            <div className="grid grid-cols-[1fr_64px] gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Code</span>
                <input
                  value={projectMeta.code}
                  onChange={(e) => setProjectMeta(prev => ({ ...prev, code: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Iter</span>
                <input
                  type="number"
                  min="1"
                  value={projectMeta.iteration}
                  onChange={(e) => setProjectMeta(prev => ({ ...prev, iteration: Math.max(1, Number(e.target.value) || 1) }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
            </div>
            <label className="space-y-1 block">
              <span className="text-[9px] text-zinc-500 uppercase font-bold">Game</span>
              <input
                value={projectMeta.game}
                onChange={(e) => setProjectMeta(prev => ({ ...prev, game: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-[9px] text-zinc-500 uppercase font-bold">Notion URL</span>
              <input
                value={projectMeta.sourceTzUrl}
                onChange={(e) => setProjectMeta(prev => ({ ...prev, sourceTzUrl: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
              />
            </label>
            <button
              onClick={handleTzUrlImport}
              disabled={!projectMeta.sourceTzUrl.trim() || isImportingTzUrl}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-[11px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImportingTzUrl ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {isImportingTzUrl ? 'Importing URL...' : 'Import TZ URL'}
            </button>
            <label className="w-full flex items-center justify-center gap-2 p-2 rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-[11px] transition-all cursor-pointer">
              <Upload size={14} />
              Import Playable JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleProjectJsonUpload}
                className="hidden"
              />
            </label>
            <button
              onClick={saveProjectToLibrary}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-[11px] transition-all"
            >
              <Save size={14} />
              Save to Library
            </button>
            {storedProjects.length > 0 && (
              <div className="grid grid-cols-[1fr_34px_34px] gap-2">
                <select
                  value={selectedStoredProjectId}
                  onChange={(e) => setSelectedStoredProjectId(e.target.value)}
                  className="min-w-0 bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                >
                  <option value="">Playable Library</option>
                  {storedProjects.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {new Date(item.savedAt).toLocaleDateString()}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  title="Load playable"
                  onClick={loadProjectFromLibrary}
                  disabled={!selectedStoredProjectId}
                  className="flex h-[31px] items-center justify-center rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FolderOpen size={14} />
                </button>
                <button
                  type="button"
                  title="Delete playable"
                  onClick={deleteProjectFromLibrary}
                  disabled={!selectedStoredProjectId}
                  className="flex h-[31px] items-center justify-center rounded-sm bg-zinc-800 hover:bg-red-900/70 text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">TZ</span>
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-2 space-y-2">
            <textarea
              value={tzDraft}
              onChange={(e) => setTzDraft(e.target.value)}
              rows={5}
              className="w-full resize-none bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
            />
            <button
              onClick={handleParseBrief}
              disabled={!tzDraft.trim()}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-sm bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Settings2 size={14} />
              Parse TZ
            </button>
            <label className={cn(
              "w-full flex items-center justify-center gap-2 p-2 rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-[11px] transition-all cursor-pointer",
              isParsingPdf && "opacity-60 pointer-events-none"
            )}>
              {isParsingPdf ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {isParsingPdf ? 'Reading PDF...' : 'Import TZ PDF'}
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleTzPdfUpload}
                className="hidden"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Task</span>
                <input
                  value={brief.taskText}
                  onChange={(e) => setBrief(prev => ({ ...prev, taskText: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">CTA</span>
                <input
                  value={brief.ctaText}
                  onChange={(e) => setBrief(prev => ({ ...prev, ctaText: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Android URL</span>
                <input
                  value={brief.androidUrl}
                  onChange={(e) => setBrief(prev => ({ ...prev, androidUrl: e.target.value }))}
                  onBlur={(e) => setBrief(prev => ({ ...prev, androidUrl: normalizeUrlInput(e.target.value) || defaultBrief.androidUrl }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">iOS URL</span>
                <input
                  value={brief.iosUrl}
                  onChange={(e) => setBrief(prev => ({ ...prev, iosUrl: e.target.value }))}
                  onBlur={(e) => setBrief(prev => ({ ...prev, iosUrl: normalizeUrlInput(e.target.value) || defaultBrief.iosUrl }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5 block">Upload Image</span>
            <div className="relative group">
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleImageUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="border-2 border-dashed border-zinc-800 rounded-lg p-2 flex flex-col items-center justify-center gap-1 group-hover:border-zinc-600 transition-colors bg-zinc-900/50">
                <Upload className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                <span className="text-[10px] text-zinc-500">Drop or click to upload</span>
              </div>
            </div>
          </label>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">History</span>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={undo} 
              disabled={history.length === 0}
              className="flex items-center justify-center gap-2 p-1.5 rounded-sm border bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={14} />
              <span className="text-[9px] font-bold uppercase">Undo</span>
            </button>
            <button 
              onClick={redo} 
              disabled={redoStack.length === 0}
              className="flex items-center justify-center gap-2 p-1.5 rounded-sm border bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={14} />
              <span className="text-[9px] font-bold uppercase">Redo</span>
            </button>
            <button
              onClick={() => setShowLogicHints(!showLogicHints)}
              className={cn(
                "w-full flex items-center justify-between p-2 rounded-sm border transition-all text-[11px] font-semibold",
                showLogicHints
                  ? "bg-emerald-950/20 border-emerald-900/50 text-emerald-300"
                  : "bg-zinc-900 border-zinc-800 text-zinc-500"
              )}
            >
              <span>Logic Hints</span>
              {showLogicHints ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">Background</span>
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-2 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400 font-medium">Show Image</span>
              <button
                onClick={() => setShowBackground(!showBackground)}
                className={cn(
                  "w-8 h-4 rounded-full relative transition-colors",
                  showBackground ? "bg-blue-600" : "bg-zinc-700"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform",
                  showBackground ? "translate-x-4" : "translate-x-0"
                )} />
              </button>
            </div>
            
            {showBackground && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <span>Opacity</span>
                  <span>{Math.round(backgroundOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={backgroundOpacity}
                  onChange={(e) => setBackgroundOpacity(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">Assets</span>
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-2 space-y-2">
            <AssetSlotControl
              label="BG Image"
              icon={<ImageIcon size={14} />}
              accept="image/*"
              asset={assetLibrary.backgroundImage}
              onUpload={(file) => handleAssetUpload('backgroundImage', file)}
              onClear={() => clearAsset('backgroundImage')}
              onSave={() => saveAssetToLibrary('backgroundImage')}
            />
            <AssetSlotControl
              label="Tile Texture"
              icon={<Package size={14} />}
              accept="image/*"
              asset={assetLibrary.tileTexture}
              onUpload={(file) => handleAssetUpload('tileTexture', file)}
              onClear={() => clearAsset('tileTexture')}
              onSave={() => saveAssetToLibrary('tileTexture')}
            />
            <AssetSlotControl
              label="Trail Texture"
              icon={<Package size={14} />}
              accept="image/*"
              asset={assetLibrary.trailTexture}
              onUpload={(file) => handleAssetUpload('trailTexture', file)}
              onClear={() => clearAsset('trailTexture')}
              onSave={() => saveAssetToLibrary('trailTexture')}
            />
            <AssetSlotControl
              label="Center Animal"
              icon={<ImageIcon size={14} />}
              accept="image/*"
              asset={assetLibrary.centerCharacter}
              onUpload={(file) => handleAssetUpload('centerCharacter', file)}
              onClear={() => clearAsset('centerCharacter')}
              onSave={() => saveAssetToLibrary('centerCharacter')}
            />
            <AssetSlotControl
              label="Store Button"
              icon={<ImageIcon size={14} />}
              accept="image/*"
              asset={assetLibrary.storeButtonTexture}
              onUpload={(file) => handleAssetUpload('storeButtonTexture', file)}
              onClear={() => clearAsset('storeButtonTexture')}
              onSave={() => saveAssetToLibrary('storeButtonTexture')}
            />
            <AssetSlotControl
              label="Win Button"
              icon={<ImageIcon size={14} />}
              accept="image/*"
              asset={assetLibrary.winButtonTexture}
              onUpload={(file) => handleAssetUpload('winButtonTexture', file)}
              onClear={() => clearAsset('winButtonTexture')}
              onSave={() => saveAssetToLibrary('winButtonTexture')}
            />
            <AssetSlotControl
              label="CTA Panel"
              icon={<ImageIcon size={14} />}
              accept="image/*"
              asset={assetLibrary.ctaPanelTexture}
              onUpload={(file) => handleAssetUpload('ctaPanelTexture', file)}
              onClear={() => clearAsset('ctaPanelTexture')}
              onSave={() => saveAssetToLibrary('ctaPanelTexture')}
            />
            <AssetSlotControl
              label="Win BG"
              icon={<ImageIcon size={14} />}
              accept="image/*"
              asset={assetLibrary.winBackgroundImage}
              onUpload={(file) => handleAssetUpload('winBackgroundImage', file)}
              onClear={() => clearAsset('winBackgroundImage')}
              onSave={() => saveAssetToLibrary('winBackgroundImage')}
            />
            <AssetSlotControl
              label="Music"
              icon={<Music size={14} />}
              accept="audio/*"
              asset={assetLibrary.musicTrack}
              onUpload={(file) => handleAssetUpload('musicTrack', file)}
              onClear={() => clearAsset('musicTrack')}
              onSave={() => saveAssetToLibrary('musicTrack')}
            />
            <AssetSlotControl
              label="Tap SFX"
              icon={<Music size={14} />}
              accept="audio/*"
              asset={assetLibrary.tapSound}
              onUpload={(file) => handleAssetUpload('tapSound', file)}
              onClear={() => clearAsset('tapSound')}
              onSave={() => saveAssetToLibrary('tapSound')}
            />
            <AssetSlotControl
              label="Bad Move SFX"
              icon={<Music size={14} />}
              accept="audio/*"
              asset={assetLibrary.badMoveSound}
              onUpload={(file) => handleAssetUpload('badMoveSound', file)}
              onClear={() => clearAsset('badMoveSound')}
              onSave={() => saveAssetToLibrary('badMoveSound')}
            />
            <AssetSlotControl
              label="Win SFX"
              icon={<Music size={14} />}
              accept="audio/*"
              asset={assetLibrary.winSound}
              onUpload={(file) => handleAssetUpload('winSound', file)}
              onClear={() => clearAsset('winSound')}
              onSave={() => saveAssetToLibrary('winSound')}
            />
            <AssetSlotControl
              label="Warning SFX"
              icon={<Music size={14} />}
              accept="audio/*"
              asset={assetLibrary.warningSound}
              onUpload={(file) => handleAssetUpload('warningSound', file)}
              onClear={() => clearAsset('warningSound')}
              onSave={() => saveAssetToLibrary('warningSound')}
            />
            {storedAssets.length > 0 && (
              <div className="grid grid-cols-[1fr_auto_auto] gap-1.5 pt-1 border-t border-zinc-800">
                <select
                  value={selectedStoredAssetId}
                  onChange={(e) => setSelectedStoredAssetId(e.target.value)}
                  className="min-w-0 bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[10px] text-zinc-200 outline-none focus:border-sky-500"
                >
                  <option value="">Asset Library</option>
                  {storedAssets.map(item => (
                    <option key={item.id} value={item.id}>
                      {assetSlotLabel(item.slot)} / {item.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={loadStoredAsset}
                  disabled={!selectedStoredAssetId}
                  className="px-2 rounded-sm border bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Load asset"
                >
                  <Download size={13} />
                </button>
                <button
                  onClick={deleteStoredAsset}
                  disabled={!selectedStoredAssetId}
                  className="px-2 rounded-sm border bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-900/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Delete asset"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">Style Presets</span>
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-2 space-y-2">
            <button
              onClick={saveStylePreset}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-[11px] transition-all"
            >
              <Save size={14} />
              Save Style Preset
            </button>
            {storedStylePresets.length > 0 && (
              <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
                <select
                  value={selectedStylePresetId}
                  onChange={(e) => setSelectedStylePresetId(e.target.value)}
                  className="min-w-0 bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[10px] text-zinc-200 outline-none focus:border-sky-500"
                >
                  <option value="">Style Library</option>
                  {storedStylePresets.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} / {new Date(item.savedAt).toLocaleDateString()}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  title="Load style"
                  onClick={loadStylePreset}
                  disabled={!selectedStylePresetId}
                  className="px-2 rounded-sm border bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Download size={13} />
                </button>
                <button
                  type="button"
                  title="Delete style"
                  onClick={deleteStylePreset}
                  disabled={!selectedStylePresetId}
                  className="px-2 rounded-sm border bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-900/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">Playable Templates</span>
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-2 space-y-2">
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[10px] text-zinc-200 outline-none focus:border-sky-500"
            >
              {BUILT_IN_PLAYABLE_TEMPLATES.map(template => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyPlayableTemplate}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-[11px] transition-all"
            >
              <Package size={14} />
              Apply Template
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">Engine</span>
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-2 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Tile</span>
                <input
                  type="number"
                  value={sceneSettings.tileSize}
                  onChange={(e) => setSceneSettings(prev => ({ ...prev, tileSize: Number(e.target.value) || 82 }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Gap X</span>
                <input
                  type="number"
                  value={sceneSettings.gapX}
                  onChange={(e) => setSceneSettings(prev => ({ ...prev, gapX: Number(e.target.value) || 82 }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Gap Y</span>
                <input
                  type="number"
                  value={sceneSettings.gapY}
                  onChange={(e) => setSceneSettings(prev => ({ ...prev, gapY: Number(e.target.value) || 82 }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Offset X</span>
                <input
                  type="number"
                  value={sceneSettings.offsetX}
                  onChange={(e) => setSceneSettings(prev => ({ ...prev, offsetX: Number(e.target.value) || 0 }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Offset Y</span>
                <input
                  type="number"
                  value={sceneSettings.offsetY}
                  onChange={(e) => setSceneSettings(prev => ({ ...prev, offsetY: Number(e.target.value) || 0 }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={centerBoardForImpion}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-[11px] transition-all"
            >
              <Maximize size={14} />
              Center Board
            </button>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Flight</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={sceneSettings.tileFlightDuration}
                  onChange={(e) => setSceneSettings(prev => ({ ...prev, tileFlightDuration: Number(e.target.value) || 1.2 }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Ease</span>
                <select
                  value={sceneSettings.tileFlightEase}
                  onChange={(e) => setSceneSettings(prev => ({ ...prev, tileFlightEase: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                >
                  <option value="expo.in">expo.in</option>
                  <option value="power2.in">power2.in</option>
                  <option value="sine.in">sine.in</option>
                  <option value="back.in">back.in</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Trail</span>
                <input
                  type="color"
                  value={sceneSettings.trailTint}
                  onChange={(e) => setSceneSettings(prev => ({ ...prev, trailTint: e.target.value }))}
                  className="w-full h-[30px] bg-zinc-950 border border-zinc-800 rounded-sm px-1 py-1 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">BG</span>
                <input
                  type="color"
                  value={sceneSettings.backgroundColor}
                  onChange={(e) => setSceneSettings(prev => ({ ...prev, backgroundColor: e.target.value }))}
                  className="w-full h-[30px] bg-zinc-950 border border-zinc-800 rounded-sm px-1 py-1 outline-none focus:border-sky-500"
                />
              </label>
            </div>
            <div className="grid grid-cols-[1fr_74px] gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Level</span>
                <input
                  value={gameplaySettings.levelText}
                  onChange={(e) => setGameplaySettings(prev => ({ ...prev, levelText: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Redirect</span>
                <input
                  type="number"
                  min="0"
                  value={gameplaySettings.redirectTapCount}
                  onChange={(e) => setGameplaySettings(prev => ({ ...prev, redirectTapCount: Math.max(0, Number(e.target.value) || 0) }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Store Btn</span>
                <input
                  value={gameplaySettings.storeButtonText}
                  onChange={(e) => setGameplaySettings(prev => ({ ...prev, storeButtonText: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Win Btn</span>
                <input
                  value={gameplaySettings.winButtonText}
                  onChange={(e) => setGameplaySettings(prev => ({ ...prev, winButtonText: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
            </div>
            <div className="pt-2 border-t border-zinc-800 space-y-2">
              <span className="text-[9px] text-zinc-500 uppercase font-bold">Tile Render</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTileRenderingSettings(prev => ({ ...prev, useSharedTexture: !prev.useSharedTexture }))}
                  className={cn(
                    "h-[30px] rounded-sm border text-[10px] font-semibold transition-colors",
                    tileRenderingSettings.useSharedTexture
                      ? "bg-sky-500/10 border-sky-500/50 text-sky-300"
                      : "bg-zinc-950 border-zinc-800 text-zinc-500"
                  )}
                >
                  Shared Texture
                </button>
                <button
                  type="button"
                  onClick={() => setTileRenderingSettings(prev => ({ ...prev, tintSharedTexture: !prev.tintSharedTexture }))}
                  className={cn(
                    "h-[30px] rounded-sm border text-[10px] font-semibold transition-colors",
                    tileRenderingSettings.tintSharedTexture
                      ? "bg-sky-500/10 border-sky-500/50 text-sky-300"
                      : "bg-zinc-950 border-zinc-800 text-zinc-500"
                  )}
                >
                  Tint Texture
                </button>
              </div>
              <label className="space-y-1 block">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Fallback Tint</span>
                <input
                  type="color"
                  value={tileRenderingSettings.fallbackTint}
                  onChange={(e) => setTileRenderingSettings(prev => ({ ...prev, fallbackTint: e.target.value }))}
                  className="w-full h-[30px] bg-zinc-950 border border-zinc-800 rounded-sm px-1 py-1 outline-none focus:border-sky-500"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">Tutorial</span>
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-2 space-y-2">
            <button
              type="button"
              onClick={() => setTutorialSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
              className={cn(
                "w-full flex items-center justify-between p-2 rounded-sm border transition-all text-[11px] font-semibold",
                tutorialSettings.enabled
                  ? "bg-emerald-950/20 border-emerald-900/50 text-emerald-300"
                  : "bg-zinc-950 border-zinc-800 text-zinc-500"
              )}
            >
              <span>Enabled</span>
              {tutorialSettings.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <label className="space-y-1 block">
              <span className="text-[9px] text-zinc-500 uppercase font-bold">Target</span>
              <select
                value={tutorialSettings.targetMode}
                onChange={(e) => setTutorialSettings(prev => ({ ...prev, targetMode: e.target.value as PlayableTutorialSettings['targetMode'] }))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
              >
                <option value="first-available">First available tile</option>
                <option value="tile">Tile coordinates</option>
                <option value="center">Board center</option>
                <option value="store-button">Store button</option>
                <option value="win-button">Win button</option>
              </select>
            </label>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">X</span>
                <input
                  type="number"
                  min="0"
                  max={Math.max(0, gridWidth - 1)}
                  value={tutorialSettings.targetX}
                  onChange={(e) => setTutorialSettings(prev => ({ ...prev, targetX: Math.max(0, Math.min(gridWidth - 1, Number(e.target.value) || 0)) }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Y</span>
                <input
                  type="number"
                  min="0"
                  max={Math.max(0, gridHeight - 1)}
                  value={tutorialSettings.targetY}
                  onChange={(e) => setTutorialSettings(prev => ({ ...prev, targetY: Math.max(0, Math.min(gridHeight - 1, Number(e.target.value) || 0)) }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <button
                type="button"
                onClick={useCursorAsTutorialTarget}
                disabled={!cursorPos}
                className="self-end h-[30px] px-2 rounded-sm border bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[10px] font-semibold"
              >
                Cursor
              </button>
            </div>
            <label className="space-y-1 block">
              <span className="text-[9px] text-zinc-500 uppercase font-bold">Text</span>
              <input
                value={tutorialSettings.text}
                onChange={(e) => setTutorialSettings(prev => ({ ...prev, text: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Start</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={tutorialSettings.startDelay}
                  onChange={(e) => setTutorialSettings(prev => ({ ...prev, startDelay: Math.max(0, Number(e.target.value) || 0) }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Repeat</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={tutorialSettings.repeatDelay}
                  onChange={(e) => setTutorialSettings(prev => ({ ...prev, repeatDelay: Math.max(0, Number(e.target.value) || 0) }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Hide</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={tutorialSettings.visibleDuration}
                  onChange={(e) => setTutorialSettings(prev => ({ ...prev, visibleDuration: Math.max(0, Number(e.target.value) || 0) }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
            </div>
            <label className="space-y-1 block">
              <span className="text-[9px] text-zinc-500 uppercase font-bold">End</span>
              <select
                value={tutorialSettings.endCondition}
                onChange={(e) => setTutorialSettings(prev => ({ ...prev, endCondition: e.target.value as PlayableTutorialSettings['endCondition'] }))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
              >
                <option value="specific-tile">Specific tile tap</option>
                <option value="any-tap">Any tap</option>
                <option value="screen-tap">Screen tap</option>
                <option value="time">Timer</option>
                <option value="manual">Manual/runtime</option>
              </select>
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">Layout</span>
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Char X</span>
                <input
                  type="number"
                  value={layoutSettings.centerCharacterX}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, centerCharacterX: Number(e.target.value) || 0 }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Char Y</span>
                <input
                  type="number"
                  value={layoutSettings.centerCharacterY}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, centerCharacterY: Number(e.target.value) || 0 }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Char V Scale</span>
                <input
                  type="number"
                  min="0.05"
                  step="0.01"
                  value={layoutSettings.centerCharacterScaleVertical}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, centerCharacterScaleVertical: Math.max(0.01, Number(e.target.value) || 0.48) }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Char H Scale</span>
                <input
                  type="number"
                  min="0.05"
                  step="0.01"
                  value={layoutSettings.centerCharacterScaleHorizontal}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, centerCharacterScaleHorizontal: Math.max(0.01, Number(e.target.value) || 0.42) }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Text Y</span>
                <input
                  type="number"
                  value={layoutSettings.taskTextY}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, taskTextY: Number(e.target.value) || 0 }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Text X H</span>
                <input
                  type="number"
                  value={layoutSettings.taskTextHorizontalX}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, taskTextHorizontalX: Number(e.target.value) || 0 }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Size</span>
                <input
                  type="number"
                  min="8"
                  value={layoutSettings.taskTextFontSize}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, taskTextFontSize: Math.max(8, Number(e.target.value) || 75) }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
            </div>
            <div className="grid grid-cols-[1fr_1fr_42px] gap-2">
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Pointer X</span>
                <input
                  type="number"
                  value={layoutSettings.pointerOffsetX}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, pointerOffsetX: Number(e.target.value) || 0 }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Pointer Y</span>
                <input
                  type="number"
                  value={layoutSettings.pointerOffsetY}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, pointerOffsetY: Number(e.target.value) || 0 }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-sky-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Color</span>
                <input
                  type="color"
                  value={layoutSettings.taskTextColor}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, taskTextColor: e.target.value }))}
                  className="w-full h-[30px] bg-zinc-950 border border-zinc-800 rounded-sm px-1 py-1 outline-none focus:border-sky-500"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">Tools</span>
          <div className="grid grid-cols-6 gap-1.5">
            <div className="grid grid-cols-2 grid-rows-2 gap-1">
              {[1, 2, 3, 4].map((size) => (
                <button
                  key={size}
                  onClick={() => setBrushSize(size as 1 | 2 | 3 | 4)}
                  className={cn(
                    "flex items-center justify-center rounded-sm border text-[10px] font-medium transition-all",
                    brushSize === size
                      ? "bg-blue-500/10 border-blue-500/50 text-blue-400"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  )}
                  title={`Brush size ${size}`}
                >
                  {size}
                </button>
              ))}
            </div>
            <ToolButton 
              active={tool === 'add'} 
              onClick={() => setTool('add')} 
              icon={<Plus size={14} />} 
              label="Add" 
            />
            <ToolButton 
              active={tool === 'erase'} 
              onClick={() => setTool('erase')} 
              icon={<Eraser size={14} />} 
              label="Erase" 
            />
            <ToolButton 
              active={tool === 'paint'} 
              onClick={() => setTool('paint')} 
              icon={<Palette size={14} />} 
              label="Paint" 
            />
            <ToolButton
              active={tool === 'arrow'}
              onClick={() => setTool('arrow')}
              icon={<div className="w-3.5 h-3.5">{getDirectionIcon(selectedDirection)}</div>}
              label="Arrow"
            />
            <ToolButton
              active={tool === 'tutorial'}
              onClick={() => setTool('tutorial')}
              icon={<MousePointer2 size={14} />}
              label="Target"
            />
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {DIRECTIONS.map((direction) => (
              <button
                key={direction}
                onClick={() => setSelectedDirection(direction)}
                title={`Set ${direction} direction`}
                className={cn(
                  "h-[30px] flex items-center justify-center rounded-sm border transition-all",
                  selectedDirection === direction
                    ? "bg-sky-500/10 border-sky-500/60 text-sky-300"
                    : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700"
                )}
              >
                <span className="w-4 h-4">{getDirectionIcon(direction)}</span>
              </button>
            ))}
          </div>
          <button 
            onClick={clearTiles}
            className="w-full flex items-center justify-center gap-2 p-1.5 rounded-sm border bg-zinc-900 text-red-400 border-zinc-800 hover:border-red-900/50 hover:bg-red-950/20 transition-all text-[9px] font-bold uppercase"
          >
            <RotateCcw size={12} />
            Clear Field
          </button>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">Crop Edges</span>
          <div className="grid grid-cols-4 gap-1.5">
            <button onClick={removeTopRow} className="flex flex-col items-center justify-center h-[36px] bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-sm text-[9px] uppercase font-bold text-zinc-400 hover:text-zinc-200 transition-colors">
              Top
            </button>
            <button onClick={removeBottomRow} className="flex flex-col items-center justify-center h-[36px] bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-sm text-[9px] uppercase font-bold text-zinc-400 hover:text-zinc-200 transition-colors">
              Btm
            </button>
            <button onClick={removeLeftCol} className="flex flex-col items-center justify-center h-[36px] bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-sm text-[9px] uppercase font-bold text-zinc-400 hover:text-zinc-200 transition-colors">
              Left
            </button>
            <button onClick={removeRightCol} className="flex flex-col items-center justify-center h-[36px] bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-sm text-[9px] uppercase font-bold text-zinc-400 hover:text-zinc-200 transition-colors">
              Right
            </button>
          </div>
          <button
            onClick={clearCenterHole}
            disabled={tiles.size === 0}
            className="w-full flex items-center justify-center gap-2 p-1.5 rounded-sm border bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200 transition-all text-[9px] font-bold uppercase disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Eraser size={12} />
            Center Hole
          </button>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">Settings</span>
          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="text-[9px] text-zinc-500 uppercase font-bold px-1">
                  <span>Width</span>
                </div>
                <div className="flex items-center justify-between bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/50">
                  <button 
                    onClick={() => {
                      const newWidth = Math.max(1, gridWidth - 1);
                      setGridWidth(newWidth);
                      if (isAspectRatioLocked) {
                        setGridHeight(Math.max(1, Math.round(newWidth / aspectRatio)));
                      }
                    }}
                    className="w-5 h-5 flex shrink-0 items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <Minus size={10} />
                  </button>
                  <span className="text-[11px] font-medium text-zinc-300">{gridWidth}</span>
                  <button 
                    onClick={() => {
                      const newWidth = Math.min(100, gridWidth + 1);
                      setGridWidth(newWidth);
                      if (isAspectRatioLocked) {
                        setGridHeight(Math.max(1, Math.round(newWidth / aspectRatio)));
                      }
                    }}
                    className="w-5 h-5 flex shrink-0 items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <Plus size={10} />
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  if (!isAspectRatioLocked) {
                    setAspectRatio(gridWidth / gridHeight);
                  }
                  setIsAspectRatioLocked(!isAspectRatioLocked);
                }}
                className={cn(
                  "h-[30px] w-[30px] flex items-center justify-center rounded-sm border transition-all mb-[1px]",
                  isAspectRatioLocked
                    ? "bg-blue-500/10 border-blue-500/50 text-blue-400"
                    : "bg-zinc-900 border-zinc-800 text-zinc-600 hover:text-zinc-400"
                )}
                title={isAspectRatioLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
              >
                {isAspectRatioLocked ? <Lock size={12} /> : <Unlock size={12} />}
              </button>

              <div className="flex-1 flex flex-col gap-1.5">
                <div className="text-[9px] text-zinc-500 uppercase font-bold px-1">
                  <span>Height</span>
                </div>
                <div className="flex items-center justify-between bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/50">
                  <button 
                    onClick={() => {
                      const newHeight = Math.max(1, gridHeight - 1);
                      setGridHeight(newHeight);
                      if (isAspectRatioLocked) {
                        setGridWidth(Math.max(1, Math.round(newHeight * aspectRatio)));
                      }
                    }}
                    className="w-5 h-5 flex shrink-0 items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <Minus size={10} />
                  </button>
                  <span className="text-[11px] font-medium text-zinc-300">{gridHeight}</span>
                  <button 
                    onClick={() => {
                      const newHeight = Math.min(100, gridHeight + 1);
                      setGridHeight(newHeight);
                      if (isAspectRatioLocked) {
                        setGridWidth(Math.max(1, Math.round(newHeight * aspectRatio)));
                      }
                    }}
                    className="w-5 h-5 flex shrink-0 items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <Plus size={10} />
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowArrows(!showArrows)}
              className={cn(
                "w-full flex items-center justify-between p-2 rounded-sm border transition-all text-[11px] font-semibold",
                showArrows 
                  ? "bg-zinc-800 border-zinc-700 text-zinc-100" 
                  : "bg-zinc-900 border-zinc-800 text-zinc-500"
              )}
            >
              <span>Show Arrows</span>
              {showArrows ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">Color Picker</span>
          <div className="flex flex-wrap gap-2">
            {palette.map((c, i) => (
              <div key={i} className="flex flex-col w-11 group">
                <button
                  onClick={() => setSelectedColor(c)}
                  className={cn(
                    "w-full h-8 rounded-t-md border-2 transition-all relative z-10",
                    selectedColor === c ? "border-white" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                  title="Select color"
                >
                  <div className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-white flex items-center justify-center pointer-events-none shadow-sm">
                    <span className="text-[7px] font-black text-black leading-none">
                      {i + 1}
                    </span>
                  </div>
                </button>
                <div className="flex h-6 bg-zinc-800 rounded-b-md overflow-hidden mt-px">
                  <div className="relative flex-1 flex items-center justify-center hover:bg-zinc-700 transition-colors cursor-pointer group/edit" title="Edit color">
                    <Pencil size={10} className="text-zinc-400 group-hover/edit:text-zinc-200" />
                    <input 
                      type="color" 
                      value={c}
                      onChange={(e) => {
                        const newPalette = [...palette];
                        newPalette[i] = e.target.value;
                        setPalette(newPalette);
                        if (selectedColor === c) {
                          setSelectedColor(e.target.value);
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                  <div className="w-px bg-zinc-900" />
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      const newPalette = palette.filter((_, idx) => idx !== i);
                      setPalette(newPalette);
                      if (newPalette.length > 0 && selectedColor === c) {
                        setSelectedColor(newPalette[0]);
                      }
                    }}
                    className="flex-1 flex items-center justify-center hover:bg-red-900/30 transition-colors group/delete"
                    title="Remove color"
                  >
                    <X size={10} className="text-zinc-400 group-hover/delete:text-red-400" />
                  </button>
                </div>
              </div>
            ))}
            
            <button
              onClick={() => {
                // Generate a random color or default
                const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
                setPalette([...palette, randomColor]);
                setSelectedColor(randomColor);
              }}
              className="w-11 h-14 rounded-lg border-2 border-dashed border-zinc-700 hover:border-zinc-500 flex items-center justify-center text-zinc-600 hover:text-zinc-400 transition-colors relative cursor-pointer"
              title="Add new color"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">Build QA</span>
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-2 space-y-1.5">
            {qaChecklist.map(item => (
              <div
                key={item.label}
                className={cn(
                  "flex items-center justify-between gap-2 text-[10px] font-semibold",
                  item.ok ? "text-emerald-300" : "text-amber-300"
                )}
              >
                <span>{item.label}</span>
                {item.ok ? <CheckCircle2 size={12} /> : <X size={12} />}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">Puzzle Logic</span>
          <div className={cn(
            "rounded-sm border px-2 py-1.5 text-[10px] font-semibold flex items-center justify-between",
            puzzleLogicReport.total === 0
              ? "bg-zinc-900 border-zinc-800 text-zinc-500"
              : puzzleLogicReport.solvable
                ? "bg-emerald-950/25 border-emerald-900/50 text-emerald-300"
                : "bg-amber-950/25 border-amber-900/50 text-amber-300"
          )}>
            <span>
              {puzzleLogicReport.total === 0
                ? 'No puzzle'
                : puzzleLogicReport.solvable
                  ? 'Solvable'
                  : 'Blocked'}
            </span>
            <span className="font-mono">
              {puzzleLogicReport.cleared}/{puzzleLogicReport.total}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={generateSolvablePuzzle}
              disabled={tiles.size === 0 || isProcessing}
              className="flex items-center justify-center gap-2 p-2 rounded-sm bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Gamepad2 size={14} />
              Puzzle it!
            </button>
            <button 
              onClick={() => setIsTestModeOpen(true)}
              disabled={!puzzleLogicReport.solvable || tiles.size === 0}
              className="flex items-center justify-center gap-2 p-2 rounded-sm bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play size={14} />
              Test
            </button>
          </div>
          <button
            onClick={verifyPuzzleLogic}
            disabled={tiles.size === 0}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-[11px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 size={14} />
            Verify Logic
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={handleNew}
              className="flex items-center justify-center gap-2 p-2 rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-[11px] transition-all"
            >
              <FilePlus size={14} />
              New
            </button>
            <button 
              onClick={() => setIsGalleryOpen(true)}
              className="flex items-center justify-center gap-2 p-2 rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-[11px] transition-all"
            >
              <FolderOpen size={14} />
              Open
            </button>
            <button 
              onClick={() => handleSave(false)}
              disabled={isSaving || tiles.size === 0}
              className="flex items-center justify-center gap-2 p-2 rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-[11px] transition-all disabled:opacity-50"
            >
              <Save size={14} />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button 
              onClick={() => handleSave(true)}
              disabled={isSaving || tiles.size === 0}
              className="flex items-center justify-center gap-2 p-2 rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-[11px] transition-all disabled:opacity-50"
            >
              <Plus size={14} />
              Save As
            </button>
          </div>
          
          <button 
            onClick={exportData}
            disabled={tiles.size === 0}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-[11px] transition-all disabled:opacity-50"
          >
            <Download size={14} />
            Export Playable JSON
          </button>
          <button 
            onClick={exportTileFieldPreset}
            disabled={tiles.size === 0}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-sm bg-lime-700 hover:bg-lime-600 text-white font-semibold text-[11px] transition-all disabled:opacity-50"
          >
            <Download size={14} />
            Export Impion Preset
          </button>
          <button
            onClick={exportQaReport}
            disabled={tiles.size === 0}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-[11px] transition-all disabled:opacity-50"
          >
            <FilePlus size={14} />
            Export QA Report
          </button>
          <button
            onClick={() => buildImpionProject(false)}
            disabled={tiles.size === 0 || isExportingProject || !puzzleLogicReport.solvable}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-sm bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[11px] transition-all disabled:opacity-50"
          >
            {isExportingProject ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
            {isExportingProject ? 'Building...' : 'Build Impion Project'}
          </button>
          <button
            onClick={() => buildImpionProject(true)}
            disabled={tiles.size === 0 || isExportingProject || !puzzleLogicReport.solvable}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-sm bg-orange-700 hover:bg-orange-600 text-white font-semibold text-[11px] transition-all disabled:opacity-50"
          >
            {isExportingProject ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Build Playable ZIP
          </button>
          {exportApiStatus && (
            <p className="text-[9px] text-zinc-500 leading-snug break-words">
              {exportApiStatus}
            </p>
          )}
        </div>

        <div className="mt-auto pt-4 border-t border-zinc-800 space-y-2">
          <p className="text-[9px] text-zinc-600 text-center">
            {tiles.size} tiles generated
          </p>
        </div>
      </aside>

      {/* Main Viewport */}
      <main 
        ref={containerRef}
        className="flex-1 relative overflow-hidden cursor-crosshair select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
      >
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" 
          style={{ 
            backgroundImage: `radial-gradient(circle at 2px 2px, white 1.5px, transparent 0)`,
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`
          }} 
        />

        {/* Tiles Container */}
        <div 
          className="absolute origin-top-left"
          style={{ 
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {!isProcessing && (
            <div className="relative">
              {showBackground && lastImage && (
                <img 
                  src={lastImage} 
                  alt="Background"
                  className="absolute top-0 left-0 pointer-events-none select-none"
                  style={{
                    width: gridWidth * 24,
                    height: gridHeight * 24,
                    maxWidth: 'none',
                    opacity: backgroundOpacity,
                    zIndex: -1
                  }}
                />
              )}

              {assetLibrary.centerCharacter?.dataUrl && (
                <img
                  src={assetLibrary.centerCharacter.dataUrl}
                  alt=""
                  className="absolute pointer-events-none select-none object-contain"
                  style={{
                    width: Math.min(gridWidth * 24 * 0.34, 180),
                    height: Math.min(gridHeight * 24 * 0.34, 180),
                    left: (gridWidth * 24) / 2,
                    top: (gridHeight * 24) / 2,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 2,
                  }}
                />
              )}

              {/* Grid Boundary */}
              <div 
                className="absolute border-2 border-zinc-700 pointer-events-none"
                style={{
                  width: gridWidth * 24,
                  height: gridHeight * 24,
                  left: 0,
                  top: 0
                }}
              />

              {Array.from(tiles.values()).map((tile: Tile) => (
                (() => {
                  const key = `${tile.x},${tile.y}`;
                  const isAvailableHint = showLogicHints && logicHintKeys.available.has(key);
                  const isStuckHint = showLogicHints && !puzzleLogicReport.solvable && logicHintKeys.stuck.has(key);
                  const isTutorialTarget = tutorialSettings.enabled
                    && tutorialSettings.targetMode === 'tile'
                    && tutorialSettings.targetX === tile.x
                    && tutorialSettings.targetY === tile.y;
                  const showSharedTileTexture = tileRenderingSettings.useSharedTexture && Boolean(assetLibrary.tileTexture?.dataUrl);

                  return (
                    <motion.div
                      key={key}
                      whileHover={{ scale: 1.1, zIndex: 10 }}
                      className="absolute flex items-center justify-center cursor-pointer"
                      style={{
                        left: tile.x * 24,
                        top: tile.y * 24,
                        width: 22,
                        height: 22,
                        backgroundColor: showSharedTileTexture && !tileRenderingSettings.tintSharedTexture
                          ? tileRenderingSettings.fallbackTint
                          : tile.color,
                        backgroundImage: showSharedTileTexture ? `url(${assetLibrary.tileTexture?.dataUrl})` : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundBlendMode: showSharedTileTexture && tileRenderingSettings.tintSharedTexture ? 'multiply' : 'normal',
                        borderRadius: '4px',
                        color: getContrastColor(tile.color),
                        outline: isTutorialTarget
                          ? '2px solid rgba(56, 189, 248, 0.98)'
                          : isAvailableHint
                          ? '2px solid rgba(52, 211, 153, 0.95)'
                          : isStuckHint
                            ? '2px solid rgba(251, 191, 36, 0.95)'
                            : 'none',
                        boxShadow: isTutorialTarget
                          ? '0 0 12px rgba(56, 189, 248, 0.95)'
                          : isAvailableHint
                          ? '0 0 10px rgba(52, 211, 153, 0.85)'
                          : isStuckHint
                            ? '0 0 10px rgba(251, 191, 36, 0.65)'
                            : 'none',
                      }}
                    >
                      <div className="w-4 h-4">
                        {showArrows && getDirectionIcon(tile.direction)}
                      </div>
                    </motion.div>
                  );
                })()
              ))}
              
              {/* Brush Cursor */}
              {cursorPos && (
                <div 
                  className="absolute pointer-events-none z-50 rounded-sm transition-all duration-75 border-2"
                  style={{
                    left: (tool === 'tutorial' ? cursorPos.x : cursorPos.x - Math.floor(brushSize / 2)) * 24,
                    top: (tool === 'tutorial' ? cursorPos.y : cursorPos.y - Math.floor(brushSize / 2)) * 24,
                    width: (tool === 'tutorial' ? 1 : brushSize) * 24,
                    height: (tool === 'tutorial' ? 1 : brushSize) * 24,
                    borderColor: tool === 'tutorial'
                      ? 'rgba(56, 189, 248, 0.95)'
                      : tool === 'erase'
                        ? 'rgba(239, 68, 68, 0.8)'
                        : 'rgba(255, 255, 255, 0.8)',
                    backgroundColor: tool === 'tutorial'
                      ? 'rgba(56, 189, 248, 0.12)'
                      : tool === 'erase'
                        ? 'rgba(239, 68, 68, 0.1)'
                        : 'rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 0 10px rgba(0,0,0,0.3)'
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Loading Spinner */}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-50">
            <Loader2 className="animate-spin text-white" size={48} />
          </div>
        )}

        {/* View Controls */}
        <div className="absolute bottom-8 right-8 flex flex-col gap-2">
          <div className="bg-[#151515] border border-zinc-800 rounded-xl p-1 flex flex-col">
            <ControlButton icon={<ZoomIn size={18} />} onClick={() => setZoom(z => Math.min(z + 0.2, 5))} />
            <ControlButton icon={<ZoomOut size={18} />} onClick={() => setZoom(z => Math.max(z - 0.2, 0.1))} />
            <div className="h-px bg-zinc-800 mx-2 my-1" />
            <ControlButton icon={<Maximize size={18} />} onClick={resetView} />
          </div>
          <div className="bg-[#151515] border border-zinc-800 rounded-xl px-3 py-2 text-[10px] font-mono text-zinc-500">
            {Math.round(zoom * 100)}%
          </div>
        </div>
      </main>

      <AnimatePresence>
        {isEditorOpen && rawImage && (
          <ImageEditor 
            src={rawImage} 
            onConfirm={(croppedSrc, w, h) => {
              setLastImage(croppedSrc);
              setIsEditorOpen(false);
              const ratio = w / h;
              setAspectRatio(ratio);
              setGridWidth(30);
              setGridHeight(Math.max(1, Math.round(30 / ratio)));
              setIsAspectRatioLocked(true);
              // Trigger a view reset after state updates
              setTimeout(resetView, 0);
            }} 
            onCancel={() => setIsEditorOpen(false)} 
          />
        )}
        {isTestModeOpen && (
          <TestOverlay 
            initialTiles={tiles} 
            onClose={() => setIsTestModeOpen(false)} 
          />
        )}
        {isGalleryOpen && (
          <Gallery 
            onClose={() => setIsGalleryOpen(false)} 
            onSelect={loadPuzzle}
          />
        )}
        {dialog && (
          <CustomDialog 
            {...dialog} 
            onClose={() => setDialog(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Subcomponents ---

function Gallery({ onClose, onSelect }: { onClose: () => void, onSelect: (id: string, data: any) => void }) {
  const [puzzles, setPuzzles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    const fetchPuzzles = async () => {
      try {
        const q = query(collection(db, 'puzzles'), orderBy('updatedAt', 'desc'));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPuzzles(list);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'puzzles');
      } finally {
        setLoading(false);
      }
    };
    fetchPuzzles();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'puzzles', id));
      setPuzzles(prev => prev.filter(p => p.id !== id));
      setConfirmDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `puzzles/${id}`);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex flex-col p-8"
    >
      <div className="max-w-6xl w-full mx-auto flex flex-col h-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white tracking-tight">Puzzle Gallery</h2>
            <p className="text-zinc-400 text-sm">Open community shared puzzles</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-white hover:bg-zinc-700 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={48} />
          </div>
        ) : puzzles.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-4">
            <FolderOpen size={64} className="opacity-20" />
            <p className="text-xl">No puzzles saved yet</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-4 scrollbar-hide">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pb-12">
              {puzzles.map((p) => (
                <motion.div
                  key={p.id}
                  whileHover={{ y: -4 }}
                  onClick={() => onSelect(p.id, p)}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden cursor-pointer group relative shadow-2xl"
                >
                  <div className="aspect-square bg-black relative">
                    <img 
                      src={p.previewUrl} 
                      alt={p.name} 
                      className="w-full h-full object-contain p-2" 
                    />
                    <div className="absolute inset-0 bg-blue-600/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Play className="text-white fill-white" size={48} />
                    </div>
                  </div>
                  <div className="p-4 flex flex-col gap-1">
                    <h3 className="text-white font-semibold truncate">{p.name}</h3>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {p.gridWidth}x{p.gridHeight} • {Object.keys(p.tiles).length} tiles
                      </span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete(p.id);
                        }}
                        className="p-1.5 rounded-lg bg-zinc-800/50 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence>
          {confirmDelete && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
            >
              <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-2">Delete Puzzle?</h3>
                <p className="text-zinc-400 text-sm mb-6">This action cannot be undone.</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="flex-1 px-4 py-2 rounded-xl bg-zinc-800 text-white font-semibold hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(confirmDelete)}
                    className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-500 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function CustomDialog({ 
  type, 
  title, 
  message, 
  defaultValue, 
  onResponse, 
  onClose 
}: { 
  type: 'confirm' | 'prompt', 
  title: string, 
  message: string, 
  defaultValue?: string, 
  onResponse: (response: string | boolean | null) => void,
  onClose: () => void
}) {
  const [value, setValue] = useState(defaultValue || '');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        className="bg-[#151515] border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl"
      >
        <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
        <p className="text-zinc-400 text-sm mb-6">{message}</p>
        
        {type === 'prompt' && (
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onResponse(value);
              if (e.key === 'Escape') onResponse(null);
            }}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-white mb-6 outline-none focus:border-blue-500 transition-colors"
            placeholder="Type something..."
          />
        )}
        
        <div className="flex gap-3">
          <button
            onClick={() => onResponse(type === 'prompt' ? null : false)}
            className="flex-1 px-4 py-2 rounded-xl bg-zinc-800 text-white font-semibold hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onResponse(type === 'prompt' ? value : true)}
            className="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 transition-colors"
          >
            {type === 'prompt' ? 'OK' : 'Confirm'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ImageEditor({ src, onConfirm, onCancel }: { src: string, onConfirm: (src: string, width: number, height: number) => void, onCancel: () => void }) {
  const [brushSize, setBrushSize] = useState(30);
  const [tool, setTool] = useState<'draw' | 'erase'>('draw');
  const [cursorPos, setCursorPos] = useState<{x: number, y: number} | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    if (!canvasRef.current || !maskCanvasRef.current || !imgRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvasRef.current;
    
    // 1. Clear and draw original image
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(imgRef.current, 0, 0, width, height);
    
    // 2. Create a temporary buffer to prepare the overlay
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tctx = tempCanvas.getContext('2d');
    
    if (tctx) {
      // Fill with semi-transparent black
      tctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      tctx.fillRect(0, 0, width, height);
      
      // Punch holes in this overlay buffer using the maskCanvas
      tctx.globalCompositeOperation = 'destination-out';
      tctx.drawImage(maskCanvasRef.current, 0, 0);
      
      // 3. Draw the resulting punched overlay onto the main canvas
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(tempCanvas, 0, 0);
    }
  }, []);

  const initCanvases = useCallback(() => {
    if (!imgRef.current || !canvasRef.current || !maskCanvasRef.current) return;
    
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    
    const container = containerRef.current;
    if (!container) return;
    
    const maxWidth = container.clientWidth - 40;
    const maxHeight = container.clientHeight - 40;
    
    let displayWidth = img.naturalWidth;
    let displayHeight = img.naturalHeight;
    
    const ratio = Math.min(maxWidth / displayWidth, maxHeight / displayHeight);
    displayWidth *= ratio;
    displayHeight *= ratio;
    
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    maskCanvas.width = displayWidth;
    maskCanvas.height = displayHeight;
    
    const mctx = maskCanvas.getContext('2d');
    if (mctx) {
      mctx.clearRect(0, 0, displayWidth, displayHeight);
    }
    
    draw();
  }, [draw]);

  useEffect(() => {
    window.addEventListener('resize', initCanvases);
    return () => window.removeEventListener('resize', initCanvases);
  }, [initCanvases]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    // Calculate scale in case CSS size differs from internal size
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const paint = (x: number, y: number) => {
    if (!maskCanvasRef.current) return;
    const mctx = maskCanvasRef.current.getContext('2d');
    if (mctx) {
      mctx.beginPath();
      mctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      
      if (tool === 'draw') {
        mctx.globalCompositeOperation = 'source-over';
        mctx.fillStyle = 'black';
      } else {
        mctx.globalCompositeOperation = 'destination-out';
      }
      mctx.fill();
      draw();
    }
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    paint(cssX * scaleX, cssY * scaleY);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    setCursorPos({ x: cssX, y: cssY });
    
    if (!isDrawing) return;
    
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    paint(cssX * scaleX, cssY * scaleY);
  };

  const handleEnd = () => {
    setIsDrawing(false);
  };

  const handleLeave = () => {
    setIsDrawing(false);
    setCursorPos(null);
  };

  const handleConfirm = () => {
    if (!imgRef.current || !maskCanvasRef.current) return;

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = imgRef.current.naturalWidth;
    finalCanvas.height = imgRef.current.naturalHeight;
    const fctx = finalCanvas.getContext('2d');
    if (!fctx) return;

    // 1. Create a temporary canvas for the KEEP mask at full resolution
    const tempMask = document.createElement('canvas');
    tempMask.width = finalCanvas.width;
    tempMask.height = finalCanvas.height;
    const tctx = tempMask.getContext('2d');
    if (!tctx) return;
    
    // Draw the maskCanvas (which is our KEEP mask) onto the full-res tempMask
    tctx.drawImage(maskCanvasRef.current, 0, 0, tempMask.width, tempMask.height);
    
    // 2. Draw original image and apply the KEEP mask
    fctx.drawImage(imgRef.current, 0, 0);
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(tempMask, 0, 0);

    // 4. Crop to bounding box of non-transparent pixels
    const imageData = fctx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
    const data = imageData.data;
    let minX = finalCanvas.width, minY = finalCanvas.height, maxX = 0, maxY = 0;
    let found = false;

    for (let y = 0; y < finalCanvas.height; y++) {
      for (let x = 0; x < finalCanvas.width; x++) {
        const alpha = data[(y * finalCanvas.width + x) * 4 + 3];
        if (alpha > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          found = true;
        }
      }
    }

    if (found) {
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = width;
      croppedCanvas.height = height;
      const cctx = croppedCanvas.getContext('2d');
      if (cctx) {
        cctx.drawImage(finalCanvas, minX, minY, width, height, 0, 0, width, height);
        onConfirm(croppedCanvas.toDataURL('image/png'), width, height);
      } else {
        onConfirm(finalCanvas.toDataURL('image/png'), finalCanvas.width, finalCanvas.height);
      }
    } else {
      onConfirm(finalCanvas.toDataURL('image/png'), finalCanvas.width, finalCanvas.height);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 md:p-8"
    >
      <div className="bg-[#151515] border border-zinc-800 rounded-2xl w-full max-w-5xl h-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-[#0f0f0f]">
          <div>
            <h2 className="text-lg font-bold text-white">Mask Editor</h2>
            <p className="text-xs text-zinc-500">Draw over the area you want to keep as tiles</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
              <button 
                onClick={() => setTool('draw')}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase rounded-sm transition-all",
                  tool === 'draw' ? "bg-blue-500 text-white" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                Draw
              </button>
              <button 
                onClick={() => setTool('erase')}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase rounded-sm transition-all",
                  tool === 'erase' ? "bg-blue-500 text-white" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                Erase
              </button>
            </div>
            <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800">
              <span className="text-[10px] uppercase font-bold text-zinc-500">Brush</span>
              <input 
                type="range" 
                min="5" 
                max="100" 
                value={brushSize} 
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                className="w-24 accent-blue-500"
              />
              <span className="text-xs font-mono text-zinc-300 w-6">{brushSize}</span>
            </div>
            <button 
              onClick={onCancel}
              className="p-2 hover:bg-zinc-800 rounded-sm text-zinc-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        
        <div 
          ref={containerRef}
          className="flex-1 overflow-hidden relative flex items-center justify-center bg-zinc-950 p-4"
        >
          <img 
            ref={imgRef}
            src={src} 
            onLoad={initCanvases}
            className="hidden"
            alt="Source"
          />
          <div className="relative group">
            <canvas
              ref={canvasRef}
              onMouseDown={handleStart}
              onMouseMove={handleMove}
              onMouseUp={handleEnd}
              onMouseLeave={handleLeave}
              onTouchStart={handleStart}
              onTouchMove={handleMove}
              onTouchEnd={handleEnd}
              className="cursor-none shadow-2xl bg-zinc-900"
            />
            {cursorPos && canvasRef.current && (
              <div 
                className="absolute pointer-events-none border border-white/50 rounded-full bg-white/10 z-50"
                style={{
                  left: cursorPos.x,
                  top: cursorPos.y,
                  width: brushSize / (canvasRef.current.width / canvasRef.current.getBoundingClientRect().width),
                  height: brushSize / (canvasRef.current.height / canvasRef.current.getBoundingClientRect().height),
                  transform: 'translate(-50%, -50%)'
                }}
              />
            )}
          </div>
          <canvas ref={maskCanvasRef} className="hidden" />
        </div>

        <div className="p-4 border-t border-zinc-800 flex justify-between items-center bg-[#0f0f0f]">
          <div className="text-[10px] text-zinc-500 max-w-xs leading-relaxed">
            The masked (lightened) area will not be transparent and will generate tiles.<br/>
            The unmasked (darkened) area will be transparent and won't generate tiles.
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleConfirm}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-sm text-sm font-bold shadow-lg shadow-emerald-900/20 transition-all flex items-center gap-2"
            >
              <CheckCircle2 size={16} />
              Confirm Selection
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function TestOverlay({ initialTiles, onClose }: { initialTiles: Map<string, Tile>, onClose: () => void }) {
  const [testTiles, setTestTiles] = useState<Map<string, Tile>>(new Map(initialTiles));
  const [isWon, setIsWon] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(2);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const { contextSafe } = useGSAP({ scope: containerRef });

  const fitToScreen = useCallback(() => {
    const tilesArr = Array.from(initialTiles.values());
    if (tilesArr.length === 0) return;

    const minX = Math.min(...tilesArr.map(t => t.x));
    const minY = Math.min(...tilesArr.map(t => t.y));
    const maxX = Math.max(...tilesArr.map(t => t.x));
    const maxY = Math.max(...tilesArr.map(t => t.y));

    const width = (maxX - minX + 1) * 24;
    const height = (maxY - minY + 1) * 24;
    
    const padding = 100;
    const scaleX = (window.innerWidth - padding) / width;
    const scaleY = (window.innerHeight - padding) / height;
    
    const fitZoom = Math.min(scaleX, scaleY, 3);
    setZoom(Math.max(fitZoom, 0.5));
    setPan({ x: 0, y: 0 });
  }, [initialTiles]);

  useEffect(() => {
    fitToScreen();
  }, [fitToScreen]);

  const bounds = useMemo(() => {
    const tilesArr = Array.from(initialTiles.values());
    if (tilesArr.length === 0) return { centerX: 0, centerY: 0 };
    const minX = Math.min(...tilesArr.map(t => t.x));
    const minY = Math.min(...tilesArr.map(t => t.y));
    const maxX = Math.max(...tilesArr.map(t => t.x));
    const maxY = Math.max(...tilesArr.map(t => t.y));
    return {
      centerX: (minX + maxX) * 12 + 11,
      centerY: (minY + maxY) * 12 + 11
    };
  }, [initialTiles]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      const delta = -e.deltaY * 0.001;
      setZoom(prev => Math.min(Math.max(prev + delta, 0.1), 10));
      e.preventDefault();
    } else {
      setPan(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  };

  const handleTileClick = contextSafe((key: string, e: React.MouseEvent) => {
    if (isWon) return;
    const tile = testTiles.get(key);
    if (!tile) return;

    let isPathClear = true;
    let curX = tile.x;
    let curY = tile.y;
    const dir = tile.direction;

    while (true) {
      if (dir === 'up') curY--;
      else if (dir === 'down') curY++;
      else if (dir === 'left') curX--;
      else if (dir === 'right') curX++;
      
      if (testTiles.has(`${curX},${curY}`)) {
        isPathClear = false;
        break;
      }
      
      if (curX < -50 || curX > 150 || curY < -50 || curY > 150) break;
    }

    const target = e.currentTarget;

    if (isPathClear) {
      let xMove = 0;
      let yMove = 0;
      if (dir === 'up') yMove = -20;
      else if (dir === 'down') yMove = 20;
      else if (dir === 'left') xMove = -20;
      else if (dir === 'right') xMove = 20;

      gsap.to(target, {
        x: xMove,
        y: yMove,
        opacity: 0,
        duration: 0.1,
        ease: "sine.out",
        onComplete: () => {
          const newTiles = new Map(testTiles);
          newTiles.delete(key);
          setTestTiles(newTiles);
          if (newTiles.size === 0) setIsWon(true);
        }
      });
    } else {
      const shakeProp = (dir === 'left' || dir === 'right') ? 'x' : 'y';
      const shakeVal = (dir === 'right' || dir === 'down') ? '+=6' : '-=6';

      gsap.to(target, {
        [shakeProp]: shakeVal,
        duration: 0.025,
        repeat: 5,
        yoyo: true,
        ease: "none",
        onComplete: () => {
          gsap.set(target, { x: 0, y: 0 });
        }
      });
    }
  });

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-lg flex flex-col items-center justify-center overflow-hidden"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      ref={containerRef}
    >
      <div className="absolute top-8 right-8 flex gap-4 z-[60]">
        <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-1 flex backdrop-blur-md">
          <ControlButton icon={<ZoomIn size={18} />} onClick={() => setZoom(z => Math.min(z + 0.5, 10))} />
          <ControlButton icon={<ZoomOut size={18} />} onClick={() => setZoom(z => Math.max(z - 0.5, 0.1))} />
          <div className="w-px bg-zinc-800 mx-1 my-2" />
          <ControlButton icon={<Maximize size={18} />} onClick={fitToScreen} />
        </div>
        <button 
          onClick={() => {
            setTestTiles(new Map(initialTiles));
            setIsWon(false);
            fitToScreen();
          }}
          className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-zinc-100 transition-colors"
          title="Restart"
        >
          <RotateCcw size={20} />
        </button>
        <button 
          onClick={onClose}
          className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="absolute top-8 left-8 z-[60] pointer-events-none">
        <h2 className="text-2xl font-black tracking-tighter bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">Puzzle Test</h2>
        <p className="text-zinc-500 text-[10px] font-medium uppercase tracking-widest">Interactive Mode</p>
      </div>

      <div className="relative w-full h-full flex items-center justify-center">
         <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
          style={{ 
            backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`
          }} 
        />

        <div 
          className="relative"
          style={{ 
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {Array.from(testTiles.values()).map((tile: Tile) => {
            const key = `${tile.x},${tile.y}`;
            
            return (
              <div
                key={key}
                onClick={(e) => handleTileClick(key, e)}
                className="absolute flex items-center justify-center cursor-pointer"
                style={{
                  left: tile.x * 24 - bounds.centerX,
                  top: tile.y * 24 - bounds.centerY,
                  width: 22,
                  height: 22,
                  backgroundColor: tile.color,
                  borderRadius: '5px',
                  color: getContrastColor(tile.color),
                  backfaceVisibility: 'hidden',
                  WebkitFontSmoothing: 'antialiased'
                }}
              >
                <div className="w-3.5 h-3.5">
                  {getDirectionIcon(tile.direction)}
                </div>
              </div>
            );
          })}
        </div>

        <AnimatePresence>
          {isWon && (
            <motion.div 
              initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
              animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-[110]"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-zinc-900 border border-white/10 p-10 rounded-[32px] flex flex-col items-center gap-6 text-center"
              >
                <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500">
                  <Trophy size={56} />
                </div>
                <div>
                  <h3 className="text-3xl font-black tracking-tight mb-2">Victory!</h3>
                  <p className="text-zinc-500 text-sm max-w-[200px]">The puzzle is solvable and the logic is sound.</p>
                </div>
                <button 
                  onClick={onClose}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-sm transition-all active:scale-95"
                >
                  Return to Editor
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// --- Standalone Helpers ---

function getDirectionIcon(dir: Direction) {
  switch (dir) {
    case 'up': return <ArrowUp className="w-full h-full" />;
    case 'right': return <ArrowRight className="w-full h-full" />;
    case 'down': return <ArrowDown className="w-full h-full" />;
    case 'left': return <ArrowLeft className="w-full h-full" />;
  }
}

function getContrastColor(hexcolor: string) {
  if (!hexcolor || hexcolor.length < 6) return 'white';
  const r = parseInt(hexcolor.slice(1, 3), 16);
  const g = parseInt(hexcolor.slice(3, 5), 16);
  const b = parseInt(hexcolor.slice(5, 7), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? 'black' : 'white';
}

function assetSlotLabel(slot: keyof PlayableAssetLibrary) {
  const labels: Record<keyof PlayableAssetLibrary, string> = {
    backgroundImage: 'BG',
    tileTexture: 'Tile',
    trailTexture: 'Trail',
    centerCharacter: 'Center',
    storeButtonTexture: 'Store Btn',
    winButtonTexture: 'Win Btn',
    ctaPanelTexture: 'CTA Panel',
    winBackgroundImage: 'Win BG',
    musicTrack: 'Music',
    tapSound: 'Tap SFX',
    badMoveSound: 'Bad SFX',
    winSound: 'Win SFX',
    warningSound: 'Warn SFX',
  };
  return labels[slot];
}

function AssetSlotControl({
  label,
  icon,
  accept,
  asset,
  onUpload,
  onClear,
  onSave,
}: {
  label: string;
  icon: React.ReactNode;
  accept: string;
  asset: PlayableAssetLibrary[keyof PlayableAssetLibrary];
  onUpload: (file: File | undefined) => void;
  onClear: () => void;
  onSave: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
      <label className="min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-sm bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer">
        <span className="text-zinc-500 shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] uppercase font-bold text-zinc-500 leading-none">{label}</span>
          <span className="block text-[10px] text-zinc-300 truncate mt-0.5">
            {asset?.filename || 'Upload file'}
          </span>
        </span>
        {asset?.dataUrl && asset.mimeType.startsWith('image/') && (
          <img
            src={asset.dataUrl}
            alt=""
            className="w-7 h-7 object-cover rounded-sm border border-zinc-700 shrink-0"
          />
        )}
        <input
          type="file"
          accept={accept}
          onChange={(e) => {
            onUpload(e.target.files?.[0]);
            e.target.value = '';
          }}
          className="hidden"
        />
      </label>
      <button
        onClick={onSave}
        disabled={!asset}
        className="w-8 h-full flex items-center justify-center rounded-sm border bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-sky-300 hover:border-sky-900/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title={`Save ${label}`}
      >
        <Save size={13} />
      </button>
      <button
        onClick={onClear}
        disabled={!asset}
        className="w-8 h-full flex items-center justify-center rounded-sm border bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-900/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title={`Clear ${label}`}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function ToolButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "flex flex-col items-center justify-center gap-1 p-1.5 rounded-sm border transition-all",
        active 
          ? "bg-zinc-100 text-black border-zinc-100" 
          : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300"
      )}
    >
      {icon}
      <span className="text-[7px] font-bold uppercase tracking-tighter leading-none">{label}</span>
    </button>
  );
}

function ControlButton({ icon, onClick }: { icon: React.ReactNode, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2.5 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-sm transition-colors"
    >
      {icon}
    </button>
  );
}
