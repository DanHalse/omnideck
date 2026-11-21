import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopSnapshot } from '@omnideck/shared';
import type { OmniDeckBridge, UiCommandEvent } from './ipcTypes.js';

const api: OmniDeckBridge = {
  getSnapshot: () => ipcRenderer.invoke('omnideck:get-snapshot'),

  subscribe: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: DesktopSnapshot) => {
      listener(snapshot);
    };
    ipcRenderer.on('omnideck:snapshot', handler);
    return () => {
      ipcRenderer.removeListener('omnideck:snapshot', handler);
    };
  },

  onUiCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: UiCommandEvent) => {
      listener(command);
    };
    ipcRenderer.on('omnideck:ui-command', handler);
    return () => {
      ipcRenderer.removeListener('omnideck:ui-command', handler);
    };
  },

  openHome: () => ipcRenderer.invoke('omnideck:open-home'),
  selectService: (serviceId) => ipcRenderer.invoke('omnideck:select-service', serviceId),
  openServiceUrl: (serviceId, url, inSplitView) =>
    ipcRenderer.invoke('omnideck:open-service-url', serviceId, url, Boolean(inSplitView)),
  searchInService: (serviceId, query) =>
    ipcRenderer.invoke('omnideck:search-in-service', serviceId, query),
  goBack: (serviceId) => ipcRenderer.invoke('omnideck:go-back', serviceId),
  goForward: (serviceId) => ipcRenderer.invoke('omnideck:go-forward', serviceId),
  reload: (serviceId, hard) => ipcRenderer.invoke('omnideck:reload', serviceId, Boolean(hard)),
  goHome: (serviceId) => ipcRenderer.invoke('omnideck:go-home', serviceId),
  toggleMute: (serviceId) => ipcRenderer.invoke('omnideck:toggle-mute', serviceId),
  muteAll: () => ipcRenderer.invoke('omnideck:mute-all'),
  setVolume: (serviceId, volume) => ipcRenderer.invoke('omnideck:set-volume', serviceId, volume),
  setZoom: (serviceId, zoomFactor) => ipcRenderer.invoke('omnideck:set-zoom', serviceId, zoomFactor),
  hibernateService: (serviceId) => ipcRenderer.invoke('omnideck:hibernate', serviceId),
  hibernateInactive: () => ipcRenderer.invoke('omnideck:hibernate-inactive'),
  hibernateHeavyTabs: (thresholdMb) => ipcRenderer.invoke('omnideck:hibernate-heavy', thresholdMb),
  refreshMemoryMetrics: () => ipcRenderer.invoke('omnideck:refresh-memory'),
  wakeService: (serviceId) => ipcRenderer.invoke('omnideck:wake', serviceId),
  openExternal: (serviceId) => ipcRenderer.invoke('omnideck:open-external', serviceId),
  openDevTools: (serviceId) => ipcRenderer.invoke('omnideck:open-devtools', serviceId),
  clearServiceSession: (serviceId) => ipcRenderer.invoke('omnideck:clear-session', serviceId),

  pinCurrentPage: (serviceId) => ipcRenderer.invoke('omnideck:pin-current-page', serviceId),
  removeFavorite: (favoriteId) => ipcRenderer.invoke('omnideck:remove-favorite', favoriteId),
  clearRecentActivity: () => ipcRenderer.invoke('omnideck:clear-recent'),

  mediaPlayPause: (serviceId) => ipcRenderer.invoke('omnideck:media-play-pause', serviceId),
  mediaNext: (serviceId) => ipcRenderer.invoke('omnideck:media-next', serviceId),
  mediaPrevious: (serviceId) => ipcRenderer.invoke('omnideck:media-previous', serviceId),
  mediaLikeTrack: (serviceId) => ipcRenderer.invoke('omnideck:media-like', serviceId),
  mediaDislikeTrack: (serviceId) => ipcRenderer.invoke('omnideck:media-dislike', serviceId),
  resumeAutoPaused: () => ipcRenderer.invoke('omnideck:resume-auto-paused'),
  setSleepTimer: (minutes) => ipcRenderer.invoke('omnideck:set-sleep-timer', minutes),
  triggerPip: (serviceId) => ipcRenderer.invoke('omnideck:trigger-pip', serviceId),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('omnideck:toggle-always-on-top'),
  closeAudibleDock: () => ipcRenderer.invoke('omnideck:close-audible-dock'),
  updateEqualizer: (patch) => ipcRenderer.invoke('omnideck:update-equalizer', patch),

  getArtistDossier: (input) => ipcRenderer.invoke('omnideck:get-artist-dossier', input),
  getBandDetails: (bandName) => ipcRenderer.invoke('omnideck:get-band-details', bandName),
  askMusicAi: (dossier, question) => ipcRenderer.invoke('omnideck:ask-music-ai', dossier, question),
  testAiConnection: (config) => ipcRenderer.invoke('omnideck:test-ai-connection', config),
  setNowPlayingHubActive: (active) => ipcRenderer.invoke('omnideck:set-now-playing-active', active),

  toggleMiniPlayer: (open) => ipcRenderer.invoke('omnideck:toggle-mini-player', open),
  focusMainWindow: () => ipcRenderer.invoke('omnideck:focus-main-window'),

  getListeningStats: () => ipcRenderer.invoke('omnideck:get-listening-stats'),
  clearListeningStats: () => ipcRenderer.invoke('omnideck:clear-listening-stats'),

  windowMinimize: () => ipcRenderer.invoke('omnideck:window-minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('omnideck:window-toggle-maximize'),
  windowClose: () => ipcRenderer.invoke('omnideck:window-close'),

  toggleServiceAdBlock: (serviceId) => ipcRenderer.invoke('omnideck:toggle-service-adblock', serviceId),

  toggleSplitView: (enabled, secondaryServiceId) =>
    ipcRenderer.invoke('omnideck:toggle-split', enabled, secondaryServiceId),
  setSplitSecondary: (serviceId) => ipcRenderer.invoke('omnideck:set-split-secondary', serviceId),
  swapSplitPanes: () => ipcRenderer.invoke('omnideck:swap-split'),
  setSplitRatio: (ratio) => ipcRenderer.invoke('omnideck:set-split-ratio', ratio),

  applyWorkspace: (workspaceId) => ipcRenderer.invoke('omnideck:apply-workspace', workspaceId),
  saveCustomWorkspace: (name) => ipcRenderer.invoke('omnideck:save-workspace', name),
  deleteCustomWorkspace: (workspaceId) =>
    ipcRenderer.invoke('omnideck:delete-workspace', workspaceId),

  updateSettings: (patch) => ipcRenderer.invoke('omnideck:update-settings', patch),
  updatePowerUps: (patch) => ipcRenderer.invoke('omnideck:update-power-ups', patch),
  updateIntegrations: (patch) => ipcRenderer.invoke('omnideck:update-integrations', patch),
  blockMusic: (input) => ipcRenderer.invoke('omnideck:block-music', input),
  unblockMusic: (entryId) => ipcRenderer.invoke('omnideck:unblock-music', entryId),
  addBookNote: (input) => ipcRenderer.invoke('omnideck:add-book-note', input),
  removeBookNote: (noteId) => ipcRenderer.invoke('omnideck:remove-book-note', noteId),
  addCustomService: (input) => ipcRenderer.invoke('omnideck:add-custom-service', input),
  updateService: (serviceId, patch) =>
    ipcRenderer.invoke('omnideck:update-service', serviceId, patch),
  removeCustomService: (serviceId) => ipcRenderer.invoke('omnideck:remove-custom-service', serviceId),
  toggleServiceVisibility: (serviceId) => ipcRenderer.invoke('omnideck:toggle-visibility', serviceId),
  reorderServices: (fromIndex, toIndex) =>
    ipcRenderer.invoke('omnideck:reorder-services', fromIndex, toIndex),
  moveServiceById: (draggedId, targetId) =>
    ipcRenderer.invoke('omnideck:move-service-by-id', draggedId, targetId),
  resetDefaults: () => ipcRenderer.invoke('omnideck:reset-defaults'),
  exportConfigFile: () => ipcRenderer.invoke('omnideck:export-config-file'),
  importConfigFile: () => ipcRenderer.invoke('omnideck:import-config-file'),
  getExportJson: () => ipcRenderer.invoke('omnideck:get-export-json'),
  importConfigJson: (rawJson) => ipcRenderer.invoke('omnideck:import-config-json', rawJson),

  checkForUpdates: () => ipcRenderer.invoke('omnideck:check-updates'),
  installUpdate: () => ipcRenderer.invoke('omnideck:install-update'),
  openReleasePage: () => ipcRenderer.invoke('omnideck:open-release-page'),

  setOverlayOpen: (open) => ipcRenderer.invoke('omnideck:set-overlay-open', open),
  setChromeInsets: (insets) => ipcRenderer.invoke('omnideck:set-chrome-insets', insets),
};

contextBridge.exposeInMainWorld('omnideck', api);
