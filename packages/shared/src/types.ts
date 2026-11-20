export type NavPosition = 'top' | 'left';
export type ThemeMode = 'dark' | 'light';
export type UserAgentMode = 'auto' | 'desktop' | 'mobile';

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

export interface SplitViewState {
  enabled: boolean;
  secondaryServiceId: string | null;
  /** Fraction [0.25, 0.75] of the stage width occupied by the primary service. */
  ratio: number;
}

export interface AppSettings {
  navPosition: NavPosition;
  theme: ThemeMode;
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
}

export interface PersistedConfig {
  version: 1;
  services: ServiceDefinition[];
  activeServiceId: string;
  splitView: SplitViewState;
  settings: AppSettings;
  workspaces: WorkspacePreset[];
  activeWorkspaceId: string;
}

export interface ServiceRuntimeState {
  serviceId: string;
  mounted: boolean;
  hibernated: boolean;
  loading: boolean;
  audible: boolean;
  muted: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  currentUrl: string;
  pageTitle: string;
  zoomFactor: number;
  lastActiveAt: number;
  badgeCount: number;
  blockedRequests: number;
}

export interface NowPlayingState {
  serviceId: string | null;
  playing: boolean;
  title: string;
  muted: boolean;
  autoPausedServiceId: string | null;
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
  update: UpdateState;
  drm: DrmStatus;
  platform: string;
  overlayOpen: boolean;
  alwaysOnTop: boolean;
  totalBlockedRequests: number;
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
