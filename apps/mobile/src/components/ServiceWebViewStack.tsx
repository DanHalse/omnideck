import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import WebView, { type WebViewNavigation } from 'react-native-webview';
import {
  buildMobilePowerUpsScript,
  DESKTOP_LINUX_CHROME_UA,
  MOBILE_ANDROID_CHROME_UA,
  rewriteUrlForPowerUps,
  type PowerUpsConfig,
  type ServiceDefinition,
} from '@omnideck/shared';
import type { MobilePalette } from '../theme';
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
  activeServiceId: string;
  mountedIds: Set<string>;
  hibernatedIds: Set<string>;
  mutedIds: Set<string>;
  desktopModeOverrides: Record<string, boolean>;
  powerUps: PowerUpsConfig;
  webViewRefs: React.MutableRefObject<Record<string, WebViewHandle | null>>;
  onNavStateChange: (serviceId: string, nav: MobileNavState) => void;
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

/**
 * Keeps every visited service's native Android WebView mounted in a z-indexed stack
 * instead of unmounting on tab change — delivering instant swaps, shared persistent cookies,
 * uninterrupted background audio playback, and lightweight mobile Power-Ups.
 */
export function ServiceWebViewStack({
  palette,
  services,
  activeServiceId,
  mountedIds,
  hibernatedIds,
  mutedIds,
  desktopModeOverrides,
  powerUps,
  webViewRefs,
  onNavStateChange,
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
        const rawUri = useDesktopUa ? svc.url : (svc.mobileUrl || svc.url);
        const targetUri = rewriteUrlForPowerUps(svc.id, rawUri, powerUps) ?? rawUri;
        const combinedInjectedScript = `${buildMuteScript(mutedIds.has(svc.id))}\n${buildMobilePowerUpsScript(svc.id, powerUps)}`;

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
