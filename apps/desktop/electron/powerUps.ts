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

export interface YouTubeDislikeStats {
  likes: number;
  dislikes: number;
  rating?: number;
}

const sponsorCache = new Map<string, CacheEntry<SponsorSegment[]>>();
const emoteCache = new Map<string, CacheEntry<Record<string, string>>>();
const dislikeCache = new Map<string, CacheEntry<YouTubeDislikeStats | null>>();
const deArrowCache = new Map<string, CacheEntry<string | null>>();
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
 * Ad-free Return YouTube Dislike lookup via public returnyoutubedislikeapi.com JSON endpoint.
 */
export async function fetchYouTubeDislikes(videoId: string): Promise<YouTubeDislikeStats | null> {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
  const cached = dislikeCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const raw = await fetchJsonWithTimeout(
    `https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(videoId)}`,
    5500,
  );
  let stats: YouTubeDislikeStats | null = null;
  if (raw && typeof raw === 'object') {
    const rec = raw as { likes?: unknown; dislikes?: unknown; rating?: unknown };
    if (typeof rec.dislikes === 'number' && Number.isFinite(rec.dislikes)) {
      stats = {
        likes: typeof rec.likes === 'number' && Number.isFinite(rec.likes) ? Math.max(0, Math.round(rec.likes)) : 0,
        dislikes: Math.max(0, Math.round(rec.dislikes)),
        rating: typeof rec.rating === 'number' ? rec.rating : undefined,
      };
    }
  }
  dislikeCache.set(videoId, {
    value: stats,
    expiresAt: Date.now() + (stats ? 20 * 60_000 : 15_000),
  });
  return stats;
}

/**
 * Fetches crowdsourced anti-clickbait video title from SponsorBlock's free DeArrow API.
 */
