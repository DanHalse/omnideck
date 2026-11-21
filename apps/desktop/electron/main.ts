import path from 'node:path';
import fs from 'node:fs';
import electron, {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
} from 'electron';
import {
  addBlockedMusicEntry,
  addBookNote,
  addCustomService,
  applyWorkspace,
  buildServiceSearchUrl,
  clampDuckLevel,
  deleteCustomWorkspace,
  getVisibleServices,
  mergeAiCompanionConfig,
  mergeEqualizerConfig,
  mergeIntegrationsConfig,
  mergePowerUpsConfig,
  moveServiceById,
  parseImportedConfig,
  pinFavorite,
  removeBlockedMusicEntry,
  removeBookNote,
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
  type AiCompanionConfig,
  type AppSettings,
  type ArtistDossier,
  type ChromeInsets,
  type CustomServiceInput,
  type DesktopSnapshot,
  type DrmStatus,
  type EqualizerConfig,
  type IntegrationsConfig,
  type PowerUpsConfig,
  type ServiceDefinition,
  type WindowBounds,
} from '@omnideck/shared';
import { ConfigStore } from './store.js';
import { ViewManager } from './viewManager.js';
import { UpdateManager } from './updater.js';
import { MusicIntelService } from './musicIntel.js';
import { ListeningStatsStore } from './listeningStats.js';
import { MiniPlayerManager } from './miniPlayer.js';
import { IntegrationsManager, TaskbarControlsManager } from './integrations.js';
import type { UiCommandEvent } from './ipcTypes.js';

app.setName('OmniDeck');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}

// Read hardwareVideoAcceleration preference early (must run before app.whenReady())
function readEarlyHwAccelPreference(): boolean {
  try {
    const cfgPath = path.join(app.getPath('userData'), 'omnideck-config.json');
    if (!fs.existsSync(cfgPath)) return true;
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as {
      settings?: { hardwareVideoAcceleration?: boolean };
    };
    return raw?.settings?.hardwareVideoAcceleration !== false;
  } catch {
    return true;
  }
}

if (readEarlyHwAccelPreference()) {
  if (process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiIgnoreDriverChecks');
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
  }
} else {
  app.disableHardwareAcceleration();
}

