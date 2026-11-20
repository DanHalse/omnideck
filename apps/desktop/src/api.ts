import {
  APP_VERSION,
  GITHUB_RELEASES_URL,
  addCustomService,
  applyWorkspace,
  clampZoom,
  createDefaultConfig,
  createInitialRuntimeState,
  deleteCustomWorkspace,
  mergePersistedConfig,
  moveServiceById,
  parseImportedConfig,
  removeCustomService,
  reorderServices,
  saveCustomWorkspace,
  selectActiveService,
  serializeConfigForExport,
  setSplitRatio,
  swapSplitPanes,
  toggleServiceAdBlock,
  toggleServiceVisibility,
  toggleSplitView,
  updateService,
  type DesktopSnapshot,
  type PersistedConfig,
  type ServiceRuntimeState,
  type UpdateState,
} from '@omnideck/shared';
import type { OmniDeckBridge, UiCommandEvent } from '../electron/ipcTypes';

declare global {
  interface Window {
    omnideck?: OmniDeckBridge;
  }
}

export const isElectronRuntime = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.omnideck);

const PREVIEW_STORAGE_KEY = 'omnideck:desktop-preview-config:v1';

/**
 * Interactive localStorage-backed adapter used ONLY when opening the renderer UI directly
 * in a standard browser (`npm run dev:desktop:web`) outside Electron.
 */
