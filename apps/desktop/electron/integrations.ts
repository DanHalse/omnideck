import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { BrowserWindow, nativeImage } from 'electron';
import {
  cleanTrackAndArtist,
  type DesktopSnapshot,
  type IntegrationsConfig,
  type NowPlayingState,
} from '@omnideck/shared';

function makeSvgIcon(svgBody: string, color = '#FFFFFF'): Electron.NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${color}">${svgBody}</svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

const THUMBAR_ICONS = {
  prev: () =>
    makeSvgIcon('<path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/>'),
  play: () =>
    makeSvgIcon('<path d="M8 5v14l11-7z"/>'),
  pause: () =>
    makeSvgIcon('<path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/>'),
  next: () =>
    makeSvgIcon('<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>'),
  like: () =>
    makeSvgIcon('<path d="M2 20h4V9H2v11zm20-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 0 6.59 6.59C6.22 6.95 6 7.45 6 8v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>', '#E87A3E'),
};

/**
 * Wires native Windows Taskbar Thumbnail Media Controls (Previous, Play/Pause, Next, Thumbs Up)
 * when hovering over OmniDeck in the taskbar.
 */
export class TaskbarControlsManager {
  private lastKey = '';
  private icons: {
    prev: Electron.NativeImage;
    play: Electron.NativeImage;
    pause: Electron.NativeImage;
    next: Electron.NativeImage;
    like: Electron.NativeImage;
  } | null = null;

