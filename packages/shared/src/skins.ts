import type { PowerUpsConfig, SkinPresetId, ThemeMode } from './types.js';

export interface SkinPalette {
  id: SkinPresetId;
  name: string;
  tagline: string;
  baseTheme: ThemeMode;
  canvas: string;
  chrome: string;
  chromeElevated: string;
  surface: string;
  surfaceHover: string;
  surfaceActive: string;
  input: string;
  borderSubtle: string;
  borderDefault: string;
  borderStrong: string;
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  live: string;
  warn: string;
  danger: string;
}

export const SKIN_PRESETS: Record<SkinPresetId, SkinPalette> = {
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian',
    tagline: 'Signature dark graphite & warm copper',
    baseTheme: 'dark',
    canvas: '#0D0F12',
    chrome: '#13161B',
    chromeElevated: '#191D24',
    surface: '#1D222A',
    surfaceHover: '#252B35',
    surfaceActive: '#2A313D',
    input: '#101317',
    borderSubtle: 'rgba(255, 255, 255, 0.075)',
    borderDefault: 'rgba(255, 255, 255, 0.12)',
    borderStrong: 'rgba(255, 255, 255, 0.20)',
    inkPrimary: '#F1F3F6',
    inkSecondary: '#9AA3B2',
    inkMuted: '#687283',
    accent: '#E47E3C',
    accentHover: '#EF8D4E',
    accentSoft: 'rgba(228, 126, 60, 0.16)',
    live: '#22C55E',
    warn: '#EAB308',
    danger: '#EF4444',
  },
  oled: {
    id: 'oled',
    name: 'OLED Pitch',
    tagline: 'True #000000 black for OLED & AMOLED screens',
    baseTheme: 'dark',
    canvas: '#000000',
    chrome: '#07080A',
    chromeElevated: '#0F1115',
    surface: '#14171D',
    surfaceHover: '#1C2029',
    surfaceActive: '#232834',
    input: '#0A0B0E',
    borderSubtle: 'rgba(255, 255, 255, 0.08)',
    borderDefault: 'rgba(255, 255, 255, 0.14)',
    borderStrong: 'rgba(255, 255, 255, 0.24)',
    inkPrimary: '#F8FAFC',
    inkSecondary: '#9CA3AF',
    inkMuted: '#6B7280',
    accent: '#F59E0B',
    accentHover: '#FBBF24',
    accentSoft: 'rgba(245, 158, 11, 0.16)',
    live: '#22C55E',
    warn: '#F59E0B',
    danger: '#EF4444',
  },
  nord: {
    id: 'nord',
    name: 'Nord Frost',
    tagline: 'Calm arctic slate & ice-blue highlights',
    baseTheme: 'dark',
    canvas: '#242933',
    chrome: '#2E3440',
    chromeElevated: '#353C4A',
    surface: '#3B4252',
    surfaceHover: '#434C5E',
    surfaceActive: '#4C566A',
    input: '#272C36',
    borderSubtle: 'rgba(216, 222, 233, 0.08)',
    borderDefault: 'rgba(216, 222, 233, 0.14)',
    borderStrong: 'rgba(216, 222, 233, 0.24)',
    inkPrimary: '#ECEFF4',
    inkSecondary: '#D8DEE9',
    inkMuted: '#8894A8',
    accent: '#88C0D0',
    accentHover: '#8FBCBB',
    accentSoft: 'rgba(136, 192, 208, 0.18)',
    live: '#A3BE8C',
    warn: '#EBCB8B',
    danger: '#BF616A',
  },
  catppuccin: {
    id: 'catppuccin',
    name: 'Catppuccin',
    tagline: 'Cozy Mocha palette with soft mauve accents',
    baseTheme: 'dark',
    canvas: '#11111B',
    chrome: '#181825',
    chromeElevated: '#1E1E2E',
    surface: '#26263A',
    surfaceHover: '#313244',
    surfaceActive: '#3B3D54',
    input: '#141420',
    borderSubtle: 'rgba(205, 214, 244, 0.08)',
    borderDefault: 'rgba(205, 214, 244, 0.14)',
    borderStrong: 'rgba(205, 214, 244, 0.24)',
    inkPrimary: '#CDD6F4',
    inkSecondary: '#A6ADC8',
    inkMuted: '#7F849C',
    accent: '#CBA6F7',
    accentHover: '#DFC2FA',
    accentSoft: 'rgba(203, 166, 247, 0.18)',
    live: '#A6E3A1',
    warn: '#F9E2AF',
    danger: '#F38BA8',
  },
  daylight: {
    id: 'daylight',
    name: 'Warm Daylight',
    tagline: 'Soft low-glare paper tones for easy reading',
    baseTheme: 'light',
    canvas: '#F4F1EA',
    chrome: '#FCFBF8',
    chromeElevated: '#F7F4EE',
    surface: '#ECE7DD',
    surfaceHover: '#E3DDD0',
    surfaceActive: '#D9D1C2',
    input: '#FFFFFF',
    borderSubtle: 'rgba(28, 25, 23, 0.08)',
    borderDefault: 'rgba(28, 25, 23, 0.14)',
    borderStrong: 'rgba(28, 25, 23, 0.24)',
    inkPrimary: '#1C1917',
    inkSecondary: '#57534E',
    inkMuted: '#78716C',
    accent: '#CF6523',
    accentHover: '#B85619',
    accentSoft: 'rgba(207, 101, 35, 0.14)',
    live: '#16A34A',
    warn: '#CA8A04',
    danger: '#DC2626',
  },
};

