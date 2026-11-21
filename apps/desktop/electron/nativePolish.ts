import { DEFAULT_POWER_UPS, type PowerUpsConfig, type ThemeMode } from '@omnideck/shared';

/**
 * Generates unified slim scrollbars + site-specific CSS de-cluttering and Power-Up styles
 * (Hide YouTube Shorts, Reddit Compact Density & Hide Promoted Posts) per service.
 */
export function buildNativePolishCss(
  serviceId: string,
  theme: ThemeMode,
  powerUps: PowerUpsConfig = DEFAULT_POWER_UPS,
): string {
  const thumb = theme === 'dark' ? 'rgba(255, 255, 255, 0.20)' : 'rgba(15, 23, 42, 0.22)';
  const thumbHover = theme === 'dark' ? 'rgba(255, 255, 255, 0.34)' : 'rgba(15, 23, 42, 0.38)';

  const baseCss = `
    ::-webkit-scrollbar { width: 8px !important; height: 8px !important; }
    ::-webkit-scrollbar-track { background: transparent !important; }
    ::-webkit-scrollbar-thumb {
      background: ${thumb} !important;
      border-radius: 999px !important;
      border: 2px solid transparent !important;
      background-clip: content-box !important;
    }
    ::-webkit-scrollbar-thumb:hover { background: ${thumbHover} !important; }
  `;

  switch (serviceId) {
    case 'spotify':
      return `${baseCss}
        /* Hide "Install App" / "Download Spotify" nag buttons inside Spotify Web Player */
        a[href*="/download"],
        [data-testid="upgrade-button"],
        [data-testid="install-app-banner"] {
          display: none !important;
        }
      `;
    case 'reddit': {
      const compactCss = powerUps.redditCompactDensity
        ? `
        /* Compact Desktop Density for Modern Reddit */
        shreddit-feed article,
        shreddit-post {
          margin-bottom: 6px !important;
        }
        main.main,
        .subgrid-container {
          max-width: 1280px !important;
        }
        #right-sidebar-container {
          opacity: 0.9;
        }
        .omnideck-reddit-focus {
          outline: 2px solid #FF5414 !important;
          outline-offset: 2px !important;
          border-radius: 10px !important;
        }
      `
        : '';

      const hidePromoCss = powerUps.redditHidePromoted
        ? `
        shreddit-ad-post,
        faceplate-tracker[noun="promoted"],
        .promotedlink,
        [data-testid="post-container"]:has([data-adclicklocation]) {
          display: none !important;
        }
      `
        : '';

      return `${baseCss}
        /* Hide "Get App" / mobile app promotion prompts */
        #get-app-button,
        shreddit-async-loader[bundlename="xpromo_app_selector"],
        shreddit-experience-tree [slot="get-app"],
        [data-testid="get-app-button"] {
          display: none !important;
        }
        ${compactCss}
        ${hidePromoCss}
      `;
    }
    case 'youtube': {
      const hideShortsCss = powerUps.youtubeHideShorts
        ? `
        /* Hide YouTube Shorts shelves & navigation entries */
        ytd-rich-section-renderer[is-shorts],
        ytd-reel-shelf-renderer,
        ytd-shorts,
        grid-shelf-view-model:has(a[href*="/shorts/"]),
        ytd-guide-entry-renderer:has(a[title="Shorts"]),
        ytd-mini-guide-entry-renderer[aria-label="Shorts"],
        ytd-video-renderer:has(a[href^="/shorts/"]),
        ytd-grid-video-renderer:has(a[href^="/shorts/"]) {
          display: none !important;
        }
      `
        : '';
      return `${baseCss}
        /* Hide browser promo snackbars */
        yt-mealbar-promo-renderer,
        ytd-banner-promo-renderer {
          display: none !important;
        }
        ${hideShortsCss}
      `;
    }
    case 'youtube-music':
      return `${baseCss}
        /* Hide "Install YouTube Music" / browser promo snackbars */
        ytmusic-mealbar-promo-renderer,
        yt-mealbar-promo-renderer,
        ytd-banner-promo-renderer {
          display: none !important;
        }
      `;
    case 'twitch':
      return `${baseCss}
        /* Hide Twitch desktop app / Prime promo nag banners */
        .top-nav__prime-offers-pill,
        [data-a-target="get-desktop-app-button"] {
          display: none !important;
        }
        .omnideck-emote {
          display: inline-block !important;
          height: 28px !important;
          width: auto !important;
          vertical-align: middle !important;
          margin: -4px 2px 0 2px !important;
        }
      `;
    case 'audible':
      return `${baseCss}
        /* Hide Audible mobile app download banners */
        .adbl-app-banner,
        [data-widget="app-download-banner"] {
          display: none !important;
        }
      `;
    default:
      return baseCss;
  }
}

/**
 * Multiplicative per-app volume controller [0.0, 1.0].
 * Wraps HTMLMediaElement.prototype.volume so OmniDeck scales *on top of* each site's
 * own volume slider and loudness normalization (e.g. YouTube Music ReplayGain) instead
 * of overwriting el.volume and fighting the player when tracks change.
 */
