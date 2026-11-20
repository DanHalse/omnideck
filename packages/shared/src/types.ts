export type NavPosition = 'top' | 'left';
export type ThemeMode = 'dark' | 'light';
export type UserAgentMode = 'auto' | 'desktop' | 'mobile';
export type AppChromeMode = 'zen' | 'classic';

export type BuiltInIconKey =
  | 'youtube'
  | 'twitch'
  | 'spotify'
  | 'youtube-music'
  | 'reddit'
  | 'audible'
  | 'globe'
  | 'music'
  | 'video'
  | 'book'
  | 'chat'
  | 'stream';

export interface ServiceDefinition {
  id: string;
  name: string;
  shortName: string;
  url: string;
  mobileUrl?: string;
  accentColor: string;
  icon: BuiltInIconKey;
  /** Logical cookie/storage partition key (e.g. 'google' shared by YouTube & YouTube Music). */
  partition: string;
  hidden: boolean;
  builtIn: boolean;
  /** True for Spotify & Audible which require Widevine EME CDM playback. */
  requiresDrm?: boolean;
  /** Prevent renderer throttling while hidden so audio continues seamlessly. */
  keepAliveInBackground: boolean;
  /** Preferred User-Agent strategy on Android mobile WebView. */
  mobileUserAgentMode: UserAgentMode;
  /** Additional hosts allowed to open as in-app OAuth popups sharing this service's partition. */
  allowedAuthHosts?: string[];
  /** Per-service desktop zoom factor (0.5 - 2.0). */
  zoomFactor?: number;
  /** Whether the network-level ad & tracker blocker is enabled for this service. */
  adBlockEnabled?: boolean;
  /** Per-service independent audio mixer volume [0.0, 1.0]. */
  volume?: number;
  /** Last visited URL restored on restart when restoreLastPages is enabled. */
  lastUrl?: string;
}

export interface WorkspacePreset {
  id: string;
  name: string;
  builtIn: boolean;
  /** Empty array means "all configured services". */
  serviceIds: string[];
  activeServiceId: string;
  splitEnabled: boolean;
  secondaryServiceId?: string | null;
}

export interface PinnedFavorite {
  id: string;
  serviceId: string;
  title: string;
  url: string;
  createdAt: number;
}

export interface RecentActivityItem {
  id: string;
  serviceId: string;
  title: string;
  url: string;
  visitedAt: number;
}

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

export interface SplitViewState {
  enabled: boolean;
  secondaryServiceId: string | null;
  /** Fraction [0.25, 0.75] of the stage width occupied by the primary service. */
  ratio: number;
}

export interface PowerUpsConfig {
  // YouTube & YouTube Music
  youtubeSponsorBlock: boolean;
  youtubeHideShorts: boolean;
  youtubeAutoDismissStillListening: boolean;
  youtubeRememberSpeedQuality: boolean;

  // Twitch
  twitchThirdPartyEmotes: boolean;
  twitchAutoClaimPoints: boolean;
  twitchAutoTheater: boolean;
  twitchPauseChatOnHover: boolean;

  // Audible
  audibleDirectToLibrary: boolean;
  audibleDockCloudPlayer: boolean;
  audibleFadeSleepAndRewind: boolean;
  audibleWhisperSyncFlush: boolean;

  // Reddit (RES-Lite)
  redditCompactDensity: boolean;
  redditUseOldReddit: boolean;
  redditKeyboardNav: boolean;
  redditCollapseAutoMod: boolean;
  redditHidePromoted: boolean;

  // Spotify
  spotifyKeepConnectAlive: boolean;
  spotifyLikeShortcut: string;
}

