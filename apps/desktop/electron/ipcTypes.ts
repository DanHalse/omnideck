import type {
  AiAskResponse,
  AiCompanionConfig,
  AppSettings,
  ArtistDossier,
  ChromeInsets,
  CustomServiceInput,
  DesktopSnapshot,
  EqualizerConfig,
  ListeningStatsSummary,
  PowerUpsConfig,
  ServiceDefinition,
  SuggestedBand,
  UpdateState,
} from '@omnideck/shared';

export interface OmniDeckBridge {
  getSnapshot: () => Promise<DesktopSnapshot>;
  subscribe: (listener: (snapshot: DesktopSnapshot) => void) => () => void;
  onUiCommand: (listener: (command: UiCommandEvent) => void) => () => void;

  // Navigation & Home Hub
  openHome: () => Promise<DesktopSnapshot>;
  selectService: (serviceId: string) => Promise<DesktopSnapshot>;
  openServiceUrl: (serviceId: string, url: string, inSplitView?: boolean) => Promise<DesktopSnapshot>;
  searchInService: (serviceId: string, query: string) => Promise<DesktopSnapshot>;
  goBack: (serviceId: string) => Promise<void>;
  goForward: (serviceId: string) => Promise<void>;
  reload: (serviceId: string, hard?: boolean) => Promise<void>;
  goHome: (serviceId: string) => Promise<void>;
  toggleMute: (serviceId: string) => Promise<DesktopSnapshot>;
  muteAll: () => Promise<DesktopSnapshot>;
  setVolume: (serviceId: string, volume: number) => Promise<DesktopSnapshot>;
  setZoom: (serviceId: string, zoomFactor: number) => Promise<DesktopSnapshot>;
  hibernateService: (serviceId: string) => Promise<DesktopSnapshot>;
  hibernateInactive: () => Promise<DesktopSnapshot>;
  hibernateHeavyTabs: (thresholdMb?: number) => Promise<DesktopSnapshot>;
  refreshMemoryMetrics: () => Promise<DesktopSnapshot>;
  wakeService: (serviceId: string) => Promise<DesktopSnapshot>;
  openExternal: (serviceId: string) => Promise<void>;
  openDevTools: (serviceId: string) => Promise<void>;
  clearServiceSession: (serviceId: string) => Promise<DesktopSnapshot>;

  // Favorites & Recent History
  pinCurrentPage: (serviceId: string) => Promise<DesktopSnapshot>;
  removeFavorite: (favoriteId: string) => Promise<DesktopSnapshot>;
  clearRecentActivity: () => Promise<DesktopSnapshot>;

  // Unified Media Controls, Smart Audio Switching/Ducking, 10-Band EQ, Sleep Timer, Audible Dock & PiP
  mediaPlayPause: (serviceId?: string) => Promise<DesktopSnapshot>;
  mediaNext: (serviceId?: string) => Promise<void>;
  mediaPrevious: (serviceId?: string) => Promise<void>;
  mediaLikeTrack: (serviceId?: string) => Promise<DesktopSnapshot>;
  mediaDislikeTrack: (serviceId?: string) => Promise<DesktopSnapshot>;
  resumeAutoPaused: () => Promise<DesktopSnapshot>;
  setSleepTimer: (minutes: number) => Promise<DesktopSnapshot>;
  triggerPip: (serviceId: string) => Promise<void>;
  toggleAlwaysOnTop: () => Promise<DesktopSnapshot>;
  closeAudibleDock: () => Promise<DesktopSnapshot>;
  updateEqualizer: (patch: Partial<EqualizerConfig>) => Promise<DesktopSnapshot>;

  // AI Now Playing & Artist Discovery Hub
  getArtistDossier: (input: {
    serviceId: string;
    title: string;
    artist?: string;
    album?: string;
    artworkUrl?: string;
    durationSec?: number;
    forceRefresh?: boolean;
  }) => Promise<ArtistDossier>;
  getBandDetails: (bandName: string) => Promise<SuggestedBand>;
  askMusicAi: (dossier: ArtistDossier, question: string) => Promise<AiAskResponse>;
  testAiConnection: (config: AiCompanionConfig) => Promise<{ ok: boolean; message: string }>;
  setNowPlayingHubActive: (active: boolean) => Promise<void>;

