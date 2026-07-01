import { defaultAssets, type PlayableAssetLibrary, type PlayableAssetSlot } from './playableExport';

type AssetKitItem = {
  slot: keyof PlayableAssetLibrary;
  label: string;
  filename: string;
  mimeType: string;
  url: string;
};

export const DEFAULT_TG_ASSET_KIT_ITEMS: AssetKitItem[] = [
  {
    slot: 'backgroundImage',
    label: 'Puzzle background',
    filename: 'bm_cta_bg.png',
    mimeType: 'image/png',
    url: new URL('../assets/default-kit/textures/bm_cta_bg.png', import.meta.url).href,
  },
  {
    slot: 'tileTexture',
    label: 'Shared tile texture',
    filename: 'bm_blue.png',
    mimeType: 'image/png',
    url: new URL('../assets/default-kit/textures/bm_blue.png', import.meta.url).href,
  },
  {
    slot: 'trailTexture',
    label: 'Tile trail texture',
    filename: 'bm_trail.png',
    mimeType: 'image/png',
    url: new URL('../assets/default-kit/textures/bm_trail.png', import.meta.url).href,
  },
  {
    slot: 'centerCharacter',
    label: 'Center character',
    filename: 'bm_img.png',
    mimeType: 'image/png',
    url: new URL('../assets/default-kit/textures/bm_img.png', import.meta.url).href,
  },
  {
    slot: 'storeButtonTexture',
    label: 'Store button',
    filename: 'bm_store_button.png',
    mimeType: 'image/png',
    url: new URL('../assets/default-kit/textures/bm_store_button.png', import.meta.url).href,
  },
  {
    slot: 'winButtonTexture',
    label: 'Win button',
    filename: 'bm_win_btn.png',
    mimeType: 'image/png',
    url: new URL('../assets/default-kit/textures/bm_win_btn.png', import.meta.url).href,
  },
  {
    slot: 'ctaPanelTexture',
    label: 'CTA panel',
    filename: 'bm_store_button.png',
    mimeType: 'image/png',
    url: new URL('../assets/default-kit/textures/bm_store_button.png', import.meta.url).href,
  },
  {
    slot: 'winBackgroundImage',
    label: 'Win background',
    filename: 'bm_win_bg.jpg',
    mimeType: 'image/jpeg',
    url: new URL('../assets/default-kit/textures/bm_win_bg.jpg', import.meta.url).href,
  },
  {
    slot: 'musicTrack',
    label: 'Music',
    filename: 'bg.mp3',
    mimeType: 'audio/mpeg',
    url: new URL('../assets/default-kit/sounds/bg.mp3', import.meta.url).href,
  },
  {
    slot: 'tapSound',
    label: 'Tap SFX',
    filename: 'tap_0.mp3',
    mimeType: 'audio/mpeg',
    url: new URL('../assets/default-kit/sounds/tap_0.mp3', import.meta.url).href,
  },
  {
    slot: 'badMoveSound',
    label: 'Bad move SFX',
    filename: 'bad_move.mp3',
    mimeType: 'audio/mpeg',
    url: new URL('../assets/default-kit/sounds/bad_move.mp3', import.meta.url).href,
  },
  {
    slot: 'winSound',
    label: 'Win SFX',
    filename: 'level_completed.mp3',
    mimeType: 'audio/mpeg',
    url: new URL('../assets/default-kit/sounds/level_completed.mp3', import.meta.url).href,
  },
  {
    slot: 'warningSound',
    label: 'Warning SFX',
    filename: 'moves_warning.mp3',
    mimeType: 'audio/mpeg',
    url: new URL('../assets/default-kit/sounds/moves_warning.mp3', import.meta.url).href,
  },
];

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

export async function loadDefaultTgAssetKit(): Promise<PlayableAssetLibrary> {
  const loaded = await Promise.all(DEFAULT_TG_ASSET_KIT_ITEMS.map(async (item) => {
    const response = await fetch(item.url);
    if (!response.ok) throw new Error(`Could not load ${item.filename}`);
    const blob = await response.blob();
    const asset: PlayableAssetSlot = {
      filename: item.filename,
      mimeType: blob.type || item.mimeType,
      dataUrl: await blobToDataUrl(blob),
    };
    return [item.slot, asset] as const;
  }));

  return loaded.reduce<PlayableAssetLibrary>((acc, [slot, asset]) => ({
    ...acc,
    [slot]: asset,
  }), { ...defaultAssets });
}