export const SKIN_PRESET_LIST: SkinPalette[] = [
  SKIN_PRESETS.obsidian,
  SKIN_PRESETS.oled,
  SKIN_PRESETS.nord,
  SKIN_PRESETS.catppuccin,
  SKIN_PRESETS.daylight,
];

export function isValidSkinPresetId(value: unknown): value is SkinPresetId {
  return (
    value === 'obsidian' ||
    value === 'oled' ||
    value === 'nord' ||
    value === 'catppuccin' ||
    value === 'daylight'
  );
}

export function resolveSkinPreset(skin?: SkinPresetId, fallbackTheme?: ThemeMode): SkinPalette {
  if (skin && isValidSkinPresetId(skin)) {
    return SKIN_PRESETS[skin];
  }
  return fallbackTheme === 'light' ? SKIN_PRESETS.daylight : SKIN_PRESETS.obsidian;
}

/**
 * Generates unified, Spicetify-inspired per-app CSS overrides so all 6 embedded apps
 * share OmniDeck's chosen skin palette and fix major 2025–2026 UI regressions
 * (Audible Dark Mode, YouTube Classic Watch Layout, Reddit Apollo Depth Bars, Spotify De-Bloat).
 */
export function buildUnifiedSkinCss(
  serviceId: string,
  skinId: SkinPresetId,
  powerUps?: Partial<PowerUpsConfig>,
): string {
  const pu = powerUps ?? {};
  const skin = resolveSkinPreset(skinId);
  const isDark = skin.baseTheme === 'dark';
  const thumb = isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(28, 25, 23, 0.22)';
  const thumbHover = isDark ? 'rgba(255, 255, 255, 0.34)' : 'rgba(28, 25, 23, 0.38)';

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
    case 'spotify': {
      const spotifySkinVars = isDark
        ? `
        :root, .encore-dark-theme, .encore-base-set {
          --background-base: ${skin.canvas} !important;
          --background-highlight: ${skin.surface} !important;
          --background-press: ${skin.surfaceActive} !important;
          --background-elevated-base: ${skin.chrome} !important;
          --background-elevated-highlight: ${skin.surfaceHover} !important;
          --background-elevated-press: ${skin.surfaceActive} !important;
          --background-tinted-base: ${skin.surface} !important;
          --essential-bright-accent: ${skin.accent} !important;
          --text-bright-accent: ${skin.accent} !important;
        }
        body, #main, .Root__top-container {
          background-color: ${skin.canvas} !important;
        }
        .Root__now-playing-bar, footer[data-testid="now-playing-bar"] {
          background-color: ${skin.chrome} !important;
          border-top: 1px solid ${skin.borderSubtle} !important;
        }
      `
        : '';

      const hideNonMusic = pu.spotifyHidePodcastsAudiobooks
        ? `
        section[aria-label*="Podcast" i],
        section[aria-label*="Episode" i],
        section[aria-label*="Audiobook" i],
        section[aria-label*="Live Events" i],
        section[aria-label*="Merch" i],
        [data-testid="merch-shelf"],
        [data-testid="live-events-shelf"] {
          display: none !important;
        }
      `
        : '';

      return `${baseCss}
        a[href*="/download"],
        [data-testid="upgrade-button"],
        [data-testid="install-app-banner"] {
          display: none !important;
        }
        ${spotifySkinVars}
        ${hideNonMusic}
      `;
    }

    case 'youtube': {
      const skinOverrides = isDark
        ? `
        html[dark], ytd-app, #page-manager, #masthead-container, ytd-masthead {
          --yt-spec-base-background: ${skin.canvas} !important;
          --yt-spec-raised-background: ${skin.chrome} !important;
          --yt-spec-menu-background: ${skin.chromeElevated} !important;
          --yt-spec-additive-background: ${skin.surface} !important;
          --yt-spec-general-background-a: ${skin.canvas} !important;
          --yt-spec-general-background-b: ${skin.chrome} !important;
        }
        body { background-color: ${skin.canvas} !important; }
      `
        : `
        html:not([dark]), ytd-app, #page-manager {
          --yt-spec-base-background: ${skin.canvas} !important;
          --yt-spec-raised-background: ${skin.chrome} !important;
        }
      `;

      const hideShortsCss = pu.youtubeHideShorts
        ? `
        ytd-rich-section-renderer[is-shorts],
        ytd-reel-shelf-renderer,
        ytd-shorts,
        grid-shelf-view-model:has(a[href*="/shorts/"]),
        ytd-guide-entry-renderer:has(a[title="Shorts"]),
        ytd-mini-guide-entry-renderer[aria-label="Shorts"],
        ytd-video-renderer:has(a[href^="/shorts/"]),
        ytd-grid-video-renderer:has(a[href^="/shorts/"]),
        ytm-reel-shelf-renderer,
        ytm-pivot-bar-item-renderer:has(.pivot-shorts) {
          display: none !important;
        }
      `
        : '';

      const classicLayoutCss = pu.youtubeClassicLayoutLock
        ? `
        /* Classic Watch Layout Lock: restrain oversized 2025–2026 player buttons & hide AI/merch clutter */
        .ytp-chrome-bottom .ytp-button svg {
          transform: scale(0.94);
        }
        ytd-merch-shelf-renderer,
        #video-summary,
        ytd-expandable-metadata-renderer[has-video-summary],
        ytd-rich-section-renderer:has(a[href*="/playables"]) {
          display: none !important;
        }
      `
        : '';

      const hideWatchedCss = pu.youtubeHideWatched
        ? `
        /* Dim videos watched past 85% so unplayed subscriptions stand out */
        ytd-rich-item-renderer:has(#progress[style*="width: 9"]),
        ytd-rich-item-renderer:has(#progress[style*="width: 100"]),
        ytd-grid-video-renderer:has(#progress[style*="width: 9"]),
        ytd-grid-video-renderer:has(#progress[style*="width: 100"]),
        ytd-video-renderer:has(#progress[style*="width: 9"]),
        ytd-video-renderer:has(#progress[style*="width: 100"]) {
          opacity: 0.34 !important;
          filter: saturate(0.45) !important;
          transition: opacity 160ms ease !important;
        }
        ytd-rich-item-renderer:hover,
        ytd-grid-video-renderer:hover,
        ytd-video-renderer:hover {
          opacity: 1 !important;
          filter: none !important;
        }
      `
        : '';

      return `${baseCss}
        yt-mealbar-promo-renderer,
        ytd-banner-promo-renderer {
          display: none !important;
        }
        ${skinOverrides}
        ${hideShortsCss}
        ${classicLayoutCss}
        ${hideWatchedCss}
      `;
    }

    case 'youtube-music': {
      const ytmSkinCss = isDark
        ? `
        html, body, ytmusic-app, ytmusic-app-layout, ytmusic-browse-response {
          --ytmusic-background: ${skin.canvas} !important;
          --ytmusic-nav-bar-background: ${skin.chrome} !important;
          --ytmusic-player-bar-background: ${skin.chromeElevated} !important;
          background-color: ${skin.canvas} !important;
        }
        ytmusic-player-bar {
          background: ${skin.chrome} !important;
          border-top: 1px solid ${skin.borderSubtle} !important;
        }
        ytmusic-nav-bar {
          background: ${skin.chrome} !important;
        }
      `
        : `
        /* Astigmatism-friendly Soft Daylight Theme for YouTube Music */
        html, body, ytmusic-app, ytmusic-app-layout, ytmusic-browse-response {
          background-color: ${skin.canvas} !important;
          color: ${skin.inkPrimary} !important;
        }
        ytmusic-app {
          filter: invert(0.91) hue-rotate(180deg) saturate(1.08) !important;
        }
        ytmusic-app img,
        ytmusic-app video,
        ytmusic-app canvas,
        ytmusic-app yt-img-shadow {
          filter: invert(1) hue-rotate(180deg) !important;
        }
      `;

      return `${baseCss}
        ytmusic-mealbar-promo-renderer,
        yt-mealbar-promo-renderer,
        ytd-banner-promo-renderer {
          display: none !important;
        }
        ${ytmSkinCss}
      `;
    }

    case 'twitch': {
      const twitchSkinCss = isDark
        ? `
        :root, .tw-root--theme-dark {
          --color-background-body: ${skin.canvas} !important;
          --color-background-base: ${skin.chrome} !important;
          --color-background-alt: ${skin.chromeElevated} !important;
          --color-background-alt-2: ${skin.surface} !important;
        }
        body { background-color: ${skin.canvas} !important; }
      `
        : '';

      const clutterCss = pu.twitchHideClutter
        ? `
        .hype-train-status-card,
        [data-test-selector="hype-train-banner"],
        .channel-leaderboard,
        .community-highlight-stack__card--wide,
        [data-a-target="shouts-carousel"] {
          display: none !important;
        }
      `
        : '';

      return `${baseCss}
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
        /* Mobile Twitch Fit-to-Screen video fix */
        video { max-width: 100% !important; object-fit: contain !important; }
        ${twitchSkinCss}
        ${clutterCss}
      `;
    }

    case 'reddit': {
      const redditSkinCss = isDark
        ? `
        :root, html.theme-dark, .theme-beta.theme-dark {
          --color-neutral-background: ${skin.canvas} !important;
          --color-neutral-background-weak: ${skin.chrome} !important;
          --color-neutral-background-medium: ${skin.chromeElevated} !important;
          --color-neutral-background-strong: ${skin.canvas} !important;
          --color-neutral-background-hover: ${skin.surfaceHover} !important;
          --color-neutral-border-weak: ${skin.borderSubtle} !important;
        }
        body { background-color: ${skin.canvas} !important; }
      `
        : `
        :root, html.theme-light {
          --color-neutral-background: ${skin.canvas} !important;
          --color-neutral-background-weak: ${skin.chrome} !important;
        }
      `;

      const compactCss = pu.redditCompactDensity
        ? `
        shreddit-feed article, shreddit-post { margin-bottom: 6px !important; }
        main.main, .subgrid-container { max-width: 1280px !important; }
        #right-sidebar-container { opacity: 0.92; }
        .omnideck-reddit-focus {
          outline: 2px solid ${skin.accent} !important;
          outline-offset: 2px !important;
          border-radius: 10px !important;
        }
      `
        : '';

      const hidePromoCss = pu.redditHidePromoted
        ? `
        shreddit-ad-post,
        faceplate-tracker[noun="promoted"],
        .promotedlink,
        [data-testid="post-container"]:has([data-adclicklocation]) {
          display: none !important;
        }
      `
        : '';

      const detoxCss = pu.redditHideRecommended
        ? `
        /* Shreddit Detox 2.0: Hide Games on Reddit, Trending Today, Reddit Reviews promos */
        left-nav-games-section,
        [aria-label*="Games on Reddit" i],
        [data-testid="games-section"],
        shreddit-recent-pages-carousel,
        search-dynamic-id-cache-controller [data-testid="trending-searches"] {
          display: none !important;
        }
      `
        : '';

      const depthLinesCss = pu.redditColorDepthLines
        ? `
        /* Apollo-Style Color-Coded Comment Thread Depth Bars */
        shreddit-comment[depth="0"] { border-left: 2px solid transparent !important; }
        shreddit-comment[depth="1"] { border-left: 2.5px solid #60A5FA !important; padding-left: 6px !important; }
        shreddit-comment[depth="2"] { border-left: 2.5px solid #34D399 !important; padding-left: 6px !important; }
        shreddit-comment[depth="3"] { border-left: 2.5px solid #FBBF24 !important; padding-left: 6px !important; }
        shreddit-comment[depth="4"] { border-left: 2.5px solid #F472B6 !important; padding-left: 6px !important; }
        shreddit-comment[depth="5"] { border-left: 2.5px solid #A78BFA !important; padding-left: 6px !important; }
        shreddit-comment[depth="6"] { border-left: 2.5px solid #FB923C !important; padding-left: 6px !important; }
        /* Old Reddit depth bars */
        .comment .child { border-left: 2px solid #60A5FA !important; padding-left: 8px !important; }
        .comment .child .comment .child { border-left-color: #34D399 !important; }
        .comment .child .comment .child .comment .child { border-left-color: #FBBF24 !important; }
        .comment .child .comment .child .comment .child .comment .child { border-left-color: #F472B6 !important; }
      `
        : '';

      return `${baseCss}
        #get-app-button,
        shreddit-async-loader[bundlename="xpromo_app_selector"],
        shreddit-experience-tree [slot="get-app"],
        [data-testid="get-app-button"] {
          display: none !important;
        }
        ${redditSkinCss}
        ${compactCss}
        ${hidePromoCss}
        ${detoxCss}
        ${depthLinesCss}
      `;
    }

    case 'audible': {
      const darkAudibleCss =
        pu.audibleDarkMode && isDark
          ? `
        /* OmniDeck Native Dark Mode for Audible Library & Cloud Player */
        html, body, #center-1, #center-2, #center-3, #center-4,
        .adbl-main, .adbl-cloud-player, .bc-container, .bc-box, .bc-section,
        header, nav, footer, .ui-header, .adbl-library-content-main {
          background-color: ${skin.canvas} !important;
          color: ${skin.inkPrimary} !important;
          border-color: ${skin.borderDefault} !important;
        }
        .bc-box-group, .adbl-library-content-row, .bc-list-item, .bc-card,
        .adbl-cp-chapter-list, .adbl-cp-controls-container {
          background-color: ${skin.chrome} !important;
          color: ${skin.inkPrimary} !important;
          border-color: ${skin.borderSubtle} !important;
        }
        a, .bc-link, .bc-color-link {
          color: ${skin.accent} !important;
        }
        .bc-color-secondary, .bc-color-tertiary {
          color: ${skin.inkSecondary} !important;
        }
        input, select, textarea, .bc-input {
          background-color: ${skin.input} !important;
          color: ${skin.inkPrimary} !important;
          border-color: ${skin.borderDefault} !important;
        }
        .bc-button-primary, .bc-button-secondary {
          border-radius: 8px !important;
        }
        /* Keep book covers & icons crisp */
        img { background: transparent !important; }
      `
          : '';

      const hideStoreCss = pu.audibleHideStoreClutter
        ? `
        .adbl-app-banner,
        [data-widget="app-download-banner"],
        #adbl-library-upsell,
        [data-widget*="upsell" i],
        [data-widget*="promo" i],
        .adbl-merchandising-banner {
          display: none !important;
        }
      `
        : '';

      return `${baseCss}
        ${darkAudibleCss}
        ${hideStoreCss}
      `;
    }

    default:
      return baseCss;
  }
}
