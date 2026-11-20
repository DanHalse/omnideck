import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  cleanTrackAndArtist,
  computeListeningStatsSummary,
  type ListeningEntry,
  type ListeningStatsSummary,
} from '@omnideck/shared';

const MAX_STORED_ENTRIES = 5000;
const TRACKED_SERVICES = new Set(['youtube-music', 'spotify', 'audible', 'youtube']);

interface ActiveSession {
  serviceId: string;
  key: string;
  entryId: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  url?: string;
  startedAt: number;
  durationSec: number;
  lastTickAt: number;
  persisted: boolean;
}

export class ListeningStatsStore {
  private readonly filePath: string;
  private entries: ListeningEntry[] = [];
  private activeSessions = new Map<string, ActiveSession>();
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(customPath?: string) {
    this.filePath =
      customPath ?? path.join(app.getPath('userData'), 'omnideck-listening-stats.json');
    this.entries = this.readFromDisk();
  }

  /**
   * Called periodically while a service is actively playing audio to accumulate listening time.
   */
  recordPlaybackTick(input: {
    serviceId: string;
    title: string;
    artist?: string;
    album?: string;
    artworkUrl?: string;
    url?: string;
    deltaSec: number;
    nowMs?: number;
  }): void {
    if (!TRACKED_SERVICES.has(input.serviceId)) return;
    const now = input.nowMs ?? Date.now();
    const cleaned = cleanTrackAndArtist(input.title, input.artist);
    const title = (cleaned.track || input.title || '').trim();
    const artist = (cleaned.artist || input.artist || '').trim();
    if (!title || title.toLowerCase() === input.serviceId) return;

    // Skip generic homepage titles
    if (/^(youtube music|spotify|audible|youtube)$/i.test(title)) return;

    const key = `${input.serviceId}::${title.toLowerCase()}::${artist.toLowerCase()}`;
    const existing = this.activeSessions.get(input.serviceId);

    if (existing && existing.key === key && now - existing.lastTickAt < 90_000) {
      existing.durationSec += Math.max(1, Math.min(30, Math.round(input.deltaSec)));
      existing.lastTickAt = now;
      if (input.artworkUrl && !existing.artworkUrl) existing.artworkUrl = input.artworkUrl;
      if (input.url) existing.url = input.url;

      if (existing.durationSec >= 12) {
        this.upsertEntry(existing);
      }
      return;
    }

    // Flush previous session if any, then start a new one
    if (existing && existing.durationSec >= 12) {
      this.upsertEntry(existing);
    }

    const session: ActiveSession = {
      serviceId: input.serviceId,
      key,
      entryId: `play-${now}-${Math.random().toString(36).slice(2, 7)}`,
      title: title.slice(0, 120),
      artist: (artist || input.serviceId).slice(0, 100),
      album: input.album?.slice(0, 100),
      artworkUrl: input.artworkUrl,
      url: input.url,
      startedAt: now,
      durationSec: Math.max(1, Math.min(30, Math.round(input.deltaSec))),
      lastTickAt: now,
      persisted: false,
    };
    this.activeSessions.set(input.serviceId, session);
    if (session.durationSec >= 12) {
      this.upsertEntry(session);
    }
  }

  getSummary(): ListeningStatsSummary {
    return computeListeningStatsSummary(this.entries);
  }

  clear(): ListeningStatsSummary {
    this.entries = [];
    this.activeSessions.clear();
    this.writeToDiskNow();
    return this.getSummary();
  }

  flush(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
      this.writeToDiskNow();
    }
  }

  private upsertEntry(session: ActiveSession): void {
    const idx = this.entries.findIndex((e) => e.id === session.entryId);
    const record: ListeningEntry = {
      id: session.entryId,
      serviceId: session.serviceId,
      title: session.title,
      artist: session.artist,
      album: session.album,
      artworkUrl: session.artworkUrl,
      url: session.url,
      startedAt: session.startedAt,
      durationSec: session.durationSec,
    };

    if (idx >= 0) {
      this.entries[idx] = record;
    } else {
      this.entries.push(record);
      if (this.entries.length > MAX_STORED_ENTRIES) {
        this.entries = this.entries.slice(-MAX_STORED_ENTRIES);
      }
    }
    session.persisted = true;
    this.scheduleWrite();
  }

  private scheduleWrite(): void {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.writeToDiskNow();
    }, 8000);
  }

  private readFromDisk(): ListeningEntry[] {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as unknown;
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((item): item is ListeningEntry => {
          return Boolean(
            item &&
              typeof item === 'object' &&
              typeof (item as ListeningEntry).id === 'string' &&
              typeof (item as ListeningEntry).title === 'string' &&
              typeof (item as ListeningEntry).durationSec === 'number',
          );
        })
        .slice(-MAX_STORED_ENTRIES);
    } catch {
      return [];
    }
  }

  private writeToDiskNow(): void {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.entries), 'utf-8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.warn('[OmniDeck] Failed to persist listening stats:', err);
    }
  }
}