function createBrowserPreviewBridge(): OmniDeckBridge {
  let config: PersistedConfig = (() => {
    try {
      const saved = localStorage.getItem(PREVIEW_STORAGE_KEY);
      return saved ? mergePersistedConfig(JSON.parse(saved)) : createDefaultConfig();
    } catch {
      return createDefaultConfig();
    }
  })();

  const runtime: Record<string, ServiceRuntimeState> = {};
  for (const svc of config.services) {
    runtime[svc.id] = {
      ...createInitialRuntimeState(svc),
      mounted: svc.id === config.activeServiceId || svc.id === 'spotify',
      audible: svc.id === 'spotify',
      badgeCount: svc.id === 'reddit' ? 3 : 0,
      blockedRequests: svc.id === 'youtube' ? 12 : svc.id === 'reddit' ? 6 : 2,
      lastActiveAt: Date.now(),
    };
  }

  let overlayOpen = false;
  let alwaysOnTop = false;
  let updateState: UpdateState = {
    phase: 'up-to-date',
    currentVersion: APP_VERSION,
    releaseUrl: GITHUB_RELEASES_URL,
    canAutoInstall: false,
    message: `OmniDeck v${APP_VERSION} (Browser Preview Mode)`,
  };
  let lastPlayingId: string | null = 'spotify';
  let autoPausedId: string | null = null;

  const listeners = new Set<(s: DesktopSnapshot) => void>();
  const uiListeners = new Set<(c: UiCommandEvent) => void>();

  const persist = () => {
    try {
      localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // ignore quota issues in preview
    }
  };

  const ensureRuntime = () => {
    for (const svc of config.services) {
      if (!runtime[svc.id]) {
        runtime[svc.id] = createInitialRuntimeState(svc);
      }
    }
    const active = runtime[config.activeServiceId];
    if (active && !active.hibernated) {
      active.mounted = true;
      active.lastActiveAt = Date.now();
    }
    if (config.splitView.enabled && config.splitView.secondaryServiceId) {
      const sec = runtime[config.splitView.secondaryServiceId];
      if (sec && !sec.hibernated) {
        sec.mounted = true;
        sec.lastActiveAt = Date.now();
      }
    }
  };

  const makeSnapshot = (): DesktopSnapshot => {
    ensureRuntime();
    const npId =
      Object.values(runtime).find((r) => r.mounted && r.audible)?.serviceId ?? lastPlayingId;
    const npRt = npId ? runtime[npId] : undefined;
    const totalBlocked = Object.values(runtime).reduce((acc, r) => acc + r.blockedRequests, 0);

    return {
      config,
      runtime: { ...runtime },
      nowPlaying: {
        serviceId: npId,
        playing: Boolean(npRt?.audible),
        title: npRt?.pageTitle ?? '',
        muted: Boolean(npRt?.muted),
        autoPausedServiceId: autoPausedId,
      },
      update: updateState,
      drm: {
        engine: 'browser-preview',
        widevineReady: true,
        widevineVersion: 'Preview Mode',
        message:
          'Running desktop shell in browser preview mode. Launch via Electron for live embedded WebContentsViews.',
      },
      platform: 'browser-preview',
      overlayOpen,
      alwaysOnTop,
      totalBlockedRequests: totalBlocked,
    };
  };

  const commit = (): DesktopSnapshot => {
    persist();
    const snap = makeSnapshot();
    for (const listener of listeners) listener(snap);
    return snap;
  };

  return {
    getSnapshot: async () => makeSnapshot(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onUiCommand: (listener) => {
      uiListeners.add(listener);
      return () => uiListeners.delete(listener);
    },

    selectService: async (serviceId) => {
      config = selectActiveService(config, serviceId);
      return commit();
    },
    goBack: async () => {},
    goForward: async () => {},
    reload: async (serviceId) => {
      if (runtime[serviceId]) {
        runtime[serviceId] = { ...runtime[serviceId], loading: true };
        commit();
        setTimeout(() => {
          if (runtime[serviceId]) {
            runtime[serviceId] = { ...runtime[serviceId], loading: false };
            commit();
          }
        }, 400);
      }
    },
    goHome: async (serviceId) => {
      const svc = config.services.find((s) => s.id === serviceId);
      if (svc && runtime[serviceId]) {
        runtime[serviceId] = {
          ...runtime[serviceId],
          currentUrl: svc.url,
          hibernated: false,
          mounted: true,
        };
        commit();
      }
    },
    toggleMute: async (serviceId) => {
      if (runtime[serviceId]) {
        runtime[serviceId] = { ...runtime[serviceId], muted: !runtime[serviceId].muted };
      }
      return commit();
    },
    muteAll: async () => {
      for (const id of Object.keys(runtime)) {
        if (runtime[id].mounted) {
          runtime[id] = { ...runtime[id], muted: true };
        }
      }
      return commit();
    },
    setZoom: async (serviceId, zoomFactor) => {
      const clamped = clampZoom(zoomFactor);
      config = updateService(config, serviceId, { zoomFactor: clamped });
      if (runtime[serviceId]) {
        runtime[serviceId] = { ...runtime[serviceId], zoomFactor: clamped };
      }
      return commit();
    },
    hibernateService: async (serviceId) => {
      if (runtime[serviceId]) {
        runtime[serviceId] = {
          ...runtime[serviceId],
          mounted: false,
          hibernated: true,
          audible: false,
        };
      }
      return commit();
    },
    wakeService: async (serviceId) => {
      if (runtime[serviceId]) {
        runtime[serviceId] = {
          ...runtime[serviceId],
          mounted: true,
          hibernated: false,
          lastActiveAt: Date.now(),
        };
      }
      return commit();
    },
    openExternal: async (serviceId) => {
      const svc = config.services.find((s) => s.id === serviceId);
      if (svc) window.open(svc.url, '_blank', 'noopener,noreferrer');
    },
    openDevTools: async () => {},
    clearServiceSession: async () => commit(),

    mediaPlayPause: async (serviceId) => {
      const id = serviceId ?? lastPlayingId ?? config.activeServiceId;
      if (runtime[id]) {
        const nextPlaying = !runtime[id].audible;
        runtime[id] = { ...runtime[id], audible: nextPlaying, mounted: true, hibernated: false };
        lastPlayingId = id;
      }
      return commit();
    },
    mediaNext: async () => {},
    mediaPrevious: async () => {},
    resumeAutoPaused: async () => {
      if (autoPausedId && runtime[autoPausedId]) {
        runtime[autoPausedId] = { ...runtime[autoPausedId], audible: true };
        autoPausedId = null;
      }
      return commit();
    },
    triggerPip: async () => {},
    toggleAlwaysOnTop: async () => {
      alwaysOnTop = !alwaysOnTop;
      return commit();
    },

    toggleServiceAdBlock: async (serviceId) => {
      config = toggleServiceAdBlock(config, serviceId);
      return commit();
    },

    toggleSplitView: async (enabled, secondaryServiceId) => {
      config = toggleSplitView(config, enabled, secondaryServiceId);
      return commit();
    },
    setSplitSecondary: async (serviceId) => {
      config = toggleSplitView(config, true, serviceId);
      return commit();
    },
    swapSplitPanes: async () => {
      config = swapSplitPanes(config);
      return commit();
    },
    setSplitRatio: async (ratio) => {
      config = setSplitRatio(config, ratio);
      return commit();
    },

    applyWorkspace: async (workspaceId) => {
      config = applyWorkspace(config, workspaceId);
      return commit();
    },
    saveCustomWorkspace: async (name) => {
      config = saveCustomWorkspace(config, name);
      return commit();
    },
    deleteCustomWorkspace: async (workspaceId) => {
      config = deleteCustomWorkspace(config, workspaceId);
      return commit();
    },

    updateSettings: async (patch) => {
      config = { ...config, settings: { ...config.settings, ...patch } };
      return commit();
    },
    addCustomService: async (input) => {
      const added = addCustomService(config, input);
      config = selectActiveService(added.config, added.created.id);
      return commit();
    },
    updateService: async (serviceId, patch) => {
      config = updateService(config, serviceId, patch);
      return commit();
    },
    removeCustomService: async (serviceId) => {
      config = removeCustomService(config, serviceId);
      return commit();
    },
    toggleServiceVisibility: async (serviceId) => {
      config = toggleServiceVisibility(config, serviceId);
      return commit();
    },
    reorderServices: async (fromIndex, toIndex) => {
      config = reorderServices(config, fromIndex, toIndex);
      return commit();
    },
    moveServiceById: async (draggedId, targetId) => {
      config = moveServiceById(config, draggedId, targetId);
      return commit();
    },
    resetDefaults: async () => {
      config = createDefaultConfig();
      return commit();
    },
    exportConfigFile: async () => {
      const blob = new Blob([serializeConfigForExport(config)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'omnideck-config-backup.json';
      a.click();
      URL.revokeObjectURL(url);
      return { saved: true };
    },
    importConfigFile: async () => ({ imported: false, error: 'Use Paste JSON in browser preview.' }),
    getExportJson: async () => serializeConfigForExport(config),
    importConfigJson: async (rawJson) => {
      config = parseImportedConfig(rawJson);
      return commit();
    },

    checkForUpdates: async () => {
      updateState = {
        ...updateState,
        phase: 'up-to-date',
        message: `OmniDeck v${APP_VERSION} is up to date.`,
      };
      commit();
      return updateState;
    },
    installUpdate: async () => {},
    openReleasePage: async () => {
      window.open(GITHUB_RELEASES_URL, '_blank', 'noopener,noreferrer');
    },

    setOverlayOpen: async (open) => {
      overlayOpen = open;
    },
    setChromeInsets: async () => {},
  };
}

let cachedBridge: OmniDeckBridge | null = null;

export function getOmniDeckApi(): OmniDeckBridge {
  if (typeof window !== 'undefined' && window.omnideck) {
    return window.omnideck;
  }
  if (!cachedBridge) {
    cachedBridge = createBrowserPreviewBridge();
  }
  return cachedBridge;
}
