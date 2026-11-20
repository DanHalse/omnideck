import crypto from 'node:crypto';
import type { PowerUpsConfig } from '@omnideck/shared';

export interface SponsorSegment {
  start: number;
  end: number;
  category: string;
}

export interface EmoteEntry {
  name: string;
  url: string;
  provider: '7tv' | 'bttv' | 'ffz';
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const sponsorCache = new Map<string, CacheEntry<SponsorSegment[]>>();
const emoteCache = new Map<string, CacheEntry<Record<string, string>>>();
let globalEmotesCache: CacheEntry<Record<string, string>> | null = null;

async function fetchJsonWithTimeout(url: string, timeoutMs = 3500): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches SponsorBlock skip segments using k-anonymity SHA-256 4-char video ID hash prefix
 * so full video IDs are never sent to SponsorBlock servers.
 */
export async function fetchSponsorSegments(
  videoId: string,
  isMusic: boolean,
): Promise<SponsorSegment[]> {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return [];

  const cacheKey = `${videoId}:${isMusic ? 'ytm' : 'yt'}`;
  const cached = sponsorCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const hashPrefix = crypto.createHash('sha256').update(videoId).digest('hex').slice(0, 4);
  const categories = isMusic
    ? ['music_offtopic', 'sponsor', 'intro', 'outro']
    : ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro'];

  const params = new URLSearchParams();
  for (const cat of categories) {
    params.append('category', cat);
  }
  const url = `https://sponsor.ajay.app/api/skipSegments/${hashPrefix}?${params.toString()}`;
  const raw = await fetchJsonWithTimeout(url, 3200);

  const segments: SponsorSegment[] = [];
  if (Array.isArray(raw)) {
    const match = raw.find(
      (entry: unknown) =>
        entry &&
        typeof entry === 'object' &&
        (entry as { videoID?: string }).videoID === videoId &&
        Array.isArray((entry as { segments?: unknown[] }).segments),
    ) as { segments: Array<{ segment?: [number, number]; category?: string }> } | undefined;

    if (match) {
      for (const item of match.segments) {
        if (
          Array.isArray(item.segment) &&
          typeof item.segment[0] === 'number' &&
          typeof item.segment[1] === 'number' &&
          item.segment[1] > item.segment[0] + 0.5
        ) {
          segments.push({
            start: item.segment[0],
            end: item.segment[1],
            category: item.category || 'sponsor',
          });
        }
      }
    }
  }

  // Keep bounded LRU cache (max 250 videos, 15 min TTL)
  if (sponsorCache.size > 250) {
    const firstKey = sponsorCache.keys().next().value;
    if (firstKey) sponsorCache.delete(firstKey);
  }
  sponsorCache.set(cacheKey, { value: segments, expiresAt: Date.now() + 15 * 60_000 });
  return segments;
}

async function fetchGlobalTwitchEmotes(): Promise<Record<string, string>> {
  if (globalEmotesCache && globalEmotesCache.expiresAt > Date.now()) {
    return globalEmotesCache.value;
  }

  const map: Record<string, string> = {};
  const [sevenTv, bttv, ffz] = await Promise.all([
    fetchJsonWithTimeout('https://7tv.io/v3/emote-sets/global', 3500),
    fetchJsonWithTimeout('https://api.betterttv.net/3/cached/emotes/global', 3500),
    fetchJsonWithTimeout('https://api.frankerfacez.com/v1/set/global', 3500),
  ]);

  // FFZ Global
  if (ffz && typeof ffz === 'object' && 'sets' in ffz) {
    const sets = (ffz as { sets?: Record<string, { emoticons?: Array<{ name?: string; urls?: Record<string, string> }> }> }).sets;
    if (sets) {
      for (const setObj of Object.values(sets)) {
        for (const em of setObj?.emoticons ?? []) {
          const url = em.urls?.['2'] || em.urls?.['1'];
          if (em.name && url) {
            map[em.name] = url.startsWith('//') ? `https:${url}` : url;
          }
        }
      }
    }
  }

  // BTTV Global
  if (Array.isArray(bttv)) {
    for (const em of bttv as Array<{ id?: string; code?: string }>) {
      if (em.id && em.code) {
        map[em.code] = `https://cdn.betterttv.net/emote/${em.id}/2x`;
      }
    }
  }

  // 7TV Global (highest priority)
  if (sevenTv && typeof sevenTv === 'object' && Array.isArray((sevenTv as { emotes?: unknown[] }).emotes)) {
    for (const em of (sevenTv as { emotes: Array<{ id?: string; name?: string }> }).emotes) {
      if (em.id && em.name) {
        map[em.name] = `https://cdn.7tv.app/emote/${em.id}/2x.webp`;
      }
    }
  }

  globalEmotesCache = { value: map, expiresAt: Date.now() + 30 * 60_000 };
  return map;
}

/**
 * Fetches global + channel-specific 7TV, BTTV, and FrankerFaceZ emotes for a Twitch channel login.
 */
export async function fetchTwitchEmotes(channelLogin: string): Promise<Record<string, string>> {
  const login = channelLogin.trim().toLowerCase();
  if (!login) return {};

  const cached = emoteCache.get(login);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const globals = await fetchGlobalTwitchEmotes();
  const merged: Record<string, string> = { ...globals };

  // Resolve Twitch room ID via FFZ public room endpoint (no Twitch OAuth needed!)
  const ffzRoom = (await fetchJsonWithTimeout(
    `https://api.frankerfacez.com/v1/room/${encodeURIComponent(login)}`,
    3500,
  )) as {
    room?: { twitch_id?: number; set?: number };
    sets?: Record<string, { emoticons?: Array<{ name?: string; urls?: Record<string, string> }> }>;
  } | null;

  if (ffzRoom?.sets) {
    for (const setObj of Object.values(ffzRoom.sets)) {
      for (const em of setObj?.emoticons ?? []) {
        const url = em.urls?.['2'] || em.urls?.['1'];
        if (em.name && url) {
          merged[em.name] = url.startsWith('//') ? `https:${url}` : url;
        }
      }
    }
  }

  const twitchId = ffzRoom?.room?.twitch_id;
  if (twitchId) {
    const [bttvUser, sevenTvUser] = await Promise.all([
      fetchJsonWithTimeout(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`, 3500),
      fetchJsonWithTimeout(`https://7tv.io/v3/users/twitch/${twitchId}`, 3500),
    ]);

    if (bttvUser && typeof bttvUser === 'object') {
      const b = bttvUser as {
        channelEmotes?: Array<{ id?: string; code?: string }>;
        sharedEmotes?: Array<{ id?: string; code?: string }>;
      };
      for (const em of [...(b.channelEmotes ?? []), ...(b.sharedEmotes ?? [])]) {
        if (em.id && em.code) {
          merged[em.code] = `https://cdn.betterttv.net/emote/${em.id}/2x`;
        }
      }
    }

    if (sevenTvUser && typeof sevenTvUser === 'object') {
      const s = sevenTvUser as {
        emote_set?: { emotes?: Array<{ id?: string; name?: string }> };
      };
      for (const em of s.emote_set?.emotes ?? []) {
        if (em.id && em.name) {
          merged[em.name] = `https://cdn.7tv.app/emote/${em.id}/2x.webp`;
        }
      }
    }
  }

  if (emoteCache.size > 60) {
    const firstKey = emoteCache.keys().next().value;
    if (firstKey) emoteCache.delete(firstKey);
  }
  emoteCache.set(login, { value: merged, expiresAt: Date.now() + 15 * 60_000 });
  return merged;
}

/**
 * Injected YouTube / YouTube Music Power-Up runtime:
 * - SponsorBlock segment skipper with in-player "Skipped [category] • Undo" pill
 * - Auto-dismiss "Are you still listening?" / "Video paused" dialogs
 * - Remember preferred playback speed on YouTube
 */
export function buildYouTubePowerUpScript(
  serviceId: 'youtube' | 'youtube-music',
  powerUps: PowerUpsConfig,
): string {
  const isMusic = serviceId === 'youtube-music';
  return `(function () {
    window.__odYtCfg = {
      sponsorBlock: ${Boolean(powerUps.youtubeSponsorBlock)},
      autoDismiss: ${Boolean(powerUps.youtubeAutoDismissStillListening)},
      rememberSpeed: ${Boolean(!isMusic && powerUps.youtubeRememberSpeedQuality)}
    };

    if (!window.__odYtInit) {
      window.__odYtInit = true;
      window.__odSponsorSegments = [];
      window.__odSponsorVideoId = '';
      window.__odSponsorSkippedKeys = new Set();

      const showUndoPill = (label, undoStart) => {
        const old = document.getElementById('__od_sb_toast');
        if (old) old.remove();
        const toast = document.createElement('div');
        toast.id = '__od_sb_toast';
        toast.style.cssText = 'position:fixed;bottom:78px;right:20px;z-index:2147483647;display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:rgba(15,17,26,0.92);color:#fff;font:600 12px/1.2 system-ui,sans-serif;border:1px solid rgba(255,255,255,0.16);box-shadow:0 8px 24px rgba(0,0,0,0.45);backdrop-filter:blur(8px);';
        const txt = document.createElement('span');
        txt.textContent = 'Skipped ' + label;
        const btn = document.createElement('button');
        btn.textContent = 'Undo';
        btn.style.cssText = 'border:none;background:#6366F1;color:#fff;padding:4px 9px;border-radius:6px;font:600 11px system-ui,sans-serif;cursor:pointer;';
        btn.onclick = () => {
          const v = document.querySelector('video');
          if (v) v.currentTime = Math.max(0, undoStart);
          toast.remove();
        };
        toast.appendChild(txt);
        toast.appendChild(btn);
        document.body.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5200);
      };

      const checkSponsorSkip = () => {
        if (!window.__odYtCfg.sponsorBlock) return;
        const segs = window.__odSponsorSegments;
        if (!Array.isArray(segs) || segs.length === 0) return;
        const v = document.querySelector('video');
        if (!v || v.paused || !Number.isFinite(v.currentTime)) return;
        const t = v.currentTime;
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          const key = window.__odSponsorVideoId + ':' + s.start + '-' + s.end;
          if (!window.__odSponsorSkippedKeys.has(key) && t >= s.start && t < s.end - 0.35) {
            window.__odSponsorSkippedKeys.add(key);
            v.currentTime = s.end;
            const pretty = s.category === 'music_offtopic' ? 'non-music intro' : s.category;
            showUndoPill(pretty, s.start);
            break;
          }
        }
      };

      document.addEventListener('timeupdate', checkSponsorSkip, true);

      // Remember preferred YouTube playback speed across videos
      const SPEED_KEY = '__omnideck_yt_speed';
      const applySavedSpeed = (v) => {
        if (!window.__odYtCfg.rememberSpeed || !v) return;
        try {
          const saved = Number(localStorage.getItem(SPEED_KEY));
          if (Number.isFinite(saved) && saved >= 0.25 && saved <= 4 && Math.abs(v.playbackRate - saved) > 0.01) {
            v.playbackRate = saved;
          }
        } catch {}
      };
      document.addEventListener('ratechange', (ev) => {
        if (!window.__odYtCfg.rememberSpeed) return;
        const v = ev && ev.target;
        if (v && v.tagName === 'VIDEO' && Number.isFinite(v.playbackRate) && v.playbackRate >= 0.25 && v.playbackRate <= 4) {
          try { localStorage.setItem(SPEED_KEY, String(v.playbackRate)); } catch {}
        }
      }, true);
      document.addEventListener('loadedmetadata', (ev) => {
        if (ev && ev.target && ev.target.tagName === 'VIDEO') {
          applySavedSpeed(ev.target);
        }
      }, true);

      // Auto-dismiss "Are you still listening?" / "Video paused. Continue watching?"
      setInterval(() => {
        if (!window.__odYtCfg.autoDismiss) return;
        const btns = document.querySelectorAll(
          'yt-confirm-dialog-renderer #confirm-button button, ytmusic-you-there-renderer button, tp-yt-paper-dialog yt-button-renderer#confirm-button button'
        );
        for (const btn of btns) {
          if (btn && btn.offsetParent !== null) {
            try { btn.click(); } catch {}
          }
        }
      }, 3500);
    }
  })();`;
}

export function buildSponsorSegmentsInjector(
  videoId: string,
  segments: SponsorSegment[],
): string {
  return `(function () {
    window.__odSponsorVideoId = ${JSON.stringify(videoId)};
    window.__odSponsorSegments = ${JSON.stringify(segments)};
    if (window.__odSponsorSkippedKeys && typeof window.__odSponsorSkippedKeys.clear === 'function') {
      window.__odSponsorSkippedKeys.clear();
    }
  })();`;
}

/**
 * Injected Twitch Power-Up runtime:
 * - Built-in 7TV / BTTV / FFZ chat emote replacement
 * - Auto-claim Channel Points bonus chest (+50)
 * - Auto Theater Mode toggle
 * - Pause fast chat scrolling while hovering over chat
 */
export function buildTwitchPowerUpScript(powerUps: PowerUpsConfig): string {
  return `(function () {
    window.__odTwitchCfg = {
      emotes: ${Boolean(powerUps.twitchThirdPartyEmotes)},
      autoClaim: ${Boolean(powerUps.twitchAutoClaimPoints)},
      autoTheater: ${Boolean(powerUps.twitchAutoTheater)},
      pauseChatHover: ${Boolean(powerUps.twitchPauseChatOnHover)}
    };

    const tryAutoTheater = () => {
      if (!window.__odTwitchCfg.autoTheater) return;
      const btn = document.querySelector('[data-a-target="player-theatre-mode-button"]');
      if (btn) {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (label.includes('theatre') && !label.includes('exit')) {
          try { btn.click(); } catch {}
        }
      }
    };
    setTimeout(tryAutoTheater, 1800);

    if (!window.__odTwitchInit) {
      window.__odTwitchInit = true;
      window.__odTwitchEmoteMap = window.__odTwitchEmoteMap || {};

      // Auto-claim Channel Points chest
      setInterval(() => {
        if (!window.__odTwitchCfg.autoClaim) return;
        const btn = document.querySelector(
          'button[aria-label*="Claim Bonus" i], .community-points-summary button:has(.claimable-bonus__icon)'
        );
        if (btn && typeof btn.click === 'function') {
          try { btn.click(); } catch {}
        }
      }, 4500);

      // Pause Chat on Hover (scroll-lock helper)
      const bindHoverPause = () => {
        if (!window.__odTwitchCfg.pauseChatHover) return;
        const scroller = document.querySelector('.chat-scrollable-area__message-container')?.parentElement;
        if (!scroller || scroller.__odHoverBound) return;
        scroller.__odHoverBound = true;
        let locked = false;
        let savedTop = 0;
        scroller.addEventListener('mouseenter', () => {
          if (!window.__odTwitchCfg.pauseChatHover) return;
          locked = true;
          savedTop = scroller.scrollTop;
        });
        scroller.addEventListener('mouseleave', () => {
          locked = false;
          scroller.scrollTop = scroller.scrollHeight;
        });
        scroller.addEventListener('scroll', () => {
          if (locked && scroller.scrollTop > savedTop + 20) {
            scroller.scrollTop = savedTop;
          }
        });
      };

      // Replace 7TV/BTTV/FFZ text tokens inside newly rendered chat messages
      const processChatNode = (root) => {
        if (!window.__odTwitchCfg.emotes) return;
        const emotes = window.__odTwitchEmoteMap;
        if (!emotes || Object.keys(emotes).length === 0) return;
        const fragments = root.querySelectorAll
          ? root.querySelectorAll('[data-a-target="chat-message-text"]:not([data-od-emoted])')
          : [];
        for (const span of fragments) {
          span.setAttribute('data-od-emoted', '1');
          const text = span.textContent || '';
          if (!text.trim()) continue;
          const tokens = text.split(/(\\s+)/);
          let replaced = false;
          const frag = document.createDocumentFragment();
          for (const tok of tokens) {
            const url = emotes[tok];
            if (url) {
              const img = document.createElement('img');
              img.src = url;
              img.alt = tok;
              img.title = tok + ' (OmniDeck 7TV/BTTV/FFZ)';
              img.className = 'omnideck-emote';
              img.loading = 'lazy';
              frag.appendChild(img);
              replaced = true;
            } else {
              frag.appendChild(document.createTextNode(tok));
            }
          }
          if (replaced) {
            span.textContent = '';
            span.appendChild(frag);
          }
        }
      };

      let chatTimer = null;
      const scheduleChatScan = () => {
        if (chatTimer) return;
        chatTimer = setTimeout(() => {
          chatTimer = null;
          bindHoverPause();
          const chatBox = document.querySelector('.chat-scrollable-area__message-container');
          if (chatBox) processChatNode(chatBox);
        }, 120);
      };

      const obs = new MutationObserver((mutations) => {
        for (let i = 0; i < mutations.length; i++) {
          if (mutations[i].addedNodes && mutations[i].addedNodes.length > 0) {
            scheduleChatScan();
            return;
          }
        }
      });
      const target = document.body || document.documentElement;
      if (target) obs.observe(target, { childList: true, subtree: true });
      scheduleChatScan();
    }
  })();`;
}

export function buildTwitchEmotesInjector(emoteMap: Record<string, string>): string {
  return `(function () {
    window.__odTwitchEmoteMap = ${JSON.stringify(emoteMap)};
    document.querySelectorAll('[data-a-target="chat-message-text"][data-od-emoted]').forEach((el) => {
      el.removeAttribute('data-od-emoted');
    });
  })();`;
}

/**
 * Injected Reddit RES-Lite runtime:
 * - J/K next & previous post focus, X expand/collapse media, C open comments
 * - Auto-collapse AutoModerator / pinned mod boilerplate
 * - Hide promoted posts
 */
export function buildRedditPowerUpScript(powerUps: PowerUpsConfig): string {
  return `(function () {
    window.__odRedditCfg = {
      keyboardNav: ${Boolean(powerUps.redditKeyboardNav)},
      collapseAutoMod: ${Boolean(powerUps.redditCollapseAutoMod)},
      hidePromoted: ${Boolean(powerUps.redditHidePromoted)}
    };

    const runCleanups = () => {
      if (window.__odRedditCfg.collapseAutoMod) {
        // Modern Reddit
        document.querySelectorAll('shreddit-comment[author="AutoModerator"]:not([data-od-collapsed])').forEach((el) => {
          el.setAttribute('data-od-collapsed', '1');
          el.setAttribute('collapsed', '');
        });
        // Old Reddit
        document.querySelectorAll('.thing.comment[data-author="AutoModerator"]:not(.collapsed):not([data-od-collapsed])').forEach((el) => {
          el.setAttribute('data-od-collapsed', '1');
          const expand = el.querySelector('.expand');
          if (expand && typeof expand.click === 'function') expand.click();
        });
      }
      if (window.__odRedditCfg.hidePromoted) {
        document.querySelectorAll('shreddit-ad-post, .promotedlink').forEach((el) => {
          el.style.display = 'none';
        });
      }
    };

    runCleanups();

    if (!window.__odRedditInit) {
      window.__odRedditInit = true;
      let focusIdx = -1;

      const getPosts = () =>
        Array.from(document.querySelectorAll('shreddit-post, .thing.link:not(.promotedlink)')).filter(
          (el) => el.offsetParent !== null
        );

      const focusPost = (idx) => {
        const posts = getPosts();
        if (posts.length === 0) return;
        const clamped = Math.max(0, Math.min(posts.length - 1, idx));
        posts.forEach((p) => p.classList.remove('omnideck-reddit-focus'));
        const target = posts[clamped];
        target.classList.add('omnideck-reddit-focus');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        focusIdx = clamped;
      };

      document.addEventListener('keydown', (ev) => {
        if (!window.__odRedditCfg.keyboardNav) return;
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
        const tag = (ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : '');
        if (tag === 'input' || tag === 'textarea' || (ev.target && ev.target.isContentEditable)) return;

        const key = ev.key.toLowerCase();
        if (key === 'j') {
          ev.preventDefault();
          focusPost(focusIdx + 1);
        } else if (key === 'k') {
          ev.preventDefault();
          focusPost(focusIdx <= 0 ? 0 : focusIdx - 1);
        } else if (key === 'c' && focusIdx >= 0) {
          const post = getPosts()[focusIdx];
          const commentsLink = post && (post.querySelector('a[data-click-id="comments"], a.comments, a[slot="full-post-link"]'));
          if (commentsLink) {
            ev.preventDefault();
            commentsLink.click();
          }
        } else if (key === 'x' && focusIdx >= 0) {
          const post = getPosts()[focusIdx];
          const expando = post && post.querySelector('.expando-button, shreddit-player, button[aria-label*="Expand" i]');
          if (expando && typeof expando.click === 'function') {
            ev.preventDefault();
            expando.click();
          }
        }
      });

      // Rescue Reddit's logged-out blocking modal loop ("I already have an account" closing & reopening)
      document.addEventListener('click', (ev) => {
        try {
          const target = ev.target && ev.target.closest ? ev.target.closest('button, a') : null;
          if (!target) return;
          const label = (target.textContent || '').trim().toLowerCase();
          if (label === 'i already have an account' || label === 'log in') {
            const wasInBlockingModal = Boolean(
              target.closest('#blocking-modal, [id*="blocking-modal"], faceplate-modal, auth-flow-modal')
            );
            if (wasInBlockingModal || label === 'i already have an account') {
              const beforeUrl = location.href;
              setTimeout(() => {
                if (location.pathname.startsWith('/login')) return;
                const loginInput = document.querySelector(
                  'input[name="username"], #login-username, faceplate-text-input[name="username"], auth-flow-login'
                );
                if (!loginInput && location.href === beforeUrl) {
                  location.href = 'https://www.reddit.com/login/?dest=' + encodeURIComponent(beforeUrl);
                }
              }, 650);
            }
          }
        } catch {}
      }, true);

      setInterval(runCleanups, 2500);
    }
  })();`;
}

/**
 * Captures current scroll position and active video/audio playback time before Tier-2 hibernation.
 */
export const CAPTURE_HIBERNATE_STATE_SCRIPT = `(function () {
  try {
    const scrollY = Math.max(0, Math.round(window.scrollY || document.documentElement.scrollTop || 0));
    const media = Array.from(document.querySelectorAll('video, audio')).find((el) => Number.isFinite(el.currentTime) && el.currentTime > 2);
    return {
      scrollY,
      mediaTime: media ? Math.floor(media.currentTime) : null
    };
  } catch {
    return { scrollY: 0, mediaTime: null };
  }
})();`;

/**
 * Restores scroll position and media timestamp smoothly after waking a hibernated tab.
 */
export function buildRestoreHibernateStateScript(scrollY: number, mediaTime: number | null): string {
  return `(function () {
    try {
      const targetScroll = ${Math.max(0, Math.round(scrollY))};
      const targetTime = ${mediaTime !== null && Number.isFinite(mediaTime) ? Math.max(0, Math.floor(mediaTime)) : 'null'};
      if (targetScroll > 0) {
        setTimeout(() => window.scrollTo({ top: targetScroll, behavior: 'instant' }), 450);
        setTimeout(() => window.scrollTo({ top: targetScroll, behavior: 'instant' }), 1200);
      }
      if (targetTime !== null && targetTime > 2) {
        const restoreMedia = () => {
          const m = document.querySelector('video, audio');
          if (m && Number.isFinite(m.duration) && targetTime < m.duration - 2 && Math.abs(m.currentTime - targetTime) > 3) {
            m.currentTime = targetTime;
            return true;
          }
          return false;
        };
        if (!restoreMedia()) {
          setTimeout(restoreMedia, 900);
          setTimeout(restoreMedia, 2000);
        }
      }
    } catch {}
  })();`;
}
