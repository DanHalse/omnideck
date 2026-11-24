import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import WebView, {
  type WebViewMessageEvent,
  type WebViewNavigation,
} from 'react-native-webview';
import {
  buildMobilePowerUpsScript,
  DESKTOP_LINUX_CHROME_UA,
  extractYouTubeVideoId,
  matchServiceForUrl,
  MOBILE_ANDROID_CHROME_UA,
  rewriteUrlForPowerUps,
  type PowerUpsConfig,
  type ServiceDefinition,
  type SkinPresetId,
} from '@omnideck/shared';
import type { MobilePalette } from '../theme';
import type { MobileNowPlaying } from './ArtistHubSheet';
import { ServiceSvgIcon } from './ServiceSvgIcon';
import {
  buildMobileDislikesInjectScript,
  buildMobileSponsorInjectScript,
  fetchMobileSponsorSegments,
  fetchMobileYouTubeDislikes,
} from '../mobileEnricher';

export interface WebViewHandle {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  injectJavaScript: (script: string) => void;
}

export interface MobileNavState {
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  url: string;
}

interface ServiceWebViewStackProps {
  palette: MobilePalette;
  skin: SkinPresetId;
  services: ServiceDefinition[];
  allServices: ServiceDefinition[];
  activeServiceId: string;
  mountedIds: Set<string>;
  hibernatedIds: Set<string>;
  mutedIds: Set<string>;
  desktopModeOverrides: Record<string, boolean>;
  urlOverrides: Record<string, string>;
  smartLinkRouting: boolean;
  powerUps: PowerUpsConfig;
  webViewRefs: React.MutableRefObject<Record<string, WebViewHandle | null>>;
  onNavStateChange: (serviceId: string, nav: MobileNavState) => void;
  onMediaMeta: (meta: MobileNowPlaying) => void;
  onRouteServiceUrl: (serviceId: string, url: string) => void;
  onWakeService: (serviceId: string) => void;
}

function buildMuteScript(muted: boolean): string {
  return `
    (function() {
      window.__omnideckMuted = ${muted ? 'true' : 'false'};
      const applyEl = (el) => {
        try {
          if (!el) return;
          if (window.__omnideckMuted) {
            if (!el.__odForcedMute) {
              el.__odWasMuted = Boolean(el.muted);
              el.__odForcedMute = true;
            }
            el.muted = true;
          } else if (el.__odForcedMute) {
            // Only restore elements that OmniDeck itself muted; never unmute site-muted feed previews (e.g. YouTube Home)
            el.muted = Boolean(el.__odWasMuted);
            el.__odForcedMute = false;
          }
        } catch {}
      };
      const applyAll = () => {
        document.querySelectorAll('audio, video').forEach(applyEl);
      };
      applyAll();
      if (!window.__omnideckMuteBound) {
        window.__omnideckMuteBound = true;
        document.addEventListener('play', (ev) => {
          if (ev && ev.target && (ev.target.tagName === 'AUDIO' || ev.target.tagName === 'VIDEO')) {
            if (window.__omnideckMuted) applyEl(ev.target);
          }
        }, true);
        let timer = null;
        window.__omnideckMuteObserver = new MutationObserver(() => {
          if (!window.__omnideckMuted || timer) return;
          timer = setTimeout(() => { timer = null; applyAll(); }, 300);
        });
        window.__omnideckMuteObserver.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true
        });
      }
    })();
    true;
  `;
}

function isBlockedAppHijackUrl(rawUrl: string): boolean {
  const lower = (rawUrl || '').trim().toLowerCase();
  if (!lower) return false;
  if (
    lower.startsWith('intent://') ||
    lower.startsWith('reddit://') ||
    lower.startsWith('spotify://') ||
    lower.startsWith('vnd.youtube://') ||
    lower.startsWith('youtube://') ||
    lower.startsWith('market://')
  ) {
    return true;
  }
  return (
    lower.includes('reddit.app.link') ||
    lower.includes('spotify.app.link') ||
    lower.includes('play.google.com/store/apps')
  );
}

