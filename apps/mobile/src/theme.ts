import type { ThemeMode } from '@omnideck/shared';

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

export const MOBILE_PALETTES: Record<ThemeMode, MobilePalette> = {
  dark: {
    canvas: '#0D0F12',
    chrome: '#13161B',
    chromeElevated: '#191D24',
    surface: '#1F242D',
    surfaceActive: '#2A313D',
    input: '#101317',
    border: 'rgba(255, 255, 255, 0.09)',
    inkPrimary: '#F1F3F6',
    inkSecondary: '#9AA3B2',
    inkMuted: '#687283',
    accent: '#E47E3C',
    accentSoft: 'rgba(228, 126, 60, 0.16)',
    live: '#22C55E',
    danger: '#EF4444',
  },
  light: {
    canvas: '#F2F4F7',
    chrome: '#FFFFFF',
    chromeElevated: '#F7F8FA',
    surface: '#EDF0F5',
    surfaceActive: '#DFE5EE',
    input: '#FFFFFF',
    border: 'rgba(15, 23, 42, 0.10)',
    inkPrimary: '#11161F',
    inkSecondary: '#4E596A',
    inkMuted: '#7B8698',
    accent: '#CF6523',
    accentSoft: 'rgba(207, 101, 35, 0.14)',
    live: '#16A34A',
    danger: '#DC2626',
  },
};
