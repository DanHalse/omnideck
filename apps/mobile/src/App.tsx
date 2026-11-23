import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  APP_VERSION,
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
  type PowerUpsConfig,
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
import {
  applyMobileUpdate,
  checkForMobileUpdate,
  confirmOtaBootSuccess,
  getOtaState,
  subscribeOtaProgress,
  type MobileUpdateInfo,
  type OtaRuntimeState,
} from './otaUpdater';

function formatClock(sec?: number): string {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function isAtServiceHome(url: string, homeUrl: string): boolean {
  try {
    const cur = new URL(url);
    const home = new URL(homeUrl);
    return (
      cur.hostname.replace(/^(www|m)\./, '') === home.hostname.replace(/^(www|m)\./, '') &&
      (cur.pathname === '/' || cur.pathname === '' || cur.pathname === home.pathname) &&
      !cur.searchParams.get('v')
    );
  } catch {
    return true;
  }
}

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
  const [seekTrackWidth, setSeekTrackWidth] = useState(1);

  // Self-update (Zero-APK OTA + in-app APK fallback) state
  const [otaState, setOtaState] = useState<OtaRuntimeState | null>(null);
  const [updateInfo, setUpdateInfo] = useState<MobileUpdateInfo | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStatusText, setUpdateStatusText] = useState(`OmniDeck v${APP_VERSION}`);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);

  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webViewRefs = useRef<Record<string, WebViewHandle | null>>({});

  const runUpdateCheck = useCallback(async (silent = false) => {
    if (!silent) {
      setUpdateStatusText('Checking for updates…');
    }
    try {
      const info = await checkForMobileUpdate();
      setUpdateInfo(info);
      if (info.available) {
        setUpdateStatusText(
          info.mode === 'ota'
            ? `v${info.latestVersion} ready for instant OTA update (no APK needed)`
            : `v${info.latestVersion} available to install`,
        );
      } else {
        setUpdateStatusText(`Up to date (v${info.currentVersion})`);
      }
    } catch {
      if (!silent) {
        setUpdateStatusText('Could not reach GitHub Releases.');
      }
    }
  }, []);

  const runInstallUpdate = useCallback(async () => {
    if (!updateInfo?.available || updateBusy) return;
    setUpdateBusy(true);
    setUpdateProgress(2);
    setUpdateStatusText(
      updateInfo.mode === 'ota'
        ? `Downloading v${updateInfo.latestVersion} OTA…`
        : `Downloading v${updateInfo.latestVersion} APK…`,
    );
    try {
      const outcome = await applyMobileUpdate(updateInfo);
      if (outcome === 'restarting') {
        setUpdateStatusText(`Applying v${updateInfo.latestVersion} and restarting…`);
      } else if (outcome === 'permission-required') {
        setUpdateStatusText('Enable "Allow from this source", then tap Install Update again.');
      } else if (outcome === 'installer-opened') {
        setUpdateStatusText('Confirm the Android update prompt to finish installing.');
      } else {
        setUpdateStatusText('Opening GitHub Releases…');
        void Linking.openURL(updateInfo.apkUrl || updateInfo.releaseUrl);
      }
    } catch (err) {
      setUpdateStatusText(
        err instanceof Error ? err.message : 'Update failed. Tap Release Notes to download manually.',
      );
    } finally {
      setUpdateBusy(false);
    }
  }, [updateBusy, updateInfo]);

  useEffect(() => {
    confirmOtaBootSuccess();
    let active = true;
    void loadMobileConfig().then((loaded) => {
      if (!active) return;
      setConfig(loaded);
      setMountedIds(new Set([loaded.activeServiceId]));
    });
    void getOtaState().then((st) => {
      if (!active) return;
      setOtaState(st);
      setUpdateStatusText(
        st.isRunningOta
          ? `Running OTA v${st.activeVersion} (up to date)`
          : `OmniDeck v${st.activeVersion}`,
      );
    });
    const unsubProgress = subscribeOtaProgress((p) => {
      setUpdateProgress(p.percent);
      if (p.phase === 'downloading') {
        setUpdateStatusText('Downloading instant OTA update…');
      } else if (p.phase === 'downloading-apk') {
        setUpdateStatusText('Downloading Android update…');
      } else if (p.phase === 'installing-apk') {
        setUpdateStatusText('Opening Android installer…');
      } else if (p.phase === 'ready') {
        setUpdateStatusText('Verified! Restarting OmniDeck…');
      }
    });

    // Silent update check right on app launch
    void runUpdateCheck(true);

    return () => {
      active = false;
      unsubProgress();
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    };
  }, [runUpdateCheck]);

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
  const isDesktopMode =
    desktopModeOverrides[activeService.id] ?? activeService.mobileUserAgentMode === 'desktop';
  const activeHomeUrl = isDesktopMode
    ? activeService.url
    : (activeService.mobileUrl || activeService.url);
  const activeNav = navState[activeService.id] ?? {
    canGoBack: false,
    canGoForward: false,
    loading: false,
    url: activeHomeUrl,
  };
  const canStepBack = activeNav.canGoBack || !isAtServiceHome(activeNav.url, activeHomeUrl);

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

  const handleBack = useCallback(() => {
    const ref = webViewRefs.current[activeService.id];
    if (ref && activeNav.canGoBack) {
      ref.goBack();
    } else if (!isAtServiceHome(activeNav.url, activeHomeUrl)) {
      handleOpenUrlInService(activeService.id, activeHomeUrl);
    }
  }, [activeHomeUrl, activeNav.canGoBack, activeNav.url, activeService.id, handleOpenUrlInService]);

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
      if (canStepBack) {
        handleBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [artistHubOpen, canStepBack, handleBack, managerOpen]);

  const handleSearchInService = useCallback(
    (serviceId: string, query: string) => {
      const svc = config.services.find((s) => s.id === serviceId);
      const searchUrl = buildServiceSearchUrl(serviceId, query, svc?.url);
      handleOpenUrlInService(serviceId, searchUrl);
    },
    [config.services, handleOpenUrlInService],
  );

  const handleMediaAction = useCallback((serviceId: string, action: 'play-pause' | 'next' | 'previous') => {
    const ref = webViewRefs.current[serviceId];
    if (!ref) return;
    ref.injectJavaScript(`
      (function() {
        const action = ${JSON.stringify(action)};
        const clickFirst = (sels) => {
          for (const s of sels) {
            const el = document.querySelector(s);
            if (el && typeof el.click === 'function') { el.click(); return true; }
          }
          return false;
        };
        if (action === 'next') {
          clickFirst([
            'ytmusic-player-bar .next-button',
            '[data-testid="control-button-skip-forward"]',
            '.ytp-next-button',
            'button[aria-label*="Next" i]'
          ]);
          return;
        }
        if (action === 'previous') {
          clickFirst([
            'ytmusic-player-bar .previous-button',
            '[data-testid="control-button-skip-back"]',
            '.ytp-prev-button',
            'button[aria-label*="Previous" i]'
          ]);
          return;
        }
        const el = Array.from(document.querySelectorAll('video, audio')).find((m) => Number.isFinite(m.duration) && m.duration > 0) || document.querySelector('video, audio');
        if (el) {
          if (el.paused) el.play().catch(() => {});
          else el.pause();
        }
      })();
      true;
    `);
  }, []);

  const handleSeek = useCallback(
    (serviceId: string, targetSec: number) => {
      const ref = webViewRefs.current[serviceId];
      if (!ref || !Number.isFinite(targetSec)) return;
      const safe = Math.max(0, targetSec);
      setNowPlaying((prev) =>
        prev && prev.serviceId === serviceId ? { ...prev, currentTimeSec: safe } : prev,
      );
      ref.injectJavaScript(`
        (function() {
          const t = ${safe};
          const v = document.querySelector('video.html5-main-video') ||
            Array.from(document.querySelectorAll('video, audio')).find((m) => Number.isFinite(m.duration) && m.duration > 0);
          if (v && Number.isFinite(v.duration) && v.duration > 0) {
            v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.25));
          }
        })();
        true;
      `);
    },
    [],
  );

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

  const handleTogglePowerUp = useCallback(
    (key: keyof PowerUpsConfig) => {
      commitConfig((prev) => {
        const cur = prev.settings.powerUps[key];
        if (typeof cur !== 'boolean') return prev;
        return {
          ...prev,
          settings: {
            ...prev.settings,
            powerUps: {
              ...prev.settings.powerUps,
              [key]: !cur,
            },
          },
        };
      });
    },
    [commitConfig],
  );

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
  const showUpdateBanner = Boolean(
    updateInfo?.available &&
      (!dismissedUpdateVersion || dismissedUpdateVersion !== updateInfo.latestVersion),
  );

  const durationSec = nowPlaying?.durationSec ?? 0;
  const currentSec = nowPlaying?.currentTimeSec ?? 0;
  const progressRatio = durationSec > 0 ? Math.min(1, Math.max(0, currentSec / durationSec)) : 0;

  const handleSeekTrackPress = (e: GestureResponderEvent) => {
    if (!nowPlaying || durationSec <= 0 || seekTrackWidth <= 0) return;
    const x = e.nativeEvent.locationX;
    const ratio = Math.min(1, Math.max(0, x / seekTrackWidth));
    handleSeek(nowPlaying.serviceId, ratio * durationSec);
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.root, { backgroundColor: palette.chrome }]}
    >
      <StatusBar style={config.settings.theme === 'dark' ? 'light' : 'dark'} />

      <TopControlBar
        palette={palette}
        service={activeService}
        canGoBack={canStepBack}
        canGoForward={activeNav.canGoForward}
        loading={activeNav.loading}
        muted={mutedIds.has(activeService.id)}
        hibernated={hibernatedIds.has(activeService.id)}
        desktopMode={isDesktopMode}
        onBack={handleBack}
        onForward={() => webViewRefs.current[activeService.id]?.goForward()}
        onReload={() => webViewRefs.current[activeService.id]?.reload()}
        onHome={() => handleOpenUrlInService(activeService.id, activeHomeUrl)}
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

      {/* Top Update Call-To-Action Banner (Instant zero-APK OTA or in-app APK) */}
      {showUpdateBanner && updateInfo && (
        <View
          style={[
            styles.updateBanner,
            { backgroundColor: palette.chromeElevated, borderBottomColor: palette.border },
          ]}
        >
          <View style={styles.updateBannerLeft}>
            <View style={styles.updateBadge}>
              <Text style={styles.updateBadgeText}>
                {updateInfo.mode === 'ota' ? 'OTA UPDATE' : 'UPDATE'}
              </Text>
            </View>
            <Text numberOfLines={1} style={[styles.updateBannerText, { color: palette.inkPrimary }]}>
              {updateBusy
                ? `Updating to v${updateInfo.latestVersion} (${updateProgress}%)…`
                : `OmniDeck v${updateInfo.latestVersion} ready`}
            </Text>
          </View>
          <View style={styles.updateBannerActions}>
            <Pressable
              disabled={updateBusy}
              onPress={() => void runInstallUpdate()}
              style={[styles.updateCtaBtn, { opacity: updateBusy ? 0.65 : 1 }]}
            >
              <Text style={styles.updateCtaBtnText}>
                {updateBusy
                  ? `${updateProgress}%`
                  : updateInfo.mode === 'ota'
                    ? 'Update Now'
                    : 'Install'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Dismiss update banner"
              onPress={() => setDismissedUpdateVersion(updateInfo.latestVersion)}
              style={styles.updateDismissBtn}
            >
              <Text style={{ color: palette.inkMuted, fontSize: 13, fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>
        </View>
      )}

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

      {/* Upgraded Mobile Now Playing Mini-Bar with Interactive Seek Bar & Transport */}
      {nowPlaying && nowPlaying.title ? (
        <View
          style={[
            styles.miniBarWrap,
            { backgroundColor: palette.chromeElevated, borderTopColor: palette.border },
          ]}
        >
          {durationSec > 0 && (
            <View style={styles.seekRow}>
              <Text style={[styles.seekClock, { color: palette.inkMuted }]}>
                {formatClock(currentSec)}
              </Text>
              <Pressable
                onPress={handleSeekTrackPress}
                onLayout={(e: LayoutChangeEvent) =>
                  setSeekTrackWidth(Math.max(1, e.nativeEvent.layout.width))
                }
                style={styles.seekHitArea}
                accessibilityLabel="Seek song position"
              >
                <View style={[styles.seekTrackBg, { backgroundColor: palette.border }]}>
                  <View
                    style={[
                      styles.seekTrackFill,
                      {
                        backgroundColor: palette.accent,
                        width: `${(progressRatio * 100).toFixed(1)}%`,
                      },
                    ]}
                  />
                </View>
              </Pressable>
              <Text style={[styles.seekClock, { color: palette.inkMuted }]}>
                {formatClock(durationSec)}
              </Text>
            </View>
          )}

          <View style={styles.miniBar}>
            <Pressable
              onPress={() => setArtistHubOpen(true)}
              style={styles.miniBarTrack}
            >
              {nowPlaying.artworkUrl ? (
                <Image source={{ uri: nowPlaying.artworkUrl }} style={styles.miniBarArt} />
              ) : (
                <View
                  style={[
                    styles.miniBarArt,
                    { backgroundColor: palette.accentSoft, alignItems: 'center', justifyContent: 'center' },
                  ]}
                >
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
              <Text style={[styles.artistPillText, { color: palette.accent }]}>✦</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Previous track"
              onPress={() => handleMediaAction(nowPlaying.serviceId, 'previous')}
              style={styles.transportBtn}
            >
              <Text style={{ color: palette.inkPrimary, fontSize: 12, fontWeight: '700' }}>⏮</Text>
            </Pressable>

            <Pressable
              accessibilityLabel={nowPlaying.playing ? 'Pause' : 'Play'}
              onPress={() => handleMediaAction(nowPlaying.serviceId, 'play-pause')}
              style={[styles.playBtn, { backgroundColor: palette.accent }]}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>
                {nowPlaying.playing ? '❚❚' : '▶'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Next track"
              onPress={() => handleMediaAction(nowPlaying.serviceId, 'next')}
              style={styles.transportBtn}
            >
              <Text style={{ color: palette.inkPrimary, fontSize: 12, fontWeight: '700' }}>⏭</Text>
            </Pressable>
          </View>
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
        powerUps={config.settings.powerUps}
        otaState={otaState}
        updateInfo={updateInfo}
        updateBusy={updateBusy}
        updateProgress={updateProgress}
        updateStatusText={updateStatusText}
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
        onTogglePowerUp={handleTogglePowerUp}
        onCheckUpdates={() => runUpdateCheck(false)}
        onInstallUpdate={runInstallUpdate}
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
  updateBanner: {
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  updateBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  updateBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderColor: 'rgba(34, 197, 94, 0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  updateBadgeText: {
    color: '#22C55E',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  updateBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  updateBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  updateCtaBtn: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
  },
  updateCtaBtnText: {
    color: '#06150C',
    fontSize: 11.5,
    fontWeight: '800',
  },
  updateDismissBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBarWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  seekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 4,
  },
  seekClock: {
    fontSize: 10,
    fontWeight: '600',
    minWidth: 28,
    textAlign: 'center',
  },
  seekHitArea: {
    flex: 1,
    height: 16,
    justifyContent: 'center',
  },
  seekTrackBg: {
    height: 3.5,
    borderRadius: 99,
    overflow: 'hidden',
  },
  seekTrackFill: {
    height: '100%',
    borderRadius: 99,
  },
  miniBar: {
    height: 46,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artistPillText: {
    fontSize: 13,
    fontWeight: '800',
  },
  transportBtn: {
    width: 26,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
