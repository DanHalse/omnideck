import type { PowerUpsConfig } from './types.js';

export const DEFAULT_POWER_UPS: PowerUpsConfig = {
  // YouTube & YouTube Music
  youtubeSponsorBlock: true,
  youtubeHideShorts: true,
  youtubeAutoDismissStillListening: true,
  youtubeRememberSpeedQuality: true,

  // Twitch
  twitchThirdPartyEmotes: true,
  twitchAutoClaimPoints: true,
  twitchAutoTheater: false,
  twitchPauseChatOnHover: true,

  // Audible
  audibleDirectToLibrary: true,
  audibleDockCloudPlayer: true,
  audibleFadeSleepAndRewind: true,
  audibleWhisperSyncFlush: true,

  // Reddit (RES-Lite)
  redditCompactDensity: true,
  redditUseOldReddit: false,
  redditKeyboardNav: true,
  redditCollapseAutoMod: true,
  redditHidePromoted: true,

  // Spotify
  spotifyKeepConnectAlive: true,
  spotifyLikeShortcut: 'CommandOrControl+Alt+L',
};

/**
 * Safely merges partial/legacy Power-Ups configuration with curated v1.3 defaults.
 */
export function mergePowerUpsConfig(raw?: Partial<PowerUpsConfig>): PowerUpsConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_POWER_UPS };
  }
  const pickBool = <K extends keyof PowerUpsConfig>(key: K): boolean =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : (DEFAULT_POWER_UPS[key] as boolean);

  return {
    youtubeSponsorBlock: pickBool('youtubeSponsorBlock'),
    youtubeHideShorts: pickBool('youtubeHideShorts'),
    youtubeAutoDismissStillListening: pickBool('youtubeAutoDismissStillListening'),
    youtubeRememberSpeedQuality: pickBool('youtubeRememberSpeedQuality'),
    twitchThirdPartyEmotes: pickBool('twitchThirdPartyEmotes'),
    twitchAutoClaimPoints: pickBool('twitchAutoClaimPoints'),
    twitchAutoTheater: pickBool('twitchAutoTheater'),
    twitchPauseChatOnHover: pickBool('twitchPauseChatOnHover'),
    audibleDirectToLibrary: pickBool('audibleDirectToLibrary'),
    audibleDockCloudPlayer: pickBool('audibleDockCloudPlayer'),
    audibleFadeSleepAndRewind: pickBool('audibleFadeSleepAndRewind'),
    audibleWhisperSyncFlush: pickBool('audibleWhisperSyncFlush'),
    redditCompactDensity: pickBool('redditCompactDensity'),
    redditUseOldReddit: pickBool('redditUseOldReddit'),
    redditKeyboardNav: pickBool('redditKeyboardNav'),
    redditCollapseAutoMod: pickBool('redditCollapseAutoMod'),
    redditHidePromoted: pickBool('redditHidePromoted'),
    spotifyKeepConnectAlive: pickBool('spotifyKeepConnectAlive'),
    spotifyLikeShortcut:
      typeof raw.spotifyLikeShortcut === 'string' && raw.spotifyLikeShortcut.trim()
        ? raw.spotifyLikeShortcut.trim()
        : DEFAULT_POWER_UPS.spotifyLikeShortcut,
  };
}

/**
 * Rewrites navigation URLs for active Power-Ups while carefully preserving OAuth/sign-in flows:
 * - YouTube Shorts (`/shorts/<id>`) -> standard `/watch?v=<id>` player when `youtubeHideShorts` is on
 * - Reddit `www.reddit.com` -> `old.reddit.com` when `redditUseOldReddit` is on
 * - Audible bare storefront homepage -> `/library/titles` when `audibleDirectToLibrary` is on
 */
export function rewriteUrlForPowerUps(
  serviceId: string,
  rawUrl: string,
  powerUps: PowerUpsConfig,
): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    const host = parsed.hostname.toLowerCase();
    const pathLower = parsed.pathname.toLowerCase();

    // Never touch authentication / OAuth / checkout / account endpoints
    if (
      host.startsWith('accounts.') ||
      host.includes('signin') ||
      pathLower.includes('/login') ||
      pathLower.includes('/signin') ||
      pathLower.includes('/sign-in') ||
      pathLower.includes('/oauth') ||
      pathLower.includes('/ap/') ||
      pathLower.includes('/accounts/') ||
      pathLower.includes('checkconnection') ||
      pathLower.includes('setsid')
    ) {
      return null;
    }

    // YouTube: Convert /shorts/<videoId> into normal watch player
    if (
      serviceId === 'youtube' &&
      powerUps.youtubeHideShorts &&
      (host === 'www.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com')
    ) {
      const shortsMatch = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{6,})/);
      if (shortsMatch) {
        const next = new URL(parsed.origin + '/watch');
        next.searchParams.set('v', shortsMatch[1]);
        return next.toString();
      }
    }

    // Reddit: Optional 1-click Old Reddit redirect
    if (
      serviceId === 'reddit' &&
      powerUps.redditUseOldReddit &&
      (host === 'www.reddit.com' || host === 'reddit.com' || host === 'sh.reddit.com') &&
      !pathLower.startsWith('/media') &&
      !pathLower.startsWith('/gallery') &&
      !pathLower.startsWith('/poll') &&
      !pathLower.startsWith('/account') &&
      !pathLower.startsWith('/register')
    ) {
      parsed.hostname = 'old.reddit.com';
      return parsed.toString();
    }

    // Audible: Direct-to-Library when landing on bare storefront homepage
    if (
      serviceId === 'audible' &&
      powerUps.audibleDirectToLibrary &&
      /(^|\.)audible\.(com|co\.uk|com\.au|ca|de|fr|it|es|co\.jp|in)$/i.test(host) &&
      (parsed.pathname === '/' || parsed.pathname === '' || parsed.pathname === '/home')
    ) {
      parsed.pathname = '/library/titles';
      parsed.search = '';
      return parsed.toString();
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts a YouTube / YouTube Music 11-char video ID from a watch URL.
 */
export function extractYouTubeVideoId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const shortsMatch = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch) return shortsMatch[1];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts a Twitch channel login from a twitch.tv URL (ignoring directories/settings/popouts).
 */
