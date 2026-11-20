import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => os.tmpdir(),
  },
}));

import { ConfigStore } from './store';

describe('ConfigStore atomic disk persistence', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates default config on first boot and persists updates atomically', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnideck-store-'));
    tempDirs.push(dir);
    const file = path.join(dir, 'omnideck-config.json');

    const store1 = new ConfigStore(file);
    expect(store1.get().services).toHaveLength(6);
    expect(fs.existsSync(file)).toBe(true);

    store1.set({
      ...store1.get(),
      activeServiceId: 'audible',
      settings: {
        ...store1.get().settings,
        navPosition: 'left',
        theme: 'light',
      },
    });

    const store2 = new ConfigStore(file);
    expect(store2.get().activeServiceId).toBe('audible');
    expect(store2.get().settings.navPosition).toBe('left');
    expect(store2.get().settings.theme).toBe('light');
  });

  it('recovers cleanly from corrupted JSON on disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnideck-corrupt-'));
    tempDirs.push(dir);
    const file = path.join(dir, 'omnideck-config.json');
    fs.writeFileSync(file, '{not valid json', 'utf-8');

    const store = new ConfigStore(file);
    expect(store.get().services).toHaveLength(6);
    expect(store.get().activeServiceId).toBe('youtube');
  });
});