interface EcsComponentsApi {
  whenReady: () => Promise<void>;
  status?: () => Record<string, { version?: string; status?: string }>;
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: ConfigStore | null = null;
let viewManager: ViewManager | null = null;
let updateManager: UpdateManager | null = null;
let musicIntel: MusicIntelService | null = null;
let listeningStats: ListeningStatsStore | null = null;
let miniPlayer: MiniPlayerManager | null = null;
let integrations: IntegrationsManager | null = null;
const taskbarControls = new TaskbarControlsManager();
let forceQuitting = false;
let audibleFlushedOnQuit = false;
let mediaKeysRegistered = false;
let registeredSummonShortcut: string | null = null;
let registeredLikeShortcut: string | null = null;
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null;

async function initializeWidevineCdm(): Promise<DrmStatus> {
  const ecsComponents = (electron as unknown as { components?: EcsComponentsApi }).components;
  if (!ecsComponents?.whenReady) {
    return {
      engine: 'stock-electron',
      widevineReady: false,
      message:
        'Running stock Electron without Castlabs Widevine CDM. Install Castlabs ECS for Spotify & Audible DRM playback.',
    };
  }

  try {
    await Promise.race([
      ecsComponents.whenReady(),
      new Promise<void>((resolve) => setTimeout(resolve, 12_000)),
    ]);

    const status = ecsComponents.status?.() ?? {};
    const widevineEntry = Object.entries(status).find(([key]) =>
      key.toLowerCase().includes('widevine') || key === 'oimompecagnajdejgnnjijobebaeigek',
    )?.[1];

    return {
      engine: 'castlabs-ecs',
      widevineReady: true,
      widevineVersion: widevineEntry?.version,
      message: widevineEntry?.version
        ? `Widevine CDM ${widevineEntry.version} ready (Spotify & Audible DRM enabled)`
        : 'Castlabs Widevine CDM ready (Spotify & Audible DRM enabled)',
    };
  } catch (err) {
    return {
      engine: 'castlabs-ecs',
      widevineReady: false,
      message: `Widevine CDM initialization warning: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function resolveAppIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(process.resourcesPath || '', 'icon.png'),
  ];
  return candidates.find((p) => p && fs.existsSync(p));
}

function sendUiCommand(command: UiCommandEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('omnideck:ui-command', command);
  }
}

let lastMiniLyricsFetchKey = '';

function broadcastSnapshot(snapshot: DesktopSnapshot): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('omnideck:snapshot', snapshot);
  }
  miniPlayer?.broadcast(snapshot);

  // When Floating Mini-Player HUD is open and song changes (or duration resolves), fast-fetch synced lyrics (~150ms)
  const np = snapshot.nowPlaying;
  if (
    miniPlayer?.isOpen() &&
    np.serviceId &&
    (np.serviceId === 'youtube-music' || np.serviceId === 'spotify') &&
    np.title
  ) {
    const canonicalTrackKey = `${np.serviceId}::${np.title.toLowerCase()}`;
    const durBucket =
      typeof np.durationSec === 'number' && np.durationSec > 10
        ? Math.round(np.durationSec / 4) * 4
        : 0;
    const fetchKey = `${canonicalTrackKey}::${durBucket}`;
    if (fetchKey !== lastMiniLyricsFetchKey) {
      lastMiniLyricsFetchKey = fetchKey;
      if (!musicIntel) musicIntel = new MusicIntelService();
      void musicIntel
        .getSyncedLyricsFast({
          title: np.title,
          artist: np.artist,
          album: np.album,
          durationSec: np.durationSec,
        })
        .then((lyrics) => {
          // Ignore stale responses if the song has already moved on
          if (lastMiniLyricsFetchKey !== fetchKey) return;
          if (lyrics.synced && lyrics.lines.length > 0) {
            viewManager?.setActiveLyrics(canonicalTrackKey, lyrics.lines);
          }
        })
        .catch(() => {});
    }
  }

  taskbarControls.update(mainWindow, snapshot.nowPlaying, (action) => {
    void viewManager?.runMediaAction(action);
  });
  integrations?.onSnapshot(snapshot);
  refreshTrayMenu();
}

function syncHardwareMediaKeys(enabled: boolean): void {
  if (enabled && !mediaKeysRegistered) {
    try {
      globalShortcut.register('MediaPlayPause', () => {
        void viewManager?.runMediaAction('play-pause');
      });
      globalShortcut.register('MediaNextTrack', () => {
        void viewManager?.runMediaAction('next');
      });
      globalShortcut.register('MediaPreviousTrack', () => {
        void viewManager?.runMediaAction('previous');
      });
      mediaKeysRegistered = true;
    } catch (err) {
      console.warn('[OmniDeck] Hardware media keys unavailable:', err);
    }
  } else if (!enabled && mediaKeysRegistered) {
    globalShortcut.unregister('MediaPlayPause');
    globalShortcut.unregister('MediaNextTrack');
    globalShortcut.unregister('MediaPreviousTrack');
    mediaKeysRegistered = false;
  }
}

function syncGlobalSummonShortcut(accelerator: string): void {
  if (registeredSummonShortcut) {
    try {
      globalShortcut.unregister(registeredSummonShortcut);
    } catch {
      // ignore
    }
    registeredSummonShortcut = null;
  }

  const trimmed = accelerator.trim();
  if (!trimmed) return;

  try {
    const ok = globalShortcut.register(trimmed, () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
    if (ok) {
      registeredSummonShortcut = trimmed;
    }
  } catch (err) {
    console.warn('[OmniDeck] Could not register global summon shortcut:', err);
  }
}

function syncGlobalLikeShortcut(accelerator: string): void {
  if (registeredLikeShortcut) {
    try {
      globalShortcut.unregister(registeredLikeShortcut);
    } catch {
      // ignore
    }
    registeredLikeShortcut = null;
  }

  const trimmed = accelerator.trim();
  if (!trimmed) return;

  try {
    const ok = globalShortcut.register(trimmed, () => {
      void viewManager?.runMediaAction('like-track');
    });
    if (ok) {
      registeredLikeShortcut = trimmed;
    }
  } catch (err) {
    console.warn('[OmniDeck] Could not register global like shortcut:', err);
  }
}

function syncLaunchAtLogin(enabled: boolean): void {
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({ openAtLogin: enabled });
  } catch {
    // Some Linux desktop environments ignore setLoginItemSettings
  }
}

function resolveInitialWindowBounds(saved?: WindowBounds): WindowBounds {
  const fallback: WindowBounds = { width: 1440, height: 920 };
  if (!saved) return fallback;

  try {
    const displays = screen.getAllDisplays();
    if (typeof saved.x === 'number' && typeof saved.y === 'number') {
      const visibleOnDisplay = displays.some((d) => {
        const b = d.workArea;
        return (
          saved.x! + 100 >= b.x &&
          saved.x! <= b.x + b.width - 100 &&
          saved.y! + 60 >= b.y &&
          saved.y! <= b.y + b.height - 60
        );
      });
      if (visibleOnDisplay) return saved;
    }
  } catch {
    // fallback safely
  }

  return { width: saved.width || 1440, height: saved.height || 920, maximized: saved.maximized };
}

function scheduleSaveWindowBounds(): void {
  if (!mainWindow || !store || mainWindow.isDestroyed()) return;
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(() => {
    saveBoundsTimer = null;
    if (!mainWindow || !store || mainWindow.isDestroyed()) return;
    const isMax = mainWindow.isMaximized();
    const bounds = isMax ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    const current = store.get();
    store.set({
      ...current,
      windowBounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        maximized: isMax,
      },
    });
  }, 500);
}

function cycleService(delta: number): void {
  if (!store || !viewManager) return;
  const config = store.get();
  const visible = getVisibleServices(config);
  if (visible.length < 2) return;
  const idx = visible.findIndex((s) => s.id === config.activeServiceId);
  const nextIdx = (idx + delta + visible.length) % visible.length;
  const updated = store.set(selectActiveService(config, visible[nextIdx].id));
  viewManager.setHomeActive(false);
  viewManager.syncConfig(updated);
}

function selectServiceSlot(slotIndex: number): void {
  if (!store || !viewManager) return;
  const config = store.get();
  const visible = getVisibleServices(config);
  const target = visible[slotIndex];
  if (!target) return;
  const updated = store.set(selectActiveService(config, target.id));
  viewManager.setHomeActive(false);
  viewManager.syncConfig(updated);
}

function buildApplicationMenu(): void {
  const serviceShortcuts: Electron.MenuItemConstructorOptions[] = Array.from(
    { length: 9 },
    (_, i) => ({
      label: `Switch to App ${i + 1}`,
      accelerator: `CommandOrControl+${i + 1}`,
      click: () => selectServiceSlot(i),
    }),
  );

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'OmniDeck',
      submenu: [
        {
          label: 'Command & Search Palette',
          accelerator: 'CommandOrControl+K',
          click: () => sendUiCommand({ type: 'open-command-palette' }),
        },
        {
          label: 'OmniDeck Home Hub',
          accelerator: 'CommandOrControl+0',
          click: () => viewManager?.setHomeActive(true),
        },
        {
          label: 'Audio Mixer & Sleep Timer',
          accelerator: 'CommandOrControl+Shift+V',
          click: () => sendUiCommand({ type: 'open-audio-mixer' }),
        },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          click: () => void updateManager?.checkForUpdates(false),
        },
        {
          label: 'Settings',
          accelerator: 'CommandOrControl+,',
          click: () => sendUiCommand({ type: 'open-settings' }),
        },
        {
          label: 'Manage Apps',
          accelerator: 'CommandOrControl+Shift+A',
          click: () => sendUiCommand({ type: 'open-service-manager' }),
        },
        { type: 'separator' },
        {
          label: 'Toggle Browser Tools Bar (Zen / Classic)',
          accelerator: 'CommandOrControl+B',
          click: () => sendUiCommand({ type: 'toggle-browser-bar' }),
        },
        {
          label: 'Toggle Top Bar / Left Sidebar',
          accelerator: 'CommandOrControl+Shift+L',
          click: () => {
            if (!store || !viewManager) return;
            const cfg = store.get();
            const nextNav = cfg.settings.navPosition === 'top' ? 'left' : 'top';
            const updated = store.set({
              ...cfg,
              settings: { ...cfg.settings, navPosition: nextNav },
            });
            viewManager.syncConfig(updated);
          },
        },
        {
          label: 'Toggle Split View',
          accelerator: 'CommandOrControl+\\',
          click: () => {
            if (!store || !viewManager) return;
            viewManager.setHomeActive(false);
            const updated = store.set(toggleSplitView(store.get()));
            viewManager.syncConfig(updated);
          },
        },
        {
          label: 'Toggle Always on Top',
          accelerator: 'CommandOrControl+Shift+T',
          click: () => viewManager?.toggleAlwaysOnTop(),
        },
        { type: 'separator' },
        {
          label: 'Quit OmniDeck',
          accelerator: 'CommandOrControl+Q',
          click: () => {
            forceQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Navigate',
      submenu: [
        ...serviceShortcuts,
        { type: 'separator' },
        {
          label: 'Next App',
          accelerator: 'Control+Tab',
          click: () => cycleService(1),
        },
        {
          label: 'Previous App',
          accelerator: 'Control+Shift+Tab',
          click: () => cycleService(-1),
        },
        { type: 'separator' },
        {
          label: 'Back',
          accelerator: 'Alt+Left',
          click: () => store && viewManager?.goBack(store.get().activeServiceId),
        },
        {
          label: 'Forward',
          accelerator: 'Alt+Right',
          click: () => store && viewManager?.goForward(store.get().activeServiceId),
        },
        {
          label: 'Reload Active App',
          accelerator: 'CommandOrControl+R',
          click: () => store && viewManager?.reload(store.get().activeServiceId),
        },
        {
          label: 'Hard Reload Active App',
          accelerator: 'CommandOrControl+Shift+R',
          click: () => store && viewManager?.reload(store.get().activeServiceId, true),
        },
      ],
    },
    {
      label: 'Media & Tabs',
      submenu: [
        {
          label: 'Play / Pause Now Playing',
          accelerator: 'CommandOrControl+Shift+Space',
          click: () => void viewManager?.runMediaAction('play-pause'),
        },
        {
          label: 'Picture-in-Picture Active Video',
          accelerator: 'CommandOrControl+Shift+P',
          click: () => store && void viewManager?.runMediaAction('pip', store.get().activeServiceId),
        },
        {
          label: 'Mute / Unmute Active App',
          accelerator: 'CommandOrControl+M',
          click: () => store && viewManager?.toggleMute(store.get().activeServiceId),
        },
        {
          label: 'Mute All Apps',
          accelerator: 'CommandOrControl+Shift+M',
          click: () => viewManager?.muteAll(),
        },
        { type: 'separator' },
        {
          label: 'Sleep Active App (Free RAM)',
          accelerator: 'CommandOrControl+Shift+H',
          click: () => store && viewManager?.hibernateService(store.get().activeServiceId),
        },
        {
          label: 'Open Active App DevTools',
          accelerator: 'CommandOrControl+Shift+I',
          click: () => store && viewManager?.openDevTools(store.get().activeServiceId),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function refreshTrayMenu(): void {
  if (
    !tray ||
    tray.isDestroyed() ||
    !store ||
    !viewManager ||
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    return;
  }
  const cfg = store.get();
  const visible = getVisibleServices(cfg);
  const snapshot = viewManager.getSnapshot();

  const items: Electron.MenuItemConstructorOptions[] = [
    {
      label: mainWindow.isVisible() ? 'Hide OmniDeck' : 'Show OmniDeck',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: snapshot.nowPlaying.playing
        ? `Pause (${snapshot.nowPlaying.title.slice(0, 28)})`
        : 'Play Media',
      enabled: Boolean(snapshot.nowPlaying.serviceId),
      click: () => void viewManager?.runMediaAction('play-pause'),
    },
    { type: 'separator' },
    {
      label: 'OmniDeck Home',
      click: () => {
        viewManager?.setHomeActive(true);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    ...visible.map((svc) => {
      const rt = snapshot.runtime[svc.id];
      const audioTag = rt?.audible && !rt?.muted ? '  (Playing)' : rt?.muted ? '  (Muted)' : '';
      return {
        label: `${svc.name}${audioTag}`,
        type: 'radio' as const,
        checked: !snapshot.homeActive && cfg.activeServiceId === svc.id,
        click: () => {
          if (!store || !viewManager) return;
          viewManager.setHomeActive(false);
          const updated = store.set(selectActiveService(store.get(), svc.id));
          viewManager.syncConfig(updated);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      };
    }),
    { type: 'separator' },
    {
      label: cfg.settings.doNotDisturb ? 'Disable Do Not Disturb' : 'Enable Do Not Disturb',
      click: () => {
        if (!store || !viewManager) return;
        const cur = store.get();
        const updated = store.set({
          ...cur,
          settings: { ...cur.settings, doNotDisturb: !cur.settings.doNotDisturb },
        });
        viewManager.syncConfig(updated);
      },
    },
    {
      label: 'Check for Updates…',
      click: () => void updateManager?.checkForUpdates(false),
    },
    {
      label: 'Mute All Apps',
      click: () => viewManager?.muteAll(),
    },
    {
      label: 'Quit OmniDeck',
      click: () => {
        forceQuitting = true;
        app.quit();
      },
    },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function createTray(): void {
  const iconPath = resolveAppIconPath();
  if (!iconPath) return;
  try {
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 22, height: 22 });
    tray = new Tray(icon);
    tray.setToolTip(`OmniDeck v${app.getVersion()} — Multi-Service Media Hub`);
    tray.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    refreshTrayMenu();
  } catch (err) {
    console.warn('[OmniDeck] System tray unavailable:', err);
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('omnideck:get-snapshot', () => viewManager?.getSnapshot());

  ipcMain.handle('omnideck:open-home', () => viewManager?.setHomeActive(true));

  ipcMain.handle('omnideck:select-service', (_e, serviceId: string) => {
    if (!store || !viewManager) return null;
    viewManager.setHomeActive(false);
    const updated = store.set(selectActiveService(store.get(), serviceId));
    return viewManager.syncConfig(updated);
  });

  ipcMain.handle(
    'omnideck:open-service-url',
    (_e, serviceId: string, url: string, inSplitView: boolean) =>
      viewManager?.openServiceUrl(serviceId, url, inSplitView),
  );

  ipcMain.handle('omnideck:search-in-service', (_e, serviceId: string, query: string) => {
    if (!store || !viewManager) return null;
    const svc = store.get().services.find((s) => s.id === serviceId);
    const searchUrl = buildServiceSearchUrl(serviceId, query, svc?.url);
    return viewManager.openServiceUrl(serviceId, searchUrl, false);
  });

  ipcMain.handle('omnideck:go-back', (_e, serviceId: string) => viewManager?.goBack(serviceId));
  ipcMain.handle('omnideck:go-forward', (_e, serviceId: string) => viewManager?.goForward(serviceId));
  ipcMain.handle('omnideck:reload', (_e, serviceId: string, hard: boolean) =>
    viewManager?.reload(serviceId, hard),
  );
  ipcMain.handle('omnideck:go-home', (_e, serviceId: string) => viewManager?.goHome(serviceId));
  const keepMiniPlayerOnTop = () => {
    if (!miniPlayer?.isOpen()) return;
    miniPlayer.ensureOnTop();
    setTimeout(() => {
      if (miniPlayer?.isOpen()) miniPlayer.ensureOnTop();
    }, 220);
  };

  ipcMain.handle('omnideck:toggle-mute', (_e, serviceId: string) => {
    const res = viewManager?.toggleMute(serviceId);
    keepMiniPlayerOnTop();
    return res;
  });
  ipcMain.handle('omnideck:mute-all', () => viewManager?.muteAll());

  ipcMain.handle('omnideck:set-volume', (_e, serviceId: string, volume: number) => {
    if (!store || !viewManager) return null;
    const applied = viewManager.setVolume(serviceId, volume);
    const updated = store.set(setServiceVolume(store.get(), serviceId, applied));
    const res = viewManager.syncConfig(updated);
    keepMiniPlayerOnTop();
    return res;
  });

  ipcMain.handle('omnideck:set-zoom', (_e, serviceId: string, zoomFactor: number) => {
    if (!store || !viewManager) return null;
    const applied = viewManager.setZoom(serviceId, zoomFactor);
    const updated = store.set(updateService(store.get(), serviceId, { zoomFactor: applied }));
    return viewManager.syncConfig(updated);
  });

  ipcMain.handle('omnideck:hibernate', (_e, serviceId: string) =>
    viewManager?.hibernateService(serviceId),
  );
  ipcMain.handle('omnideck:hibernate-inactive', () => viewManager?.hibernateInactive());
  ipcMain.handle('omnideck:hibernate-heavy', (_e, thresholdMb?: number) =>
    viewManager?.hibernateHeavyTabs(typeof thresholdMb === 'number' ? thresholdMb : 350),
  );
  ipcMain.handle('omnideck:refresh-memory', () => viewManager?.refreshMemoryMetrics());
  ipcMain.handle('omnideck:wake', (_e, serviceId: string) => viewManager?.wakeService(serviceId));
  ipcMain.handle('omnideck:open-external', (_e, serviceId: string) =>
    viewManager?.openExternal(serviceId),
  );
  ipcMain.handle('omnideck:open-devtools', (_e, serviceId: string) =>
    viewManager?.openDevTools(serviceId),
  );
  ipcMain.handle('omnideck:clear-session', (_e, serviceId: string) =>
    viewManager?.clearServiceSession(serviceId),
  );

  // Favorites & Recent History
  ipcMain.handle('omnideck:pin-current-page', (_e, serviceId: string) => {
    if (!store || !viewManager) return null;
    const snap = viewManager.getSnapshot();
    const rt = snap.runtime[serviceId];
    const svc = store.get().services.find((s) => s.id === serviceId);
    if (!svc) return snap;
    const updated = store.set(
      pinFavorite(store.get(), {
        serviceId,
        title: rt?.pageTitle || svc.name,
        url: rt?.currentUrl || svc.url,
      }),
    );
    const res = viewManager.syncConfig(updated);
    viewManager.showToast(`Pinned "${(rt?.pageTitle || svc.name).slice(0, 32)}" to Home`);
    return res;
  });

  ipcMain.handle('omnideck:remove-favorite', (_e, favoriteId: string) => {
    if (!store || !viewManager) return null;
    const updated = store.set(removeFavorite(store.get(), favoriteId));
    return viewManager.syncConfig(updated);
  });

  ipcMain.handle('omnideck:clear-recent', () => {
    if (!store || !viewManager) return null;
    const cur = store.get();
    const updated = store.set({ ...cur, recentActivity: [] });
    return viewManager.syncConfig(updated);
  });

  // Unified Media, Smart Audio, Sleep Timer, Audible Dock & PiP
  ipcMain.handle('omnideck:media-play-pause', async (_e, serviceId?: string) => {
    const res = await viewManager?.runMediaAction('play-pause', serviceId);
    keepMiniPlayerOnTop();
    return res;
  });
  ipcMain.handle('omnideck:media-next', async (_e, serviceId?: string) => {
    await viewManager?.runMediaAction('next', serviceId);
    keepMiniPlayerOnTop();
  });
  ipcMain.handle('omnideck:media-previous', async (_e, serviceId?: string) => {
    await viewManager?.runMediaAction('previous', serviceId);
    keepMiniPlayerOnTop();
  });
  ipcMain.handle('omnideck:media-seek', async (_e, targetTimeSec: number, serviceId?: string) => {
    const res = await viewManager?.seekMedia(targetTimeSec, serviceId);
    keepMiniPlayerOnTop();
    return res;
  });
  ipcMain.handle('omnideck:media-like', async (_e, serviceId?: string) => {
    const res = await viewManager?.runMediaAction('like-track', serviceId);
    keepMiniPlayerOnTop();
    return res;
  });
  ipcMain.handle('omnideck:media-dislike', async (_e, serviceId?: string) => {
    const res = await viewManager?.runMediaAction('dislike-track', serviceId);
    keepMiniPlayerOnTop();
    return res;
  });
  ipcMain.handle('omnideck:resume-auto-paused', () => viewManager?.resumeAutoPaused());
  ipcMain.handle('omnideck:set-sleep-timer', (_e, minutes: number) =>
    viewManager?.setSleepTimer(minutes),
  );
  ipcMain.handle('omnideck:trigger-pip', async (_e, serviceId: string) => {
    await viewManager?.runMediaAction('pip', serviceId);
  });
  ipcMain.handle('omnideck:toggle-always-on-top', () => viewManager?.toggleAlwaysOnTop());
  ipcMain.handle('omnideck:close-audible-dock', () => viewManager?.closeAudibleDock());

  // Native Frameless Window Controls
  ipcMain.handle('omnideck:window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  });
  ipcMain.handle('omnideck:window-toggle-maximize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('omnideck:window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });

  // Ad & Tracker Shield
  ipcMain.handle('omnideck:toggle-service-adblock', (_e, serviceId: string) => {
    if (!store || !viewManager) return null;
    const updated = store.set(toggleServiceAdBlock(store.get(), serviceId));
    return viewManager.syncConfig(updated);
  });

  // Split View
  ipcMain.handle(
    'omnideck:toggle-split',
    (_e, enabled?: boolean, secondaryServiceId?: string | null) => {
      if (!store || !viewManager) return null;
      viewManager.setHomeActive(false);
      const updated = store.set(toggleSplitView(store.get(), enabled, secondaryServiceId));
      return viewManager.syncConfig(updated);
    },
  );
  ipcMain.handle('omnideck:set-split-secondary', (_e, serviceId: string) => {
    if (!store || !viewManager) return null;
    viewManager.setHomeActive(false);
    const updated = store.set(toggleSplitView(store.get(), true, serviceId));
    return viewManager.syncConfig(updated);
  });
  ipcMain.handle('omnideck:swap-split', () => {
    if (!store || !viewManager) return null;
    const updated = store.set(swapSplitPanes(store.get()));
    return viewManager.syncConfig(updated);
  });
  ipcMain.handle('omnideck:set-split-ratio', (_e, ratio: number) => {
    if (!store || !viewManager) return null;
    const updated = store.set(setSplitRatio(store.get(), ratio));
    return viewManager.syncConfig(updated);
  });

  // Workspaces
  ipcMain.handle('omnideck:apply-workspace', (_e, workspaceId: string) => {
    if (!store || !viewManager) return null;
    viewManager.setHomeActive(false);
    const updated = store.set(applyWorkspace(store.get(), workspaceId));
    return viewManager.syncConfig(updated);
  });
  ipcMain.handle('omnideck:save-workspace', (_e, name: string) => {
    if (!store || !viewManager) return null;
    const updated = store.set(saveCustomWorkspace(store.get(), name));
    return viewManager.syncConfig(updated);
  });
  ipcMain.handle('omnideck:delete-workspace', (_e, workspaceId: string) => {
    if (!store || !viewManager) return null;
    const updated = store.set(deleteCustomWorkspace(store.get(), workspaceId));
    return viewManager.syncConfig(updated);
  });

  // Settings, Power-Ups, Equalizer, AI Companion & Services
  ipcMain.handle('omnideck:update-settings', (_e, patch: Partial<AppSettings>) => {
    if (!store || !viewManager) return null;
    const current = store.get();
    const nextAudioFocus =
      patch.audioFocusMode ??
      (typeof patch.smartAudioSwitching === 'boolean'
        ? patch.smartAudioSwitching
          ? current.settings.audioFocusMode === 'duck'
            ? 'duck'
            : 'pause'
          : 'off'
        : current.settings.audioFocusMode);
    const nextSettings: AppSettings = {
      ...current.settings,
      ...patch,
      audioFocusMode: nextAudioFocus,
      smartAudioSwitching: nextAudioFocus !== 'off',
      audioDuckLevel:
        typeof patch.audioDuckLevel === 'number'
          ? clampDuckLevel(patch.audioDuckLevel)
          : current.settings.audioDuckLevel,
      powerUps: patch.powerUps
        ? mergePowerUpsConfig({ ...current.settings.powerUps, ...patch.powerUps })
        : current.settings.powerUps,
      equalizer: patch.equalizer
        ? mergeEqualizerConfig({ ...current.settings.equalizer, ...patch.equalizer })
        : current.settings.equalizer,
      aiCompanion: patch.aiCompanion
        ? mergeAiCompanionConfig({ ...current.settings.aiCompanion, ...patch.aiCompanion })
        : current.settings.aiCompanion,
    };
    const updated = store.set({
      ...current,
      settings: nextSettings,
    });
    syncHardwareMediaKeys(nextSettings.hardwareMediaKeys);
    syncGlobalSummonShortcut(nextSettings.globalSummonShortcut);
    syncGlobalLikeShortcut(nextSettings.powerUps.spotifyLikeShortcut);
    syncLaunchAtLogin(nextSettings.launchAtLogin);
    updateManager?.startSchedule(nextSettings.autoCheckUpdates);
    return viewManager.syncConfig(updated);
  });

  ipcMain.handle('omnideck:update-power-ups', (_e, patch: Partial<PowerUpsConfig>) => {
    if (!store || !viewManager) return null;
    const current = store.get();
    const nextPowerUps = mergePowerUpsConfig({ ...current.settings.powerUps, ...patch });
    const updated = store.set({
      ...current,
      settings: {
        ...current.settings,
        powerUps: nextPowerUps,
      },
    });
    syncGlobalLikeShortcut(nextPowerUps.spotifyLikeShortcut);
    return viewManager.syncConfig(updated);
  });

  ipcMain.handle('omnideck:update-equalizer', (_e, patch: Partial<EqualizerConfig>) => {
    if (!store || !viewManager) return null;
    const current = store.get();
    const nextEq = mergeEqualizerConfig({ ...current.settings.equalizer, ...patch });
    const updated = store.set({
      ...current,
      settings: {
        ...current.settings,
        equalizer: nextEq,
      },
    });
    return viewManager.syncConfig(updated);
  });

  ipcMain.handle('omnideck:add-custom-service', (_e, input: CustomServiceInput) => {
    if (!store || !viewManager) return null;
    viewManager.setHomeActive(false);
    const { config, created } = addCustomService(store.get(), input);
    const selected = selectActiveService(config, created.id);
    const updated = store.set(selected);
    return viewManager.syncConfig(updated);
  });

  ipcMain.handle('omnideck:update-integrations', (_e, patch: Partial<IntegrationsConfig>) => {
    if (!store || !viewManager) return null;
    const cur = store.get();
    const nextInt = mergeIntegrationsConfig({ ...cur.settings.integrations, ...patch });
    const updated = store.set({
      ...cur,
      settings: { ...cur.settings, integrations: nextInt },
    });
    integrations?.updateConfig(nextInt);
    return viewManager.syncConfig(updated);
  });

  ipcMain.handle(
    'omnideck:block-music',
    (_e, input: { kind: 'artist' | 'track'; value: string; artist?: string }) => {
      if (!store || !viewManager) return null;
      const updated = store.set(addBlockedMusicEntry(store.get(), input));
      const snap = viewManager.syncConfig(updated);
      viewManager.showToast(`Blocked ${input.kind}: ${input.value}`, 2400);
      // Immediately skip if the blocked song/artist is currently playing
      if (snap.nowPlaying.serviceId && snap.nowPlaying.playing) {
        void viewManager.runMediaAction('next', snap.nowPlaying.serviceId);
      }
      return snap;
    },
  );

  ipcMain.handle('omnideck:unblock-music', (_e, entryId: string) => {
    if (!store || !viewManager) return null;
    const updated = store.set(removeBlockedMusicEntry(store.get(), entryId));
    return viewManager.syncConfig(updated);
  });

  ipcMain.handle(
    'omnideck:add-book-note',
    (_e, input: { bookTitle: string; timestampLabel: string; note: string; url?: string }) => {
      if (!store || !viewManager) return null;
      const updated = store.set(addBookNote(store.get(), input));
      viewManager.showToast('Saved Audible book note', 2000);
      return viewManager.syncConfig(updated);
    },
  );

  ipcMain.handle('omnideck:remove-book-note', (_e, noteId: string) => {
    if (!store || !viewManager) return null;
    const updated = store.set(removeBookNote(store.get(), noteId));
    return viewManager.syncConfig(updated);
  });

  ipcMain.handle(
    'omnideck:update-service',
    (
      _e,
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
    ) => {
      if (!store || !viewManager) return null;
      const updated = store.set(updateService(store.get(), serviceId, patch));
      return viewManager.syncConfig(updated);
    },
  );

  ipcMain.handle('omnideck:remove-custom-service', (_e, serviceId: string) => {
    if (!store || !viewManager) return null;
    const updated = store.set(removeCustomService(store.get(), serviceId));
    return viewManager.syncConfig(updated);
  });

  ipcMain.handle('omnideck:toggle-visibility', (_e, serviceId: string) => {
    if (!store || !viewManager) return null;
    const updated = store.set(toggleServiceVisibility(store.get(), serviceId));
    return viewManager.syncConfig(updated);
  });

  ipcMain.handle('omnideck:reorder-services', (_e, fromIndex: number, toIndex: number) => {
    if (!store || !viewManager) return null;
    const updated = store.set(reorderServices(store.get(), fromIndex, toIndex));
    return viewManager.syncConfig(updated);
  });

  ipcMain.handle('omnideck:move-service-by-id', (_e, draggedId: string, targetId: string) => {
    if (!store || !viewManager) return null;
    const updated = store.set(moveServiceById(store.get(), draggedId, targetId));
    return viewManager.syncConfig(updated);
  });

  ipcMain.handle('omnideck:reset-defaults', () => {
    if (!store || !viewManager) return null;
    const updated = store.reset();
    syncHardwareMediaKeys(updated.settings.hardwareMediaKeys);
    syncGlobalSummonShortcut(updated.settings.globalSummonShortcut);
    syncGlobalLikeShortcut(updated.settings.powerUps.spotifyLikeShortcut);
    return viewManager.syncConfig(updated);
  });

  // Cross-Device Config Export / Import
  ipcMain.handle('omnideck:export-config-file', async () => {
    if (!store || !mainWindow) return { saved: false };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export OmniDeck Configuration',
      defaultPath: 'omnideck-config-backup.json',
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) {
      return { saved: false };
    }
    fs.writeFileSync(result.filePath, serializeConfigForExport(store.get()), 'utf-8');
    return { saved: true, path: result.filePath };
  });

  ipcMain.handle('omnideck:import-config-file', async () => {
    if (!store || !viewManager || !mainWindow) return { imported: false };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import OmniDeck Configuration',
      properties: ['openFile'],
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { imported: false };
    }
    try {
      const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
      const parsed = parseImportedConfig(raw);
      const updated = store.set(parsed);
      syncHardwareMediaKeys(updated.settings.hardwareMediaKeys);
      syncGlobalSummonShortcut(updated.settings.globalSummonShortcut);
      syncGlobalLikeShortcut(updated.settings.powerUps.spotifyLikeShortcut);
      const snapshot = viewManager.syncConfig(updated);
      return { imported: true, snapshot };
    } catch (err) {
      return {
        imported: false,
        error: err instanceof Error ? err.message : 'Failed to import configuration.',
      };
    }
  });

  ipcMain.handle('omnideck:get-export-json', () => {
    if (!store) return '{}';
    return serializeConfigForExport(store.get());
  });

  ipcMain.handle('omnideck:import-config-json', (_e, rawJson: string) => {
    if (!store || !viewManager) return null;
    const parsed = parseImportedConfig(rawJson);
    const updated = store.set(parsed);
    syncHardwareMediaKeys(updated.settings.hardwareMediaKeys);
    syncGlobalSummonShortcut(updated.settings.globalSummonShortcut);
    syncGlobalLikeShortcut(updated.settings.powerUps.spotifyLikeShortcut);
    return viewManager.syncConfig(updated);
  });

  // Auto-Updater
  ipcMain.handle('omnideck:check-updates', () => updateManager?.checkForUpdates(false));
  ipcMain.handle('omnideck:install-update', () => {
    forceQuitting = true;
    updateManager?.quitAndInstall();
  });
  ipcMain.handle('omnideck:open-release-page', () => updateManager?.openReleasePage());

  ipcMain.handle('omnideck:set-overlay-open', (_e, open: boolean) => {
    viewManager?.setOverlayOpen(open);
  });

  ipcMain.handle('omnideck:set-chrome-insets', (_e, insets: ChromeInsets) => {
    viewManager?.setChromeInsets(insets);
  });

  // AI Now Playing & Artist Discovery Hub
  ipcMain.handle(
    'omnideck:get-artist-dossier',
    async (
      _e,
      input: {
        serviceId: string;
        title: string;
        artist?: string;
        album?: string;
        artworkUrl?: string;
        durationSec?: number;
        forceRefresh?: boolean;
      },
    ) => {
      if (!musicIntel) musicIntel = new MusicIntelService();
      const aiConfig = store?.get().settings.aiCompanion ?? mergeAiCompanionConfig(null);
      const dossier = await musicIntel.getArtistDossier(input, aiConfig);
      if (dossier.lyrics?.synced && dossier.lyrics.lines.length > 0 && viewManager) {
        viewManager.setActiveLyrics(
          `${input.serviceId}::${input.title.toLowerCase()}`,
          dossier.lyrics.lines,
        );
      }
      return dossier;
    },
  );

  ipcMain.handle('omnideck:get-band-details', async (_e, bandName: string) => {
    if (!musicIntel) musicIntel = new MusicIntelService();
    return musicIntel.getBandDetails(bandName);
  });

  ipcMain.handle('omnideck:ask-music-ai', async (_e, dossier: ArtistDossier, question: string) => {
    if (!musicIntel) musicIntel = new MusicIntelService();
    const aiConfig = store?.get().settings.aiCompanion ?? mergeAiCompanionConfig(null);
    return musicIntel.askMusicAi(dossier, question, aiConfig);
  });

  ipcMain.handle('omnideck:test-ai-connection', async (_e, config: AiCompanionConfig) => {
    if (!musicIntel) musicIntel = new MusicIntelService();
    return musicIntel.testAiConnection(mergeAiCompanionConfig(config));
  });

  ipcMain.handle('omnideck:set-now-playing-active', (_e, active: boolean) => {
    viewManager?.setNowPlayingHubActive(Boolean(active));
  });

  // Floating Mini-Player HUD
  ipcMain.handle('omnideck:toggle-mini-player', (_e, open?: boolean) => {
    if (!viewManager || !miniPlayer) return viewManager?.getSnapshot() ?? null;
    const snap = viewManager.getSnapshot();
    if (typeof open === 'boolean') {
      if (open) miniPlayer.open(snap);
      else miniPlayer.close();
    } else {
      miniPlayer.toggle(snap);
    }
    return viewManager.getSnapshot();
  });

  ipcMain.handle('omnideck:focus-main-window', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  // Private Local Listening Stats ("OmniDeck Wrapped")
  ipcMain.handle('omnideck:get-listening-stats', () => {
    if (!listeningStats) listeningStats = new ListeningStatsStore();
    return listeningStats.getSummary();
  });

  ipcMain.handle('omnideck:clear-listening-stats', () => {
    if (!listeningStats) listeningStats = new ListeningStatsStore();
    return listeningStats.clear();
  });
}

async function createMainWindow(drmStatus: DrmStatus): Promise<void> {
  store = new ConfigStore();
  listeningStats = new ListeningStatsStore();
  musicIntel = new MusicIntelService();
  const initialConfig = store.get();
  const bounds = resolveInitialWindowBounds(initialConfig.windowBounds);

  updateManager = new UpdateManager((nextUpdate) => {
    viewManager?.setUpdateState(nextUpdate);
  });

  miniPlayer = new MiniPlayerManager(() => {
    viewManager?.setMiniPlayerOpen(Boolean(miniPlayer?.isOpen()));
  });

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 880,
    minHeight: 560,
    frame: false,
    title: 'OmniDeck',
    icon: resolveAppIconPath(),
    backgroundColor: initialConfig.settings.theme === 'light' ? '#F5F6F8' : '#0E1013',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (bounds.maximized) {
    mainWindow.maximize();
  }

  viewManager = new ViewManager(
    mainWindow,
    initialConfig,
    drmStatus,
    updateManager.getState(),
    broadcastSnapshot,
    (nextCfg) => {
      store?.set(nextCfg);
    },
    listeningStats,
  );

  integrations = new IntegrationsManager(initialConfig.settings.integrations);
  syncHardwareMediaKeys(initialConfig.settings.hardwareMediaKeys);
  syncGlobalSummonShortcut(initialConfig.settings.globalSummonShortcut);
  syncGlobalLikeShortcut(initialConfig.settings.powerUps.spotifyLikeShortcut);
  syncLaunchAtLogin(initialConfig.settings.launchAtLogin);
  updateManager.startSchedule(initialConfig.settings.autoCheckUpdates);

  mainWindow.on('resize', scheduleSaveWindowBounds);
  mainWindow.on('move', scheduleSaveWindowBounds);

  const maybeAutoOpenMiniPlayer = () => {
    if (
      store?.get().settings.miniPlayerAutoShowOnMinimize &&
      viewManager?.hasAudiblePlayback() &&
      miniPlayer &&
      !miniPlayer.isOpen()
    ) {
      miniPlayer.open(viewManager.getSnapshot());
    }
  };
  mainWindow.on('minimize', maybeAutoOpenMiniPlayer);
  mainWindow.on('hide', maybeAutoOpenMiniPlayer);

  mainWindow.on('close', (event) => {
    if (forceQuitting) return;

    // Native utility behavior: minimize to system tray so Spotify/Audible keep playing quietly
    if (store?.get().settings.minimizeToTrayOnClose && tray) {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }

    if (store?.get().settings.confirmBeforeQuitWithAudio && viewManager?.hasAudiblePlayback()) {
      event.preventDefault();
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'question',
        buttons: ['Quit OmniDeck', 'Keep Playing'],
        defaultId: 1,
        cancelId: 1,
        title: 'Audio is currently playing',
        message: 'One or more apps are playing media in the background. Quit OmniDeck anyway?',
      });
      if (choice === 0) {
        forceQuitting = true;
        app.quit();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    const mp = miniPlayer;
    miniPlayer = null;
    const vm = viewManager;
    viewManager = null;
    updateManager?.stopSchedule();
    mp?.dispose();
    vm?.dispose();
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  viewManager.syncConfig(initialConfig);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const drmStatus = await initializeWidevineCdm();
    console.log(`[OmniDeck] ${drmStatus.message}`);
    registerIpcHandlers();
    buildApplicationMenu();
    await createMainWindow(drmStatus);
    createTray();
  });

  app.on('will-quit', () => {
    syncHardwareMediaKeys(false);
    syncGlobalSummonShortcut('');
    syncGlobalLikeShortcut('');
    updateManager?.stopSchedule();
    integrations?.dispose();
    integrations = null;
    if (tray && !tray.isDestroyed()) {
      tray.destroy();
      tray = null;
    }
  });

  app.on('before-quit', (event) => {
    forceQuitting = true;
    const shouldFlushAudible =
      !audibleFlushedOnQuit &&
      store?.get().settings.powerUps.audibleWhisperSyncFlush &&
      Boolean(viewManager?.getSnapshot().runtime.audible?.audible);

    if (shouldFlushAudible && viewManager) {
      event.preventDefault();
      audibleFlushedOnQuit = true;
      void viewManager.flushAudibleSync().finally(() => {
        app.quit();
      });
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
