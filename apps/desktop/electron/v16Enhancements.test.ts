import { describe, expect, it } from 'vitest';
import { DEFAULT_POWER_UPS } from '@omnideck/shared';
import { buildV16EnhancementsScript } from './powerUps.js';
import { LanSyncServer } from './lanSync.js';
import { createDefaultConfig } from '@omnideck/shared';

describe('Phase 1–3 Desktop Enhancements & LAN Sync', () => {
  it('generates syntactically valid JS for all 6 services in buildV16EnhancementsScript', () => {
    const services = ['youtube', 'youtube-music', 'spotify', 'twitch', 'reddit', 'audible'];
    for (const svc of services) {
      const code = buildV16EnhancementsScript(svc, {
        ...DEFAULT_POWER_UPS,
        youtubeBlockedChannels: ['SpamChannel'],
        twitchChatHighlights: ['omnideck', '@dan'],
      });
      expect(code.length).toBeGreaterThan(100);
      expect(() => new Function(code)).not.toThrow();
    }
  });

  it('starts and stops LanSyncServer and enforces 6-digit PIN auth on /api/sync', async () => {
    const cfg = createDefaultConfig();
    const srv = new LanSyncServer({
      getConfig: () => cfg,
      getCurrentHandoff: () => ({
        serviceId: 'youtube',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Test Video',
        positionSec: 42,
        sentAt: Date.now(),
      }),
      onMergeIncomingBundle: () => {},
      onIncomingHandoff: () => {},
      onStatusChanged: () => {},
    });

    const status = await srv.start();
    try {
      expect(status.running).toBe(true);
      expect(status.pin).toMatch(/^\d{6}$/);

      // Unauthenticated request must be rejected with 401
      const unauth = await fetch(`http://127.0.0.1:${status.port}/api/sync`);
      expect(unauth.status).toBe(401);

      // Authenticated request succeeds with skin + handoff
      const authed = await fetch(`http://127.0.0.1:${status.port}/api/sync?pin=${status.pin}`);
      expect(authed.status).toBe(200);
      const json = (await authed.json()) as {
        bundle: { skin: string };
        handoff: { serviceId: string; positionSec: number };
      };
      expect(json.bundle.skin).toBe('obsidian');
      expect(json.handoff.serviceId).toBe('youtube');
      expect(json.handoff.positionSec).toBe(42);
    } finally {
      await srv.stop();
    }
  });
});
