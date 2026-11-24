import type { PowerUpsConfig, SkinPresetId } from './types.js';
import { buildUnifiedSkinCss } from './skins.js';

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
  youtubeStartOnSubscriptions: false,
  youtubeHideWatched: false,
  youtubeQuickThumbActions: true,
  youtubeClassicLayoutLock: true,
  youtubeBlockedChannels: [],
  ytmAudioOnlyMode: false,
  ytmPlaylistQuickFilter: true,
  ytmSmartFadeAndSilenceTrim: true,
  ytmPlaylistSorter: true,

  // Twitch
  twitchThirdPartyEmotes: true,
  twitchAutoClaimPoints: true,
  twitchAutoTheater: false,
  twitchPauseChatOnHover: true,
  twitchAutoRecover: true,
  twitchHideClutter: true,
  twitchEmoteAutocomplete: true,
  twitchChatHighlights: [],
  twitchFollowedFirstMobile: true,

  // Audible
  audibleDirectToLibrary: true,
  audibleDockCloudPlayer: true,
  audibleFadeSleepAndRewind: true,
  audibleWhisperSyncFlush: true,
  audiblePrecisionSpeed: true,
  audibleHideStoreClutter: true,
  audibleDarkMode: true,
  audibleCustomSkipSec: 15,

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
  redditColorDepthLines: true,
  redditExactTimestamps: true,
  redditKillVideoScroll: true,

  // Spotify
  spotifyKeepConnectAlive: true,
  spotifyLikeShortcut: 'CommandOrControl+Alt+L',
  spotifyHidePodcastsAudiobooks: true,
  spotifyGuardSmartShuffle: true,
  spotifyQueueDuration: true,
};

function sanitizeStringList(raw: unknown, maxItems = 100): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k.length <= 64),
    ),
  ).slice(0, maxItems);
}

/**
 * Safely merges partial/legacy Power-Ups configuration with curated v1.6 defaults.
 */