export function extractTwitchChannelLogin(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'www.twitch.tv' && host !== 'twitch.tv' && host !== 'm.twitch.tv') {
      return null;
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    const first = parts[0].toLowerCase();
    const reserved = new Set([
      'directory',
      'downloads',
      'drops',
      'following',
      'inventory',
      'jobs',
      'login',
      'p',
      'popout',
      'prime',
      'search',
      'settings',
      'signup',
      'subscriptions',
      'turbo',
      'u',
      'videos',
      'wallet',
    ]);
    if (reserved.has(first)) {
      if (first === 'popout' && parts[1] && /^[a-z0-9_]{2,25}$/i.test(parts[1])) {
        return parts[1].toLowerCase();
      }
      return null;
    }
    return /^[a-z0-9_]{2,25}$/i.test(first) ? first : null;
  } catch {
    return null;
  }
}

/**
 * Lightweight Power-Ups script shared with the Android Mobile WebView app:
 * - YouTube: Hide Shorts shelves + Auto-dismiss "Are you still listening?"
 * - Twitch: Auto-claim Channel Points bonus chest
 * - Reddit: Hide promoted posts + auto-collapse AutoModerator
 */
export function buildMobilePowerUpsScript(serviceId: string, powerUps: PowerUpsConfig): string {
  const parts: string[] = [];

  if (serviceId === 'youtube' || serviceId === 'youtube-music') {
    if (serviceId === 'youtube' && powerUps.youtubeHideShorts) {
      parts.push(`
        (function(){
          if (!document.getElementById('__od_hide_shorts')) {
            const st = document.createElement('style');
            st.id = '__od_hide_shorts';
            st.textContent = 'ytm-reel-shelf-renderer, ytd-reel-shelf-renderer, ytd-rich-section-renderer[is-shorts], ytm-pivot-bar-item-renderer:has(.pivot-shorts), a[title="Shorts"] { display: none !important; }';
            (document.head || document.documentElement).appendChild(st);
          }
        })();
      `);
    }
    if (powerUps.youtubeAutoDismissStillListening) {
      parts.push(`
        (function(){
          if (window.__odStillListeningTimer) return;
          window.__odStillListeningTimer = setInterval(function() {
            const confirm = document.querySelector('yt-confirm-dialog-renderer #confirm-button button, ytmusic-you-there-renderer button');
            if (confirm && confirm.offsetParent !== null) {
              try { confirm.click(); } catch {}
            }
          }, 4000);
        })();
      `);
    }
  }

  if (serviceId === 'twitch' && powerUps.twitchAutoClaimPoints) {
    parts.push(`
      (function(){
        if (window.__odTwitchBonusTimer) return;
        window.__odTwitchBonusTimer = setInterval(function() {
          const btn = document.querySelector('[aria-label*="Claim Bonus" i], button:has(.claimable-bonus__icon)');
          if (btn && typeof btn.click === 'function') {
            try { btn.click(); } catch {}
          }
        }, 5000);
      })();
    `);
  }

  if (serviceId === 'reddit') {
    if (powerUps.redditHidePromoted) {
      parts.push(`
        (function(){
          if (!document.getElementById('__od_reddit_promo')) {
            const st = document.createElement('style');
            st.id = '__od_reddit_promo';
            st.textContent = 'shreddit-ad-post, .promotedlink, [data-testid="post-container"]:has([data-adclicklocation]) { display: none !important; }';
            (document.head || document.documentElement).appendChild(st);
          }
        })();
      `);
    }
    if (powerUps.redditCollapseAutoMod) {
      parts.push(`
        (function(){
          if (window.__odAutoModTimer) return;
          const collapse = function() {
            document.querySelectorAll('shreddit-comment[author="AutoModerator"]:not([collapsed])').forEach(function(el) {
              el.setAttribute('collapsed', '');
            });
          };
          collapse();
          window.__odAutoModTimer = setInterval(collapse, 3000);
        })();
      `);
    }
  }

  if (parts.length === 0) return 'true;';
  return `(function(){ try { ${parts.join('\n')} } catch {} })(); true;`;
}
