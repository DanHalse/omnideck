import {
  APP_VERSION,
  GITHUB_RELEASES_URL,
  addCustomService,
  applyWorkspace,
  buildServiceSearchUrl,
  clampVolume,
  clampZoom,
  createDefaultConfig,
  createInitialRuntimeState,
  deleteCustomWorkspace,
  mergePersistedConfig,
  moveServiceById,
  parseImportedConfig,
  pinFavorite,
  removeCustomService,
  removeFavorite,
  reorderServices,
  saveCustomWorkspace,
  selectActiveService,
  serializeConfigForExport,
  setServiceVolume,
  setSplitRatio,
  swapSplitPanes,
  toggleServiceAdBlock,
  toggleServiceVisibility,
  toggleSplitView,
  updateService,
  type DesktopSnapshot,
  type PersistedConfig,
  type ServiceRuntimeState,
  type SleepTimerState,
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
  let homeActive = false;
  let alwaysOnTop = false;
  let isMaximized = false;
  let toastMessage: string | null = null;
  let sleepTimer: SleepTimerState = { active: false, endsAt: null, durationMinutes: 0 };
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
      // ignore quota issues
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
        volume: npRt?.volume ?? 1.0,
        autoPausedServiceId: autoPausedId,
      },
      sleepTimer,
      update: updateState,
      drm: {
        engine: 'browser-preview',
        widevineReady: true,
        widevineVersion: 'Preview Mode',
        message: 'Running desktop shell in browser preview mode.',
      },
      platform: 'browser-preview',
      overlayOpen,
      homeActive,
      alwaysOnTop,
      isMaximized,
      totalBlockedRequests: totalBlocked,
      totalMemoryMb: Object.values(runtime).filter((r) => r.mounted).length * 145,
      audibleDockOpen: false,
      miniPlayerOpen: false,
      toastMessage,
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

    openHome: async () => {
      homeActive = true;
      return commit();
    },
    selectService: async (serviceId) => {
      homeActive = false;
      config = selectActiveService(config, serviceId);
      return commit();
    },
    openServiceUrl: async (serviceId, url, inSplitView) => {
      homeActive = false;
      config = inSplitView
        ? toggleSplitView(config, true, serviceId)
        : selectActiveService(config, serviceId);
      if (runtime[serviceId]) {
        runtime[serviceId] = { ...runtime[serviceId], currentUrl: url, mounted: true, hibernated: false };
      }
      return commit();
    },
    searchInService: async (serviceId, query) => {
      const svc = config.services.find((s) => s.id === serviceId);
      const searchUrl = buildServiceSearchUrl(serviceId, query, svc?.url);
      homeActive = false;
      config = selectActiveService(config, serviceId);
      if (runtime[serviceId]) {
        runtime[serviceId] = { ...runtime[serviceId], currentUrl: searchUrl, mounted: true, hibernated: false };
      }
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
        }, 350);
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
    setVolume: async (serviceId, volume) => {
      const clamped = clampVolume(volume);
      config = setServiceVolume(config, serviceId, clamped);
      if (runtime[serviceId]) {
        runtime[serviceId] = { ...runtime[serviceId], volume: clamped, muted: clamped === 0 };
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
        runtime[serviceId] = { ...runtime[serviceId], mounted: false, hibernated: true, audible: false };
      }
      return commit();
    },
    hibernateInactive: async () => {
      for (const id of Object.keys(runtime)) {
        if (id !== config.activeServiceId && !runtime[id].audible) {
          runtime[id] = { ...runtime[id], mounted: false, hibernated: true };
        }
      }
      return commit();
    },
    hibernateHeavyTabs: async () => commit(),
    refreshMemoryMetrics: async () => {
      for (const id of Object.keys(runtime)) {
        runtime[id] = { ...runtime[id], memoryMb: runtime[id].mounted ? 145 : 0 };
      }
      return commit();
    },
    wakeService: async (serviceId) => {
      if (runtime[serviceId]) {
        runtime[serviceId] = { ...runtime[serviceId], mounted: true, hibernated: false, lastActiveAt: Date.now() };
      }
      return commit();
    },
    openExternal: async (serviceId) => {
      const svc = config.services.find((s) => s.id === serviceId);
      if (svc) window.open(svc.url, '_blank', 'noopener,noreferrer');
    },
    openDevTools: async () => {},
    clearServiceSession: async () => commit(),

    pinCurrentPage: async (serviceId) => {
      const svc = config.services.find((s) => s.id === serviceId);
      const rt = runtime[serviceId];
      if (svc) {
        config = pinFavorite(config, {
          serviceId,
          title: rt?.pageTitle || svc.name,
          url: rt?.currentUrl || svc.url,
        });
        toastMessage = `Pinned ${svc.name} to Home`;
      }
      return commit();
    },
    removeFavorite: async (favoriteId) => {
      config = removeFavorite(config, favoriteId);
      return commit();
    },
    clearRecentActivity: async () => {
      config = { ...config, recentActivity: [] };
      return commit();
    },

    mediaPlayPause: async (serviceId) => {
      const id = serviceId ?? lastPlayingId ?? config.activeServiceId;
      if (runtime[id]) {
        runtime[id] = { ...runtime[id], audible: !runtime[id].audible, mounted: true, hibernated: false };
        lastPlayingId = id;
      }
      return commit();
    },
    mediaNext: async () => {},
    mediaPrevious: async () => {},
    mediaLikeTrack: async () => {
      toastMessage = 'Liked current track';
      return commit();
    },
    mediaDislikeTrack: async () => {
      toastMessage = 'Disliked current track';
      return commit();
    },
    resumeAutoPaused: async () => {
      if (autoPausedId && runtime[autoPausedId]) {
        runtime[autoPausedId] = { ...runtime[autoPausedId], audible: true };
        autoPausedId = null;
      }
      return commit();
    },
    setSleepTimer: async (minutes) => {
      sleepTimer =
        minutes > 0
          ? { active: true, endsAt: Date.now() + minutes * 60_000, durationMinutes: minutes }
          : { active: false, endsAt: null, durationMinutes: 0 };
      return commit();
    },
    triggerPip: async () => {},
    toggleAlwaysOnTop: async () => {
      alwaysOnTop = !alwaysOnTop;
      return commit();
    },
    closeAudibleDock: async () => commit(),
    updateEqualizer: async (patch) => {
      config = {
        ...config,
        settings: {
          ...config.settings,
          equalizer: { ...config.settings.equalizer, ...patch },
        },
      };
      return commit();
    },

    getArtistDossier: async (input) => ({
      queryKey: `preview::${input.title}`,
      fetchedAt: Date.now(),
      serviceId: input.serviceId,
      trackTitle: input.title || 'Preview Track',
      artistName: input.artist || 'Preview Artist',
      albumName: input.album,
      artworkUrl: input.artworkUrl,
      bio: 'Browser preview mode — run the desktop app for live MusicBrainz, Wikipedia, Deezer, LRCLIB, and optional AI Artist Discovery.',
      genres: ['indie', 'alternative'],
      members: [],
      essentialAlbums: [],
      suggestedBands: [],
      lyrics: { synced: false, lines: [], plainText: '', source: 'none' },
      aiEnriched: false,
      sources: [],
    }),
    getBandDetails: async (bandName) => ({
      id: `preview-${bandName}`,
      name: bandName,
      bio: 'Run the desktop app to load full band bios and top tracks.',
      topTracks: [],
      detailsLoaded: true,
    }),
    askMusicAi: async () => ({
      answer: '',
      provider: 'none',
      error: 'Interactive AI Companion runs in the OmniDeck Desktop app.',
    }),
    testAiConnection: async () => ({
      ok: true,
      message: 'Browser preview mode.',
    }),
    setNowPlayingHubActive: async () => {},

    toggleMiniPlayer: async () => commit(),
    focusMainWindow: async () => {},

    getListeningStats: async () => ({
      totalPlays: 0,
      totalMinutes: 0,
      streakDays: 0,
      byService: [],
      topArtists: [],
      topTracks: [],
      recentPlays: [],
    }),
    clearListeningStats: async () => ({
      totalPlays: 0,
      totalMinutes: 0,
      streakDays: 0,
      byService: [],
      topArtists: [],
      topTracks: [],
      recentPlays: [],
    }),

    windowMinimize: async () => {},
    windowToggleMaximize: async () => {
      isMaximized = !isMaximized;
      commit();
    },
    windowClose: async () => {},

    toggleServiceAdBlock: async (serviceId) => {
      config = toggleServiceAdBlock(config, serviceId);
      return commit();
    },

    toggleSplitView: async (enabled, secondaryServiceId) => {
      homeActive = false;
      config = toggleSplitView(config, enabled, secondaryServiceId);
      return commit();
    },
    setSplitSecondary: async (serviceId) => {
      homeActive = false;
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
      homeActive = false;
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
    updatePowerUps: async (patch) => {
      config = {
        ...config,
        settings: {
          ...config.settings,
          powerUps: { ...config.settings.powerUps, ...patch },
        },
      };
      return commit();
    },
    addCustomService: async (input) => {
      const added = addCustomService(config, input);
      homeActive = false;
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
    exportConfigFile: async () => ({ saved: true }),
    importConfigFile: async () => ({ imported: false, error: 'Use Paste JSON in browser preview.' }),
    getExportJson: async () => serializeConfigForExport(config),
    importConfigJson: async (rawJson) => {
      config = parseImportedConfig(rawJson);
      return commit();
    },

    checkForUpdates: async () => {
      updateState = { ...updateState, phase: 'up-to-date', message: `OmniDeck v${APP_VERSION} is up to date.` };
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
