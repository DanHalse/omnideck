import {
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
  isInAppPopupUrl,
  matchServiceForUrl,
  recordRecentActivity,
  resolveElectronPartition,
  selectActiveService,
  setServiceLastUrl,
  shouldAutoHibernate,
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
  private readonly configuredPartitions = new Set<string>();
  private readonly attachedViewIds = new Set<string>();
  private readonly onSnapshotChanged: (snapshot: DesktopSnapshot) => void;
  private readonly onConfigUpdated: (nextConfig: PersistedConfig) => void;

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
      toastMessage: this.toastMessage,
    };
  }

  hasAudiblePlayback(): boolean {
    for (const state of this.runtime.values()) {
      if (state.mounted && state.audible && !state.muted) {
        return true;
      }
    }
    return false;
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
    const rt = this.runtime.get(serviceId);
    if (rt?.hibernated) {
      rt.currentUrl = svc.url;
      this.wakeService(serviceId);
      return;
    }
    const view = this.ensureMounted(svc);
    if (view && !view.webContents.isDestroyed()) {
      void view.webContents.loadURL(svc.url);
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
      this.sleepTimerState = { active: false, endsAt: null, durationMinutes: 0 };
      this.showToast('Sleep timer cancelled', 2000);
      return this.getSnapshot();
    }

    const duration = Math.min(360, Math.max(1, Math.round(minutes)));
    const endsAt = Date.now() + duration * 60_000;
    this.sleepTimerState = { active: true, endsAt, durationMinutes: duration };
    this.showToast(`Sleep timer set for ${duration} min`);

    this.sleepTimerTick = setInterval(() => {
      if (!this.sleepTimerState.active || !this.sleepTimerState.endsAt) return;
      const remainingMs = this.sleepTimerState.endsAt - Date.now();

      // Gentle 10-second fade-out before pausing
      if (remainingMs > 0 && remainingMs <= 10_000) {
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
        this.sleepTimerState = { active: false, endsAt: null, durationMinutes: 0 };

        for (const [id, rt] of this.runtime.entries()) {
          if (rt.mounted && rt.audible) {
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

  async runMediaAction(action: MediaControlAction, explicitServiceId?: string): Promise<DesktopSnapshot> {
    const targetId = explicitServiceId ?? this.resolveMediaTargetId();
    if (!targetId) return this.getSnapshot();

    const view = this.views.get(targetId);
    if (!view || view.webContents.isDestroyed()) {
      return this.getSnapshot();
    }

    try {
      await view.webContents.executeJavaScript(buildMediaControlScript(action), true);
      if (action === 'play' || action === 'play-pause') {
        this.lastNowPlayingServiceId = targetId;
        if (this.autoPausedServiceId === targetId) {
          this.autoPausedServiceId = null;
        }
      }
      if (action === 'pip') {
        this.showToast('Toggled Picture-in-Picture', 2000);
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

  hibernateService(serviceId: string): DesktopSnapshot {
    const rt = this.runtime.get(serviceId);
    if (!rt) return this.getSnapshot();

    this.destroyView(serviceId);
    rt.mounted = false;
    rt.hibernated = true;
    rt.loading = false;
    rt.audible = false;
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

  hibernateInactive(): DesktopSnapshot {
    let count = 0;
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
      this.destroyView(id);
      rt.mounted = false;
      rt.hibernated = true;
      rt.loading = false;
      this.mediaMeta.delete(id);
      count += 1;
    }
    this.relayout();
    this.showToast(
      count > 0 ? `Put ${count} inactive tab${count > 1 ? 's' : ''} to sleep` : 'No idle tabs to sleep',
      2200,
    );
    return this.getSnapshot();
  }

  wakeService(serviceId: string): DesktopSnapshot {
    const svc = this.findService(serviceId);
    const rt = this.runtime.get(serviceId);
    if (!svc || !rt) return this.getSnapshot();

    this.homeActive = false;
    rt.hibernated = false;
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
    for (const id of [...this.views.keys()]) {
      this.destroyView(id);
    }
  }

  private applyVolumeToView(serviceId: string, volume: number): void {
    const view = this.views.get(serviceId);
    if (!view || view.webContents.isDestroyed()) return;
    void view.webContents
      .executeJavaScript(buildSetVolumeScript(volume), true)
      .catch(() => {});
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

      const otherView = this.views.get(otherId);
      if (otherView && !otherView.webContents.isDestroyed()) {
        this.autoPausedServiceId = otherId;
        void otherView.webContents
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
      if (!rt.hibernated) {
        const restoreUrl = this.config.settings.restoreLastPages ? (svc.lastUrl || svc.url) : svc.url;
        this.ensureMounted(svc, rt.mounted ? rt.currentUrl : restoreUrl);
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
    rt.loading = true;
    rt.volume = clampVolume(service.volume ?? rt.volume);
    rt.lastActiveAt = Date.now();
    this.runtime.set(service.id, rt);

    const wc = view.webContents;
    wc.setAudioMuted(rt.muted);
    wc.setZoomFactor(clampZoom(service.zoomFactor ?? rt.zoomFactor));

    this.attachWebContentsListeners(service, view);

    const targetUrl = initialUrl && initialUrl.startsWith('http') ? initialUrl : service.url;
    void wc.loadURL(targetUrl).catch((err) => {
      console.warn(`[OmniDeck] Load error for ${service.id}:`, err?.message ?? err);
    });

    return view;
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
      if (this.config.settings.nativePolishCss) {
        void wc
          .insertCSS(buildNativePolishCss(service.id, this.config.settings.theme))
          .catch(() => {});
      }
      const rt = this.runtime.get(service.id);
      if (rt && rt.volume < 0.99) {
        this.applyVolumeToView(service.id, rt.volume);
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
      this.emitSnapshot();
    });

    // Smart Cross-App Link Routing on in-tab navigations (e.g. clicking YouTube/Spotify inside Reddit)
    wc.on('will-navigate', (event, url) => {
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
      rt.audible = wc.isCurrentlyAudible();
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
          click: () => this.hibernateService(service.id),
        },
      );

      Menu.buildFromTemplate(items).popup({ window: this.mainWindow });
    });
  }

  private async pollMediaMetadata(serviceId: string): Promise<void> {
    const view = this.views.get(serviceId);
    if (!view || view.webContents.isDestroyed()) return;
    try {
      const result = (await view.webContents.executeJavaScript(
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

    for (const [id, view] of this.views.entries()) {
      if (id === primaryId && bounds.primary) {
        this.setViewAttached(id, true);
        view.setBounds(bounds.primary);
      } else if (id === secondaryId && bounds.secondary) {
        this.setViewAttached(id, true);
        view.setBounds(bounds.secondary);
      } else {
        this.setViewAttached(id, false);
      }
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
    this.autoHibernateInterval = setInterval(() => {
      const now = Date.now();
      let changed = false;

      for (const [id, rt] of this.runtime.entries()) {
        const view = this.views.get(id);
        if (view && !view.webContents.isDestroyed()) {
          rt.audible = view.webContents.isCurrentlyAudible();
        }
        if (shouldAutoHibernate(rt, this.config, now)) {
          this.destroyView(id);
          rt.mounted = false;
          rt.hibernated = true;
          rt.loading = false;
          rt.audible = false;
          this.mediaMeta.delete(id);
          changed = true;
        }
      }

      if (changed) {
        this.emitSnapshot();
      }
    }, 60_000);

    // Refresh live track/video/audiobook artwork & artist metadata every 4s for playing media
    this.metadataInterval = setInterval(() => {
      const npId = this.resolveMediaTargetId();
      if (npId) {
        const rt = this.runtime.get(npId);
        if (rt?.mounted && rt.audible) {
          void this.pollMediaMetadata(npId);
        }
      }
    }, 4_000);
  }

  private emitSnapshot(): DesktopSnapshot {
    const snapshot = this.getSnapshot();
    this.onSnapshotChanged(snapshot);
    return snapshot;
  }
}