  // Floating Mini-Player HUD
  toggleMiniPlayer: (open?: boolean) => Promise<DesktopSnapshot>;
  focusMainWindow: () => Promise<void>;

  // Private Local Listening Stats ("OmniDeck Wrapped")
  getListeningStats: () => Promise<ListeningStatsSummary>;
  clearListeningStats: () => Promise<ListeningStatsSummary>;

  // Native Frameless Window Controls
  windowMinimize: () => Promise<void>;
  windowToggleMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;

  // Ad & Tracker Shield
  toggleServiceAdBlock: (serviceId: string) => Promise<DesktopSnapshot>;

  // Split View
  toggleSplitView: (enabled?: boolean, secondaryServiceId?: string | null) => Promise<DesktopSnapshot>;
  setSplitSecondary: (serviceId: string) => Promise<DesktopSnapshot>;
  swapSplitPanes: () => Promise<DesktopSnapshot>;
  setSplitRatio: (ratio: number) => Promise<DesktopSnapshot>;

  // Workspaces
  applyWorkspace: (workspaceId: string) => Promise<DesktopSnapshot>;
  saveCustomWorkspace: (name: string) => Promise<DesktopSnapshot>;
  deleteCustomWorkspace: (workspaceId: string) => Promise<DesktopSnapshot>;

  // Settings, Power-Ups, Services & Cross-Device Sync
  updateSettings: (patch: Partial<AppSettings>) => Promise<DesktopSnapshot>;
  updatePowerUps: (patch: Partial<PowerUpsConfig>) => Promise<DesktopSnapshot>;
  addCustomService: (input: CustomServiceInput) => Promise<DesktopSnapshot>;
  updateService: (
    serviceId: string,
    patch: Partial<
      Pick<
        ServiceDefinition,
        | 'name'
        | 'shortName'
        | 'url'
        | 'mobileUrl'
        | 'accentColor'
        | 'icon'
        | 'keepAliveInBackground'
        | 'mobileUserAgentMode'
        | 'zoomFactor'
        | 'adBlockEnabled'
        | 'volume'
      >
    >,
  ) => Promise<DesktopSnapshot>;
  removeCustomService: (serviceId: string) => Promise<DesktopSnapshot>;
  toggleServiceVisibility: (serviceId: string) => Promise<DesktopSnapshot>;
  reorderServices: (fromIndex: number, toIndex: number) => Promise<DesktopSnapshot>;
  moveServiceById: (draggedId: string, targetId: string) => Promise<DesktopSnapshot>;
  resetDefaults: () => Promise<DesktopSnapshot>;
  exportConfigFile: () => Promise<{ saved: boolean; path?: string }>;
  importConfigFile: () => Promise<{ imported: boolean; snapshot?: DesktopSnapshot; error?: string }>;
  getExportJson: () => Promise<string>;
  importConfigJson: (rawJson: string) => Promise<DesktopSnapshot>;

  // Auto-Updater
  checkForUpdates: () => Promise<UpdateState>;
  installUpdate: () => Promise<void>;
  openReleasePage: () => Promise<void>;

  setOverlayOpen: (open: boolean) => Promise<void>;
  setChromeInsets: (insets: ChromeInsets) => Promise<void>;
}

export type UiCommandEvent =
  | { type: 'open-settings'; tab?: 'general' | 'powerups' | 'ai' | 'performance' | 'workspaces' }
  | { type: 'open-service-manager' }
  | { type: 'open-command-palette' }
  | { type: 'open-audio-mixer'; tab?: 'mixer' | 'eq' }
  | { type: 'toggle-now-playing'; mode?: 'drawer' | 'stage' }
  | { type: 'toggle-browser-bar' }
  | { type: 'close-overlays' };
