import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  addCustomService,
  applyWorkspace,
  buildServiceSearchUrl,
  createDefaultConfig,
  getVisibleServices,
  parseImportedConfig,
  removeCustomService,
  reorderServices,
  selectActiveService,
  serializeConfigForExport,
  toggleServiceVisibility,
  type CustomServiceInput,
  type PersistedConfig,
} from '@omnideck/shared';
import { loadMobileConfig, saveMobileConfig } from './storage';
import { MOBILE_PALETTES } from './theme';
import { TopControlBar } from './components/TopControlBar';
import { BottomNavBar } from './components/BottomNavBar';
import {
  ServiceWebViewStack,
  type MobileNavState,
  type WebViewHandle,
} from './components/ServiceWebViewStack';
import { ServiceManagerSheet } from './components/ServiceManagerSheet';
import { ArtistHubSheet, type MobileNowPlaying } from './components/ArtistHubSheet';

function MobileShell() {
  const [config, setConfig] = useState<PersistedConfig>(() => createDefaultConfig());
  const [mountedIds, setMountedIds] = useState<Set<string>>(() => new Set(['youtube']));
  const [hibernatedIds, setHibernatedIds] = useState<Set<string>>(() => new Set());
  const [mutedIds, setMutedIds] = useState<Set<string>>(() => new Set());
  const [desktopModeOverrides, setDesktopModeOverrides] = useState<Record<string, boolean>>({});
  const [urlOverrides, setUrlOverrides] = useState<Record<string, string>>({});
  const [navState, setNavState] = useState<Record<string, MobileNavState>>({});
  const [nowPlaying, setNowPlaying] = useState<MobileNowPlaying | null>(null);
  const [artistHubOpen, setArtistHubOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState(0);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webViewRefs = useRef<Record<string, WebViewHandle | null>>({});

  useEffect(() => {
    let active = true;
    void loadMobileConfig().then((loaded) => {
      if (!active) return;
      setConfig(loaded);
      setMountedIds(new Set([loaded.activeServiceId]));
    });
    return () => {
      active = false;
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    };
  }, []);

  const commitConfig = useCallback((updater: (prev: PersistedConfig) => PersistedConfig) => {
    setConfig((prev) => {
      const next = updater(prev);
      void saveMobileConfig(next);
      return next;
    });
  }, []);

  const visibleServices = getVisibleServices(config);
  const activeService =
    config.services.find((s) => s.id === config.activeServiceId) ?? visibleServices[0];
  const activeNav = navState[activeService.id] ?? {
    canGoBack: false,
    canGoForward: false,
    loading: false,
    url: activeService.mobileUrl || activeService.url,
  };

  // Android hardware Back button closes sheets first, then navigates inside the active WebView
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (artistHubOpen) {
        setArtistHubOpen(false);
        return true;
      }
      if (managerOpen) {
        setManagerOpen(false);
        return true;
      }
      const ref = webViewRefs.current[activeService.id];
      if (ref && activeNav.canGoBack) {
        ref.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [activeService.id, activeNav.canGoBack, artistHubOpen, managerOpen]);

  const handleSelectService = useCallback(
    (id: string) => {
      commitConfig((prev) => selectActiveService(prev, id));
      setMountedIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    },
    [commitConfig],
  );

  const handleOpenUrlInService = useCallback(
    (serviceId: string, url: string) => {
      setHibernatedIds((prev) => {
        if (!prev.has(serviceId)) return prev;
        const next = new Set(prev);
        next.delete(serviceId);
        return next;
      });
      setUrlOverrides((prev) => ({ ...prev, [serviceId]: url }));
      handleSelectService(serviceId);
      const ref = webViewRefs.current[serviceId];
      if (ref) {
        ref.injectJavaScript(`window.location.href = ${JSON.stringify(url)}; true;`);
      }
    },
    [handleSelectService],
  );

  const handleSearchInService = useCallback(
    (serviceId: string, query: string) => {
      const svc = config.services.find((s) => s.id === serviceId);
      const searchUrl = buildServiceSearchUrl(serviceId, query, svc?.url);
      handleOpenUrlInService(serviceId, searchUrl);
    },
    [config.services, handleOpenUrlInService],
  );

  const handleTogglePlayPause = useCallback((serviceId: string) => {
    const ref = webViewRefs.current[serviceId];
    if (!ref) return;
    ref.injectJavaScript(`
      (function() {
        const el = Array.from(document.querySelectorAll('video, audio')).find((m) => Number.isFinite(m.duration) && m.duration > 0) || document.querySelector('video, audio');
        if (el) {
          if (el.paused) el.play().catch(() => {});
          else el.pause();
        }
      })();
      true;
    `);
  }, []);

  const handleSetSleepTimer = useCallback(
    (minutes: number) => {
      if (sleepTimerRef.current) {
        clearTimeout(sleepTimerRef.current);
        sleepTimerRef.current = null;
      }
      if (minutes <= 0) {
        setSleepTimerMinutes(0);
        return;
      }
      setSleepTimerMinutes(minutes);
      sleepTimerRef.current = setTimeout(() => {
        setSleepTimerMinutes(0);
        sleepTimerRef.current = null;
        for (const id of mountedIds) {
          const ref = webViewRefs.current[id];
          if (ref) {
            ref.injectJavaScript(
              `document.querySelectorAll('video, audio').forEach((m) => { try { m.pause(); } catch {} }); true;`,
            );
          }
        }
      }, minutes * 60_000);
    },
    [mountedIds],
  );

  const handleToggleHibernate = useCallback((id: string) => {
    setHibernatedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setMountedIds((m) => new Set(m).add(id));
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleWake = useCallback((id: string) => {
    setHibernatedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setMountedIds((prev) => new Set(prev).add(id));
  }, []);

  const handleToggleMute = useCallback((id: string) => {
    setMutedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSleepInactive = useCallback(() => {
    setHibernatedIds((prev) => {
      const next = new Set(prev);
      for (const id of mountedIds) {
        if (id !== activeService.id) {
          next.add(id);
        }
      }
      return next;
    });
    setManagerOpen(false);
  }, [activeService.id, mountedIds]);

  const palette = MOBILE_PALETTES[config.settings.theme];
  const isDesktopMode =
    desktopModeOverrides[activeService.id] ?? activeService.mobileUserAgentMode === 'desktop';

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.root, { backgroundColor: palette.chrome }]}
    >
      <StatusBar style={config.settings.theme === 'dark' ? 'light' : 'dark'} />

      <TopControlBar
        palette={palette}
        service={activeService}
        canGoBack={activeNav.canGoBack}
        canGoForward={activeNav.canGoForward}
        loading={activeNav.loading}
        muted={mutedIds.has(activeService.id)}
        hibernated={hibernatedIds.has(activeService.id)}
        desktopMode={isDesktopMode}
        onBack={() => webViewRefs.current[activeService.id]?.goBack()}
        onForward={() => webViewRefs.current[activeService.id]?.goForward()}
        onReload={() => webViewRefs.current[activeService.id]?.reload()}
        onHome={() => {
          const homeUrl = isDesktopMode
            ? activeService.url
            : (activeService.mobileUrl || activeService.url);
          handleOpenUrlInService(activeService.id, homeUrl);
        }}
        onToggleDesktopMode={() =>
          setDesktopModeOverrides((prev) => ({
            ...prev,
            [activeService.id]: !isDesktopMode,
          }))
        }
        onToggleMute={() => handleToggleMute(activeService.id)}
        onToggleHibernate={() => handleToggleHibernate(activeService.id)}
        onOpenManage={() => setManagerOpen(true)}
      />

      <View style={styles.stageWrap}>
        <ServiceWebViewStack
          palette={palette}
          services={visibleServices}
          allServices={config.services}
          activeServiceId={activeService.id}
          mountedIds={mountedIds}
          hibernatedIds={hibernatedIds}
          mutedIds={mutedIds}
          desktopModeOverrides={desktopModeOverrides}
          urlOverrides={urlOverrides}
          smartLinkRouting={config.settings.smartLinkRouting}
          powerUps={config.settings.powerUps}
          webViewRefs={webViewRefs}
          onNavStateChange={(serviceId, nav) =>
            setNavState((prev) => ({ ...prev, [serviceId]: nav }))
          }
          onMediaMeta={(meta) => setNowPlaying(meta)}
          onRouteServiceUrl={handleOpenUrlInService}
          onWakeService={handleWake}
        />
      </View>

      {/* Sleek Mobile Now Playing & Artist Discovery Mini-Bar */}
      {nowPlaying && nowPlaying.title ? (
        <View
          style={[
            styles.miniBar,
            { backgroundColor: palette.chromeElevated, borderTopColor: palette.border },
          ]}
        >
          <Pressable
            onPress={() => setArtistHubOpen(true)}
            style={styles.miniBarTrack}
          >
            {nowPlaying.artworkUrl ? (
              <Image source={{ uri: nowPlaying.artworkUrl }} style={styles.miniBarArt} />
            ) : (
              <View style={[styles.miniBarArt, { backgroundColor: palette.accentSoft, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: palette.accent, fontWeight: '800', fontSize: 13 }}>♪</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.miniBarTitle, { color: palette.inkPrimary }]}>
                {nowPlaying.title}
              </Text>
              <Text numberOfLines={1} style={[styles.miniBarArtist, { color: palette.inkSecondary }]}>
                {nowPlaying.artist || nowPlaying.serviceId}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => setArtistHubOpen(true)}
            style={[styles.artistPill, { backgroundColor: palette.accentSoft }]}
          >
            <Text style={[styles.artistPillText, { color: palette.accent }]}>✦ Artist</Text>
          </Pressable>

          <Pressable
            onPress={() => handleTogglePlayPause(nowPlaying.serviceId)}
            style={[styles.playBtn, { backgroundColor: palette.accent }]}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>
              {nowPlaying.playing ? '❚❚' : '▶'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <BottomNavBar
        palette={palette}
        services={visibleServices}
        activeServiceId={activeService.id}
        mountedIds={mountedIds}
        hibernatedIds={hibernatedIds}
        mutedIds={mutedIds}
        onSelectService={handleSelectService}
        onOpenManage={() => setManagerOpen(true)}
      />

      <ArtistHubSheet
        visible={artistHubOpen}
        palette={palette}
        nowPlaying={nowPlaying}
        onClose={() => setArtistHubOpen(false)}
        onSearchInService={handleSearchInService}
      />

      <ServiceManagerSheet
        visible={managerOpen}
        palette={palette}
        theme={config.settings.theme}
        services={config.services}
        workspaces={config.workspaces}
        activeWorkspaceId={config.activeWorkspaceId}
        sleepTimerMinutes={sleepTimerMinutes}
        onClose={() => setManagerOpen(false)}
        onToggleTheme={() =>
          commitConfig((prev) => ({
            ...prev,
            settings: {
              ...prev.settings,
              theme: prev.settings.theme === 'dark' ? 'light' : 'dark',
            },
          }))
        }
        onSleepInactive={handleSleepInactive}
        onSetSleepTimer={handleSetSleepTimer}
        onApplyWorkspace={(wsId) =>
          commitConfig((prev) => {
            const next = applyWorkspace(prev, wsId);
            setMountedIds((m) => new Set(m).add(next.activeServiceId));
            return next;
          })
        }
        onReorder={(from, to) => commitConfig((prev) => reorderServices(prev, from, to))}
        onToggleVisibility={(id) => commitConfig((prev) => toggleServiceVisibility(prev, id))}
        onRemoveCustom={(id) => commitConfig((prev) => removeCustomService(prev, id))}
        onAddCustom={(input: CustomServiceInput) => {
          commitConfig((prev) => {
            const added = addCustomService(prev, input);
            setMountedIds((m) => new Set(m).add(added.created.id));
            return selectActiveService(added.config, added.created.id);
          });
        }}
        onGetSyncJson={() => serializeConfigForExport(config)}
        onImportSyncJson={(rawJson) => {
          const imported = parseImportedConfig(rawJson);
          commitConfig(() => imported);
          setMountedIds(new Set([imported.activeServiceId]));
        }}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MobileShell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  stageWrap: {
    flex: 1,
  },
  miniBar: {
    height: 48,
    paddingHorizontal: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniBarTrack: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  miniBarArt: {
    width: 34,
    height: 34,
    borderRadius: 6,
  },
  miniBarTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  miniBarArtist: {
    fontSize: 11,
  },
  artistPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  artistPillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
