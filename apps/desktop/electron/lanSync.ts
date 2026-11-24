import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import type {
  BlockedMusicEntry,
  BookNoteEntry,
  HandoffPayload,
  LanSyncStatus,
  PersistedConfig,
  PinnedFavorite,
  PowerUpsConfig,
  SkinPresetId,
} from '@omnideck/shared';
import { APP_VERSION } from '@omnideck/shared';

export interface LanSyncBundle {
  version: string;
  deviceName: string;
  syncedAt: number;
  skin: SkinPresetId;
  powerUps: PowerUpsConfig;
  blockedMusic: BlockedMusicEntry[];
  autoSkipAiSlop: boolean;
  whitelistedArtists: string[];
  bookNotes: BookNoteEntry[];
  pinnedFavorites: PinnedFavorite[];
  twitchMultiStreamChannels: string[];
}

export interface LanSyncCallbacks {
  getConfig: () => PersistedConfig;
  getCurrentHandoff: () => HandoffPayload | null;
  onMergeIncomingBundle: (bundle: Partial<LanSyncBundle>, peerName?: string) => void;
  onIncomingHandoff: (payload: HandoffPayload) => void;
  onStatusChanged: () => void;
}

const DEFAULT_PORT = 47831;
const MAX_BODY_BYTES = 512 * 1024;

function generatePin(): string {
  const num = crypto.randomInt(100000, 999999);
  return String(num);
}

function resolvePrimaryLanIpv4(): string {
  const nets = os.networkInterfaces();
  const candidates: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family === 'IPv4' && !net.internal) {
        candidates.push(net.address);
      }
    }
  }
  const preferred =
    candidates.find((ip) => ip.startsWith('192.168.')) ??
    candidates.find((ip) => ip.startsWith('10.')) ??
    candidates.find((ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) ??
    candidates[0] ??
    '127.0.0.1';
  return preferred;
}

/**
 * Zero-cloud Local Wi-Fi Sync & Playback Handoff server for PC ↔ Android OmniDeck pairing.
 * Authenticated via a 6-digit pairing PIN; binds to the user's LAN only while enabled.
 */
export class LanSyncServer {
  private server: http.Server | null = null;
  private pin: string = generatePin();
  private host: string = resolvePrimaryLanIpv4();
  private port: number = DEFAULT_PORT;
  private lastSyncedAt: number | undefined;
  private lastPeerName: string | undefined;

  constructor(private readonly callbacks: LanSyncCallbacks) {}

  getStatus(): LanSyncStatus {
    const running = Boolean(this.server && this.server.listening);
    return {
      running,
      host: this.host,
      port: this.port,
      pin: this.pin,
      pairingUrl: `http://${this.host}:${this.port}`,
      lastSyncedAt: this.lastSyncedAt,
      lastPeerName: this.lastPeerName,
    };
  }

  regeneratePin(): LanSyncStatus {
    this.pin = generatePin();
    this.callbacks.onStatusChanged();
    return this.getStatus();
  }

  async start(): Promise<LanSyncStatus> {
    if (this.server && this.server.listening) {
      return this.getStatus();
    }
    this.host = resolvePrimaryLanIpv4();

    const tryListen = (port: number): Promise<number> =>
      new Promise((resolve, reject) => {
        const srv = http.createServer((req, res) => {
          void this.handleRequest(req, res);
        });
        srv.once('error', (err) => {
          reject(err);
        });
        srv.listen(port, '0.0.0.0', () => {
          this.server = srv;
          const addr = srv.address();
          const boundPort = typeof addr === 'object' && addr ? addr.port : port;
          resolve(boundPort);
        });
      });

    try {
      this.port = await tryListen(DEFAULT_PORT);
    } catch {
      this.port = await tryListen(0);
    }

    this.callbacks.onStatusChanged();
    return this.getStatus();
  }

  async stop(): Promise<LanSyncStatus> {
    if (!this.server) return this.getStatus();
    const srv = this.server;
    this.server = null;
    await new Promise<void>((resolve) => {
      srv.close(() => resolve());
    });
    this.callbacks.onStatusChanged();
    return this.getStatus();
  }

