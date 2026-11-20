import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getVersion: () => '1.1.0' },
  shell: { openExternal: vi.fn() },
}));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}));

import { isNewerSemver } from './updater.js';

describe('UpdateManager semver comparison', () => {
  it('detects newer major, minor, and patch versions accurately', () => {
    expect(isNewerSemver('v1.2.0', '1.1.0')).toBe(true);
    expect(isNewerSemver('1.1.1', '1.1.0')).toBe(true);
    expect(isNewerSemver('2.0.0', '1.9.9')).toBe(true);
    expect(isNewerSemver('1.1.0', '1.1.0')).toBe(false);
    expect(isNewerSemver('1.0.9', '1.1.0')).toBe(false);
  });
});
