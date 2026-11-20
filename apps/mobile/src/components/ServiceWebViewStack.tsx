import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import WebView, {
  type WebViewMessageEvent,
  type WebViewNavigation,
} from 'react-native-webview';
import {
  buildMobilePowerUpsScript,
  DESKTOP_LINUX_CHROME_UA,
  matchServiceForUrl,
  MOBILE_ANDROID_CHROME_UA,
  rewriteUrlForPowerUps,
  type PowerUpsConfig,
  type ServiceDefinition,
} from '@omnideck/shared';
import type { MobilePalette } from '../theme';
import type { MobileNowPlaying } from './ArtistHubSheet';
import { ServiceSvgIcon } from './ServiceSvgIcon';

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
        try { if (el) el.muted = window.__omnideckMuted; } catch {}
      };
      const applyAll = () => {
        document.querySelectorAll('audio, video').forEach(applyEl);
      };
      applyAll();
      if (!window.__omnideckMuteBound) {
        window.__omnideckMuteBound = true;
        document.addEventListener('play', (ev) => {
          if (ev && ev.target && (ev.target.tagName === 'AUDIO' || ev.target.tagName === 'VIDEO')) {
            applyEl(ev.target);
          }
        }, true);
        let timer = null;
        window.__omnideckMuteObserver = new MutationObserver(() => {
          if (timer) return;
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

function buildMobileMediaBridgeScript(serviceId: string): string {
  if (serviceId !== 'youtube-music' && serviceId !== 'spotify' && serviceId !== 'audible') {
    return 'true;';
  }
  return `
    (function() {
      if (window.__omnideckMobileMediaBridge) return;
      window.__omnideckMobileMediaBridge = true;
      const sid = ${JSON.stringify(serviceId)};
      let lastSig = '';
      const emit = () => {
        try {
          if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
          const mediaEls = Array.from(document.querySelectorAll('video, audio'));
          const activeEl =
            mediaEls.find((m) => !m.paused && Number.isFinite(m.duration) && m.duration > 0) ||
            mediaEls.find((m) => Number.isFinite(m.duration) && m.duration > 0 && m.currentTime > 0);
          const playing = Boolean(activeEl && !activeEl.paused);
          const currentTimeSec = activeEl ? Math.max(0, Number(activeEl.currentTime) || 0) : undefined;
          const durationSec = activeEl && Number.isFinite(activeEl.duration) ? Number(activeEl.duration) : undefined;

          const ms = navigator.mediaSession && navigator.mediaSession.metadata;
          const title = (ms && ms.title ? String(ms.title).trim() : '') || (playing ? String(document.title || '').trim() : '');
          const artist = ms && ms.artist ? String(ms.artist).trim() : '';
          const album = ms && ms.album ? String(ms.album).trim() : '';
          let artworkUrl = '';
          if (ms && Array.isArray(ms.artwork) && ms.artwork.length > 0) {
            const best = ms.artwork[ms.artwork.length - 1] || ms.artwork[0];
            if (best && typeof best.src === 'string') artworkUrl = best.src;
          }
          if (!title) return;
          const sig = [title, artist, playing ? '1' : '0', Math.floor(currentTimeSec || 0)].join('|');
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
      setInterval(emit, 1500);
      document.addEventListener('play', emit, true);
      document.addEventListener('pause', emit, true);
    })();
    true;
  `;
}

/**
 * Keeps every visited service's native Android WebView mounted in a z-indexed stack
 * instead of unmounting on tab change — delivering instant swaps, shared persistent cookies,
 * uninterrupted background audio playback, Smart Link Routing, live MediaSession sync, and Power-Ups.
 */
export function ServiceWebViewStack({
  palette,
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
  // Apply live mute changes to already-mounted WebViews
  useEffect(() => {
    for (const svc of services) {
      if (!mountedIds.has(svc.id) || hibernatedIds.has(svc.id)) continue;
      const ref = webViewRefs.current[svc.id];
      if (ref) {
        ref.injectJavaScript(buildMuteScript(mutedIds.has(svc.id)));
      }
    }
  }, [services, mountedIds, hibernatedIds, mutedIds, webViewRefs]);

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
        const combinedInjectedScript = `${buildMuteScript(mutedIds.has(svc.id))}\n${buildMobilePowerUpsScript(svc.id, powerUps)}\n${buildMobileMediaBridgeScript(svc.id)}`;

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
                    title?: string;
                    artist?: string;
                    album?: string;
                    artworkUrl?: string;
                    playing?: boolean;
                    currentTimeSec?: number;
                    durationSec?: number;
                  };
                  if (data.type === 'media-meta' && data.serviceId && data.title) {
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
                onNavStateChange(svc.id, {
                  canGoBack: nav.canGoBack,
                  canGoForward: nav.canGoForward,
                  loading: nav.loading,
                  url: nav.url || targetUri,
                });
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
