import { EQ_FREQUENCIES, type EqualizerConfig } from '@omnideck/shared';

/**
 * Generates a non-destructive 10-band Web Audio API Equalizer injector for media tabs.
 *
 * Uses a cascaded chain:
 *   MediaElementSource -> Preamp Gain -> 10 BiquadFilters (32Hz..16kHz) -> Limiter -> Destination
 *
 * Safety for DRM (Widevine EME on Spotify / Audible):
 *   Chromium silences MediaElementAudioSourceNode on DRM-protected EME streams. We detect
 *   `el.mediaKeys` (and explicit DRM service skip) so protected playback is never silenced.
 */
export function buildEqualizerScript(eq: EqualizerConfig): string {
  const safeEq = {
    enabled: Boolean(eq.enabled),
    preampDb: Number.isFinite(eq.preampDb) ? Math.min(12, Math.max(-12, eq.preampDb)) : 0,
    bands: EQ_FREQUENCIES.map((_, i) => {
      const val = Number(eq.bands[i] ?? 0);
      return Number.isFinite(val) ? Math.min(12, Math.max(-12, val)) : 0;
    }),
    compressorEnabled: Boolean(eq.compressorEnabled),
    volumeBoost: Number.isFinite(eq.volumeBoost) ? Math.min(2.0, Math.max(1.0, eq.volumeBoost)) : 1.0,
  };

  return `(function () {
    const cfg = ${JSON.stringify(safeEq)};
    const FREQS = ${JSON.stringify([...EQ_FREQUENCIES])};
    const isGraphNeeded = () =>
      Boolean(cfg.enabled || cfg.compressorEnabled || (cfg.volumeBoost && cfg.volumeBoost > 1.005));
    window.__omnideckEqConfig = cfg;

    const dbToGain = (db) => Math.pow(10, db / 20);

    const updateState = (state) => {
      try {
        if (!state || !state.ctx) return;
        const now = state.ctx.currentTime;
        const active = isGraphNeeded();
        if (state.dryGain && state.wetGain) {
          state.dryGain.gain.setTargetAtTime(active ? 0.0 : 1.0, now, 0.02);
          state.wetGain.gain.setTargetAtTime(active ? 1.0 : 0.0, now, 0.02);
        }

        const eqPreamp = cfg.enabled ? dbToGain(cfg.preampDb) : 1.0;
        const compMakeup = cfg.compressorEnabled ? 1.18 : 1.0;
        const boost = cfg.volumeBoost || 1.0;
        state.preamp.gain.setTargetAtTime(eqPreamp, now, 0.025);
        state.outputGain.gain.setTargetAtTime(Math.min(3.0, compMakeup * boost), now, 0.025);

        for (let i = 0; i < state.filters.length; i++) {
          const targetDb = cfg.enabled ? (cfg.bands[i] || 0) : 0;
          state.filters[i].gain.setTargetAtTime(targetDb, now, 0.025);
        }

        if (cfg.compressorEnabled) {
          state.limiter.threshold.setTargetAtTime(-16, now, 0.025);
          state.limiter.knee.setTargetAtTime(18, now, 0.025);
          state.limiter.ratio.setTargetAtTime(4, now, 0.025);
          state.limiter.attack.setTargetAtTime(0.012, now, 0.025);
          state.limiter.release.setTargetAtTime(0.26, now, 0.025);
        } else {
          state.limiter.threshold.setTargetAtTime(-0.5, now, 0.025);
          state.limiter.knee.setTargetAtTime(3, now, 0.025);
          state.limiter.ratio.setTargetAtTime(2, now, 0.025);
          state.limiter.attack.setTargetAtTime(0.01, now, 0.025);
          state.limiter.release.setTargetAtTime(0.18, now, 0.025);
        }

        if (state.ctx.state === 'suspended') {
          state.ctx.resume().catch(() => {});
        }
      } catch {}
    };

    const hookMediaElement = (el) => {
      try {
        if (!el || !(el instanceof HTMLMediaElement)) return;
        // Skip Widevine DRM EME elements so protected audio is never silenced
        if (el.mediaKeys) return;
        if (!window.__omnideckEqNodes) {
          window.__omnideckEqNodes = new WeakMap();
          window.__omnideckEqActiveStates = new Set();
        }
        const existing = window.__omnideckEqNodes.get(el);
        if (existing) {
          updateState(existing);
          return;
        }
        // Only construct an AudioContext graph once EQ, Compressor, or Boost is active
        if (!isGraphNeeded()) return;

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        let ctx = window.__omnideckEqCtx;
        if (!ctx) {
          try {
            ctx = new AudioCtx({ latencyHint: 'playback' });
          } catch {
            ctx = new AudioCtx();
          }
          window.__omnideckEqCtx = ctx;
        }

        const source = ctx.createMediaElementSource(el);
        const dryGain = ctx.createGain();
        const wetGain = ctx.createGain();
        const preamp = ctx.createGain();
        const filters = FREQS.map((freq, idx) => {
          const f = ctx.createBiquadFilter();
          f.type = idx === 0 ? 'lowshelf' : idx === FREQS.length - 1 ? 'highshelf' : 'peaking';
          f.frequency.value = freq;
          f.Q.value = idx === 0 || idx === FREQS.length - 1 ? 0.8 : 1.4;
          f.gain.value = cfg.enabled ? (cfg.bands[idx] || 0) : 0;
          return f;
        });

        const limiter = ctx.createDynamicsCompressor();
        const outputGain = ctx.createGain();
        const safetyClipper = ctx.createDynamicsCompressor();
        safetyClipper.threshold.value = -0.5;
        safetyClipper.knee.value = 2;
        safetyClipper.ratio.value = 12;
        safetyClipper.attack.value = 0.003;
        safetyClipper.release.value = 0.12;

        source.connect(dryGain);
        dryGain.connect(ctx.destination);

        source.connect(preamp);
        let prev = preamp;
        for (const f of filters) {
          prev.connect(f);
          prev = f;
        }
        prev.connect(limiter);
        limiter.connect(outputGain);
        outputGain.connect(safetyClipper);
        safetyClipper.connect(wetGain);
        wetGain.connect(ctx.destination);

        const state = { ctx, source, dryGain, wetGain, preamp, filters, limiter, outputGain, safetyClipper };
        window.__omnideckEqNodes.set(el, state);
        window.__omnideckEqActiveStates.add(state);
        updateState(state);
      } catch {
        // Gracefully ignore cross-origin or already-captured media elements
      }
    };

    if (window.__omnideckEqActiveStates) {
      for (const st of window.__omnideckEqActiveStates) {
        updateState(st);
      }
    }

    if (isGraphNeeded()) {
      document.querySelectorAll('audio, video').forEach(hookMediaElement);
    }

    if (!window.__omnideckEqPlayBound) {
      window.__omnideckEqPlayBound = true;
      document.addEventListener('play', (ev) => {
        if (ev && ev.target && (ev.target.tagName === 'AUDIO' || ev.target.tagName === 'VIDEO')) {
          const c = window.__omnideckEqConfig;
          if (c && (c.enabled || c.compressorEnabled || (c.volumeBoost && c.volumeBoost > 1.005))) {
            hookMediaElement(ev.target);
          }
        }
      }, true);
    }

    return isGraphNeeded();
  })();`;
}

