import {
  resolveSkinPreset,
  SKIN_PRESETS,
  type SkinPresetId,
  type ThemeMode,
} from '@omnideck/shared';

export interface MobilePalette {
  canvas: string;
  chrome: string;
  chromeElevated: string;
  surface: string;
  surfaceActive: string;
  input: string;
  border: string;
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string;
  accent: string;
  accentSoft: string;
  live: string;
  danger: string;
}

function toMobilePalette(skinId: SkinPresetId): MobilePalette {
  const s = SKIN_PRESETS[skinId];
  return {
    canvas: s.canvas,
    chrome: s.chrome,
    chromeElevated: s.chromeElevated,
    surface: s.surface,
    surfaceActive: s.surfaceActive,
    input: s.input,
    border: s.borderDefault,
    inkPrimary: s.inkPrimary,
    inkSecondary: s.inkSecondary,
    inkMuted: s.inkMuted,
    accent: s.accent,
    accentSoft: s.accentSoft,
    live: s.live,
    danger: s.danger,
  };
}

export const MOBILE_PALETTES: Record<ThemeMode, MobilePalette> = {
  dark: toMobilePalette('obsidian'),
  light: toMobilePalette('daylight'),
};

export function getMobilePalette(
  skin?: SkinPresetId,
  fallbackTheme?: ThemeMode,
): MobilePalette {
  const resolved = resolveSkinPreset(skin, fallbackTheme);
  return toMobilePalette(resolved.id);
}
