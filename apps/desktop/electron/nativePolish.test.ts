import { describe, expect, it } from 'vitest';
import {
  buildMobilePowerUpsScript,
  DEFAULT_EQUALIZER_CONFIG,
  DEFAULT_POWER_UPS,
} from '@omnideck/shared';
import { buildDuckFactorScript, buildEqualizerScript } from './audioEngine.js';
import { buildMediaControlScript } from './mediaScripts.js';
import { buildSetVolumeScript, READ_MEDIA_METADATA_SCRIPT } from './nativePolish.js';
import {
  buildAudiblePowerUpScript,
  buildDeArrowInjector,
  buildRedditPowerUpScript,
  buildRestoreHibernateStateScript,
  buildSponsorSegmentsInjector,
  buildSpotifyPowerUpScript,
  buildTwitchEmotesInjector,
  buildTwitchPowerUpScript,
  buildYouTubeDislikesInjector,
  buildYouTubePowerUpScript,
  CAPTURE_HIBERNATE_STATE_SCRIPT,
} from './powerUps.js';

describe('injected browser scripts syntax validation', () => {
  it('parses READ_MEDIA_METADATA_SCRIPT and all injected scripts without SyntaxError', () => {
    const scripts: Array<[string, string]> = [
      ['READ_MEDIA_METADATA_SCRIPT', READ_MEDIA_METADATA_SCRIPT],
      ['buildSetVolumeScript', buildSetVolumeScript(0.8)],
      ['buildDuckFactorScript', buildDuckFactorScript(0.2, 300)],
      ['buildEqualizerScript(default)', buildEqualizerScript(DEFAULT_EQUALIZER_CONFIG)],
      [
        'buildEqualizerScript(compressor+boost)',
        buildEqualizerScript({
          ...DEFAULT_EQUALIZER_CONFIG,
          enabled: true,
          compressorEnabled: true,
          volumeBoost: 1.75,
        }),
      ],
      ['buildMediaControlScript(play-pause)', buildMediaControlScript('play-pause')],
      ['buildMediaControlScript(like-track)', buildMediaControlScript('like-track')],
      ['buildMediaControlScript(dislike-track)', buildMediaControlScript('dislike-track')],
      ['buildYouTubePowerUpScript(youtube)', buildYouTubePowerUpScript('youtube', DEFAULT_POWER_UPS)],
      [
        'buildYouTubePowerUpScript(youtube-music)',
        buildYouTubePowerUpScript('youtube-music', {
          ...DEFAULT_POWER_UPS,
          ytmAudioOnlyMode: true,
        }),
      ],
      ['buildYouTubeDislikesInjector', buildYouTubeDislikesInjector('dQw4w9WgXcQ', 12000, 340)],
      ['buildDeArrowInjector', buildDeArrowInjector('dQw4w9WgXcQ', 'Rick Astley - Never Gonna Give You Up')],
      ['buildTwitchPowerUpScript', buildTwitchPowerUpScript(DEFAULT_POWER_UPS)],
      [
        'buildRedditPowerUpScript',
        buildRedditPowerUpScript({
          ...DEFAULT_POWER_UPS,
          redditFilteredKeywords: ['spoiler', 'r/politics'],
        }),
      ],
      ['buildSpotifyPowerUpScript', buildSpotifyPowerUpScript(DEFAULT_POWER_UPS)],
      ['buildAudiblePowerUpScript', buildAudiblePowerUpScript(DEFAULT_POWER_UPS)],
      ['CAPTURE_HIBERNATE_STATE_SCRIPT', CAPTURE_HIBERNATE_STATE_SCRIPT],
      ['buildRestoreHibernateStateScript', buildRestoreHibernateStateScript(120, 45)],
      ['buildSponsorSegmentsInjector', buildSponsorSegmentsInjector('abc123', [])],
      ['buildTwitchEmotesInjector', buildTwitchEmotesInjector({ KEKW: 'https://cdn.7tv.app/emote/1/1x.webp' })],
      ['buildMobilePowerUpsScript(reddit)', buildMobilePowerUpsScript('reddit', DEFAULT_POWER_UPS)],
      ['buildMobilePowerUpsScript(spotify)', buildMobilePowerUpsScript('spotify', DEFAULT_POWER_UPS)],
      ['buildMobilePowerUpsScript(youtube)', buildMobilePowerUpsScript('youtube', DEFAULT_POWER_UPS)],
      ['buildMobilePowerUpsScript(youtube-music)', buildMobilePowerUpsScript('youtube-music', DEFAULT_POWER_UPS)],
    ];

    for (const [name, script] of scripts) {
      expect(() => new Function(script), `${name} must be valid JS`).not.toThrow();
    }
  });
});

