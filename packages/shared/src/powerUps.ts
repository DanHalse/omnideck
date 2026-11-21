import type { PowerUpsConfig } from './types.js';

export const DEFAULT_POWER_UPS: PowerUpsConfig = {
  // YouTube & YouTube Music
  youtubeSponsorBlock: true,
  youtubeHideShorts: true,
  youtubeAutoDismissStillListening: true,
  youtubeRememberSpeedQuality: true,
  youtubeForceOriginalAudio: true,
  youtubeReturnDislikes: true,
  youtubeDeArrow: false,
  youtubeHideEndScreens: true,
  youtubeDisableHoverPreview: false,
  youtubePlayerControls: true,
  ytmAudioOnlyMode: false,
  ytmPlaylistQuickFilter: true,

  // Twitch
  twitchThirdPartyEmotes: true,
  twitchAutoClaimPoints: true,
  twitchAutoTheater: false,
  twitchPauseChatOnHover: true,
  twitchAutoRecover: true,
  twitchHideClutter: true,

  // Audible
  audibleDirectToLibrary: true,
  audibleDockCloudPlayer: true,
  audibleFadeSleepAndRewind: true,
  audibleWhisperSyncFlush: true,
  audiblePrecisionSpeed: true,
  audibleHideStoreClutter: true,

  // Reddit (Modern RES)
  redditCompactDensity: true,
  redditUseOldReddit: false,
  redditKeyboardNav: true,
  redditCollapseAutoMod: true,
  redditHidePromoted: true,
  redditHideRecommended: true,
  redditNextCommentButton: true,
  redditHoverZoom: true,
  redditUserTagger: true,
  redditFilteredKeywords: [],

  // Spotify
  spotifyKeepConnectAlive: true,
  spotifyLikeShortcut: 'CommandOrControl+Alt+L',
  spotifyHidePodcastsAudiobooks: true,
};

/**
 * Safely merges partial/legacy Power-Ups configuration with curated v1.5 defaults.
 */
