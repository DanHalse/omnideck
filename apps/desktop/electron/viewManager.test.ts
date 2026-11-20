import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  Menu: { buildFromTemplate: vi.fn() },
  WebContentsView: class {},
  session: { fromPartition: vi.fn() },
  shell: { openExternal: vi.fn() },
  clipboard: { writeText: vi.fn() },
}));

import { buildCleanDesktopUserAgent } from './viewManager';

describe('Electron User-Agent hygiene for Google Sign-In & DRM', () => {
  it('strips Electron and OmniDeck tokens while preserving the genuine Chromium version', () => {
    const raw =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OmniDeck/1.0.0 Chrome/142.0.7444.52 Electron/45.2.1 Safari/537.36';
    const cleaned = buildCleanDesktopUserAgent(raw);
    expect(cleaned).not.toContain('Electron/');
    expect(cleaned).not.toContain('OmniDeck/');
    expect(cleaned).toContain('Chrome/142.0.7444.52');
    expect(cleaned).toContain('Safari/537.36');
  });
});