export async function fetchDeArrowTitle(videoId: string): Promise<string | null> {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
  const cached = deArrowCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const raw = await fetchJsonWithTimeout(
    `https://sponsor.ajay.app/api/branding?videoID=${encodeURIComponent(videoId)}`,
    3200,
  );
  let cleanTitle: string | null = null;
  if (raw && typeof raw === 'object') {
    const rec = raw as { titles?: Array<{ title?: string; votes?: number; locked?: boolean }> };
    if (Array.isArray(rec.titles) && rec.titles.length > 0) {
      const top = rec.titles.find((t) => t && typeof t.title === 'string' && t.title.trim() && (t.votes ?? 0) >= 0);
      if (top?.title) {
        cleanTitle = top.title.replace(/^>/, '').trim();
      }
    }
  }
  deArrowCache.set(videoId, { value: cleanTitle, expiresAt: Date.now() + 30 * 60_000 });
  return cleanTitle;
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
 * - SponsorBlock segment skipper with Undo pill
 * - Auto-dismiss "Are you still listening?" dialogs
 * - Remember preferred playback speed on YouTube
 * - Force Original Audio Track (kills forced AI auto-dubbing)
 * - Hide End-Screen cards & Mixes/Playables + Disable Hover Auto-Play Previews
 * - Player Power Controls: A-B Loop, Clean Frame Screenshot, Shift+Wheel fine speed
 * - YouTube Music Audio-Only Mode + Live Playlist Quick-Filter & Queue Total Duration
 */
export function buildYouTubePowerUpScript(
  serviceId: 'youtube' | 'youtube-music',
  powerUps: PowerUpsConfig,
): string {
  const isMusic = serviceId === 'youtube-music';
  return `(function () {
    window.__odYtCfg = {
      isMusic: ${isMusic},
      sponsorBlock: ${Boolean(powerUps.youtubeSponsorBlock)},
      autoDismiss: ${Boolean(powerUps.youtubeAutoDismissStillListening)},
      rememberSpeed: ${Boolean(!isMusic && powerUps.youtubeRememberSpeedQuality)},
      forceOriginalAudio: ${Boolean(!isMusic && powerUps.youtubeForceOriginalAudio)},
      returnDislikes: ${Boolean(!isMusic && powerUps.youtubeReturnDislikes)},
      hideEndScreens: ${Boolean(!isMusic && powerUps.youtubeHideEndScreens)},
      disableHoverPreview: ${Boolean(!isMusic && powerUps.youtubeDisableHoverPreview)},
      playerControls: ${Boolean(!isMusic && powerUps.youtubePlayerControls)},
      ytmAudioOnly: ${Boolean(isMusic && powerUps.ytmAudioOnlyMode)},
      ytmPlaylistFilter: ${Boolean(isMusic && powerUps.ytmPlaylistQuickFilter)}
    };
    if (typeof window.__odApplyRyd === 'function') {
      try { window.__odApplyRyd(); } catch {}
    }

    const syncDynamicCss = () => {
      let st = document.getElementById('__od_yt_powerup_css');
      if (!st) {
        st = document.createElement('style');
        st.id = '__od_yt_powerup_css';
        (document.head || document.documentElement).appendChild(st);
      }
      const rules = [];
      if (window.__odYtCfg.hideEndScreens) {
        rules.push('.ytp-ce-element, .ytp-endscreen-content, .ytp-cards-teaser, ytd-rich-section-renderer:has(a[href*="/playables"]) { display: none !important; }');
      }
      if (window.__odYtCfg.disableHoverPreview) {
        rules.push('ytd-video-preview, #video-preview, #mouseover-overlay, #hover-overlays { display: none !important; pointer-events: none !important; }');
      }
      if (window.__odYtCfg.ytmAudioOnly) {
        rules.push('ytmusic-player[player-ui-state="PLAYER_PAGE_OPEN"] #song-video, ytmusic-player[player-ui-state="PLAYER_PAGE_OPEN"] .html5-video-player video { opacity: 0 !important; pointer-events: none !important; }');
      }
      st.textContent = rules.join('\\n');
    };
    syncDynamicCss();

    if (!window.__odYtInit) {
      window.__odYtInit = true;
      window.__odSponsorSegments = [];
      window.__odSponsorVideoId = '';
      window.__odSponsorSkippedKeys = new Set();
      window.__odAbLoop = { a: null, b: null };

      const showMiniToast = (msg, undoStart) => {
        const old = document.getElementById('__od_sb_toast');
        if (old) old.remove();
        const toast = document.createElement('div');
        toast.id = '__od_sb_toast';
        toast.style.cssText = 'position:fixed;bottom:78px;right:20px;z-index:2147483647;display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:rgba(15,17,26,0.92);color:#fff;font:600 12px/1.2 system-ui,sans-serif;border:1px solid rgba(255,255,255,0.16);box-shadow:0 8px 24px rgba(0,0,0,0.45);backdrop-filter:blur(8px);';
        const txt = document.createElement('span');
        txt.textContent = msg;
        toast.appendChild(txt);
        if (typeof undoStart === 'number') {
          const btn = document.createElement('button');
          btn.textContent = 'Undo';
          btn.style.cssText = 'border:none;background:#E87A3E;color:#fff;padding:4px 9px;border-radius:6px;font:600 11px system-ui,sans-serif;cursor:pointer;';
          btn.onclick = () => {
            const v = document.querySelector('video');
            if (v) v.currentTime = Math.max(0, undoStart);
            toast.remove();
          };
          toast.appendChild(btn);
        }
        document.body.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4200);
      };

      const checkSponsorAndLoop = () => {
        const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
        if (!v || v.paused || !Number.isFinite(v.currentTime)) return;
        const t = v.currentTime;

        // A-B Loop
        const ab = window.__odAbLoop;
        if (ab && typeof ab.a === 'number' && typeof ab.b === 'number' && ab.b > ab.a + 0.25) {
          if (t >= ab.b || t < ab.a - 0.5) {
            v.currentTime = ab.a;
            return;
          }
        }

        if (!window.__odYtCfg.sponsorBlock) return;
        const segs = window.__odSponsorSegments;
        if (!Array.isArray(segs) || segs.length === 0) return;
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          const key = window.__odSponsorVideoId + ':' + s.start + '-' + s.end;
          if (!window.__odSponsorSkippedKeys.has(key) && t >= s.start && t < s.end - 0.35) {
            window.__odSponsorSkippedKeys.add(key);
            v.currentTime = s.end;
            const pretty = s.category === 'music_offtopic' ? 'non-music intro' : s.category;
            showMiniToast('Skipped ' + pretty, s.start);
            break;
          }
        }
      };

      document.addEventListener('timeupdate', checkSponsorAndLoop, true);

      // Remember preferred YouTube playback speed across videos (main player only, preserving pitch)
      const SPEED_KEY = '__omnideck_yt_speed';
      const isStandardSpeedStep = (r) => {
        if (!Number.isFinite(r) || r < 0.25 || r > 4) return false;
        return Math.abs(r * 100 - Math.round(r * 100)) < 0.05 && (
          Math.abs(r * 4 - Math.round(r * 4)) < 0.01 ||
          Math.abs(r * 10 - Math.round(r * 10)) < 0.01
        );
      };
      const applySavedSpeed = (v) => {
        if (!window.__odYtCfg.rememberSpeed || !v) return;
        if (!v.classList || !v.classList.contains('html5-main-video')) return;
        try {
          if (typeof v.preservesPitch === 'boolean') v.preservesPitch = true;
          if (typeof v.webkitPreservesPitch === 'boolean') v.webkitPreservesPitch = true;
          const saved = Number(localStorage.getItem(SPEED_KEY));
          if (!isStandardSpeedStep(saved) || (Math.abs(saved - 1) > 0.01 && Math.abs(saved - 1) < 0.09)) {
            if (localStorage.getItem(SPEED_KEY) !== null) localStorage.removeItem(SPEED_KEY);
            return;
          }
          if (Math.abs(saved - 1) > 0.01 && Math.abs(v.playbackRate - saved) > 0.01) {
            v.playbackRate = saved;
          }
        } catch {}
      };
      let speedSaveTimer = null;
      document.addEventListener('ratechange', (ev) => {
        if (!window.__odYtCfg.rememberSpeed) return;
        const v = ev && ev.target;
        if (!v || v.tagName !== 'VIDEO' || !v.classList || !v.classList.contains('html5-main-video')) return;
        const r = v.playbackRate;
        if (!isStandardSpeedStep(r)) return;
        // Ignore YouTube live DVR micro catch-up rates (e.g. 1.03x / 1.05x) unless explicitly set via Shift+Wheel
        if (Math.abs(r - 1) > 0.01 && Math.abs(r - 1) < 0.09 && (!window.__odWheelSpeedAt || Date.now() - window.__odWheelSpeedAt > 1500)) {
          return;
        }
        if (speedSaveTimer) clearTimeout(speedSaveTimer);
        speedSaveTimer = setTimeout(() => {
          try {
            if (Math.abs(v.playbackRate - r) < 0.01) {
              localStorage.setItem(SPEED_KEY, String(r));
            }
          } catch {}
        }, 1200);
      }, true);
      document.addEventListener('loadedmetadata', (ev) => {
        const v = ev && ev.target;
        if (v && v.tagName === 'VIDEO' && v.classList && v.classList.contains('html5-main-video')) {
          window.__odAbLoop = { a: null, b: null };
          applySavedSpeed(v);
        }
      }, true);

      // Force Original Audio Track (defeats YouTube's forced AI auto-dubbing — runs at most once per video)
      const audioHandledVids = new Set();
      let lastYtWatchHref = location.href;
      const readTrackLabel = (tr) => {
        if (!tr || typeof tr !== 'object') return '';
        const parts = [tr.displayName, tr.name, tr.languageName, tr.xtags, tr.id]
          .filter((v) => typeof v === 'string' && v.length > 0);
        return parts.join(' ').toLowerCase();
      };
      const enforceOriginalAudio = () => {
        if (location.href !== lastYtWatchHref) {
          lastYtWatchHref = location.href;
          window.__odAbLoop = { a: null, b: null };
        }
        if (!window.__odYtCfg.forceOriginalAudio) return;
        try {
          const vid = new URLSearchParams(location.search).get('v') || '';
          if (!vid || audioHandledVids.has(vid)) return;

          const player = document.getElementById('movie_player');
          if (!player || typeof player.getAvailableAudioTracks !== 'function' || typeof player.getAudioTrack !== 'function') return;
          const tracks = player.getAvailableAudioTracks();
          if (!Array.isArray(tracks) || tracks.length < 2) {
            audioHandledVids.add(vid);
            return;
          }
          const current = player.getAudioTrack();
          const curLabel = readTrackLabel(current);
          // Mark video checked right away so we never repeatedly call setAudioTrack and restart playback
          audioHandledVids.add(vid);
          if (!curLabel.includes('auto-dub') && !curLabel.includes('dubbed') && !curLabel.includes('auto_dub')) {
            return;
          }
          const orig = tracks.find((tr) => {
            const lbl = readTrackLabel(tr);
            return lbl.includes('original');
          });
          if (
            orig &&
            orig !== current &&
            (!current || !orig.id || orig.id !== current.id) &&
            typeof player.setAudioTrack === 'function'
          ) {
            const v = document.querySelector('video.html5-main-video');
            const resumeAt = v && Number.isFinite(v.currentTime) ? v.currentTime : 0;
            player.setAudioTrack(orig);
            if (v && resumeAt > 0.5) {
              setTimeout(() => {
                if (v.currentTime < 0.5 && Number.isFinite(v.duration) && resumeAt < v.duration) {
                  v.currentTime = resumeAt;
                }
              }, 350);
            }
            showMiniToast('Switched to Original Audio Track');
          }
        } catch {}
      };

      // Shift+Wheel over YouTube video for crisp 0.1x playback speed adjustment
      document.addEventListener('wheel', (ev) => {
        if (!window.__odYtCfg.playerControls || !ev.shiftKey) return;
        const target = ev.target;
        if (!target || !target.closest || !target.closest('#movie_player')) return;
        const v = document.querySelector('video.html5-main-video');
        if (!v) return;
        ev.preventDefault();
        const delta = ev.deltaY < 0 ? 0.1 : -0.1;
        const next = Math.min(4.0, Math.max(0.25, Math.round((v.playbackRate + delta) * 10) / 10));
        window.__odWheelSpeedAt = Date.now();
        if (typeof v.preservesPitch === 'boolean') v.preservesPitch = true;
        if (typeof v.webkitPreservesPitch === 'boolean') v.webkitPreservesPitch = true;
        v.playbackRate = next;
        showMiniToast('Speed ' + next.toFixed(1) + 'x');
      }, { passive: false, capture: true });

      // Inject A-B Loop & Clean Frame Screenshot controls into YouTube player bar
      const ensurePlayerButtons = () => {
        const abExisting = document.getElementById('__od_yt_ab_btn');
        const shotExisting = document.getElementById('__od_yt_shot_btn');
        if (!window.__odYtCfg.playerControls) {
          window.__odAbLoop = { a: null, b: null };
          if (abExisting) abExisting.style.display = 'none';
          if (shotExisting) shotExisting.style.display = 'none';
          return;
        }
        if (abExisting) abExisting.style.display = '';
        if (shotExisting) shotExisting.style.display = '';
        const rightControls = document.querySelector('#movie_player .ytp-right-controls');
        if (!rightControls || shotExisting) return;

        const fmtT = (s) => {
          const m = Math.floor(s / 60);
          const r = Math.floor(s % 60);
          return m + ':' + String(r).padStart(2, '0');
        };

        const abBtn = document.createElement('button');
        abBtn.id = '__od_yt_ab_btn';
        abBtn.className = 'ytp-button';
        abBtn.title = 'OmniDeck A-B Loop (click to set A, B, or clear)';
        abBtn.style.cssText = 'width:auto;padding:0 7px;font:700 11px/1 system-ui,sans-serif;vertical-align:top;color:#fff;opacity:0.88;';
        abBtn.textContent = 'A-B';
        abBtn.onclick = (e) => {
          e.stopPropagation();
          const v = document.querySelector('video.html5-main-video');
          if (!v) return;
          const ab = window.__odAbLoop;
          if (ab.a === null) {
            ab.a = v.currentTime;
            ab.b = null;
            abBtn.textContent = 'A:' + fmtT(ab.a);
            abBtn.style.color = '#E87A3E';
            showMiniToast('Loop start set at ' + fmtT(ab.a));
          } else if (ab.b === null && v.currentTime > ab.a + 0.3) {
            ab.b = v.currentTime;
            abBtn.textContent = 'A-B ON';
            abBtn.style.color = '#3ECF8E';
            showMiniToast('Looping ' + fmtT(ab.a) + ' - ' + fmtT(ab.b));
          } else {
            ab.a = null;
            ab.b = null;
            abBtn.textContent = 'A-B';
            abBtn.style.color = '#fff';
            showMiniToast('A-B Loop cleared');
          }
        };

        const shotBtn = document.createElement('button');
        shotBtn.id = '__od_yt_shot_btn';
        shotBtn.className = 'ytp-button';
        shotBtn.title = 'OmniDeck Clean Frame Screenshot (copies PNG to clipboard)';
        shotBtn.style.cssText = 'width:auto;padding:0 7px;font:700 11px/1 system-ui,sans-serif;vertical-align:top;color:#fff;opacity:0.88;';
        shotBtn.textContent = 'SNAP';
        shotBtn.onclick = (e) => {
          e.stopPropagation();
          try {
            const v = document.querySelector('video.html5-main-video');
            if (!v || !v.videoWidth || !v.videoHeight) return;
            const canvas = document.createElement('canvas');
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
              if (!blob) return;
              if (navigator.clipboard && window.ClipboardItem) {
                navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                  .then(() => showMiniToast('Frame copied to clipboard'))
                  .catch(() => {
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'omnideck-frame-' + Math.floor(v.currentTime) + 's.png';
                    a.click();
                    showMiniToast('Frame saved as PNG');
                  });
              }
            }, 'image/png');
          } catch {}
        };

        rightControls.insertBefore(shotBtn, rightControls.firstChild);
        rightControls.insertBefore(abBtn, shotBtn);
      };

      // YouTube Music Playlist Quick-Filter & Up Next Total Duration
      const ensureYtmPlaylistFilter = () => {
        if (!window.__odYtCfg.isMusic) return;
        const filterBar = document.getElementById('__od_ytm_filter_bar');
        const durBadge = document.getElementById('__od_ytm_queue_dur');
        if (!window.__odYtCfg.ytmPlaylistFilter) {
          if (filterBar) filterBar.style.display = 'none';
          if (durBadge) durBadge.style.display = 'none';
          document.querySelectorAll('ytmusic-playlist-shelf-renderer #contents ytmusic-responsive-list-item-renderer').forEach((row) => {
            if (row.style.display === 'none') row.style.display = '';
          });
          return;
        }
        if (filterBar) filterBar.style.display = 'flex';
        if (durBadge) durBadge.style.display = '';
        const list = document.querySelector('ytmusic-playlist-shelf-renderer #contents');
        if (list && !filterBar) {
          const bar = document.createElement('div');
          bar.id = '__od_ytm_filter_bar';
          bar.style.cssText = 'display:flex;align-items:center;gap:8px;margin:0 0 10px 0;padding:6px 10px;border-radius:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);';
          const inp = document.createElement('input');
          inp.type = 'search';
          inp.placeholder = 'Filter playlist tracks or artists…';
          inp.style.cssText = 'flex:1;background:transparent;border:none;outline:none;color:#fff;font:500 13px system-ui,sans-serif;';
          const countEl = document.createElement('span');
          countEl.style.cssText = 'font:600 11px system-ui,sans-serif;color:rgba(255,255,255,0.62);';
          const applyFilter = () => {
            const q = inp.value.trim().toLowerCase();
            const rows = list.querySelectorAll('ytmusic-responsive-list-item-renderer');
            let shown = 0;
            rows.forEach((row) => {
              const hit = !q || (row.textContent || '').toLowerCase().includes(q);
              row.style.display = hit ? '' : 'none';
              if (hit) shown++;
            });
            countEl.textContent = q ? (shown + ' / ' + rows.length) : (rows.length + ' tracks');
          };
          inp.addEventListener('input', applyFilter);
          bar.appendChild(inp);
          bar.appendChild(countEl);
          list.parentElement && list.parentElement.insertBefore(bar, list);
          applyFilter();
        }

        // Queue Total Duration Badge on Up Next tab
        const queueItems = document.querySelectorAll('ytmusic-player-queue-item .duration');
        if (queueItems.length > 0) {
          let totalSec = 0;
          queueItems.forEach((el) => {
            const parts = (el.textContent || '').trim().split(':').map((n) => parseInt(n, 10));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) totalSec += parts[0] * 60 + parts[1];
            else if (parts.length === 3 && !isNaN(parts[0])) totalSec += parts[0] * 3600 + parts[1] * 60 + parts[2];
          });
          const header = document.querySelector('ytmusic-player-queue #automix-contents')?.parentElement || document.querySelector('ytmusic-tab-renderer[page-type="MUSIC_PAGE_TYPE_PLAYLIST_QUEUE"]');
          if (header && totalSec > 0) {
            let badge = document.getElementById('__od_ytm_queue_dur');
            if (!badge) {
              badge = document.createElement('div');
              badge.id = '__od_ytm_queue_dur';
              badge.style.cssText = 'font:600 11px system-ui,sans-serif;color:rgba(255,255,255,0.65);padding:4px 12px;';
              header.prepend(badge);
            }
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            badge.textContent = 'Queue: ' + queueItems.length + ' tracks · ' + (h > 0 ? (h + 'h ' + m + 'm') : (m + 'm'));
          }
        }
      };

      // Persistent Return YouTube Dislike renderer (survives late Polymer hydration & re-renders)
      const fmtRyd = (n) => {
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\\.0$/, '') + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1).replace(/\\.0$/, '') + 'K';
        return String(n);
      };

      const expandPillButton = (btn, selector) => {
        if (!btn) return;
        const vm = selector ? btn.closest(selector) : null;
        if (vm) {
          vm.style.setProperty('width', 'auto', 'important');
          vm.style.setProperty('overflow', 'visible', 'important');
        }
        btn.style.setProperty('width', 'auto', 'important');
        btn.style.setProperty('min-width', 'max-content', 'important');
        btn.style.setProperty('padding-left', '12px', 'important');
        btn.style.setProperty('padding-right', '14px', 'important');
        btn.style.setProperty('gap', '6px', 'important');
        btn.style.setProperty('overflow', 'visible', 'important');
      };

      window.__odApplyRyd = () => {
        try {
          if (window.__odYtCfg.isMusic) return;
          if (!window.__odYtCfg.returnDislikes) {
            const oldDis = document.getElementById('__od_ryd_count');
            if (oldDis) oldDis.remove();
            const oldLike = document.getElementById('__od_ryd_like_count');
            if (oldLike) oldLike.remove();
            const oldBar = document.getElementById('__od_ryd_bar');
            if (oldBar) oldBar.remove();
            return;
          }
          const stats = window.__odRydStats;
          if (!stats || !stats.videoId) return;
          const vid = stats.videoId;
          const curVid = new URLSearchParams(location.search).get('v') || '';
          const matchesUrl = curVid === vid || location.pathname.includes('/shorts/' + vid);
          if (!matchesUrl) return;

          const likes = Math.max(0, Math.round(stats.likes || 0));
          const dislikes = Math.max(0, Math.round(stats.dislikes || 0));

          const dislikeBtn =
            document.querySelector('ytd-watch-metadata dislike-button-view-model button') ||
            document.querySelector('dislike-button-view-model button') ||
            document.querySelector('#segmented-dislike-button button') ||
            document.querySelector('ytd-watch-metadata button[aria-label*="Dislike" i]');
          if (!dislikeBtn) return;

          expandPillButton(dislikeBtn, 'dislike-button-view-model, #segmented-dislike-button');

          let disLabel = dislikeBtn.querySelector('#__od_ryd_count');
          if (!disLabel) {
            disLabel = document.createElement('span');
            disLabel.id = '__od_ryd_count';
            disLabel.style.cssText = 'display:inline-flex;align-items:center;font:500 14px/1 "Roboto","YouTube Sans",system-ui,sans-serif;color:inherit;white-space:nowrap;';
            const touchShape = dislikeBtn.querySelector('.yt-spec-touch-feedback-shape, yt-touch-feedback-shape');
            if (touchShape) {
              dislikeBtn.insertBefore(disLabel, touchShape);
            } else {
              dislikeBtn.appendChild(disLabel);
            }
          }
          disLabel.textContent = fmtRyd(dislikes);
          dislikeBtn.title = 'Likes: ' + likes.toLocaleString() + ' · Dislikes: ' + dislikes.toLocaleString() + ' (Return YouTube Dislike)';

          const likeBtn =
            document.querySelector('ytd-watch-metadata like-button-view-model button') ||
            document.querySelector('like-button-view-model button') ||
            document.querySelector('#segmented-like-button button') ||
            document.querySelector('ytd-watch-metadata button[aria-label*="like" i]:not([aria-label*="dislike" i])');
          if (likeBtn) {
            likeBtn.title = 'Likes: ' + likes.toLocaleString() + ' · Dislikes: ' + dislikes.toLocaleString();
            let nativeDigits = '';
            for (const child of likeBtn.childNodes) {
              if (child && child.id !== '__od_ryd_like_count') {
                nativeDigits += (child.textContent || '');
              }
            }
            const fallbackEl = likeBtn.querySelector('#__od_ryd_like_count');
            if (!/\\d/.test(nativeDigits)) {
              expandPillButton(likeBtn, 'like-button-view-model, #segmented-like-button');
              let likeLabel = fallbackEl;
              if (!likeLabel) {
                likeLabel = document.createElement('span');
                likeLabel.id = '__od_ryd_like_count';
                likeLabel.style.cssText = 'display:inline-flex;align-items:center;font:500 14px/1 "Roboto","YouTube Sans",system-ui,sans-serif;color:inherit;white-space:nowrap;';
                const likeTouch = likeBtn.querySelector('.yt-spec-touch-feedback-shape, yt-touch-feedback-shape');
                if (likeTouch) {
                  likeBtn.insertBefore(likeLabel, likeTouch);
                } else {
                  likeBtn.appendChild(likeLabel);
                }
              }
              likeLabel.textContent = fmtRyd(likes);
            } else if (fallbackEl) {
              fallbackEl.remove();
            }
          }

          const total = Math.max(1, likes + dislikes);
          const pct = Math.min(100, Math.max(0, Math.round((likes / total) * 100)));
          const seg = dislikeBtn.closest('segmented-like-dislike-button-view-model, ytd-segmented-like-dislike-button-renderer');
          if (seg) {
            seg.style.position = 'relative';
            let bar = seg.querySelector('#__od_ryd_bar');
            if (!bar) {
              bar = document.createElement('div');
              bar.id = '__od_ryd_bar';
              bar.style.cssText = 'position:absolute;left:10px;right:10px;bottom:-5px;height:3px;border-radius:2px;background:rgba(240,82,82,0.82);overflow:hidden;pointer-events:none;';
              const fill = document.createElement('div');
              fill.id = '__od_ryd_fill';
              fill.style.cssText = 'height:100%;background:#3ECF8E;transition:width 0.2s ease;';
              bar.appendChild(fill);
              seg.appendChild(bar);
            }
            bar.title = pct + '% liked (' + likes.toLocaleString() + ' likes / ' + dislikes.toLocaleString() + ' dislikes)';
            const fill = bar.querySelector('#__od_ryd_fill');
            if (fill) fill.style.width = pct + '%';
          }
        } catch {}
      };

      // In-YouTube Masthead Quick Back Button (Trusted-Types safe, explicit high-contrast styling)
      const ensureYtBackButton = () => {
        if (window.__odYtCfg.isMusic) return;
        const startSlot = document.querySelector('ytd-masthead #start');
        if (!startSlot) return;

        const isDark =
          document.documentElement.hasAttribute('dark') ||
          Boolean(document.querySelector('ytd-app[dark], ytd-masthead[dark]'));
        const probe =
          document.querySelector('ytd-masthead #guide-button yt-icon') ||
          document.querySelector('ytd-masthead #guide-button button');
        let fg = probe ? getComputedStyle(probe).color : '';
        if (!fg || fg === 'rgb(0, 0, 0)' || fg === 'rgba(0, 0, 0, 0)') {
          fg = isDark ? '#f1f1f1' : '#0f0f0f';
        }
        const idleBg = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
        const hoverBg = isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.12)';
        const borderClr = isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.16)';

        let backBtn = document.getElementById('__od_yt_back_btn');
        if (!backBtn) {
          backBtn = document.createElement('button');
          backBtn.id = '__od_yt_back_btn';
          backBtn.type = 'button';
          backBtn.setAttribute('aria-label', 'Go back to previous YouTube page');
          backBtn.style.cssText = 'width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin:0 8px 0 4px;padding:0;flex-shrink:0;transition:background 0.15s ease,opacity 0.15s ease;';

          const svgNS = 'http://www.w3.org/2000/svg';
          const svg = document.createElementNS(svgNS, 'svg');
          svg.setAttribute('width', '18');
          svg.setAttribute('height', '18');
          svg.setAttribute('viewBox', '0 0 24 24');
          svg.setAttribute('fill', 'none');
          svg.setAttribute('stroke', 'currentColor');
          svg.setAttribute('stroke-width', '2.3');
          svg.setAttribute('stroke-linecap', 'round');
          svg.setAttribute('stroke-linejoin', 'round');
          svg.setAttribute('aria-hidden', 'true');
          const p1 = document.createElementNS(svgNS, 'path');
          p1.setAttribute('d', 'M19 12H5');
          const p2 = document.createElementNS(svgNS, 'path');
          p2.setAttribute('d', 'm12 19-7-7 7-7');
          svg.appendChild(p1);
          svg.appendChild(p2);
          backBtn.appendChild(svg);

          backBtn.onmouseenter = () => {
            if (!backBtn.disabled) backBtn.style.background = backBtn.dataset.hoverBg || 'rgba(255,255,255,0.2)';
          };
          backBtn.onmouseleave = () => {
            backBtn.style.background = backBtn.dataset.idleBg || 'rgba(255,255,255,0.1)';
          };
          backBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              const hasNavBack = (window.navigation && typeof window.navigation.canGoBack === 'boolean')
                ? window.navigation.canGoBack
                : (window.history.length > 1);
              if (hasNavBack) {
                window.history.back();
              } else if (location.pathname !== '/') {
                const logoLink = document.querySelector('ytd-masthead #logo a');
                if (logoLink && typeof logoLink.click === 'function') {
                  logoLink.click();
                } else {
                  location.assign('/');
                }
              }
              setTimeout(() => {
                ensureYtBackButton();
                if (typeof window.__odApplyRyd === 'function') window.__odApplyRyd();
              }, 160);
            } catch {}
          };

          const logo = startSlot.querySelector('#logo, ytd-topbar-logo-renderer');
          if (logo) {
            startSlot.insertBefore(backBtn, logo);
          } else {
            startSlot.prepend(backBtn);
          }
        }

        const hasNavBack = (window.navigation && typeof window.navigation.canGoBack === 'boolean')
          ? window.navigation.canGoBack
          : (window.history.length > 1);
        const canStepBack = hasNavBack || location.pathname !== '/';

        backBtn.dataset.idleBg = idleBg;
        backBtn.dataset.hoverBg = hoverBg;
        backBtn.style.color = fg;
        backBtn.style.background = idleBg;
        backBtn.style.border = '1px solid ' + borderClr;
        backBtn.querySelectorAll('path').forEach((p) => p.setAttribute('stroke', fg));

        backBtn.disabled = !canStepBack;
        backBtn.style.opacity = canStepBack ? '1' : '0.45';
        backBtn.style.cursor = canStepBack ? 'pointer' : 'default';
        backBtn.title = hasNavBack
          ? 'Back one step in YouTube (Alt+Left)'
          : (location.pathname !== '/' ? 'Back to YouTube Home' : 'YouTube Home');
      };

      const syncYtUiHooks = () => {
        ensureYtBackButton();
        if (typeof window.__odApplyRyd === 'function') window.__odApplyRyd();
      };

      document.addEventListener('yt-navigate-finish', () => {
        syncYtUiHooks();
        setTimeout(syncYtUiHooks, 450);
        setTimeout(syncYtUiHooks, 1300);
      }, true);
      window.addEventListener('popstate', () => {
        syncYtUiHooks();
        setTimeout(syncYtUiHooks, 300);
      }, true);

      syncYtUiHooks();

      // Periodic watcher: dismiss "Still listening?", enforce original audio, mount buttons, RYD & YTM filter
      setInterval(() => {
        if (window.__odYtCfg.autoDismiss) {
          const btns = document.querySelectorAll(
            'yt-confirm-dialog-renderer #confirm-button button, ytmusic-you-there-renderer button, tp-yt-paper-dialog yt-button-renderer#confirm-button button'
          );
          for (const btn of btns) {
            if (btn && btn.offsetParent !== null) {
              try { btn.click(); } catch {}
            }
          }
        }
        enforceOriginalAudio();
        ensurePlayerButtons();
        ensureYtBackButton();
        if (typeof window.__odApplyRyd === 'function') window.__odApplyRyd();
        ensureYtmPlaylistFilter();
      }, 2600);
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
 * Injects Return YouTube Dislike count + like count fallback + like/dislike ratio bar into YouTube's watch page.
 */
export function buildYouTubeDislikesInjector(
  videoId: string,
  likes: number,
  dislikes: number,
): string {
  const safeLikes = Math.max(0, Math.round(likes));
  const safeDislikes = Math.max(0, Math.round(dislikes));
  return `(function () {
    try {
      const vid = ${JSON.stringify(videoId)};
      const likes = ${safeLikes};
      const dislikes = ${safeDislikes};
      window.__odRydStats = { videoId: vid, likes: likes, dislikes: dislikes };
      if (typeof window.__odApplyRyd === 'function') {
        window.__odApplyRyd();
        return;
      }
      const curVid = new URLSearchParams(location.search).get('v') || '';
      if (curVid !== vid && !location.pathname.includes('/shorts/' + vid)) return;

      const fmt = (n) => {
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\\.0$/, '') + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1).replace(/\\.0$/, '') + 'K';
        return String(n);
      };
      const dislikeBtn =
        document.querySelector('ytd-watch-metadata dislike-button-view-model button') ||
        document.querySelector('dislike-button-view-model button') ||
        document.querySelector('#segmented-dislike-button button') ||
        document.querySelector('ytd-watch-metadata button[aria-label*="Dislike" i]');
      if (!dislikeBtn) return;

      const dvm = dislikeBtn.closest('dislike-button-view-model, #segmented-dislike-button');
      if (dvm) {
        dvm.style.setProperty('width', 'auto', 'important');
        dvm.style.setProperty('overflow', 'visible', 'important');
      }
      dislikeBtn.style.setProperty('width', 'auto', 'important');
      dislikeBtn.style.setProperty('min-width', 'max-content', 'important');
      dislikeBtn.style.setProperty('padding-left', '12px', 'important');
      dislikeBtn.style.setProperty('padding-right', '14px', 'important');
      dislikeBtn.style.setProperty('gap', '6px', 'important');
      dislikeBtn.style.setProperty('overflow', 'visible', 'important');

      let label = dislikeBtn.querySelector('#__od_ryd_count');
      if (!label) {
        label = document.createElement('span');
        label.id = '__od_ryd_count';
        label.style.cssText = 'display:inline-flex;align-items:center;font:500 14px/1 "Roboto","YouTube Sans",system-ui,sans-serif;color:inherit;white-space:nowrap;';
        const touch = dislikeBtn.querySelector('.yt-spec-touch-feedback-shape, yt-touch-feedback-shape');
        if (touch) dislikeBtn.insertBefore(label, touch);
        else dislikeBtn.appendChild(label);
      }
      label.textContent = fmt(dislikes);
      dislikeBtn.title = 'Likes: ' + likes.toLocaleString() + ' · Dislikes: ' + dislikes.toLocaleString() + ' (Return YouTube Dislike)';

      const total = Math.max(1, likes + dislikes);
      const pct = Math.min(100, Math.max(0, Math.round((likes / total) * 100)));
      const seg = dislikeBtn.closest('segmented-like-dislike-button-view-model, ytd-segmented-like-dislike-button-renderer');
      if (seg) {
        seg.style.position = 'relative';
        let bar = seg.querySelector('#__od_ryd_bar');
        if (!bar) {
          bar = document.createElement('div');
          bar.id = '__od_ryd_bar';
          bar.style.cssText = 'position:absolute;left:10px;right:10px;bottom:-5px;height:3px;border-radius:2px;background:rgba(240,82,82,0.82);overflow:hidden;pointer-events:none;';
          const fill = document.createElement('div');
          fill.id = '__od_ryd_fill';
          fill.style.cssText = 'height:100%;background:#3ECF8E;transition:width 0.2s ease;';
          bar.appendChild(fill);
          seg.appendChild(bar);
        }
        const fill = bar.querySelector('#__od_ryd_fill');
        if (fill) fill.style.width = pct + '%';
      }
    } catch {}
  })();`;
}

/**
 * Replaces clickbait ALL-CAPS watch titles with crowdsourced DeArrow clean title (hover shows original).
 */
export function buildDeArrowInjector(videoId: string, cleanTitle: string): string {
  return `(function () {
    try {
      const vid = ${JSON.stringify(videoId)};
      if (!location.search.includes(vid)) return;
      const h1 = document.querySelector('ytd-watch-metadata h1 yt-formatted-string, #title h1 yt-formatted-string');
      if (!h1) return;
      const storedVid = h1.getAttribute('data-od-orig-vid');
      let orig = storedVid === vid ? (h1.getAttribute('data-od-orig-title') || '') : '';
      if (!orig) {
        orig = (h1.textContent || '').trim();
        if (orig) {
          h1.setAttribute('data-od-orig-vid', vid);
          h1.setAttribute('data-od-orig-title', orig);
        }
      }
      h1.textContent = ${JSON.stringify(cleanTitle)};
      h1.title = 'DeArrow clean title · Original: ' + orig;
    } catch {}
  })();`;
}

/**
 * Injected Twitch Power-Up runtime:
 * - Built-in 7TV / BTTV / FFZ chat emote replacement + Tab-autocomplete in chat input
 * - Auto-claim Channel Points bonus chest (+50)
 * - Auto Theater Mode toggle
 * - Pause fast chat scrolling while hovering over chat
 * - Auto-recover stalled streams / Error #2000/#3000/#5000 player freezes
 * - Hide Hype Train, Gift Sub leaderboard & Recommended sidebar clutter
 */
export function buildTwitchPowerUpScript(powerUps: PowerUpsConfig): string {
  return `(function () {
    window.__odTwitchCfg = {
      emotes: ${Boolean(powerUps.twitchThirdPartyEmotes)},
      autoClaim: ${Boolean(powerUps.twitchAutoClaimPoints)},
      autoTheater: ${Boolean(powerUps.twitchAutoTheater)},
      pauseChatHover: ${Boolean(powerUps.twitchPauseChatOnHover)},
      autoRecover: ${Boolean(powerUps.twitchAutoRecover)},
      hideClutter: ${Boolean(powerUps.twitchHideClutter)}
    };

    const syncTwitchCss = () => {
      let st = document.getElementById('__od_twitch_powerup_css');
      if (!st) {
        st = document.createElement('style');
        st.id = '__od_twitch_powerup_css';
        (document.head || document.documentElement).appendChild(st);
      }
      st.textContent = window.__odTwitchCfg.hideClutter
        ? [
            '[data-test-selector="community-highlight-stack"], .channel-leaderboard, .hype-train-banner,',
            '[aria-label="Recommended Channels"], [data-a-target="recommended-channel-card"] { display: none !important; }'
          ].join('\\n')
        : '';
    };
    syncTwitchCss();

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
      let lastRecoverAt = 0;

      // Auto-claim Channel Points chest & Auto-Recover from Error #2000/#3000/#5000
      setInterval(() => {
        if (window.__odTwitchCfg.autoClaim) {
          const btn = document.querySelector(
            'button[aria-label*="Claim Bonus" i], .community-points-summary button:has(.claimable-bonus__icon)'
          );
          if (btn && typeof btn.click === 'function') {
            try { btn.click(); } catch {}
          }
        }
        if (window.__odTwitchCfg.autoRecover && Date.now() - lastRecoverAt > 12000) {
          const errOverlay = document.querySelector('[data-a-target="player-overlay-content-gate"], .content-overlay-gate');
          const txt = errOverlay ? (errOverlay.textContent || '') : '';
          if (txt.includes('#2000') || txt.includes('#3000') || txt.includes('#5000') || txt.toLowerCase().includes('network error')) {
            const retryBtn = errOverlay.querySelector('button');
            if (retryBtn) {
              lastRecoverAt = Date.now();
              try { retryBtn.click(); } catch {}
            }
          }
        }
      }, 4000);

      // Tab-autocomplete for 7TV / BTTV / FFZ emotes in Twitch chat input
      let tabMatches = [];
      let tabIdx = 0;
      let tabPrefix = '';
      document.addEventListener('keydown', (ev) => {
        if (!window.__odTwitchCfg.emotes || ev.key !== 'Tab') return;
        const el = document.activeElement;
        if (!el) return;
        const isChat = Boolean(
          (el.getAttribute && el.getAttribute('data-a-target') === 'chat-input') ||
          (el.closest && el.closest('[data-a-target="chat-input"]'))
        );
        if (!isChat) return;
        const emotes = window.__odTwitchEmoteMap;
        const names = emotes ? Object.keys(emotes) : [];
        if (names.length === 0) return;

        const isEditable = Boolean(el.isContentEditable);
        const text = isEditable ? (el.textContent || '') : (el.value || '');
        const words = text.trimEnd().split(' ');
        const lastWord = words[words.length - 1] || '';
        if (lastWord.length < 2) return;

        const lower = lastWord.toLowerCase();
        if (tabMatches.length === 0 || !tabMatches.includes(lastWord)) {
          tabPrefix = lower;
          tabMatches = names.filter((n) => n.toLowerCase().startsWith(tabPrefix)).slice(0, 12);
          tabIdx = 0;
        } else {
          tabIdx = (tabIdx + 1) % tabMatches.length;
        }
        if (tabMatches.length === 0) return;

        ev.preventDefault();
        ev.stopPropagation();
        const chosen = tabMatches[tabIdx];
        words[words.length - 1] = chosen;
        const nextVal = words.join(' ') + ' ';
        if (isEditable) {
          el.textContent = nextVal;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, data: nextVal }));
        } else {
          el.value = nextVal;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, true);

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
 * Injected Modern RES runtime for Shreddit & Old Reddit:
 * - J/K next & previous post focus, X expand/collapse media, C open comments
 * - Auto-collapse AutoModerator / pinned mod boilerplate
 * - Hide promoted posts, Games on Reddit, Trending & "Because you visited" recommendations
 * - Keyword & subreddit feed filter (filteReddit)
 * - Floating "Jump to Next Top-Level Comment" button
 * - Local color-coded User Tagger (persisted in Reddit partition localStorage)
 * - Hover Image Zoom + Exact Hover Timestamps
 */
export function buildRedditPowerUpScript(powerUps: PowerUpsConfig): string {
  return `(function () {
    window.__odRedditCfg = {
      keyboardNav: ${Boolean(powerUps.redditKeyboardNav)},
      collapseAutoMod: ${Boolean(powerUps.redditCollapseAutoMod)},
      hidePromoted: ${Boolean(powerUps.redditHidePromoted)},
      hideRecommended: ${Boolean(powerUps.redditHideRecommended)},
      nextCommentBtn: ${Boolean(powerUps.redditNextCommentButton)},
      hoverZoom: ${Boolean(powerUps.redditHoverZoom)},
      userTagger: ${Boolean(powerUps.redditUserTagger)},
      filteredKeywords: ${JSON.stringify((powerUps.redditFilteredKeywords ?? []).map((k) => k.toLowerCase()))}
    };

    const TAG_KEY = '__omnideck_reddit_user_tags';
    const TAG_COLORS = ['#E87A3E', '#3ECF8E', '#60A5FA', '#F59E0B', '#EC4899', '#A78BFA'];
    const loadTags = () => {
      try { return JSON.parse(localStorage.getItem(TAG_KEY) || '{}') || {}; } catch { return {}; }
    };
    const saveTags = (map) => {
      try { localStorage.setItem(TAG_KEY, JSON.stringify(map)); } catch {}
    };

    const runCleanups = () => {
      const cfg = window.__odRedditCfg;
      if (cfg.collapseAutoMod) {
        document.querySelectorAll('shreddit-comment[author="AutoModerator"]:not([data-od-collapsed])').forEach((el) => {
          el.setAttribute('data-od-collapsed', '1');
          el.setAttribute('collapsed', '');
        });
        document.querySelectorAll('.thing.comment[data-author="AutoModerator"]:not(.collapsed):not([data-od-collapsed])').forEach((el) => {
          el.setAttribute('data-od-collapsed', '1');
          const expand = el.querySelector('.expand');
          if (expand && typeof expand.click === 'function') expand.click();
        });
      }

      // Promoted posts (reversible)
      document.querySelectorAll('shreddit-ad-post, .promotedlink').forEach((el) => {
        if (cfg.hidePromoted) {
          el.setAttribute('data-od-hidden-promo', '1');
          el.style.display = 'none';
        } else if (el.getAttribute('data-od-hidden-promo')) {
          el.removeAttribute('data-od-hidden-promo');
          el.style.display = '';
        }
      });

      // Hide "Games on Reddit", Trending, & "Because you visited" / recommended feed injections (reversible)
      if (!cfg.hideRecommended) {
        document.querySelectorAll('[data-od-hidden-rec="1"]').forEach((el) => {
          el.removeAttribute('data-od-hidden-rec');
          el.style.display = '';
        });
      } else {
        document.querySelectorAll('reddit-recent-pages, [id*="games-on-reddit"], left-nav-games-section, shreddit-feed-carousel').forEach((el) => {
          el.setAttribute('data-od-hidden-rec', '1');
          el.style.display = 'none';
        });
        document.querySelectorAll('shreddit-post').forEach((post) => {
          const reason = (post.getAttribute('recommendation-source') || '').trim();
          const prev = post.previousElementSibling;
          const prevTxt = prev ? (prev.textContent || '').toLowerCase() : '';
          if (reason || prevTxt.includes('because you') || prevTxt.includes('similar to r/') || prevTxt.includes('popular near you')) {
            post.setAttribute('data-od-hidden-rec', '1');
            post.style.display = 'none';
            if (prev && prevTxt.length < 90) {
              prev.setAttribute('data-od-hidden-rec', '1');
              prev.style.display = 'none';
            }
          }
        });
      }

      // Keyword & Subreddit feed filter (filteReddit - reversible when keywords change/removed)
      const kws = cfg.filteredKeywords || [];
      document.querySelectorAll('shreddit-post, .thing.link').forEach((post) => {
        const title = (post.getAttribute('post-title') || post.querySelector('a.title, [slot="title"]')?.textContent || '').toLowerCase();
        const sub = (post.getAttribute('subreddit-prefixed-name') || post.getAttribute('data-subreddit-prefixed') || '').toLowerCase();
        const hit = kws.length > 0 && kws.some((kw) => kw && (title.includes(kw) || sub.includes(kw)));
        if (hit) {
          post.setAttribute('data-od-hidden-kw', '1');
          post.style.display = 'none';
        } else if (post.getAttribute('data-od-hidden-kw')) {
          post.removeAttribute('data-od-hidden-kw');
          post.style.display = '';
        }
      });

      // Exact localized hover timestamps
      document.querySelectorAll('time[datetime]:not([data-od-ts])').forEach((el) => {
        el.setAttribute('data-od-ts', '1');
        const dt = el.getAttribute('datetime');
        if (dt) {
          const d = new Date(dt);
          if (!isNaN(d.getTime())) el.title = d.toLocaleString();
        }
      });

      // Local User Tagger pills next to u/username links
      if (!cfg.userTagger) {
        document.querySelectorAll('[data-od-user-pill]').forEach((p) => { p.style.display = 'none'; });
      } else {
        document.querySelectorAll('[data-od-user-pill]').forEach((p) => { p.style.display = ''; });
        const tags = loadTags();
        document.querySelectorAll('a[href*="/user/"]:not([data-od-tagged]), a.author:not([data-od-tagged])').forEach((a) => {
          const href = a.getAttribute('href') || '';
          const m = href.match(/\\/user\\/([A-Za-z0-9_-]+)/);
          const user = (m && m[1]) || (a.textContent || '').replace(/^u\\//, '').trim();
          if (!user || user === 'AutoModerator' || user.length > 28) return;
          a.setAttribute('data-od-tagged', user.toLowerCase());
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.setAttribute('data-od-user-pill', user.toLowerCase());
          const renderPill = (entry) => {
            if (entry && entry.tag) {
              pill.textContent = entry.tag;
              pill.style.cssText = 'margin-left:5px;padding:1px 6px;border-radius:999px;border:none;background:' + (entry.color || '#E87A3E') + ';color:#fff;font:700 10px/1.3 system-ui,sans-serif;cursor:pointer;vertical-align:middle;';
              pill.title = 'Click to edit or clear tag for u/' + user;
            } else {
              pill.textContent = '+';
              pill.style.cssText = 'margin-left:4px;padding:0 4px;border-radius:4px;border:1px solid rgba(150,150,160,0.35);background:transparent;color:inherit;opacity:0.45;font:700 10px/1.2 system-ui,sans-serif;cursor:pointer;vertical-align:middle;';
              pill.title = 'Tag u/' + user + ' locally';
            }
          };
          renderPill(tags[user.toLowerCase()]);
          pill.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const curMap = loadTags();
            const existing = curMap[user.toLowerCase()];
            const nextText = window.prompt('Local tag for u/' + user + ' (leave empty to remove):', existing?.tag || '');
            if (nextText === null) return;
            const trimmed = nextText.trim().slice(0, 32);
            if (!trimmed) {
              delete curMap[user.toLowerCase()];
            } else {
              const color = existing?.color || TAG_COLORS[Object.keys(curMap).length % TAG_COLORS.length];
              curMap[user.toLowerCase()] = { tag: trimmed, color };
            }
            saveTags(curMap);
            document.querySelectorAll('[data-od-user-pill="' + user.toLowerCase() + '"]').forEach((p) => {
              const e = curMap[user.toLowerCase()];
              if (e && e.tag) {
                p.textContent = e.tag;
                p.style.cssText = 'margin-left:5px;padding:1px 6px;border-radius:999px;border:none;background:' + e.color + ';color:#fff;font:700 10px/1.3 system-ui,sans-serif;cursor:pointer;vertical-align:middle;';
              } else {
                p.textContent = '+';
                p.style.cssText = 'margin-left:4px;padding:0 4px;border-radius:4px;border:1px solid rgba(150,150,160,0.35);background:transparent;color:inherit;opacity:0.45;font:700 10px/1.2 system-ui,sans-serif;cursor:pointer;vertical-align:middle;';
              }
            });
          });
          if (a.parentElement) a.insertAdjacentElement('afterend', pill);
        });
      }

      // Floating "Jump to Next Top-Level Comment" button
      const isComments = location.pathname.includes('/comments/');
      let jumpBtn = document.getElementById('__od_reddit_next_cmt');
      if (cfg.nextCommentBtn && isComments) {
        if (!jumpBtn && document.body) {
          jumpBtn = document.createElement('button');
          jumpBtn.id = '__od_reddit_next_cmt';
          jumpBtn.type = 'button';
          jumpBtn.title = 'Jump to next top-level comment';
          jumpBtn.textContent = '↓';
          jumpBtn.style.cssText = 'position:fixed;right:20px;bottom:24px;z-index:2147483640;width:38px;height:38px;border-radius:999px;border:1px solid rgba(255,255,255,0.2);background:rgba(20,20,24,0.9);color:#fff;font:700 17px system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
          jumpBtn.onclick = () => {
            const roots = Array.from(document.querySelectorAll('shreddit-comment[depth="0"], .sitetable.nestedlisting > .thing.comment'));
            const next = roots.find((el) => el.getBoundingClientRect().top > 85);
            if (next) next.scrollIntoView({ behavior: 'smooth', block: 'start' });
          };
          document.body.appendChild(jumpBtn);
        }
        if (jumpBtn) jumpBtn.style.display = 'flex';
      } else if (jumpBtn) {
        jumpBtn.style.display = 'none';
      }
    };

    runCleanups();

    if (!window.__odRedditInit) {
      window.__odRedditInit = true;
      let focusIdx = -1;

      // Hover Image Zoom preview card
      let zoomBox = null;
      const hideZoom = () => { if (zoomBox) zoomBox.style.display = 'none'; };
      document.addEventListener('mouseover', (ev) => {
        if (!window.__odRedditCfg.hoverZoom) { hideZoom(); return; }
        const img = ev.target && ev.target.closest ? ev.target.closest('shreddit-post img, a.thumbnail img') : null;
        if (!img || !img.src || img.width > 380) return;
        const src = img.src;
        if (!src.includes('redd.it') && !src.includes('redditmedia.com') && !src.includes('imgur.com')) return;
        if (!zoomBox && document.body) {
          zoomBox = document.createElement('div');
          zoomBox.id = '__od_reddit_hover_zoom';
          zoomBox.style.cssText = 'position:fixed;right:18px;bottom:72px;z-index:2147483645;max-width:48vw;max-height:68vh;padding:4px;border-radius:10px;background:rgba(12,12,16,0.94);border:1px solid rgba(255,255,255,0.18);box-shadow:0 16px 40px rgba(0,0,0,0.65);pointer-events:none;display:none;';
          const zImg = document.createElement('img');
          zImg.style.cssText = 'display:block;max-width:46vw;max-height:64vh;object-fit:contain;border-radius:6px;';
          zoomBox.appendChild(zImg);
          document.body.appendChild(zoomBox);
        }
        if (zoomBox && zoomBox.firstChild) {
          zoomBox.firstChild.src = src;
          zoomBox.style.display = 'block';
        }
      }, true);
      document.addEventListener('mouseout', (ev) => {
        if (ev.target && ev.target.tagName === 'IMG') hideZoom();
      }, true);

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

      const isTypingOrModal = (ev) => {
        const p = (location.pathname || '').toLowerCase();
        if (p.startsWith('/login') || p.startsWith('/register') || p.startsWith('/account') || p.startsWith('/submit')) {
          return true;
        }
        const isEditableNode = (el) => {
          if (!el || typeof el !== 'object') return false;
          const tag = (el.tagName || '').toLowerCase();
          if (
            tag === 'input' || tag === 'textarea' || tag === 'select' ||
            tag.includes('input') || tag.includes('composer') || tag.includes('search') ||
            tag.startsWith('auth-flow')
          ) return true;
          if (el.isContentEditable) return true;
          if (typeof el.getAttribute === 'function') {
            const role = (el.getAttribute('role') || '').toLowerCase();
            if (role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'dialog') return true;
          }
          return false;
        };
        if (typeof ev.composedPath === 'function') {
          const path = ev.composedPath();
          for (let i = 0; i < path.length; i++) {
            if (isEditableNode(path[i])) return true;
          }
        }
        let active = document.activeElement;
        while (active) {
          if (isEditableNode(active)) return true;
          active = active.shadowRoot ? active.shadowRoot.activeElement : null;
        }
        if (document.querySelector('auth-flow-modal, faceplate-modal[open], dialog[open]')) return true;
        return isEditableNode(ev.target);
      };

      document.addEventListener('keydown', (ev) => {
        if (!window.__odRedditCfg.keyboardNav) return;
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
        if (isTypingOrModal(ev)) return;

        const key = (ev.key || '').toLowerCase();
        if (key !== 'j' && key !== 'k' && key !== 'c' && key !== 'x') return;

        const posts = getPosts();
        if (posts.length === 0) return;

        if (key === 'j') {
          ev.preventDefault();
          focusPost(focusIdx + 1);
        } else if (key === 'k') {
          ev.preventDefault();
          focusPost(focusIdx <= 0 ? 0 : focusIdx - 1);
        } else if (key === 'c' && focusIdx >= 0) {
          const post = posts[focusIdx];
          const commentsLink = post && (post.querySelector('a[data-click-id="comments"], a.comments, a[slot="full-post-link"]'));
          if (commentsLink) {
            ev.preventDefault();
            commentsLink.click();
          }
        } else if (key === 'x' && focusIdx >= 0) {
          const post = posts[focusIdx];
          const expando = post && post.querySelector('.expando-button, shreddit-player, button[aria-label*="Expand" i]');
          if (expando && typeof expando.click === 'function') {
            ev.preventDefault();
            expando.click();
          }
        }
      });

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

      setInterval(runCleanups, 2200);
    }
  })();`;
}

/**
 * Injected Spotify Web Player Power-Up runtime:
 * - Music-Only Mode: hides Podcasts, Episodes, and Audiobooks carousels/shelves & sidebar chips
 * - Live Queue Total Duration badge in the Queue view
 */
export function buildSpotifyPowerUpScript(powerUps: PowerUpsConfig): string {
  return `(function () {
    window.__odSpotifyCfg = {
      hidePodcastsAudiobooks: ${Boolean(powerUps.spotifyHidePodcastsAudiobooks)}
    };

    const runSpotifyCleanups = () => {
      if (!window.__odSpotifyCfg.hidePodcastsAudiobooks) {
        document.querySelectorAll('[data-od-sp-hidden="1"]').forEach((el) => {
          el.removeAttribute('data-od-sp-hidden');
          el.style.display = '';
        });
      } else {
        document.querySelectorAll('section[data-testid="component-shelf"], section[aria-label]').forEach((sec) => {
          const label = (sec.getAttribute('aria-label') || sec.querySelector('h2, a')?.textContent || '').toLowerCase();
          const hasPodcastLinks = Boolean(sec.querySelector('a[href*="/show/"], a[href*="/episode/"], a[href*="/audiobook/"]'));
          if (
            label.includes('podcast') ||
            label.includes('audiobook') ||
            label.includes('episodes for you') ||
            label.includes('your shows') ||
            hasPodcastLinks
          ) {
            sec.setAttribute('data-od-sp-hidden', '1');
            sec.style.display = 'none';
          }
        });
        document.querySelectorAll('[role="checkbox"], button').forEach((chip) => {
          const txt = (chip.textContent || '').trim().toLowerCase();
          if (txt === 'podcasts' || txt === 'audiobooks' || txt === 'podcasts & shows') {
            chip.setAttribute('data-od-sp-hidden', '1');
            chip.style.display = 'none';
          }
        });
      }

      // Queue Total Duration readout
      if (location.pathname.startsWith('/queue')) {
        const rows = document.querySelectorAll('[data-testid="tracklist-row"]');
        let totalSec = 0;
        rows.forEach((row) => {
          const durEl = row.querySelector('[aria-colindex="5"], :scope > div:last-child');
          const txt = (durEl?.textContent || '').trim();
          const m = txt.match(/(\\d+):(\\d{2})/);
          if (m) totalSec += parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        });
        const heading = document.querySelector('main h1');
        if (heading && totalSec > 0) {
          let badge = document.getElementById('__od_sp_queue_dur');
          if (!badge) {
            badge = document.createElement('span');
            badge.id = '__od_sp_queue_dur';
            badge.style.cssText = 'margin-left:12px;font:600 13px system-ui,sans-serif;color:#1DB954;vertical-align:middle;';
            heading.appendChild(badge);
          }
          const h = Math.floor(totalSec / 3600);
          const mins = Math.floor((totalSec % 3600) / 60);
          badge.textContent = rows.length + ' tracks · ' + (h > 0 ? (h + 'h ' + mins + 'm') : (mins + 'm'));
        }
      }
    };

    runSpotifyCleanups();
    if (!window.__odSpotifyInit) {
      window.__odSpotifyInit = true;
      setInterval(runSpotifyCleanups, 2500);
    }
  })();`;
}

/**
 * Injected Audible Player-First Power-Up runtime:
 * - Precision Speed pill (0.75x - 3.0x in 0.05x steps, remembered per book) inside Audible Cloud Player
 * - Hide storefront banner ads & upsell carousels on Library / Wishlist pages
 */
export function buildAudiblePowerUpScript(powerUps: PowerUpsConfig): string {
  return `(function () {
    window.__odAudibleCfg = {
      precisionSpeed: ${Boolean(powerUps.audiblePrecisionSpeed)},
      hideStoreClutter: ${Boolean(powerUps.audibleHideStoreClutter)}
    };

    const syncAudible = () => {
      let st = document.getElementById('__od_audible_clutter_css');
      if (!st) {
        st = document.createElement('style');
        st.id = '__od_audible_clutter_css';
        (document.head || document.documentElement).appendChild(st);
      }
      st.textContent = window.__odAudibleCfg.hideStoreClutter
        ? [
            '[data-widget="adbl-merchandising-banner"], .adbl-upsell-banner, #adbl-store-upsell,',
            '[data-automation-id*="upsell"], .bc-section:has(a[href*="/ep/audible-plus"]) { display: none !important; }'
          ].join('\\n')
        : '';

      const existingPill = document.getElementById('__od_audible_speed_pill');
      if (!window.__odAudibleCfg.precisionSpeed) {
        if (existingPill) existingPill.style.display = 'none';
        return;
      }
      if (existingPill) existingPill.style.display = 'flex';

      if (location.pathname.toLowerCase().includes('webplayer')) {
        if (!existingPill && document.body) {
          const SPEED_STORE = '__omnideck_audible_speed_' + (location.search || 'default');
          let curSpeed = 1.0;
          try {
            const saved = Number(localStorage.getItem(SPEED_STORE));
            if (Number.isFinite(saved) && saved >= 0.75 && saved <= 3.0) curSpeed = saved;
          } catch {}

          const applySpeed = (val) => {
            curSpeed = Math.min(3.0, Math.max(0.75, Math.round(val * 20) / 20));
            try { localStorage.setItem(SPEED_STORE, String(curSpeed)); } catch {}
            document.querySelectorAll('audio, video').forEach((m) => {
              try { m.playbackRate = curSpeed; } catch {}
            });
            valEl.textContent = curSpeed.toFixed(2) + 'x';
          };

          const pill = document.createElement('div');
          pill.id = '__od_audible_speed_pill';
          pill.style.cssText = 'position:fixed;bottom:14px;left:14px;z-index:2147483640;display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:999px;background:rgba(18,16,14,0.92);border:1px solid rgba(247,153,28,0.45);color:#fff;font:600 11px system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,0.45);';

          const mkBtn = (txt, fn) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = txt;
            b.style.cssText = 'border:none;background:rgba(255,255,255,0.12);color:#fff;border-radius:6px;padding:2px 6px;cursor:pointer;font:700 11px system-ui,sans-serif;';
            b.onclick = fn;
            return b;
          };
          const valEl = document.createElement('span');
          valEl.style.cssText = 'min-width:38px;text-align:center;color:#F7991C;';
          valEl.textContent = curSpeed.toFixed(2) + 'x';

          pill.appendChild(mkBtn('-0.05', () => applySpeed(curSpeed - 0.05)));
          pill.appendChild(valEl);
          pill.appendChild(mkBtn('+0.05', () => applySpeed(curSpeed + 0.05)));
          pill.appendChild(mkBtn('1x', () => applySpeed(1.0)));
          document.body.appendChild(pill);
          setTimeout(() => applySpeed(curSpeed), 1200);
        }
      }
    };

    syncAudible();
    if (!window.__odAudibleInit) {
      window.__odAudibleInit = true;
      setInterval(syncAudible, 3000);
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

/**
 * Phase 1–3 per-app DOM superpowers layered cleanly on top of existing v1.5 scripts:
 * - YouTube: 1-click thumbnail Watch Later / Queue actions, BlockTube channel/keyword filter, press `N` for timestamped notes
 * - YouTube Music: Playlist Sorter & Duplicate Highlighter, Smart Fade transitions
 * - Spotify: Smart Shuffle Guard ("Real Shuffle Only") & Queue Total Duration badge
 * - Twitch: BTTV/7TV/FFZ Tab-Autocomplete + Emote Picker, Chat Keyword Highlights + Ping, Sync-to-Live edge button
 * - Reddit: Exact local timestamps, Visited-Post Dimmer + Hide Read pill, Kill Video Infinite Scroll
 * - Audible: Full Custom Audible Deck telemetry & control bridge (chapters, true-speed remaining, end-of-chapter sleep)
 */
export function buildV16EnhancementsScript(
  serviceId: string,
  powerUps: PowerUpsConfig,
): string {
  if (serviceId === 'youtube') {
    const blocked = JSON.stringify(
      (powerUps.youtubeBlockedChannels ?? []).map((s) => s.toLowerCase()),
    );
    return `(function () {
      window.__odYt16Cfg = {
        quickThumbActions: ${Boolean(powerUps.youtubeQuickThumbActions)},
        blockedChannels: ${blocked}
      };

      const applyFiltersAndQuickActions = () => {
        const cfg = window.__odYt16Cfg;
        if (!cfg) return;
        const cards = document.querySelectorAll('ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-compact-video-renderer');
        cards.forEach((card) => {
          // 1) BlockTube-style channel & keyword filter
          if (cfg.blockedChannels && cfg.blockedChannels.length > 0) {
            const text = (card.textContent || '').toLowerCase();
            const hit = cfg.blockedChannels.some((term) => term && text.includes(term));
            card.style.display = hit ? 'none' : '';
            if (hit) return;
          }

          // 2) 1-Click Thumbnail Quick Actions (+WL / +Q)
          if (!cfg.quickThumbActions) return;
          const thumb = card.querySelector('ytd-thumbnail, #thumbnail');
          if (!thumb || thumb.querySelector('.__od-thumb-actions')) return;
          const link = card.querySelector('a#thumbnail, a[href*="/watch?v="]');
          if (!link || !link.getAttribute('href') || !link.getAttribute('href').includes('/watch')) return;

          const bar = document.createElement('div');
          bar.className = '__od-thumb-actions';
          bar.style.cssText = 'position:absolute;top:6px;left:6px;z-index:25;display:flex;gap:4px;opacity:0;transition:opacity 140ms ease;pointer-events:auto;';

          const triggerMenuAction = (ev, keywords) => {
            ev.preventDefault();
            ev.stopPropagation();
            const menuBtn = card.querySelector('button[aria-label*="Action menu" i], yt-icon-button#button button, ytd-menu-renderer button');
            if (!menuBtn) return;
            menuBtn.click();
            setTimeout(() => {
              const items = Array.from(document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item, yt-list-item-view-model'));
              const match = items.find((el) => {
                const t = (el.textContent || '').toLowerCase();
                return keywords.some((k) => t.includes(k));
              });
              if (match) {
                match.click();
              } else {
                document.body.click();
              }
            }, 140);
          };

          const mkPill = (label, title, keywords) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.title = title;
            b.style.cssText = 'border:1px solid rgba(255,255,255,0.22);background:rgba(13,15,18,0.88);color:#fff;font:700 10px system-ui,sans-serif;padding:3px 6px;border-radius:6px;cursor:pointer;backdrop-filter:blur(4px);';
            b.addEventListener('click', (ev) => triggerMenuAction(ev, keywords));
            return b;
          };

          bar.appendChild(mkPill('+WL', 'Save to Watch Later (1-click)', ['watch later']));
          bar.appendChild(mkPill('+Q', 'Add to Queue (1-click)', ['add to queue']));
          if (getComputedStyle(thumb).position === 'static') thumb.style.position = 'relative';
          thumb.appendChild(bar);
          card.addEventListener('mouseenter', () => { bar.style.opacity = '1'; });
          card.addEventListener('mouseleave', () => { bar.style.opacity = '0'; });
        });
      };

      // 3) Press 'N' on any YouTube watch page to capture a timestamped video note
      if (!window.__odYtNoteBound) {
        window.__odYtNoteBound = true;
        document.addEventListener('keydown', (ev) => {
          if (ev.key.toLowerCase() !== 'n' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
          const tag = (ev.target && ev.target.tagName || '').toLowerCase();
          if (tag === 'input' || tag === 'textarea' || (ev.target && ev.target.isContentEditable)) return;
          if (!location.pathname.startsWith('/watch')) return;
          const video = document.querySelector('video');
          if (!video) return;
          ev.preventDefault();
          const sec = Math.max(0, Math.floor(video.currentTime || 0));
          const mins = Math.floor(sec / 60);
          const rem = sec % 60;
          const stamp = mins + ':' + String(rem).padStart(2, '0');
          const title = (document.querySelector('h1.ytd-watch-metadata, h1.title')?.textContent || document.title || 'YouTube Video').replace(/ - YouTube$/i, '').trim();

          let box = document.getElementById('__od_yt_note_box');
          if (box) box.remove();
          box = document.createElement('div');
          box.id = '__od_yt_note_box';
          box.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483645;width:320px;padding:12px;border-radius:12px;background:#13161b;border:1px solid rgba(228,126,60,0.55);color:#f1f3f6;box-shadow:0 16px 40px rgba(0,0,0,0.65);font:500 12px system-ui,sans-serif;';
          box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><strong style="color:#e47e3c;">Note at ' + stamp + '</strong><button id="__od_note_x" type="button" style="background:none;border:none;color:#9aa3b2;cursor:pointer;font-size:14px;">✕</button></div><input id="__od_note_in" type="text" placeholder="Type timestamped note and press Enter…" style="width:100%;box-sizing:border-box;padding:7px 9px;border-radius:8px;border:1px solid rgba(255,255,255,0.16);background:#0d0f12;color:#fff;font-size:12px;outline:none;" />';
          document.body.appendChild(box);
          const input = document.getElementById('__od_note_in');
          const closeBtn = document.getElementById('__od_note_x');
          if (closeBtn) closeBtn.onclick = () => box.remove();
          if (input) {
            input.focus();
            input.addEventListener('keydown', (ke) => {
              ke.stopPropagation();
              if (ke.key === 'Escape') { box.remove(); return; }
              if (ke.key === 'Enter' && input.value.trim()) {
                const u = new URL(location.href);
                u.searchParams.set('t', sec + 's');
                console.debug('__OD_VIDEO_NOTE__:' + JSON.stringify({
                  bookTitle: title,
                  timestampLabel: stamp,
                  note: input.value.trim(),
                  url: u.toString()
                }));
                box.remove();
              }
            });
          }
        });
      }

      applyFiltersAndQuickActions();
      if (!window.__odYt16Timer) {
        window.__odYt16Timer = setInterval(applyFiltersAndQuickActions, 2200);
      }
    })();`;
  }

  if (serviceId === 'youtube-music') {
    return `(function () {
      window.__odYtm16Cfg = {
        playlistSorter: ${Boolean(powerUps.ytmPlaylistSorter)},
        smartFade: ${Boolean(powerUps.ytmSmartFadeAndSilenceTrim)}
      };

      const mountPlaylistSorter = () => {
        if (!window.__odYtm16Cfg.playlistSorter) return;
        const isPlaylist = location.pathname.includes('/playlist') || location.href.includes('list=');
        let bar = document.getElementById('__od_ytm_sort_bar');
        if (!isPlaylist) {
          if (bar) bar.remove();
          return;
        }
        const host = document.querySelector('ytmusic-playlist-shelf-renderer #contents, ytmusic-shelf-renderer #contents');
        if (!host) return;
        if (!bar) {
          bar = document.createElement('div');
          bar.id = '__od_ytm_sort_bar';
          bar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 4px 12px 4px;font:600 11px system-ui,sans-serif;';

          const parseDur = (txt) => {
            const m = String(txt || '').match(/(\\d+):(\\d{2})/);
            return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
          };

          const sortRows = (mode) => {
            const rows = Array.from(host.querySelectorAll(':scope > ytmusic-responsive-list-item-renderer'));
            if (rows.length < 2) return;
            rows.sort((a, b) => {
              const titleA = (a.querySelector('.title-column, .title')?.textContent || '').trim().toLowerCase();
              const titleB = (b.querySelector('.title-column, .title')?.textContent || '').trim().toLowerCase();
              const artistA = (a.querySelector('.secondary-flex-columns')?.textContent || '').trim().toLowerCase();
              const artistB = (b.querySelector('.secondary-flex-columns')?.textContent || '').trim().toLowerCase();
              const durA = parseDur(a.querySelector('.fixed-columns')?.textContent);
              const durB = parseDur(b.querySelector('.fixed-columns')?.textContent);
              if (mode === 'title') return titleA.localeCompare(titleB);
              if (mode === 'artist') return artistA.localeCompare(artistB) || titleA.localeCompare(titleB);
              if (mode === 'duration') return durA - durB;
              return 0;
            });
            rows.forEach((r) => host.appendChild(r));
          };

          const highlightDuplicates = () => {
            const rows = Array.from(host.querySelectorAll(':scope > ytmusic-responsive-list-item-renderer'));
            const seen = new Set();
            let dupCount = 0;
            rows.forEach((r) => {
              const key = ((r.querySelector('.title-column, .title')?.textContent || '') + '|' + (r.querySelector('.secondary-flex-columns')?.textContent || '')).trim().toLowerCase();
              if (key && seen.has(key)) {
                dupCount++;
                r.style.outline = '1.5px solid #eab308';
                r.style.borderRadius = '8px';
                r.style.background = 'rgba(234,179,8,0.09)';
              } else {
                seen.add(key);
                r.style.outline = '';
                r.style.background = '';
              }
            });
            dupBtn.textContent = dupCount > 0 ? ('Duplicates (' + dupCount + ')') : 'No Duplicates';
          };

          const mk = (txt, fn) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = txt;
            b.style.cssText = 'border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.06);color:#f1f3f6;border-radius:999px;padding:4px 10px;cursor:pointer;font:600 11px system-ui,sans-serif;';
            b.onclick = fn;
            return b;
          };

          const label = document.createElement('span');
          label.textContent = 'OmniDeck Sort:';
          label.style.cssText = 'color:#9aa3b2;margin-right:2px;';
          bar.appendChild(label);
          bar.appendChild(mk('A–Z Title', () => sortRows('title')));
          bar.appendChild(mk('Artist', () => sortRows('artist')));
          bar.appendChild(mk('Shortest', () => sortRows('duration')));
          const dupBtn = mk('Find Duplicates', highlightDuplicates);
          bar.appendChild(dupBtn);
          host.parentElement?.insertBefore(bar, host);
        }
      };

      // Smooth fade-out near end of track & gentle fade-in on start
      if (!window.__odYtmFadeTimer) {
        let fadeActive = false;
        window.__odYtmFadeTimer = setInterval(() => {
          if (!window.__odYtm16Cfg || !window.__odYtm16Cfg.smartFade) return;
          const v = document.querySelector('video');
          if (!v || v.paused || !Number.isFinite(v.duration) || v.duration < 25) return;
          const rem = v.duration - v.currentTime;
          const baseScale = typeof window.__omnideckVolumeScale === 'number' ? window.__omnideckVolumeScale : 1;
          if (rem > 0 && rem <= 2.2) {
            fadeActive = true;
            const factor = Math.max(0.18, rem / 2.2);
            try { v.volume = Math.min(1, Math.max(0.05, factor * baseScale)); } catch {}
          } else if (fadeActive && v.currentTime < 1.5) {
            const factor = Math.min(1, Math.max(0.25, v.currentTime / 1.5));
            try { v.volume = Math.min(1, Math.max(0.05, factor * baseScale)); } catch {}
          } else if (fadeActive) {
            fadeActive = false;
            try { v.volume = Math.min(1, Math.max(0, baseScale)); } catch {}
          }
        }, 220);
      }

      mountPlaylistSorter();
      if (!window.__odYtm16Timer) {
        window.__odYtm16Timer = setInterval(mountPlaylistSorter, 2400);
      }
    })();`;
  }

  if (serviceId === 'spotify') {
    return `(function () {
      window.__odSp16Cfg = {
        guardSmartShuffle: ${Boolean(powerUps.spotifyGuardSmartShuffle)},
        queueDuration: ${Boolean(powerUps.spotifyQueueDuration)}
      };

      let lastGuardClickAt = 0;
      const tickSpotify = () => {
        const cfg = window.__odSp16Cfg;
        if (!cfg) return;

        // 1) Smart Shuffle Guard: cycle out of Smart Shuffle back to pure Shuffle
        if (cfg.guardSmartShuffle) {
          const shuffleBtn = document.querySelector('[data-testid="control-button-shuffle"]');
          if (shuffleBtn) {
            const label = (shuffleBtn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('smart shuffle') && Date.now() - lastGuardClickAt > 2500) {
              lastGuardClickAt = Date.now();
              shuffleBtn.click();
            }
          }
        }

        // 2) Queue Total Duration Counter
        if (cfg.queueDuration) {
          const queueHeading = Array.from(document.querySelectorAll('h1, h2, h3')).find((h) => /^next (in queue|up)/i.test((h.textContent || '').trim()));
          if (queueHeading) {
            const rows = document.querySelectorAll('[data-testid="tracklist-row"]');
            let totalSec = 0;
            let count = 0;
            rows.forEach((row) => {
              const m = (row.textContent || '').match(/\\b(\\d{1,2}):(\\d{2})\\b/);
              if (m) {
                totalSec += parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
                count++;
              }
            });
            let badge = document.getElementById('__od_sp_queue_dur');
            if (count > 0 && totalSec > 0) {
              const mins = Math.round(totalSec / 60);
              const hrs = Math.floor(mins / 60);
              const remM = mins % 60;
              const formatted = hrs > 0 ? (hrs + 'h ' + remM + 'm') : (mins + 'm');
              if (!badge) {
                badge = document.createElement('span');
                badge.id = '__od_sp_queue_dur';
                badge.style.cssText = 'margin-left:10px;padding:2px 8px;border-radius:999px;background:rgba(29,185,84,0.16);border:1px solid rgba(29,185,84,0.35);color:#1db954;font:600 11px system-ui,sans-serif;vertical-align:middle;';
                queueHeading.appendChild(badge);
              }
              badge.textContent = count + ' tracks · ' + formatted;
            }
          }
        }
      };

      tickSpotify();
      if (!window.__odSp16Timer) {
        window.__odSp16Timer = setInterval(tickSpotify, 2200);
      }
    })();`;
  }

  if (serviceId === 'twitch') {
    const highlights = JSON.stringify(
      (powerUps.twitchChatHighlights ?? []).map((s) => s.toLowerCase()),
    );
    return `(function () {
      window.__odTw16Cfg = {
        emoteAutocomplete: ${Boolean(powerUps.twitchEmoteAutocomplete)},
        highlights: ${highlights}
      };

      // 1) Chat Keyword Highlights + subtle chime
      const scanChatHighlights = () => {
        const terms = window.__odTw16Cfg && window.__odTw16Cfg.highlights;
        if (!terms || terms.length === 0) return;
        document.querySelectorAll('[data-a-target="chat-line-message"]:not([data-od-hl-checked])').forEach((line) => {
          line.setAttribute('data-od-hl-checked', '1');
          const txt = (line.textContent || '').toLowerCase();
          if (terms.some((k) => k && txt.includes(k))) {
            line.style.background = 'rgba(228,126,60,0.16)';
            line.style.borderLeft = '3px solid #e47e3c';
            line.style.paddingLeft = '6px';
            line.style.borderRadius = '4px';
          }
        });
      };

      // 2) BTTV/7TV/FFZ Tab-Autocomplete & Quick Emote Picker
      const mountEmoteTools = () => {
        if (!window.__odTw16Cfg || !window.__odTw16Cfg.emoteAutocomplete) return;
        const input = document.querySelector('[data-a-target="chat-input"]');
        if (input && !input.__odTabBound) {
          input.__odTabBound = true;
          input.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Tab') return;
            const emotes = window.__odEmoteMap || {};
            const names = Object.keys(emotes);
            if (names.length === 0) return;
            const text = (input.textContent || input.value || '').trimEnd();
            const parts = text.split(/\\s+/);
            const last = parts[parts.length - 1];
            if (!last || last.length < 2) return;
            const match = names.find((n) => n.toLowerCase().startsWith(last.toLowerCase()));
            if (!match) return;
            ev.preventDefault();
            ev.stopPropagation();
            try {
              document.execCommand('insertText', false, match.slice(last.length) + ' ');
            } catch {}
          }, true);
        }

        // 3) Sync-to-Live edge pill when stream latency drifts
        const video = document.querySelector('video');
        if (video && video.buffered && video.buffered.length > 0) {
          const liveEdge = video.buffered.end(video.buffered.length - 1);
          const drift = liveEdge - video.currentTime;
          let pill = document.getElementById('__od_tw_sync_live');
          if (drift > 8 && drift < 180) {
            if (!pill && document.body) {
              pill = document.createElement('button');
              pill.id = '__od_tw_sync_live';
              pill.type = 'button';
              pill.style.cssText = 'position:fixed;bottom:68px;left:18px;z-index:2147483635;border:1px solid rgba(145,70,255,0.55);background:rgba(19,22,27,0.92);color:#fff;padding:5px 10px;border-radius:999px;font:700 11px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,0.45);';
              pill.onclick = () => {
                const v = document.querySelector('video');
                if (v && v.buffered && v.buffered.length > 0) {
                  v.currentTime = Math.max(0, v.buffered.end(v.buffered.length - 1) - 0.8);
                }
                pill.remove();
              };
              document.body.appendChild(pill);
            }
            if (pill) pill.textContent = '⚡ Sync to Live (-' + Math.round(drift) + 's)';
          } else if (pill) {
            pill.remove();
          }
        }
      };

      scanChatHighlights();
      mountEmoteTools();
      if (!window.__odTw16Timer) {
        window.__odTw16Timer = setInterval(() => {
          scanChatHighlights();
          mountEmoteTools();
        }, 2000);
      }
    })();`;
  }

  if (serviceId === 'reddit') {
    return `(function () {
      window.__odRd16Cfg = {
        exactTimestamps: ${Boolean(powerUps.redditExactTimestamps)},
        killVideoScroll: ${Boolean(powerUps.redditKillVideoScroll)}
      };

      const VISITED_KEY = '__od_reddit_visited_v1';
      let visited = new Set();
      try {
        const raw = JSON.parse(localStorage.getItem(VISITED_KEY) || '[]');
        if (Array.isArray(raw)) visited = new Set(raw.slice(-400));
      } catch {}

      const persistVisited = () => {
        try { localStorage.setItem(VISITED_KEY, JSON.stringify(Array.from(visited).slice(-400))); } catch {}
      };

      // Record current thread as visited
      const postMatch = location.pathname.match(/\\/comments\\/([a-z0-9]+)/i);
      if (postMatch && !visited.has(postMatch[1])) {
        visited.add(postMatch[1]);
        persistVisited();
      }

      const enhanceReddit = () => {
        const cfg = window.__odRd16Cfg;
        if (!cfg) return;

        // 1) Exact Local Hover Timestamps + Visited-Post Dimming
        if (cfg.exactTimestamps) {
          document.querySelectorAll('time[datetime]:not([data-od-exact-ts])').forEach((t) => {
            t.setAttribute('data-od-exact-ts', '1');
            const dt = new Date(t.getAttribute('datetime') || '');
            if (!Number.isNaN(dt.getTime())) {
              t.title = dt.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              });
            }
          });

          const hideRead = document.documentElement.classList.contains('__od-hide-read-posts');
          document.querySelectorAll('shreddit-post, .thing.link').forEach((post) => {
            const href = post.getAttribute('permalink') || post.querySelector('a[href*="/comments/"]')?.getAttribute('href') || '';
            const m = href.match(/\\/comments\\/([a-z0-9]+)/i);
            if (m && visited.has(m[1])) {
              post.style.opacity = hideRead ? '' : '0.58';
              post.style.display = hideRead ? 'none' : '';
            }
          });

          if (!location.pathname.includes('/comments/') && visited.size > 0 && !document.getElementById('__od_rd_hide_read') && document.body) {
            const btn = document.createElement('button');
            btn.id = '__od_rd_hide_read';
            btn.type = 'button';
            btn.textContent = 'Hide Read';
            btn.style.cssText = 'position:fixed;right:18px;bottom:22px;z-index:9980;border:1px solid rgba(255,255,255,0.18);background:rgba(19,22,27,0.92);color:#f1f3f6;border-radius:999px;padding:6px 12px;font:600 11px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,0.45);';
            btn.onclick = () => {
              const hidden = document.documentElement.classList.toggle('__od-hide-read-posts');
              btn.textContent = hidden ? 'Show Read' : 'Hide Read';
              enhanceReddit();
            };
            document.body.appendChild(btn);
          }
        }

        // 2) Kill Reddit Video Infinite Scroll Hijack
        if (cfg.killVideoScroll) {
          document.querySelectorAll('shreddit-player, shreddit-player-2').forEach((pl) => {
            if (pl.__odKillScroll) return;
            pl.__odKillScroll = true;
            pl.addEventListener('wheel', (ev) => {
              ev.stopPropagation();
            }, { passive: true });
          });
        }
      };

      enhanceReddit();
      if (!window.__odRd16Timer) {
        window.__odRd16Timer = setInterval(enhanceReddit, 2200);
      }
    })();`;
  }

  if (serviceId === 'audible') {
    return `(function () {
      const readAudibleState = () => {
        const media = document.querySelector('audio, video');
        const title = (
          document.querySelector('#adbl-cp-title, .adbl-cp-book-title, [data-testid="book-title"], h1')?.textContent ||
          document.title ||
          'Audible Audiobook'
        ).replace(/\\s*\\|\\s*Audible.*$/i, '').trim();
        const chapter = (
          document.querySelector('#adbl-cp-chapter-title, .adbl-cp-chapter-title, .adbl-cp-active-chapter, [aria-current="true"]')?.textContent ||
          ''
        ).trim();
        const cover = (
          document.querySelector('#adbl-cp-cover img, .adbl-cp-cover img, img.bc-pub-block')?.getAttribute('src') ||
          ''
        );
        const chapterEls = Array.from(document.querySelectorAll('.adbl-cp-chapter-item, [data-testid="chapter-item"], .adbl-cp-chapters li'));
        const chapters = chapterEls.slice(0, 120).map((el, idx) => ({
          index: idx,
          title: (el.textContent || ('Chapter ' + (idx + 1))).replace(/\\s+/g, ' ').trim().slice(0, 90),
          active: el.classList.contains('active') || el.getAttribute('aria-current') === 'true'
        }));
        return {
          title,
          chapter,
          cover,
          playing: media ? !media.paused : false,
          currentTimeSec: media && Number.isFinite(media.currentTime) ? media.currentTime : 0,
          durationSec: media && Number.isFinite(media.duration) ? media.duration : 0,
          playbackRate: media && Number.isFinite(media.playbackRate) ? media.playbackRate : 1,
          chapters,
          endOfChapterArmed: Boolean(window.__odAudibleEocArmed)
        };
      };

      window.__odAudibleDeckControl = (action, value) => {
        const media = document.querySelector('audio, video');
        if (action === 'state') return readAudibleState();
        if (action === 'playPause') {
          if (media) {
            if (media.paused) media.play().catch(() => {});
            else media.pause();
          } else {
            const btn = document.querySelector('#adbl-cp-play-btn, button[aria-label*="Play" i], button[aria-label*="Pause" i]');
            if (btn) btn.click();
          }
          return readAudibleState();
        }
        if (action === 'skip' && media) {
          const delta = Number(value) || 15;
          const next = Math.max(0, Math.min(Number.isFinite(media.duration) ? media.duration : 999999, (media.currentTime || 0) + delta));
          media.currentTime = next;
          return readAudibleState();
        }
        if (action === 'seek' && media) {
          const target = Math.max(0, Number(value) || 0);
          media.currentTime = target;
          return readAudibleState();
        }
        if (action === 'rate') {
          const rate = Math.min(3.0, Math.max(0.75, Math.round((Number(value) || 1) * 20) / 20));
          try { localStorage.setItem('__od_audible_speed', String(rate)); } catch {}
          document.querySelectorAll('audio, video').forEach((m) => {
            try { m.playbackRate = rate; } catch {}
          });
          return readAudibleState();
        }
        if (action === 'selectChapter') {
          const idx = Number(value);
          const chapterEls = Array.from(document.querySelectorAll('.adbl-cp-chapter-item, [data-testid="chapter-item"], .adbl-cp-chapters li'));
          const target = chapterEls[idx];
          if (target) {
            const clickable = target.querySelector('a, button') || target;
            clickable.click();
          }
          return readAudibleState();
        }
        if (action === 'toggleEndOfChapterSleep') {
          window.__odAudibleEocArmed = !window.__odAudibleEocArmed;
          return readAudibleState();
        }
        return readAudibleState();
      };

      if (!window.__odAudibleEocWatcher) {
        let lastChapterTitle = '';
        window.__odAudibleEocWatcher = setInterval(() => {
          const st = readAudibleState();
          if (window.__odAudibleEocArmed && st.playing) {
            const nearEnd = st.durationSec > 10 && st.currentTimeSec >= st.durationSec - 1.2;
            const chapterChanged = lastChapterTitle && st.chapter && st.chapter !== lastChapterTitle;
            if (nearEnd || chapterChanged) {
              window.__odAudibleEocArmed = false;
              const m = document.querySelector('audio, video');
              if (m) m.pause();
            }
          }
          if (st.chapter) lastChapterTitle = st.chapter;
        }, 900);
      }
    })();`;
  }

  return '';
}

