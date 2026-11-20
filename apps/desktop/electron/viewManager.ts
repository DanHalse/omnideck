import {
  app,
  BrowserWindow,
  Menu,
  WebContentsView,
  session,
  shell,
  clipboard,
} from 'electron';
import {
  clampVolume,
  clampZoom,
  computeDesktopLayoutBounds,
  createInitialRuntimeState,
  extractBadgeCountFromTitle,
  extractTwitchChannelLogin,
  extractYouTubeVideoId,
  isInAppPopupUrl,
  matchServiceForUrl,
  recordRecentActivity,
  resolveElectronPartition,
  rewriteUrlForPowerUps,
  selectActiveService,
  setServiceLastUrl,
  shouldAutoHibernate,
  shouldSoftThrottle,
  toggleSplitView,
  type ChromeInsets,
  type DesktopSnapshot,
  type DrmStatus,
  type NowPlayingState,
  type PersistedConfig,
  type ServiceDefinition,
  type ServiceRuntimeState,
  type SleepTimerState,
  type UpdateState,
} from '@omnideck/shared';
import { shouldBlockNetworkRequest } from './adBlocker.js';
import { buildMediaControlScript, type MediaControlAction } from './mediaScripts.js';
import {
  buildNativePolishCss,
  buildSetVolumeScript,
  READ_MEDIA_METADATA_SCRIPT,
} from './nativePolish.js';
import {
  buildRedditPowerUpScript,
  buildRestoreHibernateStateScript,
  buildSponsorSegmentsInjector,
  buildTwitchEmotesInjector,
  buildTwitchPowerUpScript,
  buildYouTubePowerUpScript,
  CAPTURE_HIBERNATE_STATE_SCRIPT,
  fetchSponsorSegments,
  fetchTwitchEmotes,
} from './powerUps.js';

const ALLOWED_PERMISSIONS = new Set<string>([
  'media',
  'mediaKeySystem',
  'fullscreen',
  'notifications',
  'clipboard-read',
  'clipboard-sanitized-write',
  'pointerLock',
  'display-capture',
  'openExternal',
]);

interface MediaMeta {
  title: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
}

interface HibernateSnapshot {
  scrollY: number;
  mediaTime: number | null;
}

export function shouldPreserveNativeUserAgent(): boolean {
  // Keep Electron's honest, unmodified User-Agent so HTTP User-Agent matches Chromium's
  // Sec-CH-UA Client Hints (laundering/stripping UA tokens triggers Google /v3/signin/rejected).
  return true;
}

export class ViewManager {
  private readonly mainWindow: BrowserWindow;
  private readonly drmStatus: DrmStatus;
  private readonly views = new Map<string, WebContentsView>();
  private readonly viewPartitions = new Map<string, string>();
  private readonly webContentsToService = new Map<number, string>();
  private readonly runtime = new Map<string, ServiceRuntimeState>();
  private readonly mediaMeta = new Map<string, MediaMeta>();
  private readonly hibernateSnapshots = new Map<string, HibernateSnapshot>();
  private readonly pendingRewindServiceIds = new Set<string>();
  private readonly lastSponsorVideoByService = new Map<string, string>();
  private readonly lastTwitchChannel = { login: '' };
  private readonly configuredPartitions = new Set<string>();
  private readonly attachedViewIds = new Set<string>();
  private readonly onSnapshotChanged: (snapshot: DesktopSnapshot) => void;
  private readonly onConfigUpdated: (nextConfig: PersistedConfig) => void;

  private audiblePlayerView: WebContentsView | null = null;
  private audiblePlayerAttached = false;

  private config: PersistedConfig;
  private updateState: UpdateState;
  private overlayOpen = false;
  private homeActive = false;
  private alwaysOnTop = false;
  private htmlFullscreenServiceId: string | null = null;
  private chromeInsets: ChromeInsets;

  private autoHibernateInterval: ReturnType<typeof setInterval> | null = null;
  private metadataInterval: ReturnType<typeof setInterval> | null = null;
  private sleepTimerTick: ReturnType<typeof setInterval> | null = null;
  private sleepTimerState: SleepTimerState = { active: false, endsAt: null, durationMinutes: 0 };