function buildMobileMediaBridgeScript(serviceId: string): string {
  if (
    serviceId !== 'youtube-music' &&
    serviceId !== 'spotify' &&
    serviceId !== 'audible' &&
    serviceId !== 'youtube'
  ) {
    return 'true;';
  }
  return `
    (function() {
      if (window.__omnideckMobileMediaBridge) return;
      window.__omnideckMobileMediaBridge = true;
      const sid = ${JSON.stringify(serviceId)};
      let lastSig = '';
      let lastVid = '';
      const emit = () => {
        try {
          if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
          const host = (location.hostname || '').toLowerCase();

          // Notify RN on SPA video ID transitions (m.youtube.com / www.youtube.com / music.youtube.com)
          if (sid === 'youtube' || sid === 'youtube-music') {
            const vParam = new URLSearchParams(location.search).get('v') || '';
            const shortMatch = location.pathname.match(/^\\/shorts\\/([a-zA-Z0-9_-]{11})/);
            const curVid = vParam || (shortMatch ? shortMatch[1] : '');
            if (curVid && curVid !== lastVid) {
              lastVid = curVid;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'yt-video-id',
                serviceId: sid,
                videoId: curVid
              }));
            }
          }

          const mainYtVideo =
            (host.includes('youtube.com') && document.querySelector('video.html5-main-video')) || null;
          const mediaEls = Array.from(document.querySelectorAll('video, audio'));
          const activeEl =
            (mainYtVideo && Number.isFinite(mainYtVideo.duration) && mainYtVideo.duration > 0 ? mainYtVideo : null) ||
            mediaEls.find((m) => !m.paused && Number.isFinite(m.duration) && m.duration > 0) ||
            mediaEls.find((m) => Number.isFinite(m.duration) && m.duration > 0 && m.currentTime > 0) ||
            mediaEls.find((m) => Number.isFinite(m.duration) && m.duration > 0);
          const playing = Boolean(activeEl && !activeEl.paused && !activeEl.ended);
          let currentTimeSec = activeEl ? Math.max(0, Number(activeEl.currentTime) || 0) : undefined;
          let durationSec = activeEl && Number.isFinite(activeEl.duration) ? Number(activeEl.duration) : undefined;

          // Scrape DOM fallbacks for YouTube Music & Spotify so artwork/artist/lyrics never go blank
          let domTitle = '';
          let domArtist = '';
          let domAlbum = '';
          let domArtwork = '';
          if (host.includes('music.youtube.com')) {
            const bar = document.querySelector('ytmusic-player-bar');
            if (bar) {
              const tEl = bar.querySelector('.title.ytmusic-player-bar, yt-formatted-string.title');
              if (tEl && tEl.textContent) domTitle = tEl.textContent.trim();
              const bEl = bar.querySelector('.byline.ytmusic-player-bar, yt-formatted-string.byline');
              if (bEl) {
                const links = Array.from(bEl.querySelectorAll('a'));
                if (links.length > 0 && links[0].textContent) domArtist = links[0].textContent.trim();
                else if (bEl.textContent) domArtist = bEl.textContent.split(/[•·]/)[0].trim();
                if (links.length > 1 && links[1].textContent) domAlbum = links[1].textContent.trim();
              }
              const img =
                bar.querySelector('img.image.ytmusic-player-bar') ||
                bar.querySelector('.thumbnail-image-wrapper img') ||
                bar.querySelector('img[src^="http"]');
              if (img && typeof img.src === 'string' && img.src.startsWith('http')) {
                domArtwork = img.src;
              }
            }
          } else if (host.includes('spotify.com')) {
            const parseClock = (txt) => {
              if (!txt) return undefined;
              const parts = txt.trim().split(':').map((n) => parseInt(n, 10));
              if (parts.some((n) => Number.isNaN(n))) return undefined;
              return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + (parts[1] || 0);
            };
            const posEl = document.querySelector('[data-testid="playback-position"]');
            const durEl = document.querySelector('[data-testid="playback-duration"]');
            if (posEl && typeof currentTimeSec !== 'number') currentTimeSec = parseClock(posEl.textContent);
            if (durEl && typeof durationSec !== 'number') durationSec = parseClock(durEl.textContent);
          }

          if (sid === 'youtube' && !playing) return;

          const ms = navigator.mediaSession && navigator.mediaSession.metadata;
          const msTitle = ms && ms.title ? String(ms.title).trim() : '';
          const msArtist = ms && ms.artist ? String(ms.artist).trim() : '';
          const msAlbum = ms && ms.album ? String(ms.album).trim() : '';
          let msArtwork = '';
          if (ms && Array.isArray(ms.artwork) && ms.artwork.length > 0) {
            const best = ms.artwork[ms.artwork.length - 1] || ms.artwork[0];
            if (best && typeof best.src === 'string') msArtwork = best.src;
          }

          const title = domTitle || msTitle || (playing ? String(document.title || '').replace(/\\s*-\\s*YouTube( Music)?$/i, '').trim() : '');
          const artist = domArtist || msArtist;
          const album = domAlbum || msAlbum;
          const artworkUrl = domArtwork || msArtwork;

          if (!title) return;
          const sig = [title, artist, artworkUrl, playing ? '1' : '0', Math.floor(currentTimeSec || 0), Math.floor(durationSec || 0)].join('|');
          if (sig === lastSig) return;
          lastSig = sig;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'media-meta',
            serviceId: sid,
            title,
            artist,
            album,
            artworkUrl,
            playing,
            currentTimeSec,
            durationSec
          }));
        } catch {}
      };
      setInterval(emit, 1000);
      document.addEventListener('play', emit, true);
      document.addEventListener('pause', emit, true);
      emit();
    })();
    true;
  `;
}