  private isAuthorized(req: http.IncomingMessage, url: URL): boolean {
    const headerPin = String(req.headers['x-omnideck-pin'] ?? '').trim();
    const queryPin = (url.searchParams.get('pin') ?? '').trim();
    const supplied = headerPin || queryPin;
    if (!supplied || supplied.length !== this.pin.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(this.pin));
    } catch {
      return false;
    }
  }

  private writeJson(res: http.ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-omnideck-pin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'no-store',
    });
    res.end(payload);
  }

  private readJsonBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      req.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_BODY_BYTES) {
          reject(new Error('Payload too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8').trim();
          resolve(text ? JSON.parse(text) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  private buildExportBundle(): LanSyncBundle {
    const cfg = this.callbacks.getConfig();
    return {
      version: APP_VERSION,
      deviceName: os.hostname() || 'OmniDeck Desktop',
      syncedAt: Date.now(),
      skin: cfg.settings.skin,
      powerUps: cfg.settings.powerUps,
      blockedMusic: cfg.settings.blockedMusic ?? [],
      autoSkipAiSlop: Boolean(cfg.settings.autoSkipAiSlop),
      whitelistedArtists: cfg.settings.whitelistedArtists ?? [],
      bookNotes: cfg.settings.bookNotes ?? [],
      pinnedFavorites: cfg.pinnedFavorites ?? [],
      twitchMultiStreamChannels: cfg.settings.twitchMultiStreamChannels ?? [],
    };
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') {
      this.writeJson(res, 200, { ok: true });
      return;
    }

    const url = new URL(req.url || '/', `http://${this.host}:${this.port}`);

    if (req.method === 'GET' && url.pathname === '/api/info') {
      this.writeJson(res, 200, {
        app: 'OmniDeck',
        version: APP_VERSION,
        deviceName: os.hostname() || 'OmniDeck Desktop',
        requiresPin: true,
      });
      return;
    }

    if (!this.isAuthorized(req, url)) {
      this.writeJson(res, 401, { error: 'Invalid or missing 6-digit OmniDeck pairing PIN.' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/sync') {
      this.lastSyncedAt = Date.now();
      this.lastPeerName = (url.searchParams.get('device') || 'Android').slice(0, 48);
      this.callbacks.onStatusChanged();
      this.writeJson(res, 200, {
        bundle: this.buildExportBundle(),
        handoff: this.callbacks.getCurrentHandoff(),
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/sync') {
      try {
        const body = (await this.readJsonBody(req)) as Partial<LanSyncBundle> & { deviceName?: string };
        this.lastSyncedAt = Date.now();
        this.lastPeerName = (body.deviceName || 'Android').slice(0, 48);
        this.callbacks.onMergeIncomingBundle(body, this.lastPeerName);
        this.callbacks.onStatusChanged();
        this.writeJson(res, 200, { ok: true, bundle: this.buildExportBundle() });
      } catch (err) {
        this.writeJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid JSON' });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/handoff') {
      const handoff = this.callbacks.getCurrentHandoff();
      this.writeJson(res, 200, { handoff });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/handoff') {
      try {
        const body = (await this.readJsonBody(req)) as Partial<HandoffPayload>;
        if (!body.serviceId || !body.url || !/^https?:\/\//i.test(body.url)) {
          this.writeJson(res, 400, { error: 'Missing valid serviceId and url.' });
          return;
        }
        const payload: HandoffPayload = {
          serviceId: String(body.serviceId).slice(0, 40),
          url: String(body.url).slice(0, 1024),
          title: body.title ? String(body.title).slice(0, 140) : undefined,
          positionSec:
            typeof body.positionSec === 'number' && Number.isFinite(body.positionSec) && body.positionSec >= 0
              ? Math.floor(body.positionSec)
              : undefined,
          sentAt: Date.now(),
          fromDevice: body.fromDevice ? String(body.fromDevice).slice(0, 48) : 'Android',
        };
        this.lastSyncedAt = Date.now();
        this.lastPeerName = payload.fromDevice;
        this.callbacks.onIncomingHandoff(payload);
        this.callbacks.onStatusChanged();
        this.writeJson(res, 200, { ok: true });
      } catch (err) {
        this.writeJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid JSON' });
      }
      return;
    }

    this.writeJson(res, 404, { error: 'Not found' });
  }
}
