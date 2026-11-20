import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  createDefaultConfig,
  mergePersistedConfig,
  type PersistedConfig,
} from '@omnideck/shared';

export class ConfigStore {
  private readonly filePath: string;
  private config: PersistedConfig;

  constructor(customPath?: string) {
    this.filePath = customPath ?? path.join(app.getPath('userData'), 'omnideck-config.json');
    this.config = this.readFromDisk();
  }

  get(): PersistedConfig {
    return this.config;
  }

  set(next: PersistedConfig): PersistedConfig {
    this.config = next;
    this.writeToDisk(next);
    return this.config;
  }

  reset(): PersistedConfig {
    return this.set(createDefaultConfig());
  }

  private readFromDisk(): PersistedConfig {
    try {
      if (!fs.existsSync(this.filePath)) {
        const defaults = createDefaultConfig();
        this.writeToDisk(defaults);
        return defaults;
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return mergePersistedConfig(JSON.parse(raw));
    } catch {
      return createDefaultConfig();
    }
  }

  private writeToDisk(data: PersistedConfig): void {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmpPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.error('[OmniDeck] Failed to persist config:', err);
    }
  }
}