  private lastNowPlayingServiceId: string | null = null;
  private autoPausedServiceId: string | null = null;
  private totalBlockedRequests = 0;
  private totalMemoryMb = 0;
  private blockCountEmitTimer: ReturnType<typeof setTimeout> | null = null;
  private toastMessage: string | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    mainWindow: BrowserWindow,
    initialConfig: PersistedConfig,
    drmStatus: DrmStatus,
    initialUpdateState: UpdateState,
    onSnapshotChanged: (snapshot: DesktopSnapshot) => void,
    onConfigUpdated: (nextConfig: PersistedConfig) => void,
  ) {
    this.mainWindow = mainWindow;
    this.config = initialConfig;
    this.drmStatus = drmStatus;
    this.updateState = initialUpdateState;
    this.onSnapshotChanged = onSnapshotChanged;
    this.onConfigUpdated = onConfigUpdated;
    this.chromeInsets = this.defaultInsetsFor(initialConfig);

    for (const svc of initialConfig.services) {
      this.runtime.set(svc.id, createInitialRuntimeState(svc));
    }

    this.bindWindowEvents();
    this.startBackgroundLoops();
  }

  setUpdateState(next: UpdateState): void {
    this.updateState = next;
    this.emitSnapshot();
  }

  showToast(message: string, durationMs = 2800): void {
    this.toastMessage = message;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastMessage = null;
      this.toastTimer = null;
      this.emitSnapshot();
    }, durationMs);
    this.emitSnapshot();
  }

  getSnapshot(): DesktopSnapshot {
    const runtimeObj: Record<string, ServiceRuntimeState> = {};
    for (const svc of this.config.services) {
      runtimeObj[svc.id] = this.runtime.get(svc.id) ?? createInitialRuntimeState(svc);
    }
    return {
      config: this.config,
      runtime: runtimeObj,
      nowPlaying: this.computeNowPlaying(),
      sleepTimer: this.sleepTimerState,
      update: this.updateState,
      drm: this.drmStatus,
      platform: process.platform,
      overlayOpen: this.overlayOpen,
      homeActive: this.homeActive,
      alwaysOnTop: this.alwaysOnTop,
      isMaximized: !this.mainWindow.isDestroyed() && this.mainWindow.isMaximized(),
      totalBlockedRequests: this.totalBlockedRequests,
      totalMemoryMb: this.totalMemoryMb,
      audibleDockOpen: Boolean(this.audiblePlayerView && !this.audiblePlayerView.webContents.isDestroyed()),
      toastMessage: this.toastMessage,
    };
  }

  hasAudiblePlayback(): boolean {
    for (const state of this.runtime.values()) {
      if (state.mounted && state.audible && !state.muted) {
        return true;
      }
    }
    if (
      this.audiblePlayerView &&
      !this.audiblePlayerView.webContents.isDestroyed() &&
      this.audiblePlayerView.webContents.isCurrentlyAudible()
    ) {
      return true;
    }
    return false;
  }

  /**
   * Collects live RAM usage (MB) per mounted service process + total OmniDeck footprint.
   */
  refreshMemoryMetrics(): DesktopSnapshot {
    try {
      const metrics = app.getAppMetrics();
      const pidToMb = new Map<number, number>();
      let totalKb = 0;

      for (const m of metrics) {
        const kb = m.memory?.workingSetSize ?? 0;
        totalKb += kb;
        pidToMb.set(m.pid, Math.round(kb / 1024));
      }

      this.totalMemoryMb = Math.round(totalKb / 1024);

      for (const [id, rt] of this.runtime.entries()) {
        const view = this.views.get(id);
        if (view && !view.webContents.isDestroyed()) {
          const pid = view.webContents.getOSProcessId();
          let mb = pidToMb.get(pid) ?? 0;
          if (id === 'audible' && this.audiblePlayerView && !this.audiblePlayerView.webContents.isDestroyed()) {
            const dockPid = this.audiblePlayerView.webContents.getOSProcessId();
            if (dockPid !== pid) {
              mb += pidToMb.get(dockPid) ?? 0;
            }
          }
          rt.memoryMb = mb;
        } else {
          rt.memoryMb = 0;
        }
      }
    } catch {
      // Ignore platform metric unavailability
    }

    return this.emitSnapshot();
  }

  setHomeActive(active: boolean): DesktopSnapshot {
    this.homeActive = active;
    if (!active) {
      this.ensureVisibleViewsMounted();
    }
    this.relayout();
    return this.emitSnapshot();
  }

  openServiceUrl(serviceId: string, url: string, inSplitView = false): DesktopSnapshot {
    const svc = this.findService(serviceId);
    if (!svc) return this.getSnapshot();

    this.homeActive = false;
    let nextConfig = this.config;
    if (inSplitView && serviceId !== nextConfig.activeServiceId) {
      nextConfig = toggleSplitView(nextConfig, true, serviceId);
    } else {
      nextConfig = selectActiveService(nextConfig, serviceId);
    }

    this.config = nextConfig;
    this.onConfigUpdated(nextConfig);

    const rt = this.runtime.get(serviceId);
    if (rt) {
      rt.hibernated = false;
      rt.currentUrl = url;
      rt.lastActiveAt = Date.now();
    }

    const view = this.ensureMounted(svc, url);
    if (view && !view.webContents.isDestroyed() && view.webContents.getURL() !== url) {
      void view.webContents.loadURL(url).catch(() => {});
    }

    this.relayout();
    return this.emitSnapshot();
  }

  toggleAlwaysOnTop(): DesktopSnapshot {
    this.alwaysOnTop = !this.alwaysOnTop;
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.setAlwaysOnTop(this.alwaysOnTop, 'floating');
    }
    this.showToast(this.alwaysOnTop ? 'Pinned Always on Top' : 'Unpinned Always on Top', 2000);
    return this.getSnapshot();
  }

  syncConfig(nextConfig: PersistedConfig): DesktopSnapshot {
    const prevShareGoogle = this.config.settings.shareGoogleSession;
    const prevNav = this.config.settings.navPosition;
    const prevChrome = this.config.settings.appChromeMode;
    const prevBgAudio = this.config.settings.backgroundAudioEnabled;
    const prevPowerUps = this.config.settings.powerUps;
    this.config = nextConfig;

    if (prevNav !== nextConfig.settings.navPosition || prevChrome !== nextConfig.settings.appChromeMode) {
      this.chromeInsets = this.defaultInsetsFor(nextConfig);
    }

    const validIds = new Set(nextConfig.services.map((s) => s.id));
    for (const svc of nextConfig.services) {
      if (!this.runtime.has(svc.id)) {
        this.runtime.set(svc.id, createInitialRuntimeState(svc));
      }
    }
    for (const existingId of [...this.views.keys()]) {
      if (!validIds.has(existingId)) {
        this.destroyView(existingId);
        this.runtime.delete(existingId);
      }
    }

    if (prevShareGoogle !== nextConfig.settings.shareGoogleSession) {
      for (const svc of nextConfig.services) {
        const expectedPartition = resolveElectronPartition(svc, nextConfig.settings.shareGoogleSession);
        if (this.views.has(svc.id) && this.viewPartitions.get(svc.id) !== expectedPartition) {
          this.destroyView(svc.id);
          const rt = this.runtime.get(svc.id);
          if (rt) {
            rt.mounted = false;
            rt.hibernated = false;
          }
        }
      }
    }

    if (prevBgAudio !== nextConfig.settings.backgroundAudioEnabled) {
      for (const svc of nextConfig.services) {
        const view = this.views.get(svc.id);
        if (view && !view.webContents.isDestroyed()) {
          const keepAlive = nextConfig.settings.backgroundAudioEnabled && svc.keepAliveInBackground;
          view.webContents.setBackgroundThrottling(!keepAlive);
        }
      }
    }

    // Re-apply Power-Ups live whenever any Power-Up toggle changed
    if (JSON.stringify(prevPowerUps) !== JSON.stringify(nextConfig.settings.powerUps)) {
      for (const svc of nextConfig.services) {
        const view = this.views.get(svc.id);
        if (view && !view.webContents.isDestroyed()) {
          this.applyPowerUpsToView(svc, view);
        }
      }
      // If user toggled Old Reddit on/off while Reddit is mounted, reload to switch host cleanly
      if (prevPowerUps.redditUseOldReddit !== nextConfig.settings.powerUps.redditUseOldReddit) {
        const redditView = this.views.get('reddit');
        if (redditView && !redditView.webContents.isDestroyed()) {
          const cur = redditView.webContents.getURL();
          if (cur) {
            try {
              const parsed = new URL(cur);
              if (parsed.hostname.includes('reddit.com')) {
                parsed.hostname = nextConfig.settings.powerUps.redditUseOldReddit
                  ? 'old.reddit.com'
                  : 'www.reddit.com';
                void redditView.webContents.loadURL(parsed.toString()).catch(() => {});
              }
            } catch {
              // ignore
            }
          }
        }
      }
      // If user disabled Audible docked player while open, close dock cleanly
      if (!nextConfig.settings.powerUps.audibleDockCloudPlayer && this.audiblePlayerView) {
        void this.closeAudibleDock();
      }
    }

    if (!this.homeActive) {
      this.ensureVisibleViewsMounted();
    }
    this.relayout();
    return this.emitSnapshot();
  }

  setOverlayOpen(open: boolean): void {
    if (this.overlayOpen === open) return;
    this.overlayOpen = open;
    this.relayout();
    this.emitSnapshot();
  }

  setChromeInsets(insets: ChromeInsets): void {
    this.chromeInsets = {
      top: Math.max(0, Math.round(insets.top)),
      left: Math.max(0, Math.round(insets.left)),
      right: Math.max(0, Math.round(insets.right ?? 0)),
      bottom: Math.max(0, Math.round(insets.bottom ?? 0)),
      splitDividerWidth: Math.max(4, Math.round(insets.splitDividerWidth || 8)),
      splitHeaderHeight: Math.max(0, Math.round(insets.splitHeaderHeight || 36)),
    };
    this.relayout();
  }

  goBack(serviceId: string): void {
    const view = this.views.get(serviceId);
    if (view && !view.webContents.isDestroyed() && view.webContents.navigationHistory.canGoBack()) {
      view.webContents.navigationHistory.goBack();
    }
  }

  goForward(serviceId: string): void {
    const view = this.views.get(serviceId);
    if (view && !view.webContents.isDestroyed() && view.webContents.navigationHistory.canGoForward()) {
      view.webContents.navigationHistory.goForward();
    }
  }

  reload(serviceId: string, hard = false): void {
    const rt = this.runtime.get(serviceId);
    if (rt?.hibernated) {
      this.wakeService(serviceId);
      return;
    }
    const view = this.views.get(serviceId);
    if (view && !view.webContents.isDestroyed()) {
      if (hard) {
        view.webContents.reloadIgnoringCache();
      } else {
        view.webContents.reload();
      }
    }
  }

  goHome(serviceId: string): void {
    const svc = this.findService(serviceId);
    if (!svc) return;
    this.homeActive = false;
    const homeUrl = rewriteUrlForPowerUps(svc.id, svc.url, this.config.settings.powerUps) ?? svc.url;
    const rt = this.runtime.get(serviceId);
    if (rt?.hibernated) {
      rt.currentUrl = homeUrl;
      this.wakeService(serviceId);
      return;
    }
    const view = this.ensureMounted(svc, homeUrl);
    if (view && !view.webContents.isDestroyed()) {
      void view.webContents.loadURL(homeUrl);
    }
    this.relayout();
  }

  toggleMute(serviceId: string): DesktopSnapshot {
    const rt = this.runtime.get(serviceId);
    if (!rt) return this.getSnapshot();
    const nextMuted = !rt.muted;
    rt.muted = nextMuted;

    const view = this.views.get(serviceId);
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.setAudioMuted(nextMuted);
    }
    if (serviceId === 'audible' && this.audiblePlayerView && !this.audiblePlayerView.webContents.isDestroyed()) {
      this.audiblePlayerView.webContents.setAudioMuted(nextMuted);
    }
    return this.emitSnapshot();
  }

  muteAll(): DesktopSnapshot {
    for (const [id, rt] of this.runtime.entries()) {
      if (rt.mounted) {
        rt.muted = true;
        const view = this.views.get(id);
        if (view && !view.webContents.isDestroyed()) {
          view.webContents.setAudioMuted(true);
        }
      }
    }
    if (this.audiblePlayerView && !this.audiblePlayerView.webContents.isDestroyed()) {
      this.audiblePlayerView.webContents.setAudioMuted(true);
    }
    return this.emitSnapshot();
  }

  setVolume(serviceId: string, rawVolume: number): number {
    const vol = clampVolume(rawVolume);
    const rt = this.runtime.get(serviceId);
    if (rt) {
      rt.volume = vol;
      if (vol > 0 && rt.muted) {
        rt.muted = false;
        const view = this.views.get(serviceId);
        if (view && !view.webContents.isDestroyed()) {
          view.webContents.setAudioMuted(false);
        }
        if (serviceId === 'audible' && this.audiblePlayerView && !this.audiblePlayerView.webContents.isDestroyed()) {
          this.audiblePlayerView.webContents.setAudioMuted(false);
        }
      }
    }
    this.applyVolumeToView(serviceId, vol);
    this.emitSnapshot();
    return vol;
  }

  setZoom(serviceId: string, zoomFactor: number): number {
    const clamped = clampZoom(zoomFactor);
    const rt = this.runtime.get(serviceId);
    if (rt) {
      rt.zoomFactor = clamped;
    }
    const view = this.views.get(serviceId);
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.setZoomFactor(clamped);
    }
    this.emitSnapshot();
    return clamped;
  }

  setSleepTimer(minutes: number): DesktopSnapshot {
    if (this.sleepTimerTick) {
      clearInterval(this.sleepTimerTick);
      this.sleepTimerTick = null;
    }

    if (!Number.isFinite(minutes) || minutes <= 0) {
      // Restore volumes if cancelled mid-fade
      if (this.sleepTimerState.fading) {
        for (const [id, rt] of this.runtime.entries()) {
          if (rt.mounted) this.applyVolumeToView(id, rt.volume);
        }
      }
      this.sleepTimerState = { active: false, endsAt: null, durationMinutes: 0, fading: false };
      this.showToast('Sleep timer cancelled', 2000);
      return this.getSnapshot();
    }

    const duration = Math.min(360, Math.max(1, Math.round(minutes)));
    const endsAt = Date.now() + duration * 60_000;
    this.sleepTimerState = { active: true, endsAt, durationMinutes: duration, fading: false };
    this.showToast(`Sleep timer set for ${duration} min`);

    this.sleepTimerTick = setInterval(() => {
      if (!this.sleepTimerState.active || !this.sleepTimerState.endsAt) return;
      const remainingMs = this.sleepTimerState.endsAt - Date.now();
      const fadeEnabled = this.config.settings.powerUps.audibleFadeSleepAndRewind;

      // Gentle 10-second volume fade-out before pausing
      if (fadeEnabled && remainingMs > 0 && remainingMs <= 10_000) {
        this.sleepTimerState.fading = true;
        const factor = Math.max(0.05, remainingMs / 10_000);
        for (const [id, rt] of this.runtime.entries()) {
          if (rt.mounted && rt.audible) {
            this.applyVolumeToView(id, rt.volume * factor);
          }
        }
      }

      if (remainingMs <= 0) {
        if (this.sleepTimerTick) {
          clearInterval(this.sleepTimerTick);
          this.sleepTimerTick = null;
        }
        this.sleepTimerState = { active: false, endsAt: null, durationMinutes: 0, fading: false };

        for (const [id, rt] of this.runtime.entries()) {
          if (rt.mounted && rt.audible) {
            if (fadeEnabled && id === 'audible') {
              this.pendingRewindServiceIds.add(id);
            }
            void this.runMediaAction('pause', id).then(() => {
              this.applyVolumeToView(id, rt.volume);
            });
          }
        }
        this.showToast('Sleep timer finished — playback paused', 4000);
      } else {
        this.emitSnapshot();
      }
    }, 1000);

    return this.getSnapshot();
  }

  private getMediaWebContents(serviceId: string): Electron.WebContents | null {
    if (
      serviceId === 'audible' &&
      this.audiblePlayerView &&
      !this.audiblePlayerView.webContents.isDestroyed()
    ) {
      return this.audiblePlayerView.webContents;
    }
    const view = this.views.get(serviceId);
    if (view && !view.webContents.isDestroyed()) {
      return view.webContents;
    }
    return null;
  }

  async runMediaAction(action: MediaControlAction, explicitServiceId?: string): Promise<DesktopSnapshot> {
    const targetId = explicitServiceId ?? this.resolveMediaTargetId();
    if (!targetId) return this.getSnapshot();

    const wc = this.getMediaWebContents(targetId);
    if (!wc) {
      return this.getSnapshot();
    }

    try {
      // Auto-rewind 15s when resuming Audible after a Sleep Timer fade-out
      if (
        (action === 'play' || action === 'play-pause') &&
        this.pendingRewindServiceIds.has(targetId)
      ) {
        this.pendingRewindServiceIds.delete(targetId);
        await wc.executeJavaScript(buildMediaControlScript('rewind-15'), true);
        this.showToast('Rewound 15s after sleep timer', 2400);
      }

      const result = await wc.executeJavaScript(buildMediaControlScript(action), true);
      if (action === 'play' || action === 'play-pause') {
        this.lastNowPlayingServiceId = targetId;
        if (this.autoPausedServiceId === targetId) {
          this.autoPausedServiceId = null;
        }
      }
      if (action === 'pip') {
        this.showToast('Toggled Picture-in-Picture', 2000);
      }
      if (action === 'like-track') {
        const svc = this.findService(targetId);
        this.showToast(
          result === 'liked'
            ? `Liked current ${svc?.shortName ?? 'track'}`
            : `No active like button found in ${svc?.name ?? targetId}`,
          2200,
        );
      }
    } catch {
      // Ignore if page is mid-navigation
    }

    return this.emitSnapshot();
  }

  async resumeAutoPaused(): Promise<DesktopSnapshot> {
    const id = this.autoPausedServiceId;
    if (!id) return this.getSnapshot();
    this.autoPausedServiceId = null;
    return this.runMediaAction('play', id);
  }

  /**
   * Smart WhisperSync Flush for Audible: pauses playback briefly before sleep or app quit
   * so the Audible Cloud Player cleanly posts the exact playback position back to Amazon servers.
   */
  async flushAudibleSync(): Promise<void> {
    if (!this.config.settings.powerUps.audibleWhisperSyncFlush) return;
    const rt = this.runtime.get('audible');
    const wc = this.getMediaWebContents('audible');
    if (!wc || (!rt?.audible && !wc.isCurrentlyAudible())) return;

    try {
      await wc.executeJavaScript(buildMediaControlScript('pause'), true);
      await new Promise<void>((resolve) => setTimeout(resolve, 1600));
    } catch {
      // Best-effort sync flush
    }
  }

  async closeAudibleDock(): Promise<DesktopSnapshot> {
    if (!this.audiblePlayerView) return this.getSnapshot();
    await this.flushAudibleSync();
    this.destroyAudibleDock();
    this.relayout();
    this.showToast('Closed docked Audible Cloud Player', 2000);
    return this.emitSnapshot();
  }

  private async captureHibernateSnapshot(serviceId: string): Promise<void> {
    const view = this.views.get(serviceId);
    if (!view || view.webContents.isDestroyed()) return;
    try {
      const result = (await Promise.race([
        view.webContents.executeJavaScript(CAPTURE_HIBERNATE_STATE_SCRIPT, true),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 450)),
      ])) as HibernateSnapshot | null;
      if (result && (result.scrollY > 0 || (result.mediaTime !== null && result.mediaTime > 2))) {
        this.hibernateSnapshots.set(serviceId, result);
      }
    } catch {
      // Ignore snapshot errors on unload
    }
  }

  async hibernateService(serviceId: string): Promise<DesktopSnapshot> {
    const rt = this.runtime.get(serviceId);
    if (!rt) return this.getSnapshot();

    if (serviceId === 'audible') {
      await this.flushAudibleSync();
      this.destroyAudibleDock();
    }
    await this.captureHibernateSnapshot(serviceId);

    this.destroyView(serviceId);
    rt.mounted = false;
    rt.hibernated = true;
    rt.softThrottled = false;
    rt.loading = false;
    rt.audible = false;
    rt.memoryMb = 0;
    rt.canGoBack = false;
    rt.canGoForward = false;
    this.mediaMeta.delete(serviceId);

    if (this.htmlFullscreenServiceId === serviceId) {
      this.htmlFullscreenServiceId = null;
    }
    if (this.lastNowPlayingServiceId === serviceId) {
      this.lastNowPlayingServiceId = null;
    }
    if (this.autoPausedServiceId === serviceId) {
      this.autoPausedServiceId = null;
    }

    this.relayout();
    return this.emitSnapshot();
  }

  async hibernateInactive(): Promise<DesktopSnapshot> {
    const targets: string[] = [];
    for (const [id, rt] of this.runtime.entries()) {
      if (!rt.mounted || rt.hibernated || rt.audible) continue;
      if (!this.homeActive && id === this.config.activeServiceId) continue;
      if (
        !this.homeActive &&
        this.config.splitView.enabled &&
        id === this.config.splitView.secondaryServiceId
      ) {
        continue;
      }
      targets.push(id);
    }

    for (const id of targets) {
      await this.captureHibernateSnapshot(id);
      const rt = this.runtime.get(id);
      if (id === 'audible') this.destroyAudibleDock();
      this.destroyView(id);
      if (rt) {
        rt.mounted = false;
        rt.hibernated = true;
        rt.softThrottled = false;
        rt.loading = false;
        rt.memoryMb = 0;
      }
      this.mediaMeta.delete(id);
    }

    this.relayout();
    this.refreshMemoryMetrics();
    this.showToast(
      targets.length > 0
        ? `Put ${targets.length} inactive tab${targets.length > 1 ? 's' : ''} to sleep`
        : 'No idle tabs to sleep',
      2200,
    );
    return this.getSnapshot();
  }

  /**
   * Sleeps mounted, non-visible, silent tabs whose working-set RAM exceeds thresholdMb.
   */
  async hibernateHeavyTabs(thresholdMb = 350): Promise<DesktopSnapshot> {
    this.refreshMemoryMetrics();
    const targets: string[] = [];
    for (const [id, rt] of this.runtime.entries()) {
      if (!rt.mounted || rt.hibernated || rt.audible) continue;
      if (id === 'spotify' && this.config.settings.powerUps.spotifyKeepConnectAlive) continue;
      if (!this.homeActive && id === this.config.activeServiceId) continue;
      if (
        !this.homeActive &&
        this.config.splitView.enabled &&
        id === this.config.splitView.secondaryServiceId
      ) {
        continue;
      }
      if ((rt.memoryMb ?? 0) >= thresholdMb) {
        targets.push(id);
      }
    }

    for (const id of targets) {
      await this.captureHibernateSnapshot(id);
      const rt = this.runtime.get(id);
      if (id === 'audible') this.destroyAudibleDock();
      this.destroyView(id);
      if (rt) {
        rt.mounted = false;
        rt.hibernated = true;
        rt.softThrottled = false;
        rt.loading = false;
        rt.memoryMb = 0;
      }
      this.mediaMeta.delete(id);
    }

    this.relayout();
    this.refreshMemoryMetrics();
    this.showToast(
      targets.length > 0
        ? `Slept ${targets.length} heavy tab${targets.length > 1 ? 's' : ''} (>${thresholdMb} MB)`
        : `No idle tabs above ${thresholdMb} MB`,
      2400,
    );
    return this.getSnapshot();
  }

  wakeService(serviceId: string): DesktopSnapshot {
    const svc = this.findService(serviceId);
    const rt = this.runtime.get(serviceId);
    if (!svc || !rt) return this.getSnapshot();

    this.homeActive = false;
    rt.hibernated = false;
    rt.softThrottled = false;
    rt.lastActiveAt = Date.now();
    this.ensureMounted(svc, rt.currentUrl || svc.url);
    this.relayout();
    return this.emitSnapshot();
  }

  openExternal(serviceId: string): void {
    const svc = this.findService(serviceId);
    if (!svc) return;
    const rt = this.runtime.get(serviceId);
    const targetUrl = rt?.currentUrl || svc.url;
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      void shell.openExternal(targetUrl);
    }
  }

  openDevTools(serviceId: string): void {
    const view = this.views.get(serviceId);
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.openDevTools({ mode: 'detach' });
    }
  }

  async clearServiceSession(serviceId: string): Promise<DesktopSnapshot> {
    const svc = this.findService(serviceId);
    if (!svc) return this.getSnapshot();

    const partition = resolveElectronPartition(svc, this.config.settings.shareGoogleSession);
    const ses = session.fromPartition(partition);
    await ses.clearStorageData();
    await ses.clearCache();

    for (const [id, part] of this.viewPartitions.entries()) {
      if (part === partition) {
        const view = this.views.get(id);
        const s = this.findService(id);
        if (view && s && !view.webContents.isDestroyed()) {
          void view.webContents.loadURL(s.url);
        }
      }
    }

    return this.emitSnapshot();
  }

  dispose(): void {
    if (this.autoHibernateInterval) {
      clearInterval(this.autoHibernateInterval);
      this.autoHibernateInterval = null;
    }
    if (this.metadataInterval) {
      clearInterval(this.metadataInterval);
      this.metadataInterval = null;
    }
    if (this.sleepTimerTick) {
      clearInterval(this.sleepTimerTick);
      this.sleepTimerTick = null;
    }
    if (this.blockCountEmitTimer) {
      clearTimeout(this.blockCountEmitTimer);
      this.blockCountEmitTimer = null;
    }
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.destroyAudibleDock();
    for (const id of [...this.views.keys()]) {
      this.destroyView(id);
    }
  }

  private applyVolumeToView(serviceId: string, volume: number): void {
    const view = this.views.get(serviceId);
    if (view && !view.webContents.isDestroyed()) {
      void view.webContents
        .executeJavaScript(buildSetVolumeScript(volume), true)
        .catch(() => {});
    }
    if (
      serviceId === 'audible' &&
      this.audiblePlayerView &&
      !this.audiblePlayerView.webContents.isDestroyed()
    ) {
      void this.audiblePlayerView.webContents
        .executeJavaScript(buildSetVolumeScript(volume), true)
        .catch(() => {});
    }
  }

  private resolveMediaTargetId(): string | null {
    for (const [id, rt] of this.runtime.entries()) {
      if (rt.mounted && rt.audible && !rt.muted) {
        return id;
      }
    }
    if (this.lastNowPlayingServiceId) {
      const rt = this.runtime.get(this.lastNowPlayingServiceId);
      if (rt?.mounted) return this.lastNowPlayingServiceId;
    }
    const activeRt = this.runtime.get(this.config.activeServiceId);
    if (activeRt?.mounted) return this.config.activeServiceId;
    return null;
  }

  private computeNowPlaying(): NowPlayingState {
    let targetId: string | null = null;
    for (const [id, rt] of this.runtime.entries()) {
      if (rt.mounted && rt.audible) {
        targetId = id;
        break;
      }
    }

    if (!targetId && this.lastNowPlayingServiceId) {
      const prev = this.runtime.get(this.lastNowPlayingServiceId);
      if (prev?.mounted) {
        targetId = this.lastNowPlayingServiceId;
      }
    }

    if (!targetId) {
      return {
        serviceId: null,
        playing: false,
        title: '',
        muted: false,
        volume: 1.0,
        autoPausedServiceId: this.autoPausedServiceId,
      };
    }

    const rt = this.runtime.get(targetId)!;
    const svc = this.findService(targetId);
    const meta = this.mediaMeta.get(targetId);

    return {
      serviceId: targetId,
      playing: rt.audible,
      title: meta?.title || rt.pageTitle || svc?.name || targetId,
      artist: meta?.artist || svc?.name,
      album: meta?.album,
      artworkUrl: meta?.artworkUrl,
      muted: rt.muted,
      volume: rt.volume,
      autoPausedServiceId: this.autoPausedServiceId,
    };
  }

  private handleSmartAudioSwitching(startedServiceId: string): void {
    if (!this.config.settings.smartAudioSwitching) return;

    for (const [otherId, otherRt] of this.runtime.entries()) {
      if (otherId === startedServiceId) continue;
      if (!otherRt.mounted || !otherRt.audible || otherRt.muted) continue;

      const otherWc = this.getMediaWebContents(otherId);
      if (otherWc) {
        this.autoPausedServiceId = otherId;
        void otherWc
          .executeJavaScript(buildMediaControlScript('pause'), true)
          .catch(() => {});
      }
    }
  }

  private defaultInsetsFor(cfg: PersistedConfig): ChromeInsets {
    const isClassic = cfg.settings.appChromeMode === 'classic';
    if (cfg.settings.navPosition === 'top') {
      return {
        top: isClassic ? 84 : 46,
        left: 0,
        bottom: 0,
        splitDividerWidth: 8,
        splitHeaderHeight: 34,
      };
    }
    return {
      top: isClassic ? 76 : 38,
      left: 70,
      bottom: 0,
      splitDividerWidth: 8,
      splitHeaderHeight: 34,
    };
  }

  private findService(serviceId: string): ServiceDefinition | undefined {
    return this.config.services.find((s) => s.id === serviceId);
  }

  private ensureVisibleViewsMounted(): void {
    const now = Date.now();
    const visibleIds = [this.config.activeServiceId];
    if (this.config.splitView.enabled && this.config.splitView.secondaryServiceId) {
      visibleIds.push(this.config.splitView.secondaryServiceId);
    }

    for (const id of visibleIds) {
      const svc = this.findService(id);
      const rt = this.runtime.get(id);
      if (!svc || !rt) continue;
      rt.lastActiveAt = now;

      // Wake from Tier-1 soft background throttling immediately when focused
      if (rt.softThrottled) {
        rt.softThrottled = false;
        const existing = this.views.get(id);
        if (existing && !existing.webContents.isDestroyed()) {
          const keepAlive = this.config.settings.backgroundAudioEnabled && svc.keepAliveInBackground;
          existing.webContents.setBackgroundThrottling(!keepAlive);
        }
      }

      if (!rt.hibernated) {
        const baseRestoreUrl = this.config.settings.restoreLastPages ? (svc.lastUrl || svc.url) : svc.url;
        const rewritten =
          rewriteUrlForPowerUps(svc.id, baseRestoreUrl, this.config.settings.powerUps) ?? baseRestoreUrl;
        this.ensureMounted(svc, rt.mounted ? rt.currentUrl : rewritten);
      }
    }
  }

  private configurePartition(partition: string): Electron.Session {
    const ses = session.fromPartition(partition);
    if (this.configuredPartitions.has(partition)) {
      return ses;
    }
    this.configuredPartitions.add(partition);

    ses.setPermissionRequestHandler((_webContents, permission, callback) => {
      if (permission === 'notifications' && this.config.settings.doNotDisturb) {
        callback(false);
        return;
      }
      callback(ALLOWED_PERMISSIONS.has(permission));
    });

    ses.setPermissionCheckHandler((_webContents, permission) => {
      if (permission === 'notifications' && this.config.settings.doNotDisturb) {
        return false;
      }
      return ALLOWED_PERMISSIONS.has(permission);
    });

    ses.webRequest.onBeforeRequest((details, callback) => {
      if (!this.config.settings.adBlockerEnabled) {
        callback({ cancel: false });
        return;
      }

      const svcId =
        typeof details.webContentsId === 'number'
          ? this.webContentsToService.get(details.webContentsId)
          : undefined;
      const svc = svcId ? this.findService(svcId) : undefined;
      if (svc && svc.adBlockEnabled === false) {
        callback({ cancel: false });
        return;
      }

      if (shouldBlockNetworkRequest(details.url, details.resourceType)) {
        this.totalBlockedRequests += 1;
        if (svcId) {
          const rt = this.runtime.get(svcId);
          if (rt) rt.blockedRequests += 1;
        }
        this.scheduleBlockedCountEmit();
        callback({ cancel: true });
        return;
      }

      callback({ cancel: false });
    });

    return ses;
  }

  private scheduleBlockedCountEmit(): void {
    if (this.blockCountEmitTimer) return;
    this.blockCountEmitTimer = setTimeout(() => {
      this.blockCountEmitTimer = null;
      this.emitSnapshot();
    }, 800);
  }

  private ensureMounted(service: ServiceDefinition, initialUrl?: string): WebContentsView {
    const existing = this.views.get(service.id);
    if (existing && !existing.webContents.isDestroyed()) {
      return existing;
    }

    const partition = resolveElectronPartition(service, this.config.settings.shareGoogleSession);
    this.configurePartition(partition);

    const keepAlive = this.config.settings.backgroundAudioEnabled && service.keepAliveInBackground;

    const view = new WebContentsView({
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: !keepAlive,
        spellcheck: true,
      },
    });

    this.views.set(service.id, view);
    this.viewPartitions.set(service.id, partition);
    this.webContentsToService.set(view.webContents.id, service.id);

    const rt = this.runtime.get(service.id) ?? createInitialRuntimeState(service);
    rt.mounted = true;
    rt.hibernated = false;
    rt.softThrottled = false;
    rt.loading = true;
    rt.volume = clampVolume(service.volume ?? rt.volume);
    rt.lastActiveAt = Date.now();
    this.runtime.set(service.id, rt);

    const wc = view.webContents;
    wc.setAudioMuted(rt.muted);
    wc.setZoomFactor(clampZoom(service.zoomFactor ?? rt.zoomFactor));

    this.attachWebContentsListeners(service, view);

    const baseTarget = initialUrl && initialUrl.startsWith('http') ? initialUrl : service.url;
    const targetUrl = rewriteUrlForPowerUps(service.id, baseTarget, this.config.settings.powerUps) ?? baseTarget;
    void wc.loadURL(targetUrl).catch((err) => {
      console.warn(`[OmniDeck] Load error for ${service.id}:`, err?.message ?? err);
    });

    return view;
  }

  private applyPowerUpsToView(service: ServiceDefinition, view: WebContentsView): void {
    const wc = view.webContents;
    if (wc.isDestroyed()) return;
    const powerUps = this.config.settings.powerUps;

    if (this.config.settings.nativePolishCss) {
      void wc
        .insertCSS(buildNativePolishCss(service.id, this.config.settings.theme, powerUps))
        .catch(() => {});
    }

    if (service.id === 'youtube' || service.id === 'youtube-music') {
      void wc
        .executeJavaScript(buildYouTubePowerUpScript(service.id, powerUps), true)
        .catch(() => {});
    } else if (service.id === 'twitch') {
      void wc.executeJavaScript(buildTwitchPowerUpScript(powerUps), true).catch(() => {});
    } else if (service.id === 'reddit') {
      void wc.executeJavaScript(buildRedditPowerUpScript(powerUps), true).catch(() => {});
    }

    this.syncDynamicPowerUpData(service.id, wc.getURL());
  }

  private syncDynamicPowerUpData(serviceId: string, url: string): void {
    if (!url) return;
    const powerUps = this.config.settings.powerUps;
    const view = this.views.get(serviceId);
    if (!view || view.webContents.isDestroyed()) return;

    // YouTube & YouTube Music SponsorBlock segments
    if ((serviceId === 'youtube' || serviceId === 'youtube-music') && powerUps.youtubeSponsorBlock) {
      const videoId = extractYouTubeVideoId(url);
      if (videoId && this.lastSponsorVideoByService.get(serviceId) !== videoId) {
        this.lastSponsorVideoByService.set(serviceId, videoId);
        void fetchSponsorSegments(videoId, serviceId === 'youtube-music').then((segments) => {
          const curView = this.views.get(serviceId);
          if (!curView || curView.webContents.isDestroyed()) return;
          if (this.lastSponsorVideoByService.get(serviceId) !== videoId) return;
          void curView.webContents
            .executeJavaScript(buildSponsorSegmentsInjector(videoId, segments), true)
            .catch(() => {});
        });
      }
    }

    // Twitch 7TV / BTTV / FFZ emotes
    if (serviceId === 'twitch' && powerUps.twitchThirdPartyEmotes) {
      const login = extractTwitchChannelLogin(url);
      if (login && this.lastTwitchChannel.login !== login) {
        this.lastTwitchChannel.login = login;
        void fetchTwitchEmotes(login).then((emoteMap) => {
          const curView = this.views.get('twitch');
          if (!curView || curView.webContents.isDestroyed()) return;
          if (this.lastTwitchChannel.login !== login) return;
          if (Object.keys(emoteMap).length > 0) {
            void curView.webContents
              .executeJavaScript(buildTwitchEmotesInjector(emoteMap), true)
              .catch(() => {});
          }
        });
      }
    }
  }

  private openDockedAudiblePlayer(url: string, partition: string): void {
    if (this.audiblePlayerView && !this.audiblePlayerView.webContents.isDestroyed()) {
      void this.audiblePlayerView.webContents.loadURL(url).catch(() => {});
      this.relayout();
      this.emitSnapshot();
      return;
    }

    this.configurePartition(partition);
    const playerView = new WebContentsView({
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        spellcheck: false,
      },
    });

    this.audiblePlayerView = playerView;
    const wc = playerView.webContents;
    this.webContentsToService.set(wc.id, 'audible');

    const rt = this.runtime.get('audible');
    if (rt) {
      wc.setAudioMuted(rt.muted);
    }

    wc.on('did-finish-load', () => {
      if (wc.isDestroyed()) return;
      if (this.config.settings.nativePolishCss) {
        void wc
          .insertCSS(buildNativePolishCss('audible', this.config.settings.theme, this.config.settings.powerUps))
          .catch(() => {});
      }
      const curRt = this.runtime.get('audible');
      if (curRt && curRt.volume < 0.99) {
        this.applyVolumeToView('audible', curRt.volume);
      }
    });

    wc.on('media-started-playing', () => {
      const curRt = this.runtime.get('audible');
      if (!curRt) return;
      curRt.audible = true;
      this.lastNowPlayingServiceId = 'audible';
      if (this.autoPausedServiceId === 'audible') {
        this.autoPausedServiceId = null;
      }
      this.handleSmartAudioSwitching('audible');
      void this.pollMediaMetadata('audible');
      this.emitSnapshot();
    });

    wc.on('media-paused', () => {
      const curRt = this.runtime.get('audible');
      if (!curRt || wc.isDestroyed()) return;
      const mainView = this.views.get('audible');
      const mainAudible = Boolean(mainView && !mainView.webContents.isDestroyed() && mainView.webContents.isCurrentlyAudible());
      curRt.audible = wc.isCurrentlyAudible() || mainAudible;
      this.emitSnapshot();
    });

    wc.on('page-title-updated', (_e, title) => {
      if (title) {
        void this.pollMediaMetadata('audible');
      }
    });

    void wc.loadURL(url).catch(() => {});
    this.relayout();
    this.showToast('Audible Cloud Player docked inside OmniDeck', 2400);
    this.emitSnapshot();
  }

  private destroyAudibleDock(): void {
    const view = this.audiblePlayerView;
    if (!view) return;
    this.webContentsToService.delete(view.webContents.id);
    if (this.audiblePlayerAttached && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.contentView.removeChildView(view);
      } catch {
        // ignore
      }
    }
    this.audiblePlayerAttached = false;
    if (!view.webContents.isDestroyed()) {
      view.webContents.close({ waitForBeforeUnload: false });
    }
    this.audiblePlayerView = null;
  }

  private setAudibleDockAttached(shouldAttach: boolean): void {
    const view = this.audiblePlayerView;
    if (!view || this.mainWindow.isDestroyed()) return;
    if (shouldAttach && !this.audiblePlayerAttached) {
      this.mainWindow.contentView.addChildView(view);
      this.audiblePlayerAttached = true;
    } else if (!shouldAttach && this.audiblePlayerAttached) {
      try {
        this.mainWindow.contentView.removeChildView(view);
      } catch {
        // ignore
      }
      this.audiblePlayerAttached = false;
    }
  }

  private attachWebContentsListeners(service: ServiceDefinition, view: WebContentsView): void {
    const wc = view.webContents;
    const partition = this.viewPartitions.get(service.id) ?? `persist:${service.id}`;

    const syncNavigation = () => {
      const rt = this.runtime.get(service.id);
      if (!rt || wc.isDestroyed()) return;
      rt.canGoBack = wc.navigationHistory.canGoBack();
      rt.canGoForward = wc.navigationHistory.canGoForward();
      const url = wc.getURL();
      const title = wc.getTitle();
      if (url) rt.currentUrl = url;
      if (title) {
        rt.pageTitle = title;
        rt.badgeCount = extractBadgeCountFromTitle(title);
      }

      if (url && /^https?:\/\//i.test(url)) {
        // Apply Power-Up URL rewrites on SPA in-page transitions too (e.g. YouTube Shorts click)
        const rewritten = rewriteUrlForPowerUps(service.id, url, this.config.settings.powerUps);
        if (rewritten && rewritten !== url) {
          void wc.loadURL(rewritten).catch(() => {});
          return;
        }

        let nextCfg = this.config;
        if (nextCfg.settings.restoreLastPages) {
          nextCfg = setServiceLastUrl(nextCfg, service.id, url);
        }
        if (title) {
          nextCfg = recordRecentActivity(nextCfg, { serviceId: service.id, title, url });
        }
        if (nextCfg !== this.config) {
          this.config = nextCfg;
          this.onConfigUpdated(nextCfg);
        }

        this.syncDynamicPowerUpData(service.id, url);
      }

      if (rt.audible) {
        void this.pollMediaMetadata(service.id);
      }

      this.emitSnapshot();
    };

    wc.on('did-start-loading', () => {
      const rt = this.runtime.get(service.id);
      if (!rt) return;
      rt.loading = true;
      this.emitSnapshot();
    });

    wc.on('did-finish-load', () => {
      if (wc.isDestroyed()) return;
      this.applyPowerUpsToView(service, view);

      const rt = this.runtime.get(service.id);
      if (rt && rt.volume < 0.99) {
        this.applyVolumeToView(service.id, rt.volume);
      }

      // Restore scroll position & media timestamp if waking from Tier-2 hibernation
      const snap = this.hibernateSnapshots.get(service.id);
      if (snap) {
        this.hibernateSnapshots.delete(service.id);
        void wc
          .executeJavaScript(buildRestoreHibernateStateScript(snap.scrollY, snap.mediaTime), true)
          .catch(() => {});
      }
    });

    wc.on('did-stop-loading', () => {
      const rt = this.runtime.get(service.id);
      if (!rt) return;
      rt.loading = false;
      syncNavigation();
    });

    wc.on('did-navigate', syncNavigation);
    wc.on('did-navigate-in-page', syncNavigation);
    wc.on('page-title-updated', (_e, title) => {
      const rt = this.runtime.get(service.id);
      if (!rt) return;
      rt.pageTitle = title || service.name;
      rt.badgeCount = extractBadgeCountFromTitle(title || '');
      if (rt.currentUrl) {
        const nextCfg = recordRecentActivity(this.config, {
          serviceId: service.id,
          title: rt.pageTitle,
          url: rt.currentUrl,
        });
        if (nextCfg !== this.config) {
          this.config = nextCfg;
          this.onConfigUpdated(nextCfg);
        }
      }
      if (rt.audible) {
        void this.pollMediaMetadata(service.id);
      }
      this.emitSnapshot();
    });

    // Smart Cross-App Link Routing + Power-Up URL rewrites on navigations
    wc.on('will-navigate', (event, url) => {
      const rewritten = rewriteUrlForPowerUps(service.id, url, this.config.settings.powerUps);
      if (rewritten && rewritten !== url) {
        event.preventDefault();
        void wc.loadURL(rewritten).catch(() => {});
        return;
      }

      if (!this.config.settings.smartLinkRouting) return;
      const matched = matchServiceForUrl(url, this.config.services, service.id);
      if (matched) {
        event.preventDefault();
        this.openServiceUrl(matched.id, url);
        this.showToast(`Opened link in ${matched.name}`);
      }
    });

    wc.on('media-started-playing', () => {
      const rt = this.runtime.get(service.id);
      if (!rt) return;
      rt.audible = true;
      this.lastNowPlayingServiceId = service.id;
      if (this.autoPausedServiceId === service.id) {
        this.autoPausedServiceId = null;
      }
      this.handleSmartAudioSwitching(service.id);
      void this.pollMediaMetadata(service.id);
      this.emitSnapshot();
    });

    wc.on('media-paused', () => {
      const rt = this.runtime.get(service.id);
      if (!rt || wc.isDestroyed()) return;
      const dockAudible =
        service.id === 'audible' &&
        Boolean(this.audiblePlayerView && !this.audiblePlayerView.webContents.isDestroyed() && this.audiblePlayerView.webContents.isCurrentlyAudible());
      rt.audible = wc.isCurrentlyAudible() || dockAudible;
      this.emitSnapshot();
    });

    wc.on('enter-html-full-screen', () => {
      this.htmlFullscreenServiceId = service.id;
      this.relayout();
    });

    wc.on('leave-html-full-screen', () => {
      if (this.htmlFullscreenServiceId === service.id) {
        this.htmlFullscreenServiceId = null;
        this.relayout();
      }
    });

    wc.setWindowOpenHandler(({ url }) => {
      // Audible Desktop Upgrade: dock Cloud Player right inside OmniDeck instead of a stray popup
      if (
        service.id === 'audible' &&
        this.config.settings.powerUps.audibleDockCloudPlayer &&
        /audible\./i.test(url) &&
        /webplayer|cloudplayer/i.test(url)
      ) {
        this.openDockedAudiblePlayer(url, partition);
        return { action: 'deny' };
      }

      if (isInAppPopupUrl(url, service)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 560,
            height: 760,
            autoHideMenuBar: true,
            title: `${service.name} — Sign In`,
            webPreferences: {
              partition,
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
            },
          },
        };
      }

      // Smart Cross-App Link Routing for new-tab links (e.g. Reddit -> YouTube/Twitch/Spotify)
      if (this.config.settings.smartLinkRouting) {
        const matched = matchServiceForUrl(url, this.config.services, service.id);
        if (matched) {
          this.openServiceUrl(matched.id, url);
          this.showToast(`Opened link in ${matched.name}`);
          return { action: 'deny' };
        }
      }

      if (url.startsWith('http://') || url.startsWith('https://')) {
        void shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    wc.on('context-menu', (_event, params) => {
      const items: Electron.MenuItemConstructorOptions[] = [];

      if (params.linkURL) {
        const routedTarget = matchServiceForUrl(params.linkURL, this.config.services, service.id);
        if (routedTarget) {
          items.push({
            label: `Open in ${routedTarget.name} (Split View)`,
            click: () => {
              this.openServiceUrl(routedTarget.id, params.linkURL, true);
              this.showToast(`Opened in Split View with ${routedTarget.name}`);
            },
          });
        }
        items.push(
          {
            label: 'Open Link in External Browser',
            click: () => void shell.openExternal(params.linkURL),
          },
          {
            label: 'Copy Link Address',
            click: () => clipboard.writeText(params.linkURL),
          },
          { type: 'separator' },
        );
      }

      if (params.selectionText) {
        items.push({ role: 'copy' });
      }
      if (params.isEditable) {
        items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
      }

      if (items.length > 0) {
        items.push({ type: 'separator' });
      }

      items.push(
        {
          label: 'Back',
          enabled: wc.navigationHistory.canGoBack(),
          click: () => this.goBack(service.id),
        },
        {
          label: 'Forward',
          enabled: wc.navigationHistory.canGoForward(),
          click: () => this.goForward(service.id),
        },
        {
          label: 'Reload',
          click: () => this.reload(service.id),
        },
        { type: 'separator' },
        {
          label: 'Picture-in-Picture Video',
          click: () => void this.runMediaAction('pip', service.id),
        },
        {
          label: this.runtime.get(service.id)?.muted ? `Unmute ${service.name}` : `Mute ${service.name}`,
          click: () => this.toggleMute(service.id),
        },
        {
          label: `Sleep ${service.name} Tab (Free RAM)`,
          click: () => void this.hibernateService(service.id),
        },
      );

      Menu.buildFromTemplate(items).popup({ window: this.mainWindow });
    });
  }

  private async pollMediaMetadata(serviceId: string): Promise<void> {
    const wc = this.getMediaWebContents(serviceId);
    if (!wc) return;
    try {
      const result = (await wc.executeJavaScript(
        READ_MEDIA_METADATA_SCRIPT,
        true,
      )) as MediaMeta | null;

      const prev = this.mediaMeta.get(serviceId);
      if (
        result &&
        (result.title !== prev?.title ||
          result.artist !== prev?.artist ||
          result.artworkUrl !== prev?.artworkUrl)
      ) {
        this.mediaMeta.set(serviceId, result);
        this.emitSnapshot();
      }
    } catch {
      // Ignore cross-frame/navigation errors
    }
  }

  private destroyView(serviceId: string): void {
    const view = this.views.get(serviceId);
    if (!view) return;

    this.webContentsToService.delete(view.webContents.id);

    if (this.attachedViewIds.has(serviceId)) {
      try {
        this.mainWindow.contentView.removeChildView(view);
      } catch {
        // Ignore if window already closing
      }
      this.attachedViewIds.delete(serviceId);
    }

    if (!view.webContents.isDestroyed()) {
      view.webContents.close({ waitForBeforeUnload: false });
    }
    this.views.delete(serviceId);
    this.viewPartitions.delete(serviceId);
  }

  private setViewAttached(serviceId: string, shouldAttach: boolean): void {
    const view = this.views.get(serviceId);
    if (!view || this.mainWindow.isDestroyed()) return;

    const currentlyAttached = this.attachedViewIds.has(serviceId);
    if (shouldAttach && !currentlyAttached) {
      this.mainWindow.contentView.addChildView(view);
      this.attachedViewIds.add(serviceId);
    } else if (!shouldAttach && currentlyAttached) {
      this.mainWindow.contentView.removeChildView(view);
      this.attachedViewIds.delete(serviceId);
    }
  }

  relayout(): void {
    if (this.mainWindow.isDestroyed()) return;
    const [contentW, contentH] = this.mainWindow.getContentSize();

    if (this.htmlFullscreenServiceId && !this.overlayOpen && !this.homeActive) {
      this.setAudibleDockAttached(false);
      for (const id of this.views.keys()) {
        const isFs = id === this.htmlFullscreenServiceId;
        this.setViewAttached(id, isFs);
        if (isFs) {
          this.views.get(id)?.setBounds({ x: 0, y: 0, width: contentW, height: contentH });
        }
      }
      return;
    }

    const primaryId = this.config.activeServiceId;
    const secondaryId = this.config.splitView.enabled ? this.config.splitView.secondaryServiceId : null;
    const primaryRt = this.runtime.get(primaryId);
    const secondaryRt = secondaryId ? this.runtime.get(secondaryId) : undefined;

    const bounds = computeDesktopLayoutBounds(contentW, contentH, this.chromeInsets, {
      overlayOpen: this.overlayOpen || this.homeActive,
      primaryHibernated: Boolean(primaryRt?.hibernated),
      splitEnabled: Boolean(secondaryId),
      secondaryHibernated: Boolean(secondaryRt?.hibernated),
      splitRatio: this.config.splitView.ratio,
    });

    const dockReady = Boolean(this.audiblePlayerView && !this.audiblePlayerView.webContents.isDestroyed());
    let dockRect: Electron.Rectangle | null = null;

    for (const [id, view] of this.views.entries()) {
      let rect: Electron.Rectangle | null = null;
      if (id === primaryId && bounds.primary) {
        rect = { ...bounds.primary };
      } else if (id === secondaryId && bounds.secondary) {
        rect = { ...bounds.secondary };
      }

      if (rect) {
        // When Audible is visible and Cloud Player is docked, share its rect cleanly side-by-side
        if (id === 'audible' && dockReady && rect.width >= 640) {
          const playerW = Math.min(430, Math.max(320, Math.round(rect.width * 0.36)));
          const libW = Math.max(260, rect.width - playerW - 4);
          dockRect = {
            x: rect.x + libW + 4,
            y: rect.y,
            width: Math.max(200, rect.width - libW - 4),
            height: rect.height,
          };
          rect = { x: rect.x, y: rect.y, width: libW, height: rect.height };
        }
        this.setViewAttached(id, true);
        view.setBounds(rect);
      } else {
        this.setViewAttached(id, false);
      }
    }

    if (dockReady && dockRect) {
      this.setAudibleDockAttached(true);
      this.audiblePlayerView!.setBounds(dockRect);
    } else {
      this.setAudibleDockAttached(false);
    }
  }

  private bindWindowEvents(): void {
    const onResize = () => {
      this.relayout();
      this.emitSnapshot();
    };
    this.mainWindow.on('resize', onResize);
    this.mainWindow.on('maximize', onResize);
    this.mainWindow.on('unmaximize', onResize);
    this.mainWindow.on('enter-full-screen', onResize);
    this.mainWindow.on('leave-full-screen', onResize);
  }

  private startBackgroundLoops(): void {
    // 2-Tier Smart Hibernation Loop (Tier-1 soft throttling @ 5 min, Tier-2 lossless sleep @ autoHibernateMinutes)
    this.autoHibernateInterval = setInterval(() => {
      const now = Date.now();
      let changed = false;

      for (const [id, rt] of this.runtime.entries()) {
        const view = this.views.get(id);
        if (view && !view.webContents.isDestroyed()) {
          const dockAudible =
            id === 'audible' &&
            Boolean(this.audiblePlayerView && !this.audiblePlayerView.webContents.isDestroyed() && this.audiblePlayerView.webContents.isCurrentlyAudible());
          rt.audible = view.webContents.isCurrentlyAudible() || dockAudible;
        }

        // Tier-1: Engage background throttling after 5 min of silent inactivity
        if (shouldSoftThrottle(rt, this.config, now, 5) && view && !view.webContents.isDestroyed()) {
          view.webContents.setBackgroundThrottling(true);
          rt.softThrottled = true;
          changed = true;
        }

        // Tier-2: Snapshot scroll & timestamp, then unload to free RAM
        if (shouldAutoHibernate(rt, this.config, now)) {
          void this.hibernateService(id);
          changed = true;
        }
      }

      if (changed) {
        this.emitSnapshot();
      }
    }, 60_000);

    // Low-overhead fallback metadata sync (event-driven triggers handle instant updates; 15s safety net only when visible & playing)
    this.metadataInterval = setInterval(() => {
      if (this.mainWindow.isDestroyed() || this.mainWindow.isMinimized()) return;
      const npId = this.resolveMediaTargetId();
      if (npId) {
        const rt = this.runtime.get(npId);
        if (rt?.mounted && rt.audible) {
          void this.pollMediaMetadata(npId);
        }
      }
    }, 15_000);
  }

  private emitSnapshot(): DesktopSnapshot {
    const snapshot = this.getSnapshot();
    this.onSnapshotChanged(snapshot);
    return snapshot;
  }
}

