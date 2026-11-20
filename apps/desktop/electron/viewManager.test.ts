import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  Menu: { buildFromTemplate: vi.fn() },
  WebContentsView: class {},
  session: { fromPartition: vi.fn() },
  shell: { openExternal: vi.fn() },
  clipboard: { writeText: vi.fn() },
}));

import { shouldPreserveNativeUserAgent } from './viewManager.js';

describe('Electron User-Agent policy for Google Sign-In & Widevine DRM', () => {
  it('preserves Electron native User-Agent so HTTP headers match Chromium Sec-CH-UA Client Hints', () => {
    expect(shouldPreserveNativeUserAgent()).toBe(true);
  });
});
