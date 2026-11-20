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
 * Low-CPU independent per-app volume controller [0.0, 1.0].
 * Uses native `play` & `loadedmetadata` capture listeners plus a debounced MutationObserver
 * that only reacts when newly added nodes actually contain <audio>/<video> elements —
 * avoiding DOM-churn CPU spikes on fast-moving Twitch chats or Reddit infinite scroll.
 */
export function buildSetVolumeScript(volume: number): string {
  const safeVol = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1));
  return `(function () {
    window.__omnideckVolume = ${safeVol};
    const applyEl = (el) => {
      try {
        if (el && typeof el.volume === 'number' && Math.abs(el.volume - window.__omnideckVolume) > 0.01) {
          el.volume = window.__omnideckVolume;
        }
      } catch {}
    };
    const applyAll = () => {
      document.querySelectorAll('audio, video').forEach(applyEl);
    };
    applyAll();
    if (!window.__omnideckVolumeBound) {
      window.__omnideckVolumeBound = true;
      const onMediaEvent = (ev) => {
        if (ev && ev.target && (ev.target.tagName === 'AUDIO' || ev.target.tagName === 'VIDEO')) {
          applyEl(ev.target);
        }
      };
      document.addEventListener('play', onMediaEvent, true);
      document.addEventListener('loadedmetadata', onMediaEvent, true);

      let timer = null;
      const schedule = () => {
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          applyAll();
        }, 250);
      };

      const target = document.body || document.documentElement;
      if (target) {
        window.__omnideckVolumeObserver = new MutationObserver((mutations) => {
          for (let i = 0; i < mutations.length; i++) {
            const added = mutations[i].addedNodes;
            for (let j = 0; j < added.length; j++) {
              const node = added[j];
              if (node.nodeType !== 1) continue;
              const tag = node.tagName;
              if (tag === 'AUDIO' || tag === 'VIDEO' || (node.querySelector && node.querySelector('audio, video'))) {
                schedule();
                return;
              }
            }
          }
        });
        window.__omnideckVolumeObserver.observe(target, { childList: true, subtree: true });
      }
    }
    return window.__omnideckVolume;
  })();`;
}

/**
 * Reads live MediaSession metadata (track title, artist/channel, album, cover artwork)
 * from Spotify, YouTube, YouTube Music, Twitch, or Audible for OmniDeck's native Media Dock.
 */
export const READ_MEDIA_METADATA_SCRIPT = `(function () {
  try {
    const ms = navigator.mediaSession && navigator.mediaSession.metadata;
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
        artworkUrl: artworkUrl
      };
    }
    return null;
  } catch {
    return null;
  }
})();`;