  update(
    win: BrowserWindow | null,
    np: NowPlayingState,
    onAction: (action: 'previous' | 'play-pause' | 'next' | 'like-track') => void,
  ): void {
    if (process.platform !== 'win32' || !win || win.isDestroyed()) return;
    const key = `${np.playing ? '1' : '0'}:${np.serviceId ?? ''}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    try {
      if (!this.icons) {
        this.icons = {
          prev: THUMBAR_ICONS.prev(),
          play: THUMBAR_ICONS.play(),
          pause: THUMBAR_ICONS.pause(),
          next: THUMBAR_ICONS.next(),
          like: THUMBAR_ICONS.like(),
        };
      }
      const hasMedia = Boolean(np.serviceId);
      const buttons: Electron.ThumbarButton[] = [
        {
          tooltip: 'Previous Track',
          icon: this.icons.prev,
          flags: hasMedia ? [] : ['disabled'],
          click: () => onAction('previous'),
        },
        {
          tooltip: np.playing ? 'Pause' : 'Play',
          icon: np.playing ? this.icons.pause : this.icons.play,
          flags: hasMedia ? [] : ['disabled'],
          click: () => onAction('play-pause'),
        },
        {
          tooltip: 'Next Track',
          icon: this.icons.next,
          flags: hasMedia ? [] : ['disabled'],
          click: () => onAction('next'),
        },
        {
          tooltip: 'Thumbs Up / Like Track',
          icon: this.icons.like,
          flags: hasMedia ? [] : ['disabled'],
          click: () => onAction('like-track'),
        },
      ];
      win.setThumbarButtons(buttons);
    } catch {
      // Ignore on unsupported Windows shells
    }
  }
}

/**
 * Lightweight zero-dependency Discord Rich Presence + ListenBrainz + Last.fm Scrobbler.
 */
export class IntegrationsManager {
  private config: IntegrationsConfig;
  private discordSocket: net.Socket | null = null;
  private discordReady = false;
  private discordConnecting = false;
  private lastDiscordKey = '';
  private lastDiscordRetryAt = 0;

  // Scrobble session state
  private activeTrackKey = '';
  private activeTrackStartedAt = 0;
  private activeTrackPlayedSec = 0;
  private lastTickAt = 0;
  private scrobbledCurrent = false;
  private lastNowPlayingSentKey = '';

  constructor(initialConfig: IntegrationsConfig) {
    this.config = initialConfig;
  }

  updateConfig(next: IntegrationsConfig): void {
    const discordWasEnabled = this.config.discordRpcEnabled;
    const clientChanged = this.config.discordClientId !== next.discordClientId;
    this.config = next;

    if ((!next.discordRpcEnabled && discordWasEnabled) || clientChanged) {
      this.disconnectDiscord();
      this.lastDiscordKey = '';
    }
  }

  onSnapshot(snapshot: DesktopSnapshot): void {
    const np = snapshot.nowPlaying;
    this.syncDiscord(snapshot);
    this.syncScrobblers(np);
  }

  dispose(): void {
    this.disconnectDiscord();
  }

  private getDiscordPipePaths(): string[] {
    if (process.platform === 'win32') {
      return Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`);
    }
    const baseDirs = [
      process.env.XDG_RUNTIME_DIR,
      process.env.TMPDIR,
      process.env.TMP,
      os.tmpdir(),
      '/tmp',
    ].filter((d): d is string => Boolean(d));
    const paths: string[] = [];
    for (const dir of baseDirs) {
      for (let i = 0; i < 4; i++) {
        paths.push(path.join(dir, `discord-ipc-${i}`));
        paths.push(path.join(dir, 'app', 'com.discordapp.Discord', `discord-ipc-${i}`));
      }
    }
    return Array.from(new Set(paths));
  }

  private encodeDiscordFrame(op: number, payload: unknown): Buffer {
    const json = Buffer.from(JSON.stringify(payload), 'utf8');
    const header = Buffer.alloc(8);
    header.writeInt32LE(op, 0);
    header.writeInt32LE(json.length, 4);
    return Buffer.concat([header, json]);
  }

  private connectDiscord(): void {
    if (this.discordConnecting || this.discordSocket || !this.config.discordRpcEnabled) return;
    const now = Date.now();
    if (now - this.lastDiscordRetryAt < 15_000) return;
    this.lastDiscordRetryAt = now;
    this.discordConnecting = true;

    const candidates = this.getDiscordPipePaths();
    const tryIndex = (idx: number) => {
      if (idx >= candidates.length || !this.config.discordRpcEnabled) {
        this.discordConnecting = false;
        return;
      }
      const sock = net.createConnection(candidates[idx]);
      let settled = false;
      sock.once('connect', () => {
        settled = true;
        this.discordConnecting = false;
        this.discordSocket = sock;
        this.discordReady = false;
        try {
          sock.write(
            this.encodeDiscordFrame(0, {
              v: 1,
              client_id: this.config.discordClientId,
            }),
          );
        } catch {
          this.disconnectDiscord();
        }
      });
      sock.on('data', (chunk) => {
        if (!this.discordReady && chunk.length >= 8) {
          this.discordReady = true;
          this.lastDiscordKey = '';
        }
      });
      sock.on('error', () => {
        if (!settled) {
          settled = true;
          sock.destroy();
          tryIndex(idx + 1);
        } else {
          this.disconnectDiscord();
        }
      });
      sock.on('close', () => {
        if (this.discordSocket === sock) {
          this.discordSocket = null;
          this.discordReady = false;
        }
      });
    };

    tryIndex(0);
  }

  private disconnectDiscord(): void {
    this.discordReady = false;
    this.discordConnecting = false;
    if (this.discordSocket) {
      try {
        this.discordSocket.end();
        this.discordSocket.destroy();
      } catch {}
      this.discordSocket = null;
    }
  }

  private syncDiscord(snapshot: DesktopSnapshot): void {
    if (!this.config.discordRpcEnabled) return;
    if (!this.discordSocket) {
      this.connectDiscord();
      return;
    }
    if (!this.discordReady) return;

    const np = snapshot.nowPlaying;
    const svc = np.serviceId
      ? snapshot.config.services.find((s) => s.id === np.serviceId)
      : undefined;

    const key = `${np.serviceId ?? ''}|${np.playing ? '1' : '0'}|${np.title}|${np.artist ?? ''}`;
    if (key === this.lastDiscordKey) return;
    this.lastDiscordKey = key;

    const isMusic = np.serviceId === 'youtube-music' || np.serviceId === 'spotify';
    const activity =
      np.serviceId && np.title && np.playing
        ? {
            type: isMusic ? 2 : 3, // 2 = Listening, 3 = Watching
            details: np.title.slice(0, 120),
            state: (np.artist || svc?.name || 'OmniDeck').slice(0, 120),
            timestamps:
              typeof np.currentTimeSec === 'number'
                ? {
                    start: Math.floor(Date.now() / 1000 - np.currentTimeSec),
                    ...(typeof np.durationSec === 'number' && np.durationSec > np.currentTimeSec
                      ? { end: Math.floor(Date.now() / 1000 + (np.durationSec - np.currentTimeSec)) }
                      : {}),
                  }
                : undefined,
            assets: {
              large_image: np.artworkUrl || 'omnideck',
              large_text: `${svc?.name ?? 'OmniDeck'} · via OmniDeck`,
            },
          }
        : null;

    try {
      this.discordSocket.write(
        this.encodeDiscordFrame(1, {
          cmd: 'SET_ACTIVITY',
          args: {
            pid: process.pid,
            activity,
          },
          nonce: `od-${Date.now()}`,
        }),
      );
    } catch {
      this.disconnectDiscord();
    }
  }

  private syncScrobblers(np: NowPlayingState): void {
    const hasLb = Boolean(this.config.listenBrainzToken);
    const hasLfm = Boolean(
      this.config.lastFmApiKey && this.config.lastFmApiSecret && this.config.lastFmSessionKey,
    );
    if (!hasLb && !hasLfm) return;
    if (np.serviceId !== 'youtube-music' && np.serviceId !== 'spotify') return;
    if (!np.title) return;

    const cleaned = cleanTrackAndArtist(np.title, np.artist);
    const track = cleaned.track || np.title.trim();
    const artist = cleaned.artist || np.artist?.trim() || '';
    if (!track || !artist) return;

    const trackKey = `${artist.toLowerCase()}::${track.toLowerCase()}`;
    const now = Date.now();

    if (trackKey !== this.activeTrackKey) {
      this.activeTrackKey = trackKey;
      this.activeTrackStartedAt = Math.floor(now / 1000);
      this.activeTrackPlayedSec = 0;
      this.lastTickAt = now;
      this.scrobbledCurrent = false;
    } else if (np.playing && this.lastTickAt > 0) {
      const delta = Math.min(10, Math.max(0, (now - this.lastTickAt) / 1000));
      this.activeTrackPlayedSec += delta;
      this.lastTickAt = now;
    } else {
      this.lastTickAt = now;
    }

    if (np.playing && this.lastNowPlayingSentKey !== trackKey) {
      this.lastNowPlayingSentKey = trackKey;
      if (hasLb) void this.postListenBrainz('playing_now', artist, track, np.album);
      if (hasLfm) void this.postLastFm('track.updateNowPlaying', artist, track, np.album);
    }

    const duration = typeof np.durationSec === 'number' && np.durationSec > 30 ? np.durationSec : 180;
    const threshold = Math.min(240, Math.max(30, duration * 0.5));
    if (!this.scrobbledCurrent && this.activeTrackPlayedSec >= threshold) {
      this.scrobbledCurrent = true;
      if (hasLb) {
        void this.postListenBrainz(
          'single',
          artist,
          track,
          np.album,
          this.activeTrackStartedAt,
        );
      }
      if (hasLfm) {
        void this.postLastFm(
          'track.scrobble',
          artist,
          track,
          np.album,
          this.activeTrackStartedAt,
        );
      }
    }
  }

  private async postListenBrainz(
    listenType: 'playing_now' | 'single',
    artist: string,
    track: string,
    album?: string,
    listenedAt?: number,
  ): Promise<void> {
    try {
      const payloadItem: Record<string, unknown> = {
        track_metadata: {
          artist_name: artist,
          track_name: track,
          ...(album ? { release_name: album } : {}),
          additional_info: {
            submission_client: 'OmniDeck',
          },
        },
      };
      if (listenType === 'single' && listenedAt) {
        payloadItem.listened_at = listenedAt;
      }
      await fetch('https://api.listenbrainz.org/1/submit-listens', {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.config.listenBrainzToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listen_type: listenType,
          payload: [payloadItem],
        }),
      });
    } catch {
      // Quietly ignore transient network errors
    }
  }

  private async postLastFm(
    method: 'track.updateNowPlaying' | 'track.scrobble',
    artist: string,
    track: string,
    album?: string,
    timestamp?: number,
  ): Promise<void> {
    try {
      const params: Record<string, string> = {
        method,
        api_key: this.config.lastFmApiKey,
        sk: this.config.lastFmSessionKey,
        artist,
        track,
      };
      if (album) params.album = album;
      if (method === 'track.scrobble' && timestamp) {
        params.timestamp = String(timestamp);
      }
      const sigBase =
        Object.keys(params)
          .sort()
          .map((k) => `${k}${params[k]}`)
          .join('') + this.config.lastFmApiSecret;
      params.api_sig = crypto.createHash('md5').update(sigBase, 'utf8').digest('hex');
      params.format = 'json';

      const body = new URLSearchParams(params);
      await fetch('https://ws.audioscrobbler.com/2.0/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch {
      // Quietly ignore transient network errors
    }
  }
}