export function mergePowerUpsConfig(raw?: Partial<PowerUpsConfig>): PowerUpsConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_POWER_UPS,
      redditFilteredKeywords: [...DEFAULT_POWER_UPS.redditFilteredKeywords],
      youtubeBlockedChannels: [...DEFAULT_POWER_UPS.youtubeBlockedChannels],
      twitchChatHighlights: [...DEFAULT_POWER_UPS.twitchChatHighlights],
    };
  }
  const pickBool = <K extends keyof PowerUpsConfig>(key: K): boolean =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : (DEFAULT_POWER_UPS[key] as boolean);

  const rawSkip = Number(raw.audibleCustomSkipSec);
  const audibleCustomSkipSec =
    rawSkip === 10 || rawSkip === 15 || rawSkip === 30 || rawSkip === 60
      ? rawSkip
      : DEFAULT_POWER_UPS.audibleCustomSkipSec;

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
    youtubeStartOnSubscriptions: pickBool('youtubeStartOnSubscriptions'),
    youtubeHideWatched: pickBool('youtubeHideWatched'),
    youtubeQuickThumbActions: pickBool('youtubeQuickThumbActions'),
    youtubeClassicLayoutLock: pickBool('youtubeClassicLayoutLock'),
    youtubeBlockedChannels: sanitizeStringList(raw.youtubeBlockedChannels),
    ytmAudioOnlyMode: pickBool('ytmAudioOnlyMode'),
    ytmPlaylistQuickFilter: pickBool('ytmPlaylistQuickFilter'),
    ytmSmartFadeAndSilenceTrim: pickBool('ytmSmartFadeAndSilenceTrim'),
    ytmPlaylistSorter: pickBool('ytmPlaylistSorter'),
    twitchThirdPartyEmotes: pickBool('twitchThirdPartyEmotes'),
    twitchAutoClaimPoints: pickBool('twitchAutoClaimPoints'),
    twitchAutoTheater: pickBool('twitchAutoTheater'),
    twitchPauseChatOnHover: pickBool('twitchPauseChatOnHover'),
    twitchAutoRecover: pickBool('twitchAutoRecover'),
    twitchHideClutter: pickBool('twitchHideClutter'),
    twitchEmoteAutocomplete: pickBool('twitchEmoteAutocomplete'),
    twitchChatHighlights: sanitizeStringList(raw.twitchChatHighlights, 60),
    twitchFollowedFirstMobile: pickBool('twitchFollowedFirstMobile'),
    audibleDirectToLibrary: pickBool('audibleDirectToLibrary'),
    audibleDockCloudPlayer: pickBool('audibleDockCloudPlayer'),
    audibleFadeSleepAndRewind: pickBool('audibleFadeSleepAndRewind'),
    audibleWhisperSyncFlush: pickBool('audibleWhisperSyncFlush'),
    audiblePrecisionSpeed: pickBool('audiblePrecisionSpeed'),
    audibleHideStoreClutter: pickBool('audibleHideStoreClutter'),
    audibleDarkMode: pickBool('audibleDarkMode'),
    audibleCustomSkipSec,
    redditCompactDensity: pickBool('redditCompactDensity'),
    redditUseOldReddit: pickBool('redditUseOldReddit'),
    redditKeyboardNav: pickBool('redditKeyboardNav'),
    redditCollapseAutoMod: pickBool('redditCollapseAutoMod'),
    redditHidePromoted: pickBool('redditHidePromoted'),
    redditHideRecommended: pickBool('redditHideRecommended'),
    redditNextCommentButton: pickBool('redditNextCommentButton'),
    redditHoverZoom: pickBool('redditHoverZoom'),
    redditUserTagger: pickBool('redditUserTagger'),
    redditFilteredKeywords: sanitizeStringList(raw.redditFilteredKeywords),
    redditColorDepthLines: pickBool('redditColorDepthLines'),
    redditExactTimestamps: pickBool('redditExactTimestamps'),
    redditKillVideoScroll: pickBool('redditKillVideoScroll'),
    spotifyKeepConnectAlive: pickBool('spotifyKeepConnectAlive'),
    spotifyLikeShortcut:
      typeof raw.spotifyLikeShortcut === 'string' && raw.spotifyLikeShortcut.trim()
        ? raw.spotifyLikeShortcut.trim()
        : DEFAULT_POWER_UPS.spotifyLikeShortcut,
    spotifyHidePodcastsAudiobooks: pickBool('spotifyHidePodcastsAudiobooks'),
    spotifyGuardSmartShuffle: pickBool('spotifyGuardSmartShuffle'),
    spotifyQueueDuration: pickBool('spotifyQueueDuration'),
  };
}