/**
 * Smoothly animates OmniDeck's multiplicative ducking factor [0.05, 1.0] on top of
 * each tab's native volume & mixer scale (from nativePolish.ts) without ever fighting
 * YouTube Music's own volume slider or ReplayGain normalization.
 */
export function buildDuckFactorScript(targetFactor: number, rampMs = 380): string {
  const safeTarget = Math.min(1, Math.max(0.05, Number.isFinite(targetFactor) ? targetFactor : 1));
  const safeRamp = Math.min(2000, Math.max(50, Math.round(rampMs)));

  return `(function () {
    const target = ${safeTarget};
    const duration = ${safeRamp};

    // Ensure HTMLMediaElement.prototype.volume wrapper is installed before ducking
    if (!window.__omnideckVolumePatched) {
      const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
      if (desc && typeof desc.get === 'function' && typeof desc.set === 'function') {
        window.__omnideckVolumePatched = true;
        window.__omnideckNativeVolGet = desc.get;
        window.__omnideckNativeVolSet = desc.set;
        if (typeof window.__omnideckVolumeScale !== 'number') {
          window.__omnideckVolumeScale = 1;
        }
        Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
          configurable: true,
          enumerable: desc.enumerable,
          get: function () {
            if (typeof this.__odSiteVol === 'number') return this.__odSiteVol;
            return window.__omnideckNativeVolGet.call(this);
          },
          set: function (val) {
            const num = Number(val);
            if (!Number.isFinite(num)) return;
            const clamped = Math.min(1, Math.max(0, num));
            this.__odSiteVol = clamped;
            const curScale = typeof window.__omnideckVolumeScale === 'number' ? window.__omnideckVolumeScale : 1;
            const curDuck = typeof window.__omnideckDuckFactor === 'number' ? window.__omnideckDuckFactor : 1;
            window.__omnideckNativeVolSet.call(this, Math.min(1, Math.max(0, clamped * curScale * curDuck)));
          }
        });
      }
    }

    const applyFactor = (factor) => {
      window.__omnideckDuckFactor = factor;
      const curScale = typeof window.__omnideckVolumeScale === 'number' ? window.__omnideckVolumeScale : 1;
      const nativeGet = window.__omnideckNativeVolGet;
      const nativeSet = window.__omnideckNativeVolSet;
      document.querySelectorAll('audio, video').forEach((el) => {
        try {
          if (nativeGet && nativeSet) {
            if (typeof el.__odSiteVol !== 'number') {
              el.__odSiteVol = nativeGet.call(el);
            }
            nativeSet.call(el, Math.min(1, Math.max(0, el.__odSiteVol * curScale * factor)));
          }
        } catch {}
      });
    };

    const startFactor = typeof window.__omnideckDuckFactor === 'number' ? window.__omnideckDuckFactor : 1;
    if (window.__omnideckDuckRaf) {
      cancelAnimationFrame(window.__omnideckDuckRaf);
      window.__omnideckDuckRaf = null;
    }

    if (Math.abs(target - startFactor) < 0.005) {
      applyFactor(target);
      return target;
    }

    const startTime = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const cur = startFactor + (target - startFactor) * eased;
      applyFactor(cur);
      if (t < 1) {
        window.__omnideckDuckRaf = requestAnimationFrame(step);
      } else {
        window.__omnideckDuckRaf = null;
      }
    };
    window.__omnideckDuckRaf = requestAnimationFrame(step);
    return target;
  })();`;
}
