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
  youtubeForceOriginalAudio: boolean;
  youtubeReturnDislikes: boolean;
  youtubeDeArrow: boolean;
  youtubeHideEndScreens: boolean;
  youtubeDisableHoverPreview: boolean;
  youtubePlayerControls: boolean;
  ytmAudioOnlyMode: boolean;
  ytmPlaylistQuickFilter: boolean;

  // Twitch
  twitchThirdPartyEmotes: boolean;
  twitchAutoClaimPoints: boolean;
  twitchAutoTheater: boolean;
  twitchPauseChatOnHover: boolean;
  twitchAutoRecover: boolean;
  twitchHideClutter: boolean;

  // Audible
  audibleDirectToLibrary: boolean;
  audibleDockCloudPlayer: boolean;
  audibleFadeSleepAndRewind: boolean;
  audibleWhisperSyncFlush: boolean;
  audiblePrecisionSpeed: boolean;
  audibleHideStoreClutter: boolean;

  // Reddit (Modern RES)
  redditCompactDensity: boolean;
  redditUseOldReddit: boolean;
  redditKeyboardNav: boolean;
  redditCollapseAutoMod: boolean;
  redditHidePromoted: boolean;
  redditHideRecommended: boolean;
  redditNextCommentButton: boolean;
  redditHoverZoom: boolean;
  redditUserTagger: boolean;
  redditFilteredKeywords: string[];

  // Spotify
  spotifyKeepConnectAlive: boolean;
  spotifyLikeShortcut: string;
  spotifyHidePodcastsAudiobooks: boolean;
}

export interface BlockedMusicEntry {
  id: string;
  kind: 'artist' | 'track';
  value: string;
  artist?: string;
  addedAt: number;
}

export interface BookNoteEntry {
  id: string;
  bookTitle: string;
  timestampLabel: string;
  note: string;
  url?: string;
  createdAt: number;
}

export interface IntegrationsConfig {
  discordRpcEnabled: boolean;
  discordClientId: string;
  listenBrainzToken: string;
  lastFmApiKey: string;
  lastFmApiSecret: string;
  lastFmSessionKey: string;
}

export type AudioFocusMode = 'off' | 'pause' | 'duck';

export type EqPresetId =
  | 'flat'
  | 'bass-boost'
  | 'rock'
  | 'vocal'
  | 'late-night'
  | 'electronic'
  | 'custom';

export interface EqualizerConfig {
  enabled: boolean;
  preset: EqPresetId;
  /** Preamp gain in dB [-12, +12]. */
  preampDb: number;
  /** 10-band gains in dB [-12, +12] at 32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz. */
  bands: number[];
  /** Live FFZ-style Web Audio DynamicsCompressorNode loudness leveler. */
  compressorEnabled: boolean;
  /** Output volume booster multiplier [1.0, 2.0] (100% - 200%). */
  volumeBoost: number;
}

export type AiProviderId = 'none' | 'gemini' | 'openai' | 'anthropic' | 'ollama';

export interface AiCompanionConfig {
  provider: AiProviderId;
  apiKey: string;
  model: string;
  ollamaBaseUrl: string;
  autoEnrich: boolean;
}

export interface LyricLine {
  timeSec: number;
  text: string;
}

export interface SyncedLyricsResult {
  synced: boolean;
  lines: LyricLine[];
  plainText: string;
  source: 'lrclib' | 'none';
}

export interface SuggestedBandTrack {
  title: string;
  album?: string;
  previewUrl?: string;
  durationSec?: number;
}

export interface SuggestedBand {
  id: string;
  name: string;
  pictureUrl?: string;
  fans?: number;
  tags?: string[];
  reason?: string;
  bio?: string;
  topTracks: SuggestedBandTrack[];
  detailsLoaded?: boolean;
}

export interface ArtistDossier {
  queryKey: string;
  fetchedAt: number;
  serviceId: string;
  trackTitle: string;
  artistName: string;
  albumName?: string;
  artworkUrl?: string;
  bio: string;
  origin?: string;
  activeYears?: string;
  genres: string[];
  members: string[];
  essentialAlbums: string[];
  trackContext?: string;
  suggestedBands: SuggestedBand[];
  lyrics?: SyncedLyricsResult;
  aiEnriched: boolean;
  aiProvider?: AiProviderId;
  sources: string[];
  verificationStatus?: 'verified' | 'unverified';
  verificationHint?: string;
}

export interface AiAskResponse {
  answer: string;
  provider: AiProviderId;
  error?: string;
}

export interface ListeningEntry {
  id: string;
  serviceId: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  url?: string;
  startedAt: number;
  durationSec: number;
}

export interface ListeningStatsSummary {
  totalPlays: number;
  totalMinutes: number;
  streakDays: number;
  byService: Array<{ serviceId: string; plays: number; minutes: number }>;
  topArtists: Array<{
    name: string;
    plays: number;
    minutes: number;
    artworkUrl?: string;
    serviceId: string;
  }>;
  topTracks: Array<{
    title: string;
    artist: string;
    plays: number;
    minutes: number;
    artworkUrl?: string;
    serviceId: string;
    url?: string;
  }>;
  recentPlays: ListeningEntry[];
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
  /** Legacy boolean kept synced with audioFocusMode !== 'off'. */
  smartAudioSwitching: boolean;
  /** 3-mode audio focus behavior: off, pause competing audio, or smoothly duck music while video plays. */
  audioFocusMode: AudioFocusMode;
  /** Target multiplicative volume level [0.05, 0.5] when Smart Ducking lowers music. */
  audioDuckLevel: number;
  /** Automatically show the floating Mini-Player HUD when minimizing OmniDeck during playback. */
  miniPlayerAutoShowOnMinimize: boolean;
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
  /** Built-in 10-band Web Audio Equalizer applied across supported media tabs. */
  equalizer: EqualizerConfig;
  /** Optional BYOK or local Ollama AI provider for Music Discovery & Now Playing Hub. */
  aiCompanion: AiCompanionConfig;
  /** Universal artist/track auto-skip blocklist ("Trashbin") across YouTube Music & Spotify. */
  blockedMusic: BlockedMusicEntry[];
  /** Local timestamped notes & quotes for Audible audiobooks. */
  bookNotes: BookNoteEntry[];
  /** Optional Discord Rich Presence, ListenBrainz, and Last.fm scrobbling integrations. */
  integrations: IntegrationsConfig;
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
  currentTimeSec?: number;
  durationSec?: number;
  playbackSyncedAt?: number;
  currentLyricLine?: string;
  duckedServiceIds?: string[];
  likeStatus?: 'like' | 'dislike' | 'none';
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
  miniPlayerOpen: boolean;
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
