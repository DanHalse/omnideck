import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  addCustomService,
  applyWorkspace,
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

function MobileShell() {
  const [config, setConfig] = useState<PersistedConfig>(() => createDefaultConfig());
  const [mountedIds, setMountedIds] = useState<Set<string>>(() => new Set(['youtube']));
  const [hibernatedIds, setHibernatedIds] = useState<Set<string>>(() => new Set());
  const [mutedIds, setMutedIds] = useState<Set<string>>(() => new Set());
  const [desktopModeOverrides, setDesktopModeOverrides] = useState<Record<string, boolean>>({});
  const [navState, setNavState] = useState<Record<string, MobileNavState>>({});
  const [managerOpen, setManagerOpen] = useState(false);
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

  // Android hardware Back button navigates inside the active WebView first
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
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
  }, [activeService.id, activeNav.canGoBack, managerOpen]);

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
          webViewRefs.current[activeService.id]?.injectJavaScript(
            `window.location.href = ${JSON.stringify(homeUrl)}; true;`,
          );
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
          activeServiceId={activeService.id}
          mountedIds={mountedIds}
          hibernatedIds={hibernatedIds}
          mutedIds={mutedIds}
          desktopModeOverrides={desktopModeOverrides}
          powerUps={config.settings.powerUps}
          webViewRefs={webViewRefs}
          onNavStateChange={(serviceId, nav) =>
            setNavState((prev) => ({ ...prev, [serviceId]: nav }))
          }
          onWakeService={handleWake}
        />
      </View>

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

      <ServiceManagerSheet
        visible={managerOpen}
        palette={palette}
        theme={config.settings.theme}
        services={config.services}
        workspaces={config.workspaces}
        activeWorkspaceId={config.activeWorkspaceId}
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
});