export function mergePowerUpsConfig(raw?: Partial<PowerUpsConfig>): PowerUpsConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_POWER_UPS, redditFilteredKeywords: [...DEFAULT_POWER_UPS.redditFilteredKeywords] };
  }
  const pickBool = <K extends keyof PowerUpsConfig>(key: K): boolean =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : (DEFAULT_POWER_UPS[key] as boolean);

  const rawKeywords = Array.isArray(raw.redditFilteredKeywords) ? raw.redditFilteredKeywords : [];
  const redditFilteredKeywords = Array.from(
    new Set(
      rawKeywords
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k.length <= 64),
    ),
  ).slice(0, 100);

  return {
    youtubeSponsorBlock: pickBool('youtubeSponsorBlock'),
    youtubeHideShorts: pickBool('youtubeHideShorts'),
    youtubeAutoDismissStillListening: pickBool('youtubeAutoDismissStillListening'),
    youtubeRememberSpeedQuality: pickBool('youtubeRememberSpeedQuality'),
    youtubeForceOriginalAudio: pickBool('youtubeForceOriginalAudio'),
    youtubeReturnDislikes: pickBool('youtubeReturnDislikes'),
    youtubeDeArrow: pickBool('youtubeDeArrow'),
    youtubeHideEndScreens: pickBool('youtubeHideEndScreens'),
    youtubeDisableHoverPreview: pickBool('youtubeDisableHoverPreview'),
    youtubePlayerControls: pickBool('youtubePlayerControls'),
    ytmAudioOnlyMode: pickBool('ytmAudioOnlyMode'),
    ytmPlaylistQuickFilter: pickBool('ytmPlaylistQuickFilter'),
    twitchThirdPartyEmotes: pickBool('twitchThirdPartyEmotes'),
    twitchAutoClaimPoints: pickBool('twitchAutoClaimPoints'),
    twitchAutoTheater: pickBool('twitchAutoTheater'),
    twitchPauseChatOnHover: pickBool('twitchPauseChatOnHover'),
    twitchAutoRecover: pickBool('twitchAutoRecover'),
    twitchHideClutter: pickBool('twitchHideClutter'),
    audibleDirectToLibrary: pickBool('audibleDirectToLibrary'),
    audibleDockCloudPlayer: pickBool('audibleDockCloudPlayer'),
    audibleFadeSleepAndRewind: pickBool('audibleFadeSleepAndRewind'),
    audibleWhisperSyncFlush: pickBool('audibleWhisperSyncFlush'),
    audiblePrecisionSpeed: pickBool('audiblePrecisionSpeed'),
    audibleHideStoreClutter: pickBool('audibleHideStoreClutter'),
    redditCompactDensity: pickBool('redditCompactDensity'),
    redditUseOldReddit: pickBool('redditUseOldReddit'),
    redditKeyboardNav: pickBool('redditKeyboardNav'),
    redditCollapseAutoMod: pickBool('redditCollapseAutoMod'),
    redditHidePromoted: pickBool('redditHidePromoted'),
    redditHideRecommended: pickBool('redditHideRecommended'),
    redditNextCommentButton: pickBool('redditNextCommentButton'),
    redditHoverZoom: pickBool('redditHoverZoom'),
    redditUserTagger: pickBool('redditUserTagger'),
    redditFilteredKeywords,
    spotifyKeepConnectAlive: pickBool('spotifyKeepConnectAlive'),
    spotifyLikeShortcut:
      typeof raw.spotifyLikeShortcut === 'string' && raw.spotifyLikeShortcut.trim()
        ? raw.spotifyLikeShortcut.trim()
        : DEFAULT_POWER_UPS.spotifyLikeShortcut,
    spotifyHidePodcastsAudiobooks: pickBool('spotifyHidePodcastsAudiobooks'),
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
 * Lightweight Power-Ups & mobile-ergonomics script shared with the Android Mobile WebView app:
 * - YouTube / YT Music: Hide Shorts shelves, Auto-dismiss "Still listening?", enforce native mobile viewport
 * - Twitch: Auto-claim Channel Points bonus chest
 * - Reddit: Dismiss/hide unclosable "Open in Reddit App" / xpromo popups, hide promoted posts, collapse AutoMod
 * - Spotify: Transform desktop Widevine Web Player into a touch-friendly responsive mobile layout with toggleable Library drawer
 */
export function buildMobilePowerUpsScript(serviceId: string, powerUps: PowerUpsConfig): string {
  const parts: string[] = [];

  if (serviceId === 'youtube' || serviceId === 'youtube-music') {
    if (serviceId === 'youtube-music') {
      parts.push(`
        (function(){
          var vp = document.querySelector('meta[name="viewport"]');
          if (!vp) {
            vp = document.createElement('meta');
            vp.name = 'viewport';
            (document.head || document.documentElement).appendChild(vp);
          }
          vp.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        })();
      `);
    }
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
    parts.push(`
      (function(){
        if (!document.getElementById('__od_reddit_mobile_anti_xpromo')) {
          const st = document.createElement('style');
          st.id = '__od_reddit_mobile_anti_xpromo';
          st.textContent = [
            'shreddit-async-loader[bundlename*="xpromo"],',
            'xpromo-app-selector,',
            'xpromo-nsfw-blocking-modal-desktop,',
            'xpromo-nsfw-bypassable-modal-desktop,',
            'xpromo-nsfw-blocking-container,',
            'shreddit-xpromo-bottom-sheet,',
            'shreddit-experience-tree [slot="get-app"],',
            '#get-app-button,',
            '[data-testid="xpromo-bottom-sheet"],',
            '[data-testid="get-app-button"],',
            '.XPromoPopup, .XPromoPill, .XPromoBanner, .XPromoInFeed,',
            'shreddit-async-loader[bundlename="bottom_bar_xpromo"],',
            'faceplate-banner[appearance="xpromo"],',
            'a[href*="reddit.app.link"],',
            '#blocking-modal {',
            '  display: none !important;',
            '  pointer-events: none !important;',
            '  visibility: hidden !important;',
            '}'
          ].join(' ');
          (document.head || document.documentElement).appendChild(st);
        }

        const isAuthPath = function() {
          const p = (window.location.pathname || '').toLowerCase();
          return p.startsWith('/login') || p.startsWith('/register') || p.startsWith('/account');
        };

        const unlockScroll = function() {
          if (isAuthPath()) return;
          try {
            if (document.documentElement) {
              document.documentElement.style.overflow = '';
              document.documentElement.style.position = '';
              document.documentElement.classList.remove('scroll-disabled', 'overflow-hidden');
            }
            if (document.body) {
              document.body.style.overflow = '';
              document.body.style.position = '';
              document.body.style.pointerEvents = '';
              document.body.classList.remove('scroll-disabled', 'overflow-hidden');
            }
            document.querySelectorAll('[inert]').forEach(function(el) {
              el.removeAttribute('inert');
            });
          } catch {}
        };

        const isAppNagText = function(txt) {
          const t = (txt || '').toLowerCase();
          return (
            t.includes('see reddit in') ||
            t.includes('open in app') ||
            t.includes('open in the reddit app') ||
            t.includes('use the reddit app') ||
            t.includes('get the reddit app') ||
            t.includes('continue in chrome') ||
            t.includes('continue in browser') ||
            t.includes('log in with the app') ||
            t.includes('view in app')
          );
        };

        const sweepNode = function(root) {
          if (!root || isAuthPath()) return;
          let removedAny = false;
          const candidates = root.querySelectorAll
            ? root.querySelectorAll(
                'xpromo-app-selector, shreddit-xpromo-bottom-sheet, shreddit-async-loader[bundlename*="xpromo"], faceplate-bottom-sheet, faceplate-dialog, rpl-dialog, rpl-modal-card, [role="dialog"], [aria-modal="true"], #blocking-modal'
              )
            : [];
          candidates.forEach(function(el) {
            const tag = (el.tagName || '').toLowerCase();
            const txt = (el.textContent || '') + ' ' + ((el.shadowRoot && el.shadowRoot.textContent) || '');
            const hasAppLink = Boolean(
              (el.querySelector && el.querySelector('a[href*="app.link"], a[href*="play.google.com"], [data-testid*="xpromo"]')) ||
              (el.shadowRoot && el.shadowRoot.querySelector('a[href*="app.link"], a[href*="play.google.com"]'))
            );
            const isXpromo = tag.includes('xpromo') || el.id === 'blocking-modal' || hasAppLink || isAppNagText(txt);
            if (!isXpromo) return;

            // Try clicking Reddit's own "Continue" / "Continue in browser" button if present first
            const btnRoot = el.shadowRoot || el;
            const btns = btnRoot.querySelectorAll ? btnRoot.querySelectorAll('button, a') : [];
            for (const b of btns) {
              const label = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase().trim();
              if (
                label === 'continue' ||
                label.includes('continue in chrome') ||
                label.includes('continue in browser') ||
                label.includes('not now') ||
                label.includes('stay on web') ||
                label === 'close'
              ) {
                try { b.click(); } catch {}
                break;
              }
            }
            try {
              el.style.setProperty('display', 'none', 'important');
              el.style.setProperty('pointer-events', 'none', 'important');
              el.removeAttribute('open');
              removedAny = true;
            } catch {}
          });

          // Walk into open shadow roots of shreddit custom elements
          if (root.querySelectorAll) {
            root.querySelectorAll('shreddit-app, shreddit-experience-tree, shreddit-async-loader, xpromo-app-selector, faceplate-bottom-sheet').forEach(function(host) {
              if (host.shadowRoot) sweepNode(host.shadowRoot);
            });
          }

          if (removedAny) unlockScroll();
        };

        if (!window.__odRedditAntiNagBound) {
          window.__odRedditAntiNagBound = true;
          sweepNode(document);
          setInterval(function() { sweepNode(document); }, 1200);

          // Ensure "Log in" / "I already have an account" inside any stuck modal goes cleanly to /login/
          document.addEventListener('click', function(ev) {
            if (isAuthPath()) return;
            const path = typeof ev.composedPath === 'function' ? ev.composedPath() : [ev.target];
            for (const n of path) {
              if (!n || !n.tagName) continue;
              const tag = n.tagName.toLowerCase();
              if (tag === 'a' && n.href && /reddit\\.app\\.link|play\\.google\\.com\\/store/i.test(n.href)) {
                ev.preventDefault();
                ev.stopPropagation();
                sweepNode(document);
                return;
              }
              if (tag === 'button' || tag === 'a') {
                const label = (n.textContent || '').toLowerCase().trim();
                if (label.includes('already have an account')) {
                  ev.preventDefault();
                  ev.stopPropagation();
                  window.location.href = 'https://www.reddit.com/login/';
                  return;
                }
              }
            }
          }, true);
        } else {
          sweepNode(document);
        }
      })();
    `);

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
    if (powerUps.redditNextCommentButton) {
      parts.push(`
        (function(){
          if (document.getElementById('__od_next_comment_btn')) return;
          const syncBtn = function() {
            const isComments = location.pathname.includes('/comments/');
            let btn = document.getElementById('__od_next_comment_btn');
            if (!isComments) {
              if (btn) btn.style.display = 'none';
              return;
            }
            if (!btn && document.body) {
              btn = document.createElement('button');
              btn.id = '__od_next_comment_btn';
              btn.type = 'button';
              btn.setAttribute('aria-label', 'Jump to next top-level comment');
              btn.textContent = '↓';
              btn.style.cssText = 'position:fixed;right:14px;bottom:84px;z-index:9990;width:40px;height:40px;padding:0;border-radius:999px;border:1px solid rgba(255,255,255,0.2);background:rgba(24,24,27,0.88);color:#fff;font-size:18px;font-weight:700;line-height:1;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,0.45);cursor:pointer;';
              btn.addEventListener('click', function() {
                const roots = Array.from(document.querySelectorAll('shreddit-comment[depth="0"], .sitetable.nestedlisting > .thing.comment'));
                const next = roots.find(function(el) { return el.getBoundingClientRect().top > 80; });
                if (next) next.scrollIntoView({ behavior: 'smooth', block: 'start' });
              });
              document.body.appendChild(btn);
            }
            if (btn) btn.style.display = 'flex';
          };
          syncBtn();
          if (!window.__odNextCmtTimer) window.__odNextCmtTimer = setInterval(syncBtn, 1500);
        })();
      `);
    }
  }

  if (serviceId === 'spotify') {
    parts.push(`
      (function(){
        // Enforce crisp 1:1 mobile viewport scaling on Spotify Web Player
        var vp = document.querySelector('meta[name="viewport"]');
        if (!vp) {
          vp = document.createElement('meta');
          vp.name = 'viewport';
          (document.head || document.documentElement).appendChild(vp);
        }
        vp.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

        if (!document.getElementById('__od_spotify_mobile_css')) {
          const st = document.createElement('style');
          st.id = '__od_spotify_mobile_css';
          st.textContent = [
            'html, body, #main, .Root, .Root__top-container {',
            '  min-width: 0 !important;',
            '  max-width: 100vw !important;',
            '  overflow-x: hidden !important;',
            '}',
            '.Root__top-container {',
            '  grid-template-columns: minmax(0, 1fr) !important;',
            '  grid-template-areas: "global-nav" "main-view" "now-playing-bar" !important;',
            '  gap: 0 !important;',
            '  padding: 0 !important;',
            '}',
            '/* Hide desktop Right Sidebar & Install/Premium nags on mobile */',
            '.Root__right-sidebar, aside[aria-label*="Now playing" i], [data-testid="right-sidebar"],',
            'a[href*="/download"], [data-testid="upgrade-button"], [data-testid="install-app-banner"] {',
            '  display: none !important;',
            '}',
            '/* Collapse desktop Left Library Sidebar into a slide-over drawer toggled by OmniDeck pill */',
            '#Desktop_LeftSidebar_Id, .Root__nav-bar {',
            '  position: fixed !important;',
            '  top: 0 !important; left: 0 !important; bottom: 72px !important;',
            '  width: 84vw !important; max-width: 320px !important;',
            '  z-index: 9998 !important;',
            '  transform: translateX(-105%) !important;',
            '  transition: transform 200ms ease !important;',
            '  box-shadow: 12px 0 36px rgba(0,0,0,0.65) !important;',
            '}',
            'html.__od-sp-lib-open #Desktop_LeftSidebar_Id,',
            'html.__od-sp-lib-open .Root__nav-bar {',
            '  transform: translateX(0) !important;',
            '}',
            '/* Keep main view full-width and touch-friendly */',
            '.Root__main-view, [data-testid="main-view"] {',
            '  min-width: 0 !important;',
            '  width: 100vw !important;',
            '  border-radius: 0 !important;',
            '}',
            '/* Compact Spotify global nav & search bar for phone width */',
            '#global-nav-bar, [data-testid="global-nav-bar"] {',
            '  padding: 6px 8px 6px 52px !important;',
            '  gap: 6px !important;',
            '  min-height: 48px !important;',
            '}',
            '[data-testid="search-input"] {',
            '  min-width: 0 !important;',
            '}',
            '/* Compact bottom player bar so controls fit cleanly on 360-430px screens */',
            '.Root__now-playing-bar, [data-testid="now-playing-bar"] {',
            '  min-width: 0 !important;',
            '  padding: 4px 8px !important;',
            '}',
            '[data-testid="now-playing-bar"] > div:last-child,',
            '.volume-bar {',
            '  display: none !important;',
            '}',
            '/* Floating Library Drawer toggle button */',
            '#__od_sp_lib_btn {',
            '  position: fixed !important;',
            '  top: 8px !important; left: 8px !important;',
            '  z-index: 9999 !important;',
            '  height: 34px !important; width: 36px !important;',
            '  border-radius: 9px !important;',
            '  border: 1px solid rgba(255,255,255,0.18) !important;',
            '  background: rgba(24,24,24,0.92) !important;',
            '  color: #ffffff !important;',
            '  font-size: 16px !important;',
            '  font-weight: 700 !important;',
            '  display: flex !important; align-items: center !important; justify-content: center !important;',
            '  box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;',
            '}'
          ].join('\\n');
          (document.head || document.documentElement).appendChild(st);
        }

        if (!document.getElementById('__od_sp_lib_btn') && document.body) {
          const btn = document.createElement('button');
          btn.id = '__od_sp_lib_btn';
          btn.type = 'button';
          btn.setAttribute('aria-label', 'Toggle Spotify Library');
          btn.textContent = '☰';
          btn.addEventListener('click', function(ev) {
            ev.stopPropagation();
            const open = document.documentElement.classList.toggle('__od-sp-lib-open');
            btn.textContent = open ? '✕' : '☰';
          });
          document.body.appendChild(btn);

          document.addEventListener('click', function(ev) {
            if (!document.documentElement.classList.contains('__od-sp-lib-open')) return;
            const target = ev.target;
            if (target && target.closest && (target.closest('#Desktop_LeftSidebar_Id') || target.closest('.Root__nav-bar') || target.closest('#__od_sp_lib_btn'))) {
              // If user tapped a playlist/library link inside the sidebar, auto-close drawer smoothly
              if (target.closest('a, [role="listitem"], [data-testid="rootlist-item"]')) {
                setTimeout(function() {
                  document.documentElement.classList.remove('__od-sp-lib-open');
                  btn.textContent = '☰';
                }, 150);
              }
              return;
            }
            document.documentElement.classList.remove('__od-sp-lib-open');
            btn.textContent = '☰';
          }, true);
        }
      })();
    `);
  }

  if (parts.length === 0) return 'true;';
  return `(function(){ try { ${parts.join('\n')} } catch {} })(); true;`;
}
