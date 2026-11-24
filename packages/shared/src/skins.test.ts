import { describe, expect, it } from 'vitest';
import {
  buildMobilePowerUpsScript,
  buildUnifiedSkinCss,
  createDefaultConfig,
  DEFAULT_POWER_UPS,
  isArtistWhitelisted,
  mergePersistedConfig,
  rewriteUrlForPowerUps,
  setTwitchMultiStreamChannels,
  SKIN_PRESET_LIST,
  whitelistArtist,
} from './index.js';

describe('Unified Skin Engine & Phase 1–3 Shared Logic', () => {
  it('generates valid per-app CSS across all 5 skin presets and 6 services', () => {
    const services = ['youtube', 'youtube-music', 'spotify', 'twitch', 'reddit', 'audible'];
    for (const preset of SKIN_PRESET_LIST) {
      for (const svc of services) {
        const css = buildUnifiedSkinCss(svc, preset.id, DEFAULT_POWER_UPS);
        expect(css.length).toBeGreaterThan(40);
      }
    }

    // Audible Dark Mode activates on dark skins
    const audibleDark = buildUnifiedSkinCss('audible', 'oled', DEFAULT_POWER_UPS);
    expect(audibleDark).toContain('OmniDeck Native Dark Mode for Audible');

    // Reddit Apollo-style color-coded depth bars activate
    const redditCss = buildUnifiedSkinCss('reddit', 'catppuccin', DEFAULT_POWER_UPS);
    expect(redditCss).toContain('shreddit-comment[depth="1"]');

    // YouTube Music Soft Daylight theme activates on daylight skin
    const ytmLight = buildUnifiedSkinCss('youtube-music', 'daylight', DEFAULT_POWER_UPS);
    expect(ytmLight).toContain('Soft Daylight Theme');
  });

  it('produces syntactically valid JS in buildMobilePowerUpsScript across all services and skins', () => {
    const services = ['youtube', 'youtube-music', 'spotify', 'twitch', 'reddit', 'audible'];
    for (const svc of services) {
      const script = buildMobilePowerUpsScript(svc, DEFAULT_POWER_UPS, 'nord');
      expect(() => new Function(script)).not.toThrow();
    }
  });

  it('handles YouTube Start-on-Subscriptions and Twitch Followed-First URL rewrites safely', () => {
    const pu = { ...DEFAULT_POWER_UPS, youtubeStartOnSubscriptions: true, twitchFollowedFirstMobile: true };
    expect(rewriteUrlForPowerUps('youtube', 'https://www.youtube.com/', pu)).toBe(
      'https://www.youtube.com/feed/subscriptions',
    );
    expect(rewriteUrlForPowerUps('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', pu)).toBeNull();
    expect(rewriteUrlForPowerUps('twitch', 'https://m.twitch.tv/', pu)).toBe(
      'https://m.twitch.tv/directory/following/live',
    );
    // Auth endpoints are never rewritten
    expect(rewriteUrlForPowerUps('youtube', 'https://accounts.google.com/signin', pu)).toBeNull();
  });

  it('hydrates skin, anti-slop whitelist, and Twitch multi-stream channels cleanly', () => {
    let cfg = createDefaultConfig();
    cfg = whitelistArtist(cfg, 'Indie Human Band');
    cfg = setTwitchMultiStreamChannels(cfg, ['esl_cs', '@Caedrel', 'invalid channel!', 'shroud']);

    expect(isArtistWhitelisted(cfg.settings.whitelistedArtists, 'indie human band')).toBe(true);
    expect(cfg.settings.twitchMultiStreamChannels).toEqual(['esl_cs', 'caedrel', 'shroud']);

    const roundTrip = mergePersistedConfig({
      ...cfg,
      settings: { ...cfg.settings, skin: 'catppuccin', autoSkipAiSlop: true },
    });
    expect(roundTrip.settings.skin).toBe('catppuccin');
    expect(roundTrip.settings.theme).toBe('dark');
    expect(roundTrip.settings.autoSkipAiSlop).toBe(true);
    expect(roundTrip.settings.whitelistedArtists).toContain('Indie Human Band');
    expect(roundTrip.settings.twitchMultiStreamChannels).toEqual(['esl_cs', 'caedrel', 'shroud']);
  });
});
