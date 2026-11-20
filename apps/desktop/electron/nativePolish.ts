import type { ThemeMode } from '@omnideck/shared';

/**
 * Generates unified slim scrollbars + site-specific CSS de-cluttering so every embedded
 * service sheds browser/app-install nag banners and feels cohesive inside OmniDeck.
 */
export function buildNativePolishCss(serviceId: string, theme: ThemeMode): string {
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
    case 'reddit':
      return `${baseCss}
        /* Hide "Get App" / mobile app promotion prompts */
        #get-app-button,
        shreddit-async-loader[bundlename="xpromo_app_selector"],
        shreddit-experience-tree [slot="get-app"],
        [data-testid="get-app-button"] {
          display: none !important;
        }
      `;
    case 'youtube':
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
 * Applies independent per-app volume scaling [0.0, 1.0] to all current and future
 * HTML5 <audio> and <video> elements inside a service tab.
 */
export function buildSetVolumeScript(volume: number): string {
  const safeVol = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1));
  return `(function () {
    window.__omnideckVolume = ${safeVol};
    const apply = () => {
      document.querySelectorAll('audio, video').forEach((el) => {
        try {
          if (Math.abs(el.volume - window.__omnideckVolume) > 0.01) {
            el.volume = window.__omnideckVolume;
          }
        } catch {}
      });
    };
    apply();
    if (!window.__omnideckVolumeObserver) {
      window.__omnideckVolumeObserver = new MutationObserver(apply);
      const target = document.documentElement || document.body;
      if (target) {
        window.__omnideckVolumeObserver.observe(target, { childList: true, subtree: true });
      }
      document.addEventListener('play', apply, true);
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
