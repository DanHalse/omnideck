import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUALIZER_CONFIG } from '@omnideck/shared';
import { buildDuckFactorScript, buildEqualizerScript } from './audioEngine.js';

describe('audioEngine injectors', () => {
  it('generates a DRM-safe 10-band EQ script with clamped band values', () => {
    const script = buildEqualizerScript({
      ...DEFAULT_EQUALIZER_CONFIG,
      enabled: true,
      preampDb: 40,
      bands: [15, -20, 3, 0, 0, 0, 0, 0, 0, 6],
    });
    expect(script).toContain('if (el.mediaKeys) return;');
    expect(script).toContain('"preampDb":12');
    expect(script).toContain('[12,-12,3,0,0,0,0,0,0,6]');
    expect(script).toContain('createBiquadFilter');
    expect(script).toContain('createDynamicsCompressor');
  });

  it('generates a multiplicative smooth ducking script clamped to [0.05, 1.0]', () => {
    const script = buildDuckFactorScript(0.15, 400);
    expect(script).toContain('const target = 0.15;');
    expect(script).toContain('window.__omnideckDuckFactor');
    expect(script).toContain('clamped * curScale * curDuck');

    const floorScript = buildDuckFactorScript(0.001, 200);
    expect(floorScript).toContain('const target = 0.05;');
  });
});
