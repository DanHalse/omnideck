import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUALIZER_CONFIG, DEFAULT_POWER_UPS } from '@omnideck/shared';
import { buildDuckFactorScript, buildEqualizerScript } from './audioEngine.js';
import { buildMediaControlScript } from './mediaScripts.js';
import { buildSetVolumeScript, READ_MEDIA_METADATA_SCRIPT } from './nativePolish.js';
import {
  buildRedditPowerUpScript,
  buildRestoreHibernateStateScript,
  buildSponsorSegmentsInjector,
  buildTwitchEmotesInjector,
  buildTwitchPowerUpScript,
  buildYouTubePowerUpScript,
  CAPTURE_HIBERNATE_STATE_SCRIPT,
} from './powerUps.js';

describe('injected browser scripts syntax validation', () => {
  it('parses READ_MEDIA_METADATA_SCRIPT and all injected scripts without SyntaxError', () => {
    const scripts: Array<[string, string]> = [
      ['READ_MEDIA_METADATA_SCRIPT', READ_MEDIA_METADATA_SCRIPT],
      ['buildSetVolumeScript', buildSetVolumeScript(0.8)],
      ['buildDuckFactorScript', buildDuckFactorScript(0.2, 300)],
      ['buildEqualizerScript', buildEqualizerScript(DEFAULT_EQUALIZER_CONFIG)],
      ['buildMediaControlScript(play-pause)', buildMediaControlScript('play-pause')],
      ['buildMediaControlScript(like-track)', buildMediaControlScript('like-track')],
      ['buildMediaControlScript(dislike-track)', buildMediaControlScript('dislike-track')],
      ['buildYouTubePowerUpScript(youtube)', buildYouTubePowerUpScript('youtube', DEFAULT_POWER_UPS)],
      [
        'buildYouTubePowerUpScript(youtube-music)',
        buildYouTubePowerUpScript('youtube-music', DEFAULT_POWER_UPS),
      ],
      ['buildTwitchPowerUpScript', buildTwitchPowerUpScript(DEFAULT_POWER_UPS)],
      ['buildRedditPowerUpScript', buildRedditPowerUpScript(DEFAULT_POWER_UPS)],
      ['CAPTURE_HIBERNATE_STATE_SCRIPT', CAPTURE_HIBERNATE_STATE_SCRIPT],
      ['buildRestoreHibernateStateScript', buildRestoreHibernateStateScript(120, 45)],
      ['buildSponsorSegmentsInjector', buildSponsorSegmentsInjector('abc123', [])],
      ['buildTwitchEmotesInjector', buildTwitchEmotesInjector({})],
    ];

    for (const [name, script] of scripts) {
      expect(() => new Function(script), `${name} must be valid JS`).not.toThrow();
    }
  });
});