/**
 * Rewrites navigation URLs for active Power-Ups while carefully preserving OAuth/sign-in flows:
 * - YouTube Shorts (`/shorts/<id>`) -> standard `/watch?v=<id>` player when `youtubeHideShorts` is on
 * - YouTube bare `/` -> `/feed/subscriptions` when `youtubeStartOnSubscriptions` is on
 * - Twitch mobile bare `/` -> `/directory/following/live` when `twitchFollowedFirstMobile` is on
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

    // YouTube: Start directly on Subscriptions feed instead of algorithmic Home
    if (
      serviceId === 'youtube' &&
      powerUps.youtubeStartOnSubscriptions &&
      (host === 'www.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com') &&
      (parsed.pathname === '/' || parsed.pathname === '') &&
      !parsed.search
    ) {
      return `${parsed.origin}/feed/subscriptions`;
    }

    // Twitch Mobile: Followed-First mode (skip TikTok-style discovery feed)
    if (
      serviceId === 'twitch' &&
      powerUps.twitchFollowedFirstMobile &&
      host === 'm.twitch.tv' &&
      (parsed.pathname === '/' || parsed.pathname === '') &&
      !parsed.search
    ) {
      return 'https://m.twitch.tv/directory/following/live';
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
export function buildMobilePowerUpsScript(
  serviceId: string,
  powerUps: PowerUpsConfig,
  skinId: SkinPresetId = 'obsidian',
): string {
  const parts: string[] = [];

  const unifiedSkinCss = buildUnifiedSkinCss(serviceId, skinId, powerUps);
  if (unifiedSkinCss.trim()) {
    parts.push(`
      (function(){
        var st = document.getElementById('__od_unified_skin_css');
        if (!st) {
          st = document.createElement('style');
          st.id = '__od_unified_skin_css';
          (document.head || document.documentElement).appendChild(st);
        }
        st.textContent = ${JSON.stringify(unifiedSkinCss)};
      })();
    `);
  }

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
    if (serviceId === 'youtube') {
      parts.push(`
        (function(){
          window.__odMobileYtCfg = {
            hideShorts: ${Boolean(powerUps.youtubeHideShorts)},
            hideEndScreens: ${Boolean(powerUps.youtubeHideEndScreens)},
            returnDislikes: ${Boolean(powerUps.youtubeReturnDislikes)},
            sponsorBlock: ${Boolean(powerUps.youtubeSponsorBlock)}
          };

          var st = document.getElementById('__od_mobile_yt_css');
          if (!st) {
            st = document.createElement('style');
            st.id = '__od_mobile_yt_css';
            (document.head || document.documentElement).appendChild(st);
          }
          var rules = [];
          if (window.__odMobileYtCfg.hideShorts) {
            rules.push('ytm-reel-shelf-renderer, ytd-reel-shelf-renderer, ytd-rich-section-renderer[is-shorts], ytm-pivot-bar-item-renderer:has(.pivot-shorts), a[title="Shorts"] { display: none !important; }');
          }
          if (window.__odMobileYtCfg.hideEndScreens) {
            rules.push('.ytp-ce-element, .ytp-endscreen-content, .ytp-cards-teaser { display: none !important; }');
          }
          st.textContent = rules.join('\\n');

          var fmtRyd = function(n) {
            if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\\.0$/, '') + 'M';
            if (n >= 1000) return (n / 1000).toFixed(1).replace(/\\.0$/, '') + 'K';
            return String(n);
          };

          window.__odApplyMobileRyd = function() {
            try {
              if (!window.__odMobileYtCfg || !window.__odMobileYtCfg.returnDislikes) {
                var oldDis = document.getElementById('__od_ryd_count');
                if (oldDis) oldDis.remove();
                var oldBar = document.getElementById('__od_ryd_bar');
                if (oldBar) oldBar.remove();
                return;
              }
              var stats = window.__odMobileRydStats;
              if (!stats || !stats.videoId) return;
              var curVid = new URLSearchParams(location.search).get('v') || '';
              if (curVid !== stats.videoId && !location.pathname.includes('/shorts/' + stats.videoId)) return;

              var dislikeBtn =
                document.querySelector('ytd-watch-metadata dislike-button-view-model button') ||
                document.querySelector('dislike-button-view-model button') ||
                document.querySelector('#segmented-dislike-button button') ||
                document.querySelector('ytm-segmented-like-dislike-button-renderer button[aria-label*="Dislike" i]') ||
                document.querySelector('button[aria-label*="Dislike this video" i]');
              if (!dislikeBtn) return;

              var dvm = dislikeBtn.closest('dislike-button-view-model, #segmented-dislike-button');
              if (dvm) {
                dvm.style.setProperty('width', 'auto', 'important');
                dvm.style.setProperty('overflow', 'visible', 'important');
              }
              dislikeBtn.style.setProperty('width', 'auto', 'important');
              dislikeBtn.style.setProperty('min-width', 'max-content', 'important');
              dislikeBtn.style.setProperty('padding-left', '10px', 'important');
              dislikeBtn.style.setProperty('padding-right', '12px', 'important');
              dislikeBtn.style.setProperty('gap', '5px', 'important');
              dislikeBtn.style.setProperty('overflow', 'visible', 'important');

              var label = dislikeBtn.querySelector('#__od_ryd_count');
              if (!label) {
                label = document.createElement('span');
                label.id = '__od_ryd_count';
                label.style.cssText = 'display:inline-flex;align-items:center;font:500 13px/1 Roboto,system-ui,sans-serif;color:inherit;white-space:nowrap;';
                var touch = dislikeBtn.querySelector('.yt-spec-touch-feedback-shape, yt-touch-feedback-shape');
                if (touch) dislikeBtn.insertBefore(label, touch);
                else dislikeBtn.appendChild(label);
              }
              label.textContent = fmtRyd(Math.max(0, Math.round(stats.dislikes || 0)));

              var likes = Math.max(0, Math.round(stats.likes || 0));
              var dislikes = Math.max(0, Math.round(stats.dislikes || 0));
              var total = Math.max(1, likes + dislikes);
              var pct = Math.min(100, Math.max(0, Math.round((likes / total) * 100)));
              var seg = dislikeBtn.closest('segmented-like-dislike-button-view-model, ytd-segmented-like-dislike-button-renderer, ytm-segmented-like-dislike-button-renderer');
              if (seg) {
                seg.style.position = 'relative';
                var bar = seg.querySelector('#__od_ryd_bar');
                if (!bar) {
                  bar = document.createElement('div');
                  bar.id = '__od_ryd_bar';
                  bar.style.cssText = 'position:absolute;left:8px;right:8px;bottom:-4px;height:3px;border-radius:2px;background:rgba(240,82,82,0.82);overflow:hidden;pointer-events:none;';
                  var fill = document.createElement('div');
                  fill.id = '__od_ryd_fill';
                  fill.style.cssText = 'height:100%;background:#3ECF8E;transition:width 0.2s ease;';
                  bar.appendChild(fill);
                  seg.appendChild(bar);
                }
                var fillEl = bar.querySelector('#__od_ryd_fill');
                if (fillEl) fillEl.style.width = pct + '%';
              }
            } catch {}
          };

          if (!window.__odMobileYtHooksBound) {
            window.__odMobileYtHooksBound = true;
            setInterval(function() {
              if (typeof window.__odApplyMobileRyd === 'function') window.__odApplyMobileRyd();
            }, 2200);
          }
          window.__odApplyMobileRyd();
        })();
      `);
    }

    if (powerUps.youtubeSponsorBlock) {
      parts.push(`
        (function(){
          if (!window.__odMobileSponsorSkipped) window.__odMobileSponsorSkipped = new Set();
          if (window.__odMobileSponsorBound) return;
          window.__odMobileSponsorBound = true;
          var showToast = function(msg, undoStart) {
            var old = document.getElementById('__od_mob_sb_toast');
            if (old) old.remove();
            var t = document.createElement('div');
            t.id = '__od_mob_sb_toast';
            t.style.cssText = 'position:fixed;bottom:72px;right:14px;z-index:2147483647;display:flex;align-items:center;gap:8px;padding:7px 11px;border-radius:10px;background:rgba(15,17,26,0.92);color:#fff;font:600 12px/1.2 system-ui,sans-serif;border:1px solid rgba(255,255,255,0.18);box-shadow:0 6px 20px rgba(0,0,0,0.45);';
            var s = document.createElement('span');
            s.textContent = msg;
            t.appendChild(s);
            if (typeof undoStart === 'number') {
              var b = document.createElement('button');
              b.textContent = 'Undo';
              b.style.cssText = 'border:none;background:#E87A3E;color:#fff;padding:3px 8px;border-radius:6px;font:700 11px system-ui,sans-serif;';
              b.onclick = function() {
                var v = document.querySelector('video');
                if (v) v.currentTime = Math.max(0, undoStart);
                t.remove();
              };
              t.appendChild(b);
            }
            if (document.body) {
              document.body.appendChild(t);
              setTimeout(function(){ if (t.parentNode) t.remove(); }, 3800);
            }
          };
          document.addEventListener('timeupdate', function() {
            var segs = window.__odMobileSponsorSegments;
            if (!Array.isArray(segs) || segs.length === 0) return;
            var v = document.querySelector('video.html5-main-video') || document.querySelector('video');
            if (!v || v.paused || !Number.isFinite(v.currentTime)) return;
            var cur = v.currentTime;
            for (var i = 0; i < segs.length; i++) {
              var seg = segs[i];
              var key = (window.__odMobileSponsorVideoId || '') + ':' + seg.start + '-' + seg.end;
              if (!window.__odMobileSponsorSkipped.has(key) && cur >= seg.start && cur < seg.end - 0.35) {
                window.__odMobileSponsorSkipped.add(key);
                v.currentTime = seg.end;
                showToast('Skipped ' + (seg.category === 'music_offtopic' ? 'non-music' : seg.category), seg.start);
                break;
              }
            }
          }, true);
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
