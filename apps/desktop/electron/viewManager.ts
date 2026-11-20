import {
  BrowserWindow,
  Menu,
  WebContentsView,
  session,
  shell,
  clipboard,
} from 'electron';
import {
  clampZoom,
  computeDesktopLayoutBounds,
  createInitialRuntimeState,
  extractBadgeCountFromTitle,
  isInAppPopupUrl,
  resolveElectronPartition,
  shouldAutoHibernate,
  type ChromeInsets,
  type DesktopSnapshot,
  type DrmStatus,
  type NowPlayingState,
  type PersistedConfig,
  type ServiceDefinition,
  type ServiceRuntimeState,
  type UpdateState,
} from '@omnideck/shared';
import { shouldBlockNetworkRequest } from './adBlocker.js';
import { buildMediaControlScript, type MediaControlAction } from './mediaScripts.js';

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

/**
 * Generates a clean Chromium desktop User-Agent matching the live Electron Chromium binary,
 * stripping Electron/App tokens so Google Sign-In (YouTube / YT Music) and DRM media players
 * operate smoothly without mismatched version fingerprints.
 */
export function buildCleanDesktopUserAgent(rawUa: string): string {
  const cleaned = rawUa
    .replace(/\sElectron\/[^\s]+/gi, '')
    .replace(/\sOmniDeck\/[^\s]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (cleaned.includes('Chrome/')) {
    return cleaned;
  }

  const chromeVersion = process.versions.chrome || '136.0.0.0';
  if (process.platform === 'win32') {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  }
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}

export class ViewManager {
  private readonly mainWindow: BrowserWindow;
  private readonly drmStatus: DrmStatus;
  private readonly cleanUserAgent: string;
  private readonly views = new Map<string, WebContentsView>();
  private readonly viewPartitions = new Map<string, string>();
  private readonly webContentsToService = new Map<number, string>();
  private readonly runtime = new Map<string, ServiceRuntimeState>();
  private readonly configuredPartitions = new Set<string>();
  private readonly attachedViewIds = new Set<string>();
  private readonly onSnapshotChanged: (snapshot: DesktopSnapshot) => void;

  private config: PersistedConfig;
  private updateState: UpdateState;
  private overlayOpen = false;
  private alwaysOnTop = false;
  private htmlFullscreenServiceId: string | null = null;
  private chromeInsets: ChromeInsets;
  private autoHibernateInterval: ReturnType<typeof setInterval> | null = null;

  private lastNowPlayingServiceId: string | null = null;
  private autoPausedServiceId: string | null = null;
  private totalBlockedRequests = 0;
  private blockCountEmitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    mainWindow: BrowserWindow,
    initialConfig: PersistedConfig,
    drmStatus: DrmStatus,
    initialUpdateState: UpdateState,
    onSnapshotChanged: (snapshot: DesktopSnapshot) => void,
  ) {
    this.mainWindow = mainWindow;
    this.config = initialConfig;
    this.drmStatus = drmStatus;
    this.updateState = initialUpdateState;
    this.onSnapshotChanged = onSnapshotChanged;
    this.cleanUserAgent = buildCleanDesktopUserAgent(mainWindow.webContents.getUserAgent());
    this.chromeInsets = this.defaultInsetsFor(initialConfig.settings.navPosition);

    for (const svc of initialConfig.services) {
      this.runtime.set(svc.id, createInitialRuntimeState(svc));
    }

    this.bindWindowEvents();
    this.startAutoHibernateLoop();
  }

  setUpdateState(next: UpdateState): void {
    this.updateState = next;
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
      update: this.updateState,
      drm: this.drmStatus,
      platform: process.platform,
      overlayOpen: this.overlayOpen,
      alwaysOnTop: this.alwaysOnTop,
      totalBlockedRequests: this.totalBlockedRequests,
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

  toggleAlwaysOnTop(): DesktopSnapshot {
    this.alwaysOnTop = !this.alwaysOnTop;
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.setAlwaysOnTop(this.alwaysOnTop, 'floating');
    }
    return this.emitSnapshot();
  }

  syncConfig(nextConfig: PersistedConfig): DesktopSnapshot {
    const prevShareGoogle = this.config.settings.shareGoogleSession;
    const prevNav = this.config.settings.navPosition;
    const prevBgAudio = this.config.settings.backgroundAudioEnabled;
    this.config = nextConfig;

    if (prevNav !== nextConfig.settings.navPosition) {
      this.chromeInsets = this.defaultInsetsFor(nextConfig.settings.navPosition);
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

    this.ensureVisibleViewsMounted();
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

  wakeService(serviceId: string): DesktopSnapshot {
    const svc = this.findService(serviceId);
    const rt = this.runtime.get(serviceId);
    if (!svc || !rt) return this.getSnapshot();

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
    if (this.blockCountEmitTimer) {
      clearTimeout(this.blockCountEmitTimer);
      this.blockCountEmitTimer = null;
    }
    for (const id of [...this.views.keys()]) {
      this.destroyView(id);
    }
  }

  private resolveMediaTargetId(): string | null {
    // 1. Currently playing & unmuted tab
    for (const [id, rt] of this.runtime.entries()) {
      if (rt.mounted && rt.audible && !rt.muted) {
        return id;
      }
    }
    // 2. Last known Now Playing tab if still mounted
    if (this.lastNowPlayingServiceId) {
      const rt = this.runtime.get(this.lastNowPlayingServiceId);
      if (rt?.mounted) return this.lastNowPlayingServiceId;
    }
    // 3. Active tab if mounted
    const activeRt = this.runtime.get(this.config.activeServiceId);
    if (activeRt?.mounted) return this.config.activeServiceId;
    return null;
  }

  private computeNowPlaying(): NowPlayingState {
    // Prefer an actively playing service
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
        autoPausedServiceId: this.autoPausedServiceId,
      };
    }

    const rt = this.runtime.get(targetId)!;
    const svc = this.findService(targetId);
    return {
      serviceId: targetId,
      playing: rt.audible,
      title: rt.pageTitle || svc?.name || targetId,
      muted: rt.muted,
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

  private defaultInsetsFor(navPosition: 'top' | 'left'): ChromeInsets {
    return navPosition === 'top'
      ? { top: 88, left: 0, splitDividerWidth: 8, splitHeaderHeight: 36 }
      : { top: 44, left: 72, splitDividerWidth: 8, splitHeaderHeight: 36 };
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
        this.ensureMounted(svc, rt.currentUrl || svc.url);
      }
    }
  }

  private configurePartition(partition: string): Electron.Session {
    const ses = session.fromPartition(partition);
    if (this.configuredPartitions.has(partition)) {
      return ses;
    }
    this.configuredPartitions.add(partition);

    ses.setUserAgent(this.cleanUserAgent);

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

    // Network-level Ad & Tracker Shield per session partition
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
    rt.lastActiveAt = Date.now();
    this.runtime.set(service.id, rt);

    const wc = view.webContents;
    wc.setUserAgent(this.cleanUserAgent);
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
      if (url) rt.currentUrl = url;
      const title = wc.getTitle();
      if (title) {
        rt.pageTitle = title;
        rt.badgeCount = extractBadgeCountFromTitle(title);
      }
      this.emitSnapshot();
    };

    wc.on('did-start-loading', () => {
      const rt = this.runtime.get(service.id);
      if (!rt) return;
      rt.loading = true;
      this.emitSnapshot();
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
      this.emitSnapshot();
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

      if (url.startsWith('http://') || url.startsWith('https://')) {
        void shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    wc.on('did-create-window', (childWindow) => {
      childWindow.webContents.setUserAgent(this.cleanUserAgent);
    });

    wc.on('context-menu', (_event, params) => {
      const items: Electron.MenuItemConstructorOptions[] = [];

      if (params.linkURL) {
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

    if (this.htmlFullscreenServiceId && !this.overlayOpen) {
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
      overlayOpen: this.overlayOpen,
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
    const onResize = () => this.relayout();
    this.mainWindow.on('resize', onResize);
    this.mainWindow.on('maximize', onResize);
    this.mainWindow.on('unmaximize', onResize);
    this.mainWindow.on('enter-full-screen', onResize);
    this.mainWindow.on('leave-full-screen', onResize);
  }

  private startAutoHibernateLoop(): void {
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
          changed = true;
        }
      }

      if (changed) {
        this.emitSnapshot();
      }
    }, 60_000);
  }

  private emitSnapshot(): DesktopSnapshot {
    const snapshot = this.getSnapshot();
    this.onSnapshotChanged(snapshot);
    return snapshot;
  }
}