export interface AppSettings {
  navPosition: NavPosition;
  theme: ThemeMode;
  /** 'zen' hides browser URL/nav chrome for a pure native app feel; 'classic' keeps it pinned open. */
  appChromeMode: AppChromeMode;
  /** Inject slim native scrollbars and remove "Install Desktop App" / nag banners per service. */
  nativePolishCss: boolean;
  /** Route cross-service links (e.g. YouTube/Spotify/Twitch links inside Reddit) straight into their native OmniDeck tab. */
  smartLinkRouting: boolean;
  /** Closing the window minimizes to system tray so background music/audiobooks keep playing. */
  minimizeToTrayOnClose: boolean;
  /** Automatically launch OmniDeck when signing into Windows/Linux. */
  launchAtLogin: boolean;
  /** Restore each service's last visited page/video/audiobook on app startup. */
  restoreLastPages: boolean;
  /** Global OS hotkey to summon or hide OmniDeck instantly from anywhere. */
  globalSummonShortcut: string;
  /** Share a single persistent Google session ('persist:google') between YouTube & YouTube Music. */
  shareGoogleSession: boolean;
  /** Keep audio-playing services unthrottled when switched to the background. */
  backgroundAudioEnabled: boolean;
  /** Auto-hibernate idle inactive services after N minutes (0 disables auto-hibernation). */
  autoHibernateMinutes: number;
  /** Ask before quitting when at least one service is actively playing audio. */
  confirmBeforeQuitWithAudio: boolean;
  /** Automatically pause competing background audio when another app starts playing. */
  smartAudioSwitching: boolean;
  /** Bind OS hardware media keys (Play/Pause, Next, Previous) to the active audio service. */
  hardwareMediaKeys: boolean;
  /** Enable built-in network-level ad & tracker shield across services. */
  adBlockerEnabled: boolean;
  /** Suppress desktop notifications and hide unread count badges on tabs. */
  doNotDisturb: boolean;
  /** Automatically check GitHub Releases for new versions and download in background. */
  autoCheckUpdates: boolean;
  /** Enable GPU/VA-API hardware video acceleration (takes effect on app restart). */
  hardwareVideoAcceleration: boolean;
  /** Curated per-platform quality-of-life Power-Ups. */
  powerUps: PowerUpsConfig;
}

export interface PersistedConfig {
  version: 1;
  services: ServiceDefinition[];
  activeServiceId: string;
  splitView: SplitViewState;
  settings: AppSettings;
  workspaces: WorkspacePreset[];
  activeWorkspaceId: string;
  pinnedFavorites: PinnedFavorite[];
  recentActivity: RecentActivityItem[];
  windowBounds?: WindowBounds;
}

export interface ServiceRuntimeState {
  serviceId: string;
  mounted: boolean;
  hibernated: boolean;
  softThrottled?: boolean;
  loading: boolean;
  audible: boolean;
  muted: boolean;
  volume: number;
  canGoBack: boolean;
  canGoForward: boolean;
  currentUrl: string;
  pageTitle: string;
  zoomFactor: number;
  lastActiveAt: number;
  badgeCount: number;
  blockedRequests: number;
  memoryMb?: number;
}

export interface NowPlayingState {
  serviceId: string | null;
  playing: boolean;
  title: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  muted: boolean;
  volume: number;
  autoPausedServiceId: string | null;
}

export interface SleepTimerState {
  active: boolean;
  endsAt: number | null;
  durationMinutes: number;
  fading?: boolean;
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'
  | 'unsupported';

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  availableVersion?: string;
  progressPercent?: number;
  releaseUrl?: string;
  releaseNotes?: string;
  message: string;
  canAutoInstall: boolean;
}

export interface DrmStatus {
  engine: 'castlabs-ecs' | 'stock-electron' | 'android-webview' | 'browser-preview';
  widevineReady: boolean;
  widevineVersion?: string;
  message: string;
}

export interface DesktopSnapshot {
  config: PersistedConfig;
  runtime: Record<string, ServiceRuntimeState>;
  nowPlaying: NowPlayingState;
  sleepTimer: SleepTimerState;
  update: UpdateState;
  drm: DrmStatus;
  platform: string;
  overlayOpen: boolean;
  homeActive: boolean;
  alwaysOnTop: boolean;
  isMaximized: boolean;
  totalBlockedRequests: number;
  totalMemoryMb: number;
  audibleDockOpen: boolean;
  toastMessage: string | null;
}

export interface CustomServiceInput {
  name: string;
  shortName?: string;
  url: string;
  mobileUrl?: string;
  accentColor?: string;
  icon?: BuiltInIconKey;
  partition?: string;
  keepAliveInBackground?: boolean;
  mobileUserAgentMode?: UserAgentMode;
  adBlockEnabled?: boolean;
}

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageLayoutMetrics {
  /** Primary WebContentsView bounds (null when hidden, e.g. modal overlay open or hibernated). */
  primary: LayoutRect | null;
  /** Secondary split WebContentsView bounds (null when split view is off or hidden). */
  secondary: LayoutRect | null;
  /** X-coordinate of the split divider in window client pixels (null when split view is off). */
  dividerX: number | null;
}

export interface ChromeInsets {
  top: number;
  left: number;
  right?: number;
  bottom?: number;
  splitDividerWidth: number;
  splitHeaderHeight: number;
}