export function buildSetVolumeScript(volume: number): string {
  const safeVol = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1));
  return `(function () {
    const scale = ${safeVol};
    window.__omnideckVolumeScale = scale;

    if (!window.__omnideckVolumePatched) {
      if (scale >= 0.999) return scale;
      const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
      if (desc && typeof desc.get === 'function' && typeof desc.set === 'function') {
        window.__omnideckVolumePatched = true;
        window.__omnideckNativeVolGet = desc.get;
        window.__omnideckNativeVolSet = desc.set;

        Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
          configurable: true,
          enumerable: desc.enumerable,
          get: function () {
            if (typeof this.__odSiteVol === 'number') {
              return this.__odSiteVol;
            }
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

    const applyEl = (el) => {
      try {
        if (!el) return;
        const nativeGet = window.__omnideckNativeVolGet;
        const nativeSet = window.__omnideckNativeVolSet;
        const curDuck = typeof window.__omnideckDuckFactor === 'number' ? window.__omnideckDuckFactor : 1;
        if (nativeGet && nativeSet) {
          if (typeof el.__odSiteVol !== 'number') {
            el.__odSiteVol = nativeGet.call(el);
          }
          nativeSet.call(el, Math.min(1, Math.max(0, el.__odSiteVol * scale * curDuck)));
        } else if (typeof el.volume === 'number') {
          el.volume = scale * curDuck;
        }
      } catch {}
    };

    document.querySelectorAll('audio, video').forEach(applyEl);

    if (!window.__omnideckVolumeEventBound) {
      window.__omnideckVolumeEventBound = true;
      document.addEventListener('play', (ev) => {
        if (ev && ev.target && (ev.target.tagName === 'AUDIO' || ev.target.tagName === 'VIDEO')) {
          applyEl(ev.target);
        }
      }, true);
    }

    return scale;
  })();`;
}

/**
 * Reads live MediaSession metadata (track title, artist/channel, album, cover artwork)
 * plus live playback position (currentTimeSec, durationSec) for synced lyrics & stats.
 */
export const READ_MEDIA_METADATA_SCRIPT = `(function () {
  try {
    let currentTimeSec = undefined;
    let durationSec = undefined;
    const mediaEls = Array.from(document.querySelectorAll('video, audio'));
    const activeEl =
      mediaEls.find((m) => !m.paused && Number.isFinite(m.duration) && m.duration > 0) ||
      mediaEls.find((m) => Number.isFinite(m.duration) && m.duration > 0 && m.currentTime > 0);
    if (activeEl) {
      currentTimeSec = Math.max(0, Number(activeEl.currentTime) || 0);
      durationSec = Number.isFinite(activeEl.duration) ? Math.max(0, Number(activeEl.duration)) : undefined;
    }

    const ms = navigator.mediaSession && navigator.mediaSession.metadata;
    let likeStatus = 'none';
    try {
      const host = (location.hostname || '').toLowerCase();
      if (host.includes('music.youtube.com')) {
        const likeBtn =
          document.querySelector('ytmusic-player-bar ytmusic-like-button-renderer #button-shape-like button') ||
          document.querySelector('ytmusic-player-bar ytmusic-like-button-renderer .like button') ||
          document.querySelector('ytmusic-player-bar button[aria-label="Like"], ytmusic-player-bar button[aria-label="Remove like"]');
        const dislikeBtn =
          document.querySelector('ytmusic-player-bar ytmusic-like-button-renderer #button-shape-dislike button') ||
          document.querySelector('ytmusic-player-bar ytmusic-like-button-renderer .dislike button') ||
          document.querySelector('ytmusic-player-bar button[aria-label="Dislike"], ytmusic-player-bar button[aria-label="Remove dislike"]');
        const likePressed = likeBtn && (likeBtn.getAttribute('aria-pressed') === 'true' || /remove like/i.test(likeBtn.getAttribute('aria-label') || ''));
        const dislikePressed = dislikeBtn && (dislikeBtn.getAttribute('aria-pressed') === 'true' || /remove dislike/i.test(dislikeBtn.getAttribute('aria-label') || ''));
        if (likePressed) likeStatus = 'like';
        else if (dislikePressed) likeStatus = 'dislike';
      }
    } catch {}

    if (ms && (ms.title || ms.artist)) {
      let artworkUrl = '';
      if (Array.isArray(ms.artwork) && ms.artwork.length > 0) {
        const best = ms.artwork[ms.artwork.length - 1] || ms.artwork[0];
        if (best && typeof best.src === 'string') artworkUrl = best.src;
      }
      return {
        title: String(ms.title || '').trim(),
        artist: String(ms.artist || '').trim(),
        album: String(ms.album || '').trim(),
        artworkUrl: artworkUrl,
        currentTimeSec,
        durationSec,
        likeStatus
      };
    }

    if (typeof currentTimeSec === 'number') {
      return {
        title: '',
        artist: '',
        album: '',
        artworkUrl: '',
        currentTimeSec,
        durationSec,
        likeStatus
      };
    }
    return null;
  } catch {
    return null;
  }
})();`;