/**
 * Keeps every visited service's native Android WebView mounted in a z-indexed stack
 * instead of unmounting on tab change — delivering instant swaps, shared persistent cookies,
 * uninterrupted background audio playback, Smart Link Routing, live MediaSession/DOM sync,
 * Return YouTube Dislike, SponsorBlock, and Power-Ups.
 */
export function ServiceWebViewStack({
  palette,
  skin,
  services,
  allServices,
  activeServiceId,
  mountedIds,
  hibernatedIds,
  mutedIds,
  desktopModeOverrides,
  urlOverrides,
  smartLinkRouting,
  powerUps,
  webViewRefs,
  onNavStateChange,
  onMediaMeta,
  onRouteServiceUrl,
  onWakeService,
}: ServiceWebViewStackProps) {
  const lastEnrichedVidRef = useRef<Record<string, string>>({});

  const enrichYouTubeVideo = (serviceId: string, videoId: string) => {
    if (!videoId || (serviceId !== 'youtube' && serviceId !== 'youtube-music')) return;
    const key = `${serviceId}:${videoId}`;
    if (lastEnrichedVidRef.current[serviceId] === key) return;
    lastEnrichedVidRef.current[serviceId] = key;

    if (serviceId === 'youtube' && powerUps.youtubeReturnDislikes) {
      void fetchMobileYouTubeDislikes(videoId).then((stats) => {
        if (!stats || lastEnrichedVidRef.current[serviceId] !== key) return;
        const inject = () => {
          const ref = webViewRefs.current[serviceId];
          if (ref && lastEnrichedVidRef.current[serviceId] === key) {
            ref.injectJavaScript(buildMobileDislikesInjectScript(stats));
          }
        };
        inject();
        setTimeout(inject, 900);
      });
    }

    if (powerUps.youtubeSponsorBlock) {
      void fetchMobileSponsorSegments(videoId, serviceId === 'youtube-music').then((segments) => {
        if (lastEnrichedVidRef.current[serviceId] !== key) return;
        const ref = webViewRefs.current[serviceId];
        if (ref) {
          ref.injectJavaScript(buildMobileSponsorInjectScript(videoId, segments));
        }
      });
    }
  };

  // Apply live mute, skin & power-up changes to already-mounted WebViews
  useEffect(() => {
    for (const svc of services) {
      if (!mountedIds.has(svc.id) || hibernatedIds.has(svc.id)) continue;
      const ref = webViewRefs.current[svc.id];
      if (ref) {
        ref.injectJavaScript(buildMuteScript(mutedIds.has(svc.id)));
        ref.injectJavaScript(buildMobilePowerUpsScript(svc.id, powerUps, skin));
      }
    }
  }, [services, mountedIds, hibernatedIds, mutedIds, powerUps, skin, webViewRefs]);

  return (
    <View style={[styles.stage, { backgroundColor: palette.canvas }]}>
      {services.map((svc) => {
        const isActive = svc.id === activeServiceId;
        const isHibernated = hibernatedIds.has(svc.id);
        const isMounted = mountedIds.has(svc.id);

        if (isHibernated) {
          if (!isActive) return null;
          return (
            <View key={svc.id} style={[styles.hibernatedCard, { backgroundColor: palette.canvas }]}>
              <View
                style={[
                  styles.sleepBox,
                  { backgroundColor: palette.chrome, borderColor: palette.border },
                ]}
              >
                <ServiceSvgIcon icon={svc.icon} size={34} color={svc.accentColor} />
                <Text style={[styles.sleepTitle, { color: palette.inkPrimary }]}>
                  {svc.name} is sleeping
                </Text>
                <Text style={[styles.sleepDesc, { color: palette.inkSecondary }]}>
                  Unloaded from memory to save battery and RAM. Your login session stays saved.
                </Text>
                <Pressable
                  onPress={() => onWakeService(svc.id)}
                  style={[styles.wakeBtn, { backgroundColor: palette.accent }]}
                >
                  <Text style={styles.wakeBtnText}>Wake {svc.name}</Text>
                </Pressable>
              </View>
            </View>
          );
        }

        if (!isMounted && !isActive) {
          return null;
        }

        const useDesktopUa =
          desktopModeOverrides[svc.id] ?? svc.mobileUserAgentMode === 'desktop';
        const userAgent = useDesktopUa ? DESKTOP_LINUX_CHROME_UA : MOBILE_ANDROID_CHROME_UA;
        const rawUri = urlOverrides[svc.id] || (useDesktopUa ? svc.url : (svc.mobileUrl || svc.url));
        const targetUri = rewriteUrlForPowerUps(svc.id, rawUri, powerUps) ?? rawUri;
        const combinedInjectedScript = `${buildMuteScript(mutedIds.has(svc.id))}\n${buildMobilePowerUpsScript(svc.id, powerUps, skin)}\n${buildMobileMediaBridgeScript(svc.id)}`;

        return (
          <View
            key={`${svc.id}-${useDesktopUa ? 'desktop' : 'mobile'}`}
            pointerEvents={isActive ? 'auto' : 'none'}
            style={[
              styles.layer,
              isActive ? styles.layerActive : styles.layerHidden,
            ]}
          >
            <WebView
              ref={(node: WebViewHandle | null) => {
                webViewRefs.current[svc.id] = node;
              }}
              source={{ uri: targetUri }}
              userAgent={userAgent}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              allowsProtectedMedia
              allowsFullscreenVideo
              allowsInlineMediaPlayback
              allowsPictureInPictureMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              setSupportMultipleWindows={false}
              mixedContentMode="compatibility"
              injectedJavaScript={combinedInjectedScript}
              onMessage={(ev: WebViewMessageEvent): void => {
                try {
                  const data = JSON.parse(ev.nativeEvent.data) as {
                    type?: string;
                    serviceId?: string;
                    videoId?: string;
                    title?: string;
                    artist?: string;
                    album?: string;
                    artworkUrl?: string;
                    playing?: boolean;
                    currentTimeSec?: number;
                    durationSec?: number;
                  };
                  if (data.type === 'yt-video-id' && data.serviceId && data.videoId) {
                    enrichYouTubeVideo(data.serviceId, data.videoId);
                  } else if (data.type === 'media-meta' && data.serviceId && data.title) {
                    onMediaMeta({
                      serviceId: data.serviceId,
                      title: data.title,
                      artist: data.artist,
                      album: data.album,
                      artworkUrl: data.artworkUrl,
                      playing: Boolean(data.playing),
                      currentTimeSec: data.currentTimeSec,
                      durationSec: data.durationSec,
                    });
                  }
                } catch {
                  // Ignore non-JSON postMessage payloads from web pages
                }
              }}
              onShouldStartLoadWithRequest={(req): boolean => {
                if (req.url && isBlockedAppHijackUrl(req.url)) {
                  return false;
                }
                if (smartLinkRouting && req.url && /^https?:\/\//i.test(req.url)) {
                  const matched = matchServiceForUrl(req.url, allServices, svc.id);
                  if (matched) {
                    onRouteServiceUrl(matched.id, req.url);
                    return false;
                  }
                }
                return true;
              }}
              onNavigationStateChange={(nav: WebViewNavigation): void => {
                const navUrl = nav.url || targetUri;
                onNavStateChange(svc.id, {
                  canGoBack: nav.canGoBack,
                  canGoForward: nav.canGoForward,
                  loading: nav.loading,
                  url: navUrl,
                });
                if (svc.id === 'youtube' || svc.id === 'youtube-music') {
                  const vid = extractYouTubeVideoId(navUrl);
                  if (vid) enrichYouTubeVideo(svc.id, vid);
                }
              }}
              onLoadEnd={(): void => {
                const ref = webViewRefs.current[svc.id];
                if (ref) {
                  ref.injectJavaScript(combinedInjectedScript);
                }
              }}
              style={styles.webview}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    position: 'relative',
  },
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  layerActive: {
    zIndex: 10,
    opacity: 1,
  },
  layerHidden: {
    zIndex: 0,
    opacity: 0,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  hibernatedCard: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 15,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sleepBox: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  sleepTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sleepDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  wakeBtn: {
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  wakeBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13.5,
  },
});
